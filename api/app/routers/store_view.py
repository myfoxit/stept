from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.schemas.store_view import StoreViewCreate, StoreViewRead
from app.crud.store_view import (
    create_store_view,
    get_store_view,
    list_store_views,
    delete_store_view,
)

router = APIRouter()

@router.post("/", response_model=StoreViewRead)
async def api_create_store_view(body: StoreViewCreate, db: AsyncSession = Depends(get_db)):
    return await create_store_view(db, body)

@router.get("/", response_model=list[StoreViewRead])
async def api_list_store_views(db: AsyncSession = Depends(get_db)):
    return await list_store_views(db)

@router.get("/{sv_id}", response_model=StoreViewRead)
async def api_get_store_view(sv_id: str, db: AsyncSession = Depends(get_db)):
    sv = await get_store_view(db, sv_id)
    if not sv:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "store view not found")
    return sv

@router.delete("/{sv_id}", status_code=status.HTTP_204_NO_CONTENT)
async def api_delete_store_view(sv_id: str, db: AsyncSession = Depends(get_db)):
    try:
        await delete_store_view(db, sv_id)
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))
