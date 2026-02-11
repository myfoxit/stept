from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
import pandas as pd
import numpy as np  # Add direct numpy import
import io
import json
import uuid
from typing import Optional, Dict, Any, List
from app.database import get_session as get_db
from app.security import get_current_user
from app.models import User, TableMeta
from app.crud.table import get_table
from app.crud.column import add_column, get_columns
from app.crud.field import insert_row
from app.schemas.table import TableCreate
from app.schemas.column import ColumnCreate
import asyncio
import redis.asyncio as redis
from app.core.config import settings

router = APIRouter()

# In-memory storage for preview data (use Redis in production)
import_cache: Dict[str, Any] = {}

@router.post("/upload")
async def upload_excel(
    file: UploadFile = File(...),
    mode: str = Form(...),
    table_id: Optional[str] = Form(None),
    table_name: Optional[str] = Form(None),
    project_id: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload and preview Excel/CSV file"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    # Read file based on extension
    content = await file.read()
    file_ext = file.filename.split('.')[-1].lower()
    
    try:
        if file_ext == 'csv':
            df = pd.read_csv(io.BytesIO(content))
        elif file_ext in ['xlsx', 'xls']:
            df = pd.read_excel(io.BytesIO(content))
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {str(e)}")
    
    # Clean up data - replace NaN/Infinity with None for JSON serialization
    df = df.replace([np.inf, -np.inf], None)  # Replace infinity values using numpy directly
    df = df.where(pd.notnull(df), None)  # Replace NaN with None
    
    # Generate upload ID
    upload_id = str(uuid.uuid4())
    
    # Store preview data
    import_cache[upload_id] = {
        'user_id': current_user.id,
        'mode': mode,
        'table_id': table_id,
        'table_name': table_name,
        'project_id': project_id,
        'dataframe': df,
        'status': 'preview',
        'progress': 0,
    }
    
    # Prepare preview response - ensure all values are JSON serializable
    preview_rows = df.head(10).to_dict('records')
    
    # Additional cleanup for preview data to ensure JSON compatibility
    for row in preview_rows:
        for key, value in row.items():
            # Convert any remaining problematic types
            if pd.isna(value):
                row[key] = None
            elif isinstance(value, (pd.Timestamp, pd.Timedelta)):
                row[key] = str(value)
            elif isinstance(value, (np.integer, np.floating)):
                # Convert numpy types to Python native types
                if np.isnan(value) or np.isinf(value):
                    row[key] = None
                else:
                    row[key] = value.item()
    
    preview_data = {
        'columns': df.columns.tolist(),
        'rows': preview_rows,
        'total_rows': len(df),
    }
    
    return {
        'upload_id': upload_id,
        'preview': preview_data,
    }

@router.post("/{upload_id}/confirm")
async def confirm_import(
    upload_id: str,
    mappings: Dict[str, Any],
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Confirm column mappings and start import"""
    if upload_id not in import_cache:
        raise HTTPException(status_code=404, detail="Upload not found")
    
    upload_data = import_cache[upload_id]
    if upload_data['user_id'] != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Update status
    upload_data['status'] = 'processing'
    upload_data['mappings'] = mappings['mappings']
    
    # Start background import
    background_tasks.add_task(
        process_import,
        upload_id,
        upload_data,
        db,
        current_user.id  # Pass user_id for table creation
    )
    
    return {'message': 'Import started', 'upload_id': upload_id}

async def process_import(upload_id: str, upload_data: Dict[str, Any], db: AsyncSession, user_id: str):
    """Process the actual import in background"""
    try:
        df = upload_data['dataframe']
        mappings = upload_data['mappings']
        mode = upload_data['mode']
        
        # Create or get table
        if mode == 'new':
            # Import the crud function directly to avoid circular imports
            from app.crud.table import create_table as crud_create_table
            
            # Create table WITHOUT the empty row (we'll add our own data)
            table = await crud_create_table(
                db, 
                upload_data['table_name'],
                upload_data['project_id']
            )
            table_id = table.id
            
            # Delete the empty row that was automatically created
            from sqlalchemy import text
            from app.db.utils import quote_ident, sanitize_identifier
            quoted_table = quote_ident(sanitize_identifier(table.physical_name))
            await db.execute(text(f"DELETE FROM {quoted_table} WHERE name = '' OR name IS NULL"))
            await db.commit()
        else:
            table_id = upload_data['table_id']
            table = await get_table(db, table_id)
            if not table:
                raise ValueError("Table not found")
        
        # Get existing columns
        existing_columns = await get_columns(db, table_id)
        existing_column_names = {col.name for col in existing_columns}
        
        # Create new columns as needed
        column_map = {}
        for mapping in mappings:
            source_col = mapping['sourceColumn']
            target_col = mapping['targetColumn']
            
            if target_col == 'skip':
                continue
            elif target_col == 'new':
                new_col_name = mapping.get('newColumnName', source_col)
                if new_col_name not in existing_column_names:
                    # Use single_line_text as default for all new columns
                    col = await add_column(
                        db,
                        table,
                        new_col_name,
                        'single_line_text'
                    )
                    column_map[source_col] = new_col_name
                    existing_column_names.add(new_col_name)
                else:
                    column_map[source_col] = new_col_name
            else:
                column_map[source_col] = target_col
        
        # Ensure we have at least the name column mapped or create it
        if 'name' not in column_map.values() and 'name' in existing_column_names:
            # Try to find a reasonable column to map to name
            name_candidates = ['name', 'Name', 'NAME', 'title', 'Title', 'TITLE']
            for candidate in name_candidates:
                if candidate in df.columns and candidate not in column_map:
                    column_map[candidate] = 'name'
                    break
        
        # Import data in batches
        batch_size = 100
        total_rows = len(df)
        rows_imported = 0
        
        for i in range(0, total_rows, batch_size):
            batch_df = df.iloc[i:i+batch_size]
            
            for idx, row in batch_df.iterrows():
                row_data = {}
                for source_col, target_col in column_map.items():
                    if source_col in row:
                        value = row[source_col]
                        # Convert value to appropriate type - handle NaN/Infinity
                        if pd.isna(value) or (isinstance(value, float) and (np.isnan(value) or np.isinf(value))):
                            row_data[target_col] = None
                        elif isinstance(value, bool):
                            row_data[target_col] = str(value).lower()
                        elif isinstance(value, (int, float)):
                            # For numeric values, ensure they're not NaN/Inf before converting
                            if np.isfinite(value):
                                row_data[target_col] = str(value)
                            else:
                                row_data[target_col] = None
                        elif isinstance(value, (pd.Timestamp, pd.Timedelta)):
                            row_data[target_col] = str(value)
                        else:
                            row_data[target_col] = str(value)
                
                # Add default name if not mapped and it's required
                if 'name' not in row_data and 'name' in existing_column_names:
                    # Use first mapped column value or row number as name
                    if row_data:
                        first_val = next(iter(row_data.values()))
                        row_data['name'] = str(first_val) if first_val else f"Row {rows_imported + 1}"
                    else:
                        row_data['name'] = f"Row {rows_imported + 1}"
                
                # Only insert if we have data
                if row_data:
                    await insert_row(db, table, row_data)
                    rows_imported += 1
            
            # Update progress
            progress = min(100, int((i + batch_size) / total_rows * 100))
            upload_data['progress'] = progress
            upload_data['rows_processed'] = rows_imported
            
            await db.commit()
        
        # Mark as completed
        upload_data['status'] = 'completed'
        upload_data['progress'] = 100
        upload_data['rows_processed'] = rows_imported
        
    except Exception as e:
        upload_data['status'] = 'failed'
        upload_data['error'] = str(e)
        await db.rollback()

@router.get("/{upload_id}/status")
async def get_import_status(
    upload_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get import status"""
    if upload_id not in import_cache:
        raise HTTPException(status_code=404, detail="Upload not found")
    
    upload_data = import_cache[upload_id]
    if upload_data['user_id'] != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return {
        'upload_id': upload_id,
        'status': upload_data['status'],
        'progress': upload_data['progress'],
        'error': upload_data.get('error'),
        'total_rows': len(upload_data['dataframe']) if 'dataframe' in upload_data else 0,
    }
