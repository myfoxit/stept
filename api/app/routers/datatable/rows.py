"""Row/field endpoints — all require auth + project permissions."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.security import get_current_user, check_project_permission
from app.models import User, ProjectRole
from app.schemas.datatable import RowCreate, RowCreateAtPosition, RowUpdate
from app.crud.datatable.table import get_table
from app.crud.datatable.field import (
    insert_row, insert_row_at_position, get_rows,
    delete_row, update_row, search_rows,
)

router = APIRouter()


@router.post("/")
async def api_insert_row(
    body: RowCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tbl = await get_table(db, body.table_id)
    if not tbl:
        raise HTTPException(status_code=404, detail="Table not found")
    await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.EDITOR)
    try:
        return await insert_row(db, tbl, body.data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/position")
async def api_insert_row_at_position(
    body: RowCreateAtPosition,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tbl = await get_table(db, body.table_id)
    if not tbl:
        raise HTTPException(status_code=404, detail="Table not found")
    await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.EDITOR)
    try:
        return await insert_row_at_position(
            db, tbl, body.data,
            position=body.position,
            reference_row_id=body.reference_row_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{table_id}")
async def api_get_rows(
    table_id: str,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    apply_filters: bool = True,
    apply_sorts: bool = True,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tbl = await get_table(db, table_id)
    if not tbl:
        raise HTTPException(status_code=404, detail="Table not found")
    await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.VIEWER)
    return await get_rows(
        db, tbl, limit=limit, offset=offset,
        user_id=current_user.id,
        apply_filters=apply_filters,
        apply_sorts=apply_sorts,
    )


@router.get("/{table_id}/search")
async def api_search_rows(
    table_id: str,
    q: str = Query(""),
    scope: str = Query("global"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tbl = await get_table(db, table_id)
    if not tbl:
        raise HTTPException(status_code=404, detail="Table not found")
    await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.VIEWER)
    return await search_rows(db, tbl, q, scope=scope, limit=limit, offset=offset)


@router.delete("/{table_id}/{row_id}")
async def api_delete_row(
    table_id: str,
    row_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tbl = await get_table(db, table_id)
    if not tbl:
        raise HTTPException(status_code=404, detail="Table not found")
    await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.EDITOR)
    return await delete_row(db, tbl, row_id)


@router.patch("/{table_id}/{row_id}")
async def api_update_row(
    table_id: str,
    row_id: int,
    body: RowUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tbl = await get_table(db, table_id)
    if not tbl:
        raise HTTPException(status_code=404, detail="Table not found")
    await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.EDITOR)
    try:
        return await update_row(db, tbl, row_id, body.data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
