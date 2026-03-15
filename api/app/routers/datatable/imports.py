"""Import endpoints — all require auth.

FIX: No background task session leak. Import processes synchronously
within the request session.
"""
import io
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.security import get_current_user, check_project_permission
from app.models import User, ProjectRole
from app.crud.datatable.table import get_table
from app.crud.datatable.imports import process_import

router = APIRouter()


@router.post("/{table_id}")
async def api_import_data(
    table_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tbl = await get_table(db, table_id)
    if not tbl:
        raise HTTPException(status_code=404, detail="Table not found")
    await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.EDITOR)

    content = await file.read()
    filename = file.filename or ""

    try:
        import pandas as pd

        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif filename.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(content))
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Use CSV or Excel.")

        # Clean data
        df = df.where(pd.notnull(df), None)
        rows = df.to_dict("records")

        # Auto-map columns: all as new single_line_text
        column_mapping: Dict[str, Any] = {}
        for col_name in df.columns:
            column_mapping[col_name] = {
                "action": "new",
                "target": col_name,
                "ui_type": "single_line_text",
            }

        result = await process_import(db, tbl, rows, column_mapping)
        return result

    except ImportError:
        raise HTTPException(status_code=500, detail="pandas is required for import")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
