import os, datetime as dt
import logging
import json
from typing import Any, Optional, Dict, List, Set, Protocol
from passlib.context import CryptContext
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from app.database import get_session as get_db
from app.models import User, Session, Document, project_members, ProjectRole
from hashlib import sha256
from enum import Enum
from app.models import PermissionLevel

SESSION_COOKIE_NAME = "session_stept"

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

logger = logging.getLogger(__name__)

def normalize_email(email: str) -> str:
    # Trim spaces and lowercase to enforce consistent identity comparisons
    return email.strip().lower()

# New: helpers for UTC time
def utc_now() -> dt.datetime:
    # Timezone-aware UTC for application logic
    return dt.datetime.now(dt.timezone.utc)

def utc_now_naive() -> dt.datetime:
    # Naive UTC for DB bindings to TIMESTAMP WITHOUT TIME ZONE columns
    return utc_now().replace(tzinfo=None)

def hash_password(password: str) -> str:
    return pwd_ctx.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_ctx.verify(plain, hashed)

def _hash(value: str) -> str:
    return sha256(value.encode()).hexdigest()



from fastapi.security.utils import get_authorization_scheme_param
import jwt
from app.config import settings
from sqlalchemy import select

async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    # 1) Try cookie-based session (web app)
    token: Optional[str] = request.cookies.get(SESSION_COOKIE_NAME)
    if token:
        token_hash = _hash(token)
        now = utc_now_naive()
        session = await db.scalar(
            select(Session).where(
                Session.token_hash == token_hash,
                Session.revoked == False,
                Session.expires_at > now,
            )
        )
        if session:
            user = await db.scalar(select(User).where(User.id == session.user_id))
            if user:
                return user

    # 2) Fallback to Authorization: Bearer <access_token> (desktop app)
    auth_header = request.headers.get("Authorization")
    scheme, credentials = get_authorization_scheme_param(auth_header)

    if not auth_header or scheme.lower() != "bearer":
        # Neither cookie nor bearer token -> not authenticated
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="NO_SESSION"
        )

    # Support comma-separated JWT secrets for rotation
    from app.core.jwt import get_jwt_secrets
    jwt_secrets = get_jwt_secrets()

    payload = None
    for secret in jwt_secrets:
        try:
            payload = jwt.decode(credentials, secret, algorithms=["HS256"])
            break
        except jwt.InvalidTokenError:
            continue
    if payload is None:
        raise HTTPException(status_code=401, detail="INVALID_TOKEN")

    user_id = payload.get("sub")
    token_type = payload.get("type")

    if not user_id or token_type != "access":
        raise HTTPException(status_code=401, detail="INVALID_TOKEN")

    user = await db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=401, detail="INVALID_SESSION")

    return user


async def get_current_user_optional(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """Like get_current_user but returns None instead of raising 401."""
    try:
        return await get_current_user(request, db)
    except HTTPException:
        return None


# New: Protocol for project context extractors
class ProjectContextExtractor(Protocol):
    """Protocol for extracting project_id from various sources"""
    async def extract(self, db: AsyncSession, **kwargs) -> Optional[str]:
        ...


class DocumentProjectExtractor:
    """Extract project_id from document_id"""
    async def extract(self, db: AsyncSession, document_id: str = None, **kwargs) -> Optional[str]:
        if not document_id:
            return None
        stmt = select(Document.project_id).where(Document.id == document_id)
        return await db.scalar(stmt)


class DirectProjectExtractor:
    """Extract project_id directly from parameter"""
    async def extract(self, db: AsyncSession, project_id: str = None, **kwargs) -> Optional[str]:
        return project_id


class BodyProjectExtractor:
    """Extract project_id from request body (for POST requests)"""
    def __init__(self, body_data: Optional[dict] = None):
        self.body_data = body_data
    
    async def extract(self, db: AsyncSession, **kwargs) -> Optional[str]:
        if self.body_data:
            return self.body_data.get("project_id")
        return None


class ProjectPermissionChecker:
    """
    Dependency class for checking project permissions.
    Usage: 
        auth = Depends(ProjectPermissionChecker(ProjectRole.EDITOR))
    
    Automatically gets current user and validates their role in the project.
    """
    def __init__(self, required_role: ProjectRole = ProjectRole.VIEWER):
        self.required_role = required_role
        # Initialize extractors in priority order
        self.extractors = [
            DirectProjectExtractor(),
            DocumentProjectExtractor(),
        ]
    
    async def _extract_project_id(
        self,
        db: AsyncSession,
        request: Request,
        **params
    ) -> Optional[str]:
        """Extract project_id using chain of responsibility pattern"""
        
        # Try each extractor in order
        for extractor in self.extractors:
            project_id = await extractor.extract(db, **params)
            if project_id:
                logger.debug(f"Extracted project_id {project_id} using {extractor.__class__.__name__}")
                return project_id
        
        # For POST requests with body, extract from Pydantic model if available
        if request.method == "POST" and "body" in params and params["body"]:
            body = params["body"]
            # Handle Pydantic models
            if hasattr(body, "project_id"):
                return body.project_id
            # Handle dict-like objects
            elif isinstance(body, dict):
                if "project_id" in body:
                    return body.get("project_id")
        
        # NEW: Fallbacks when dependency params are not populated
        # 1) Path params
        pid = request.path_params.get("project_id") if hasattr(request, "path_params") else None
        if pid:
            return pid
        # 2) Query params
        pid = request.query_params.get("project_id") if hasattr(request, "query_params") else None
        if pid:
            return pid
        # 3) Body JSON (safe best-effort; body is cached by Starlette)
        if request.method in {"POST", "PUT", "PATCH"}:
            try:
                payload = await request.json()
                if isinstance(payload, dict):
                    pid = payload.get("project_id")
                    if pid:
                        return pid
            except Exception:
                pass
        
        return None
    
    async def __call__(
        self,
        request: Request,
        db: AsyncSession = Depends(get_db),
        document_id: Optional[str] = None,
        project_id: Optional[str] = None,
        body: Optional[Any] = None,  # Will be injected by FastAPI for POST requests
    ) -> tuple[User, ProjectRole]:
        """
        Check if the current user has the required role in the project.
        Returns the user and their actual role if authorized.
        """
        # Get current user automatically - this will raise 401 if not authenticated
        current_user = await get_current_user(request, db)
        
        logger.debug(f"Permission check for user {current_user.id}: project_id={project_id}, document_id={document_id}")
        
        # Extract project_id using the chain of extractors
        extracted_project_id = await self._extract_project_id(
            db=db,
            request=request,
            document_id=document_id,
            project_id=project_id,
            body=body
        )
        
        if not extracted_project_id:
            logger.error(f"No project_id could be extracted for permission check. Request path: {request.url.path}")
            raise HTTPException(
                status_code=403,
                detail="Access denied - unable to determine project context"
            )
        
        # Query the user's role in the project
        stmt = select(project_members.c.role).where(
            and_(
                project_members.c.project_id == extracted_project_id,
                project_members.c.user_id == current_user.id
            )
        )
        result = await db.execute(stmt)
        user_role_value = result.scalar_one_or_none()
        
        # CRITICAL FIX: Properly handle non-members (None result)
        if user_role_value is None:
            logger.warning(f"User {current_user.id} is not a member of project {extracted_project_id}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied - you are not a member of this project"
            )
        
        # Convert to ProjectRole enum safely
        if hasattr(user_role_value, 'value'):
            role_str = user_role_value.value
        else:
            role_str = user_role_value
            
        user_role = ProjectRole.from_string(role_str)
        
        # Check if user has sufficient permissions
        if not user_role.has_permission(self.required_role):
            logger.warning(f"User {current_user.id} has insufficient permissions. Required: {self.required_role.value}, Has: {user_role.value}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required: {self.required_role.value}, Your role: {user_role.value}"
            )
        
        logger.debug(f"Permission granted for user {current_user.id} with role {user_role.value} in project {extracted_project_id}")
        return current_user, user_role


# New: Async version of check_project_permission helper
async def check_project_permission(
    db: AsyncSession,
    user_id: str,
    project_id: str,
    required_role: ProjectRole = ProjectRole.VIEWER
) -> ProjectRole:
    """
    Check if a user has the required permission level for a project.
    Returns the user's actual role if authorized, raises HTTPException otherwise.
    """
    stmt = select(project_members.c.role).where(
        and_(
            project_members.c.project_id == project_id,
            project_members.c.user_id == user_id
        )
    )
    result = await db.execute(stmt)
    user_role_value = result.scalar_one_or_none()
    
    # CRITICAL FIX: Properly handle non-members
    if user_role_value is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this project"
        )
    
    # Safe enum conversion
    if hasattr(user_role_value, 'value'):
        role_str = user_role_value.value
    else:
        role_str = user_role_value
        
    user_role = ProjectRole.from_string(role_str)
    
    if not user_role.has_permission(required_role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Insufficient permissions"
        )
    
    return user_role


# New: Async helper to get user's role in project (returns None if not member)
async def get_user_project_role(
    db: AsyncSession,
    user_id: str,
    project_id: str
) -> Optional[ProjectRole]:
    """
    Get a user's role in a project.
    Returns None if user is not a member.
    """
    stmt = select(project_members.c.role).where(
        and_(
            project_members.c.project_id == project_id,
            project_members.c.user_id == user_id
        )
    )
    result = await db.execute(stmt)
    user_role_value = result.scalar_one_or_none()
    
    if user_role_value is None:
        return None
    
    # Safe enum conversion
    if hasattr(user_role_value, 'value'):
        role_str = user_role_value.value
    else:
        role_str = user_role_value
        
    return ProjectRole.from_string(role_str)


# Pre-configured permission checkers for common use cases
require_viewer = ProjectPermissionChecker(ProjectRole.VIEWER)
require_member = ProjectPermissionChecker(ProjectRole.MEMBER)
require_editor = ProjectPermissionChecker(ProjectRole.EDITOR)
require_admin = ProjectPermissionChecker(ProjectRole.ADMIN)
require_owner = ProjectPermissionChecker(ProjectRole.OWNER)


