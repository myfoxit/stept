"""Filter endpoints — all require auth."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.security import get_current_user, check_project_permission
from app.models import User, ProjectRole, ColumnMeta
from app.schemas.datatable import FilterCreate, FilterUpdate, FilterRead, OPERATIONS_BY_UI_TYPE
from app.crud.datatable.table import get_table
from app.crud.datatable.filter import create_filter, get_filters, update_filter, delete_filter

router = APIRouter()


@router.post("/", response_model=FilterRead)
async def api_create_filter(
    body: FilterCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tbl = await get_table(db, body.table_id)
    if not tbl:
        raise HTTPException(status_code=404, detail="Table not found")
    await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.VIEWER)
    try:
        return await create_filter(
            db, current_user.id, body.name, body.table_id,
            body.column_id, body.operation, body.value, body.is_reusable,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/", response_model=list[FilterRead])
async def api_list_filters(
    table_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tbl = await get_table(db, table_id)
    if not tbl:
        raise HTTPException(status_code=404, detail="Table not found")
    await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.VIEWER)
    return await get_filters(db, current_user.id, table_id)


@router.patch("/{filter_id}", response_model=FilterRead)
async def api_update_filter(
    filter_id: str,
    body: FilterUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await update_filter(db, filter_id, current_user.id, body.model_dump(exclude_unset=True))
    if not result:
        raise HTTPException(status_code=404, detail="Filter not found")
    return result


@router.delete("/{filter_id}")
async def api_delete_filter(
    filter_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not await delete_filter(db, filter_id, current_user.id):
        raise HTTPException(status_code=404, detail="Filter not found")
    return {"ok": True}


@router.get("/operations/{column_id}")
async def api_get_operations(
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
    return {"operations": OPERATIONS_BY_UI_TYPE.get(col.ui_type, [])}
