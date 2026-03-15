"""Lookup column endpoints — all require auth."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.security import get_current_user, check_project_permission
from app.models import User, ProjectRole, ColumnMeta
from app.schemas.datatable import LookupCreate
from app.crud.datatable.table import get_table
from app.crud.datatable.lookup import create_lookup_column, delete_lookup_column

router = APIRouter()


@router.post("/")
async def api_create_lookup(
    body: LookupCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rel_col = await db.get(ColumnMeta, body.relation_column_id)
    if not rel_col:
        raise HTTPException(status_code=404, detail="Relation column not found")
    tbl = await get_table(db, rel_col.table_id)
    if tbl:
        await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.EDITOR)
    try:
        col = await create_lookup_column(db, body.relation_column_id, body.lookup_column_id, body.custom_name)
        return {"id": col.id, "name": col.display_name}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{column_id}")
async def api_delete_lookup(
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
        await delete_lookup_column(db, column_id)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
