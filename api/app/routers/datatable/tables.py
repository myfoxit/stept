"""Table endpoints — all require auth + project permissions."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.security import get_current_user, check_project_permission
from app.models import User, ProjectRole
from app.schemas.datatable import TableCreate, TableRead, TableUpdate
from app.crud.datatable.table import create_table, get_tables, get_table, drop_table, update_table

router = APIRouter()


@router.post("/", response_model=TableRead)
async def api_create_table(
    body: TableCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await check_project_permission(db, current_user.id, body.project_id, ProjectRole.EDITOR)
    return await create_table(db, body.name, body.project_id)


@router.get("/{project_id}", response_model=list[TableRead])
async def api_list_tables(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await check_project_permission(db, current_user.id, project_id, ProjectRole.VIEWER)
    return await get_tables(db, project_id)


@router.get("/table/{table_id}", response_model=TableRead)
async def api_get_table(
    table_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tbl = await get_table(db, table_id)
    if not tbl:
        raise HTTPException(status_code=404, detail="Table not found")
    await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.VIEWER)
    return tbl


@router.delete("/{table_id}")
async def api_drop_table(
    table_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tbl = await get_table(db, table_id)
    if not tbl:
        raise HTTPException(status_code=404, detail="Table not found")
    await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.ADMIN)
    result = await drop_table(db, table_id)
    if not result:
        raise HTTPException(status_code=404, detail="Table not found")
    return {"ok": True}


@router.put("/{table_id}", response_model=TableRead)
async def api_update_table(
    table_id: str,
    body: TableUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tbl = await get_table(db, table_id)
    if not tbl:
        raise HTTPException(status_code=404, detail="Table not found")
    await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.EDITOR)
    try:
        return await update_table(db, table_id, body.name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
