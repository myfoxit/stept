from typing import Optional
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.utils import gen_suffix
from app.models import User, Session
from app.security import hash_password

async def create_user(db: AsyncSession, email: str, password: str, name: Optional[str] = None):
    meta_id = gen_suffix(16)
    user = User(
        id=meta_id,
        email=email,
        name=name,
        hashed_password=hash_password(password),
        is_verified=True,       # created by admin route, skip e-mail flow
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user

async def get_users(db: AsyncSession):
    res = await db.execute(select(User))
    return res.scalars().all()

async def delete_user_by_email(db: AsyncSession, email: str) -> int:
    """
    Delete a user and their sessions by email. Returns 1 if deleted, 0 if not found.
    """
    user = await db.scalar(select(User).where(User.email == email))
    if not user:
        return 0
    # Delete sessions first (best-effort)
    await db.execute(delete(Session).where(Session.user_id == user.id))
    # Delete the user
    await db.execute(delete(User).where(User.id == user.id))
    await db.commit()
    return 1

async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    """Return a user by email or None."""
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()
