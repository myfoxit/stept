from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict

from app.database import get_session as get_db
from app.schemas.filter import FilterCreate, FilterRead, FilterUpdate, OPERATIONS_BY_UI_TYPE
from app.crud.filter import (
    create_filter, get_filters, update_filter, delete_filter
)
from app.security import get_current_user
from app.models import User, ColumnMeta

router = APIRouter()

@router.post("/", response_model=FilterRead)
async def api_create_filter(
    filter_data: FilterCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        filter_obj = await create_filter(
            db,
            user_id=current_user.id,
            name=filter_data.name,
            table_id=filter_data.table_id,
            column_id=filter_data.column_id,
            operation=filter_data.operation,
            value=filter_data.value,
            is_reusable=filter_data.is_reusable,
        )
        await db.commit()
        return filter_obj
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))

@router.get("/", response_model=List[FilterRead])
async def api_list_filters(
    table_id: Optional[str] = None,
    include_reusable: bool = True,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await get_filters(
        db,
        user_id=current_user.id,
        table_id=table_id,
        include_reusable=include_reusable,
    )

@router.patch("/{filter_id}", response_model=FilterRead)
async def api_update_filter(
    filter_id: str,
    updates: FilterUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        filter_obj = await update_filter(
            db,
            filter_id=filter_id,
            user_id=current_user.id,
            updates=updates.dict(exclude_unset=True),
        )
        if not filter_obj:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Filter not found")
        await db.commit()
        return filter_obj
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))

@router.delete("/{filter_id}", status_code=status.HTTP_204_NO_CONTENT)
async def api_delete_filter(
    filter_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    success = await delete_filter(db, filter_id, current_user.id)
    if not success:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Filter not found")
    await db.commit()

@router.get("/operations/{column_id}", response_model=List[str])
async def api_get_column_operations(
    column_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get allowed filter operations for a specific column based on its ui_type"""
    column = await db.get(ColumnMeta, column_id)
    if not column:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Column not found")
    
    return OPERATIONS_BY_UI_TYPE.get(column.ui_type, [])
