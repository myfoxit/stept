from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.models import ColumnVisibility, ColumnMeta, TableMeta, User
from app.schemas.column_visibility import (
    ColumnVisibilityCreate,
    ColumnVisibilityRead,
    ColumnVisibilityUpdate,
    ColumnVisibilityBulkUpdate
)
from app.security import get_current_user

router = APIRouter()

@router.post("/", response_model=ColumnVisibilityRead)
async def create_column_visibility(
    visibility_in: ColumnVisibilityCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create or update column visibility preference."""
    # Check if preference already exists
    existing = await db.scalar(
        select(ColumnVisibility).where(
            ColumnVisibility.table_id == visibility_in.table_id,
            ColumnVisibility.user_id == current_user.id,
            ColumnVisibility.column_id == visibility_in.column_id,
        )
    )
    
    if existing:
        # Update existing preference
        existing.is_visible = visibility_in.is_visible
        await db.commit()
        await db.refresh(existing)
        return existing
    
    # Create new preference
    visibility = ColumnVisibility(
        **visibility_in.model_dump(),
        user_id=current_user.id,
    )
    db.add(visibility)
    await db.commit()
    await db.refresh(visibility)
    return visibility

@router.get("/", response_model=List[ColumnVisibilityRead])
async def list_column_visibility(
    table_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all column visibility preferences for current user."""
    query = select(ColumnVisibility).where(ColumnVisibility.user_id == current_user.id)
    
    if table_id:
        query = query.where(ColumnVisibility.table_id == table_id)
    
    result = await db.execute(query)
    return result.scalars().all()

@router.post("/bulk", response_model=List[ColumnVisibilityRead])
async def bulk_update_visibility(
    bulk_update: ColumnVisibilityBulkUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk update column visibility for a table."""
    updated = []
    
    for column_id, is_visible in bulk_update.visibility.items():
        # Check if preference exists
        existing = await db.scalar(
            select(ColumnVisibility).where(
                ColumnVisibility.table_id == bulk_update.table_id,
                ColumnVisibility.user_id == current_user.id,
                ColumnVisibility.column_id == column_id,
            )
        )
        
        if existing:
            existing.is_visible = is_visible
            updated.append(existing)
        else:
            # Create new preference
            new_visibility = ColumnVisibility(
                table_id=bulk_update.table_id,
                column_id=column_id,
                is_visible=is_visible,
                user_id=current_user.id,
            )
            db.add(new_visibility)
            updated.append(new_visibility)
    
    await db.commit()
    for item in updated:
        await db.refresh(item)
    
    return updated

@router.delete("/{visibility_id}")
async def delete_column_visibility(
    visibility_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a column visibility preference."""
    visibility = await db.get(ColumnVisibility, visibility_id)
    if not visibility:
        raise HTTPException(404, "Visibility preference not found")
    if visibility.user_id != current_user.id:
        raise HTTPException(403, "Not authorized")
    
    await db.delete(visibility)
    await db.commit()
    return {"deleted": visibility_id}

@router.delete("/table/{table_id}")
async def clear_table_visibility(
    table_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Clear all visibility preferences for a table."""
    await db.execute(
        delete(ColumnVisibility).where(
            ColumnVisibility.table_id == table_id,
            ColumnVisibility.user_id == current_user.id,
        )
    )
    await db.commit()
    return {"message": "All visibility preferences cleared"}
