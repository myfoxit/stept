from app.security import get_current_user
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.schemas.column import ColumnCreate, ColumnRead, ColumnUpdate
from app.crud.column import add_column, delete_column, get_columns, update_column, reorder_column 
from app.database import get_session as get_db
from app.models import TableMeta, User
from typing import Optional

router = APIRouter()

@router.post("/", response_model=ColumnRead)
async def api_add_column(c: ColumnCreate, db: AsyncSession = Depends(get_db)):
    tbl = await db.get(TableMeta, c.table_id)
    if not tbl:
        raise HTTPException(404, "table not found")
    return await add_column(
        db, 
        tbl, 
        c.name, 
        c.ui_type, 
        c.scale,
        c.position, 
        c.reference_column_id,
        c.default_value,  # NEW
        c.settings,  # NEW
    )

#
# NEW: Endpoint for reordering columns
@router.patch("/{column_id}/reorder")
async def api_reorder_column(
    column_id: str,
    new_position: int,
    db: AsyncSession = Depends(get_db),
):
    """Move a column to a new position (0-based index)."""
    try:
        return await reorder_column(db, column_id, new_position)
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))

@router.get("/{table_id}", response_model=list[ColumnRead])
async def api_list_columns(
    table_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    return await get_columns(
        db, 
        table_id=table_id,
        user_id=current_user.id if current_user else None,
    )

@router.delete("/{column_id}", status_code=status.HTTP_204_NO_CONTENT)
async def api_delete_column(
    column_id: str,
    db: AsyncSession = Depends(get_db),
):
    try:
        await delete_column(db, column_id)
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))

@router.patch("/{column_id}", response_model=ColumnRead)
async def api_update_column(
    column_id: str,
    updates: ColumnUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update column properties like name/display_name."""
    try:
        return await update_column(db, column_id, updates)
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))
