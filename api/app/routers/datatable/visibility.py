"""Column visibility endpoints — all require auth."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.security import get_current_user, check_project_permission
from app.models import User, ProjectRole
from app.schemas.datatable import VisibilityCreate, VisibilityBulk, VisibilityRead
from app.crud.datatable.table import get_table
from app.crud.datatable.visibility import (
    create_visibility, get_visibility, bulk_update_visibility,
    delete_visibility, clear_visibility,
)

router = APIRouter()


@router.post("/", response_model=VisibilityRead)
async def api_create_visibility(
    body: VisibilityCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tbl = await get_table(db, body.table_id)
    if not tbl:
        raise HTTPException(status_code=404, detail="Table not found")
    await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.VIEWER)
    return await create_visibility(db, current_user.id, body.table_id, body.column_id, body.is_visible)


@router.get("/", response_model=list[VisibilityRead])
async def api_list_visibility(
    table_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tbl = await get_table(db, table_id)
    if not tbl:
        raise HTTPException(status_code=404, detail="Table not found")
    await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.VIEWER)
    return await get_visibility(db, current_user.id, table_id)


@router.post("/bulk", response_model=list[VisibilityRead])
async def api_bulk_visibility(
    body: VisibilityBulk,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tbl = await get_table(db, body.table_id)
    if not tbl:
        raise HTTPException(status_code=404, detail="Table not found")
    await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.VIEWER)
    return await bulk_update_visibility(db, current_user.id, body.table_id, body.columns)


@router.delete("/{visibility_id}")
async def api_delete_visibility(
    visibility_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not await delete_visibility(db, visibility_id, current_user.id):
        raise HTTPException(status_code=404, detail="Visibility setting not found")
    return {"ok": True}


@router.delete("/table/{table_id}")
async def api_clear_visibility(
    table_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tbl = await get_table(db, table_id)
    if not tbl:
        raise HTTPException(status_code=404, detail="Table not found")
    await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.VIEWER)
    count = await clear_visibility(db, current_user.id, table_id)
    return {"deleted": count}
