# app/api/document.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_session as get_db
from app.schemas.text_container import (
    TextContainerCreate,
    TextContainerUpdate,
    TextContainerRead,
)
from app.crud.text_container import (
    create_text_container,
    get_text_container,
    upsert_text_container,
    get_all_text_containers,
)
from app.security import get_current_user
from app.models import User

router = APIRouter()

@router.get("/", response_model=list[TextContainerRead] ,response_model_exclude={"__all__": {"content"}},)
async def api_list_text_containers(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await get_all_text_containers(db)

@router.get("/{container_id}", response_model=TextContainerRead)
async def api_get_text_container(
    container_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tc = await get_text_container(container_id, db)
    if not tc:
        raise HTTPException(status_code=404, detail="text container not found")
    return tc

@router.post("/", response_model=TextContainerRead, status_code=201)
async def api_create_text_container(
    payload: TextContainerCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await create_text_container(db, name=payload.name, content=payload.content)

@router.put("/{container_id}/", response_model=TextContainerRead  )
async def api_update_text_container(
    payload: TextContainerUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await upsert_text_container(
        payload.id,
        db,
        name=payload.name,
        content=payload.content or {},
    )
