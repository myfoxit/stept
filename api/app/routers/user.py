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
async def api_list_users(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    # Scope to project members only — never return all users
    from sqlalchemy import select
    from app.models import project_members, User
    # Get all project IDs this user is a member of
    member_project_ids = select(project_members.c.project_id).where(
        project_members.c.user_id == current_user.id
    )
    # Get all user IDs that share at least one project
    peer_user_ids = select(project_members.c.user_id).where(
        project_members.c.project_id.in_(member_project_ids)
    ).distinct()
    result = await db.execute(select(User).where(User.id.in_(peer_user_ids)))
    return result.scalars().all()
