"""Sort endpoints — all require auth."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.security import get_current_user, check_project_permission
from app.models import User, ProjectRole
from app.schemas.datatable import SortCreate, SortUpdate, SortRead
from app.crud.datatable.table import get_table
from app.crud.datatable.sort import create_sort, get_sorts, update_sort, delete_sort, clear_sorts

router = APIRouter()


@router.post("/", response_model=SortRead)
async def api_create_sort(
    body: SortCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tbl = await get_table(db, body.table_id)
    if not tbl:
        raise HTTPException(status_code=404, detail="Table not found")
    await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.VIEWER)
    return await create_sort(db, current_user.id, body.table_id, body.column_id, body.direction, body.priority)


@router.get("/", response_model=list[SortRead])
async def api_list_sorts(
    table_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tbl = await get_table(db, table_id)
    if not tbl:
        raise HTTPException(status_code=404, detail="Table not found")
    await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.VIEWER)
    return await get_sorts(db, current_user.id, table_id)


@router.patch("/{sort_id}", response_model=SortRead)
async def api_update_sort(
    sort_id: str,
    body: SortUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await update_sort(db, sort_id, current_user.id, body.model_dump(exclude_unset=True))
    if not result:
        raise HTTPException(status_code=404, detail="Sort not found")
    return result


@router.delete("/{sort_id}")
async def api_delete_sort(
    sort_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not await delete_sort(db, sort_id, current_user.id):
        raise HTTPException(status_code=404, detail="Sort not found")
    return {"ok": True}


@router.delete("/table/{table_id}")
async def api_clear_sorts(
    table_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tbl = await get_table(db, table_id)
    if not tbl:
        raise HTTPException(status_code=404, detail="Table not found")
    await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.VIEWER)
    count = await clear_sorts(db, current_user.id, table_id)
    return {"deleted": count}
