"""Rollup endpoints — all require auth."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.security import get_current_user, check_project_permission
from app.models import User, ProjectRole, ColumnMeta
from app.schemas.datatable import RollupCreate, RollupUpdate
from app.crud.datatable.table import get_table
from app.crud.datatable.rollup import add_rollup, get_rollup, update_rollup, delete_rollup

router = APIRouter()


@router.post("/")
async def api_add_rollup(
    body: RollupCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tbl = await get_table(db, body.table_id)
    if not tbl:
        raise HTTPException(status_code=404, detail="Table not found")
    await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.EDITOR)
    try:
        r = await add_rollup(
            db, body.display_name, body.table_id,
            body.relation_column_id, body.aggregate_func,
            body.rollup_column_id, body.precision, body.show_thousands_sep,
        )
        return {"id": r.id, "column_id": r.column_id, "aggregate_func": r.aggregate_func}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{column_id}")
async def api_get_rollup(
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
    r = await get_rollup(db, column_id)
    if not r:
        raise HTTPException(status_code=404, detail="Rollup not found")
    return {"id": r.id, "column_id": r.column_id, "aggregate_func": r.aggregate_func,
            "relation_column_id": r.relation_column_id, "rollup_column_id": r.rollup_column_id}


@router.patch("/{column_id}")
async def api_update_rollup(
    column_id: str,
    body: RollupUpdate,
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
        r = await update_rollup(
            db, column_id,
            relation_column_id=body.relation_column_id,
            rollup_column_id=body.rollup_column_id,
            aggregate_func=body.aggregate_func,
            precision=body.precision,
            show_thousands_sep=body.show_thousands_sep,
        )
        return {"id": r.id, "aggregate_func": r.aggregate_func}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{column_id}")
async def api_delete_rollup(
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
        await delete_rollup(db, column_id)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
