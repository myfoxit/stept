from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.schemas.user import UserCreate, UserRead
from app.crud.user import create_user, get_users
from app.database import get_session as get_db
from app.security import get_current_user  # optional auth for admin routes

router = APIRouter()

@router.post("/", response_model=UserRead)
async def api_create_user(
    u: UserCreate,
    db: AsyncSession = Depends(get_db),
    _ = Depends(get_current_user),          # protect route if desired
):
    return await create_user(db, u.email, u.password, u.name)

@router.get("/", response_model=list[UserRead])
async def api_list_users(db: AsyncSession = Depends(get_db)):
    return await get_users(db)
