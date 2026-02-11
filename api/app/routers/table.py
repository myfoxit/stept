from fastapi import APIRouter, Depends, HTTPException, Path, Body
from sqlalchemy.ext.asyncio import AsyncSession
from app.schemas.table import TableCreate, TableRead, TableUpdate
from app.crud.table import create_table, get_table, get_tables, drop_table, update_table
from app.database import get_session as get_db
from app.security import ProjectPermissionChecker
from app.models import ProjectRole

router = APIRouter()

@router.post("/", response_model=TableRead)
async def api_create_table(
    t: TableCreate = Body(...),  # Explicitly mark as body parameter
    db: AsyncSession = Depends(get_db), 
    auth: tuple = Depends(ProjectPermissionChecker(ProjectRole.EDITOR))
):
    # The permission checker will now receive the Pydantic model directly
    # and extract project_id from it without interfering with parsing
    return await create_table(db, t.name, t.project_id)

@router.get("/{project_id}", response_model=list[TableRead])
async def api_list_tables(
    project_id: str,  # This parameter will be passed to ProjectPermissionChecker
    db: AsyncSession = Depends(get_db), 
    auth: tuple = Depends(ProjectPermissionChecker(ProjectRole.VIEWER))
):
    return await get_tables(db, project_id)

@router.get("/table/{table_id}", response_model=TableRead)  # Changed path to avoid conflict
async def api_get_table(
    table_id: str,
    db: AsyncSession = Depends(get_db), 
    auth: tuple = Depends(ProjectPermissionChecker(ProjectRole.VIEWER))
):
    # Permission checker will validate access before this code runs
    table = await get_table(db, table_id=table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    return table

@router.delete("/{table_id}", response_model=TableRead)
async def api_drop_table(
    table_id: str,  # This parameter will be passed to ProjectPermissionChecker
    db: AsyncSession = Depends(get_db), 
    auth: tuple = Depends(ProjectPermissionChecker(ProjectRole.ADMIN))
):
    res = await drop_table(db, table_id)
    if not res:
        raise HTTPException(status_code=404, detail="Not found")
    return res

@router.put("/{table_id}", response_model=TableRead)
async def api_update_table(
    table_id: str,  # This parameter will be passed to ProjectPermissionChecker
    data: TableUpdate,
    db: AsyncSession = Depends(get_db),
    auth: tuple = Depends(ProjectPermissionChecker(ProjectRole.EDITOR))
):
    try:
        return await update_table(db, table_id, data.name)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
