import secrets, datetime as dt
from sqlalchemy import select, update, delete, func
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List

from app.models import User, Session, Project, ResourceShare, project_members
from app.security import (
    hash_password, verify_password, _hash, normalize_email, utc_now_naive
)
from app.emails import send_verification_email, send_reset_email

SESSION_TTL = dt.timedelta(weeks=2)

def _new_session_token() -> str:
    # 32 bytes url-safe random token
    return secrets.token_urlsafe(32)

async def _create_session(
    db: AsyncSession,
    user: User,
    *,
    user_agent: Optional[str],
    ip_address: Optional[str],
) -> str:
    token = _new_session_token()
    token_hash = _hash(token)
    session = Session(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=utc_now_naive() + SESSION_TTL,
        user_agent=user_agent,
        ip_address=ip_address,
    )
    db.add(session)
    await db.flush()
    # Don't commit here - let the calling function handle it
    return token





async def register(db: AsyncSession, *, email: str, password: str, name: Optional[str], user_agent: Optional[str] = None, ip_address: Optional[str] = None):
    norm = normalize_email(email)
    # Enforce uniqueness on normalized email to prevent case/space collisions
    if await db.scalar(select(User).where(User.normalized_email == norm)):
        raise ValueError("email-taken")
    user_count = await db.scalar(select(func.count(User.id)))
    is_first_user = user_count == 0
    
    user = User(
        id=secrets.token_hex(8),
        email=email.strip(),
        normalized_email=norm,
        name=name,
        hashed_password=hash_password(password),
        verification_tok=secrets.token_hex(16),
    )
    db.add(user)
    await db.flush()  # Flush to get user.id
    
    # Auto-create default workspace project
    default_project = Project(
        id=secrets.token_hex(8),
        name="My Workspace",
        owner_id=user.id,
        user_id=user.id,
    )
    db.add(default_project)
    await db.flush()
    
    # Add user as owner in project_members
    await db.execute(
        project_members.insert().values(
            user_id=user.id,
            project_id=default_project.id,
            role="owner",
        )
    )
    
    # Resolve any pending ResourceShares for this email
    await db.execute(
        update(ResourceShare)
        .where(func.lower(ResourceShare.shared_with_email) == norm)
        .where(ResourceShare.shared_with_user_id.is_(None))
        .values(shared_with_user_id=user.id)
    )
    
    # send verification mail
    send_verification_email(user.email, user.verification_tok)
    # create a session for immediate login
    session_token = await _create_session(db, user, user_agent=user_agent, ip_address=ip_address)
    
    await db.commit()  # Single commit for user and session
    return user, session_token

async def authenticate(db: AsyncSession, *, email: str, password: str, user_agent: Optional[str] = None, ip_address: Optional[str] = None) -> Optional[str]:
    norm = normalize_email(email)
    user: Optional[User] = await db.scalar(select(User).where(User.normalized_email == norm))
    if not user or not verify_password(password, user.hashed_password):
        return None
    
    # Resolve any pending ResourceShares for this user's email
    await db.execute(
        update(ResourceShare)
        .where(func.lower(ResourceShare.shared_with_email) == norm)
        .where(ResourceShare.shared_with_user_id.is_(None))
        .values(shared_with_user_id=user.id)
    )
    
    # create a new session and return its opaque token
    session_token = await _create_session(db, user, user_agent=user_agent, ip_address=ip_address)
    await db.commit()  # Single commit
    return session_token

async def verify_email(db: AsyncSession, token: str) -> bool:
    user: Optional[User] = await db.scalar(select(User).where(User.verification_tok == token))
    if not user:
        return False
    user.is_verified = True
    user.verification_tok = None
    await db.flush()
    await db.commit()  # Add commit
    return True

async def request_password_reset(db: AsyncSession, email: str) -> Optional[str]:
    norm = normalize_email(email)
    user: Optional[User] = await db.scalar(select(User).where(User.normalized_email == norm))
    if not user:
        return None
    user.reset_token      = secrets.token_hex(16)
    user.reset_expires_at = utc_now_naive() + dt.timedelta(hours=1)
    await db.flush()
    await db.commit()
    send_reset_email(user.email, user.reset_token)
    return user.reset_token

async def reset_password(db: AsyncSession, token: str, new_password: str) -> bool:
    now  = utc_now_naive()
    stmt = select(User).where(User.reset_token == token, User.reset_expires_at > now)
    user: Optional[User] = await db.scalar(stmt)
    if not user:
        return False
    user.hashed_password  = hash_password(new_password)
    user.reset_token      = None
    user.reset_expires_at = None
    await db.execute(
        update(Session)
        .where(Session.user_id == user.id, Session.revoked == False)
        .values(revoked=True)
    )
    await db.flush()
    await db.commit()
    return True

async def logout(db: AsyncSession, session_token: str):
    # Revoke the current session (best effort)
    token_hash = _hash(session_token)
    session: Optional[Session] = await db.scalar(
        select(Session).where(Session.token_hash == token_hash, Session.revoked == False)
    )
    if session:
        session.revoked = True
        await db.flush()
        await db.commit()  # Commit the revocation
    token_hash = _hash(session_token)
    session: Optional[Session] = await db.scalar(
        select(Session).where(Session.token_hash == token_hash, Session.revoked == False)
    )
    if session:
        session.revoked = True
        await db.flush()
        await db.commit()  # Commit the revocation
