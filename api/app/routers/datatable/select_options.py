"""Select option endpoints — all require auth."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.security import get_current_user, check_project_permission
from app.models import User, ProjectRole, ColumnMeta
from app.schemas.datatable import SelectColumnCreate, SelectOptionUpdate, SelectOptionAssign, MultiSelectOptionAssign
from app.crud.datatable.table import get_table
from app.crud.datatable.select_option import (
    add_select_column_with_options, get_select_options,
    update_select_options, delete_select_column,
    assign_select_option, assign_multi_select_options,
)

router = APIRouter()


@router.post("/")
async def api_add_select_column(
    body: SelectColumnCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tbl = await get_table(db, body.table_id)
    if not tbl:
        raise HTTPException(status_code=404, detail="Table not found")
    await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.EDITOR)
    col = await add_select_column_with_options(db, tbl, body.name, body.options, body.ui_type)
    return {"id": col.id, "name": col.display_name}


@router.get("/{column_id}")
async def api_list_options(
    column_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    col = await db.get(ColumnMeta, column_id)
    if not col:
        raise HTTPException(status_code=404, detail="Column not found")
    tbl = await get_table(db, col.table_id)
    if tbl:
        await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.VIEWER)
    options = await get_select_options(db, column_id)
    return [{"id": o.id, "name": o.name, "color": o.color, "order": o.order} for o in options]


@router.put("/{column_id}")
async def api_update_options(
    column_id: str,
    body: SelectOptionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    col = await db.get(ColumnMeta, column_id)
    if not col:
        raise HTTPException(status_code=404, detail="Column not found")
    tbl = await get_table(db, col.table_id)
    if tbl:
        await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.EDITOR)
    options = await update_select_options(db, column_id, body.options)
    return [{"id": o.id, "name": o.name, "color": o.color, "order": o.order} for o in options]


@router.delete("/{column_id}")
async def api_delete_select_column(
    column_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    col = await db.get(ColumnMeta, column_id)
    if not col:
        raise HTTPException(status_code=404, detail="Column not found")
    tbl = await get_table(db, col.table_id)
    if tbl:
        await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.EDITOR)
    try:
        await delete_select_column(db, column_id)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{column_id}/assign")
async def api_assign_option(
    column_id: str,
    body: SelectOptionAssign,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    col = await db.get(ColumnMeta, column_id)
    if not col:
        raise HTTPException(status_code=404, detail="Column not found")
    tbl = await get_table(db, col.table_id)
    if tbl:
        await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.EDITOR)
    try:
        return await assign_select_option(db, column_id, body.row_id, body.option_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{column_id}/assign-multi")
async def api_assign_multi_options(
    column_id: str,
    body: MultiSelectOptionAssign,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    col = await db.get(ColumnMeta, column_id)
    if not col:
        raise HTTPException(status_code=404, detail="Column not found")
    tbl = await get_table(db, col.table_id)
    if tbl:
        await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.EDITOR)
    try:
        return await assign_multi_select_options(db, column_id, body.row_id, body.option_ids)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
