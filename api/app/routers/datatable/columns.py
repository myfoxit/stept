"""Column endpoints — all require auth + project permissions."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.security import get_current_user, check_project_permission
from app.models import User, ProjectRole
from app.schemas.datatable import ColumnCreate, ColumnRead, ColumnUpdate, ColumnReorder
from app.crud.datatable.table import get_table
from app.crud.datatable.column import (
    add_column, get_columns, delete_column, update_column, reorder_column,
)

router = APIRouter()


@router.post("/", response_model=ColumnRead)
async def api_add_column(
    body: ColumnCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tbl = await get_table(db, body.table_id)
    if not tbl:
        raise HTTPException(status_code=404, detail="Table not found")
    await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.EDITOR)
    try:
        col = await add_column(
            db, tbl, body.name, body.ui_type,
            scale=body.scale, position=body.position,
            reference_column_id=body.reference_column_id,
            default_value=body.default_value, settings=body.settings,
        )
        setattr(col, "relation_id", None)
        setattr(col, "allowed_operations", [])
        setattr(col, "active_filters", [])
        return col
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{table_id}", response_model=list[ColumnRead])
async def api_list_columns(
    table_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tbl = await get_table(db, table_id)
    if not tbl:
        raise HTTPException(status_code=404, detail="Table not found")
    await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.VIEWER)
    return await get_columns(db, table_id, user_id=current_user.id)


@router.delete("/{column_id}")
async def api_delete_column(
    column_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models import ColumnMeta
    col = await db.get(ColumnMeta, column_id)
    if not col:
        raise HTTPException(status_code=404, detail="Column not found")
    tbl = await get_table(db, col.table_id)
    if not tbl:
        raise HTTPException(status_code=404, detail="Table not found")
    await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.EDITOR)
    try:
        await delete_column(db, column_id)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{column_id}", response_model=ColumnRead)
async def api_update_column(
    column_id: str,
    body: ColumnUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models import ColumnMeta
    col = await db.get(ColumnMeta, column_id)
    if not col:
        raise HTTPException(status_code=404, detail="Column not found")
    tbl = await get_table(db, col.table_id)
    if not tbl:
        raise HTTPException(status_code=404, detail="Table not found")
    await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.EDITOR)
    try:
        result = await update_column(db, column_id, body)
        setattr(result, "relation_id", None)
        setattr(result, "allowed_operations", [])
        setattr(result, "active_filters", [])
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{column_id}/reorder", response_model=ColumnRead)
async def api_reorder_column(
    column_id: str,
    body: ColumnReorder,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models import ColumnMeta
    col = await db.get(ColumnMeta, column_id)
    if not col:
        raise HTTPException(status_code=404, detail="Column not found")
    tbl = await get_table(db, col.table_id)
    if not tbl:
        raise HTTPException(status_code=404, detail="Table not found")
    await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.EDITOR)
    try:
        result = await reorder_column(db, column_id, body.new_position)
        setattr(result, "relation_id", None)
        setattr(result, "allowed_operations", [])
        setattr(result, "active_filters", [])
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
