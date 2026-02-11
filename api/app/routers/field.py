from app.security import get_current_user
from fastapi import APIRouter, Depends, HTTPException, Response  # ← add Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.schemas.field import FieldCreate
from app.crud.field import insert_row, insert_row_at_position, get_rows, delete_row, update_row, search_rows
from app.database import get_session as get_db
from app.models import TableMeta, User
from app.schemas.field import Row, FieldUpdate, RowPage, SearchRequest, FieldCreatePosition
from typing import Dict, Any, List, Optional
from app.security import ProjectPermissionChecker
from app.models import ProjectRole


router = APIRouter()

@router.post("/", response_model=dict)
async def api_insert_row(f: FieldCreate, db: AsyncSession = Depends(get_db)):
    tbl = await db.get(TableMeta, f.table_id)
    if not tbl:
        raise HTTPException(404, "table not found")
    return await insert_row(db, tbl, f.data)

@router.post("/position", response_model=dict)
async def api_insert_row_at_position(
    f: FieldCreatePosition, 
    db: AsyncSession = Depends(get_db),
    auth: tuple = Depends(ProjectPermissionChecker(ProjectRole.EDITOR)),
):
    # Extract table_id for the permission checker
    # The permission checker will now have access via the 'body' parameter
    tbl = await db.get(TableMeta, f.table_id)
    if not tbl:
        raise HTTPException(404, "table not found")
    return await insert_row_at_position(
        db, 
        tbl, 
        f.data, 
        position=f.position,
        reference_row_id=f.reference_row_id
    )


@router.get(
    "/{table_id}",
    response_model=RowPage,
    response_model_exclude={"items": {"__all__": {"created_at", "updated_at"}}}, 
)
async def api_list_rows_with_links(
    table_id: str,
    apply_filters: bool = True,
    apply_sorts: bool = True,
    limit: int = 100,     
    offset: int = 0,      
    response: Response = None,  
    db: AsyncSession = Depends(get_db),
    auth: tuple = Depends(ProjectPermissionChecker(ProjectRole.VIEWER)),
    
    current_user: Optional[User] = Depends(get_current_user),
):
    tbl = await db.get(TableMeta, table_id)
    if not tbl:
        raise HTTPException(404, "table not found")

    result = await get_rows(
        db, 
        tbl,
        limit=limit,
        offset=offset,
        user_id=current_user.id if current_user else None,
        apply_filters=apply_filters,
        apply_sorts=apply_sorts,  # ← NEW
    )
    return result

@router.get(
    "/{table_id}/search",
    response_model=RowPage,
    response_model_exclude={"items": {"__all__": {"created_at", "updated_at"}}},
)
async def api_search_rows_get(
    table_id: str,
    query: str,
    scope: str = "global",
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    auth: tuple = Depends(ProjectPermissionChecker(ProjectRole.VIEWER)),
):
    tbl = await db.get(TableMeta, table_id)
    if not tbl:
        raise HTTPException(404, "table not found")
    return await search_rows(db, tbl, query=query, scope=scope, limit=limit, offset=offset)

@router.post(
    "/{table_id}/search",
    response_model=RowPage,
    response_model_exclude={"items": {"__all__": {"created_at", "updated_at"}}},
)
async def api_search_rows_post(
    table_id: str,
    payload: SearchRequest,
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    auth: tuple = Depends(ProjectPermissionChecker(ProjectRole.VIEWER)),
):
    tbl = await db.get(TableMeta, table_id)
    if not tbl:
        raise HTTPException(404, "table not found")
    return await search_rows(
        db, tbl, query=payload.query, scope=payload.scope or "global", limit=limit, offset=offset
    )

@router.delete("/{table_id}/{row_id}", response_model=dict)
async def api_delete_row(
    table_id: str,
    row_id: int,
    db: AsyncSession = Depends(get_db),
    auth: tuple = Depends(ProjectPermissionChecker(ProjectRole.EDITOR)),
):
    tbl = await db.get(TableMeta, table_id)
    if not tbl:
        raise HTTPException(404, "table not found")
    return await delete_row(db, tbl, row_id)

@router.patch("/{table_id}/{row_id}", response_model=Dict[str, int])
async def patch_row(
    table_id: str,
    row_id: int,
    payload: FieldUpdate,
    db: AsyncSession = Depends(get_db),
    auth: tuple = Depends(ProjectPermissionChecker(ProjectRole.EDITOR)),
):
    try:
        tbl = await db.get(TableMeta, table_id)
        if not tbl:
            raise HTTPException(404, "table not found")
        return await update_row(db, tbl, row_id, payload.data)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
