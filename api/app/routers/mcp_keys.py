"""CRUD router for MCP API keys."""
from __future__ import annotations

import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.models import McpApiKey, User, project_members
from app.security import get_current_user
from app.mcp_auth import hash_api_key
from app.utils import gen_suffix

router = APIRouter()


class McpKeyCreate(BaseModel):
    name: str


class McpKeyOut(BaseModel):
    id: str
    project_id: str
    name: str
    key_prefix: str
    created_at: Optional[str] = None
    last_used_at: Optional[str] = None
    is_active: bool


class McpKeyCreated(McpKeyOut):
    raw_key: str  # shown once


async def _check_admin(project_id: str, user: User, db: AsyncSession):
    """Verify user is admin/owner of the project."""
    result = await db.execute(
        select(project_members.c.role).where(
            project_members.c.project_id == project_id,
            project_members.c.user_id == user.id,
        )
    )
    row = result.first()
    if not row or row.role not in ("admin", "owner"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin or owner role required")


@router.get("/projects/{project_id}/mcp-keys", response_model=list[McpKeyOut])
async def list_mcp_keys(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _check_admin(project_id, current_user, db)
    result = await db.execute(
        select(McpApiKey)
        .where(McpApiKey.project_id == project_id)
        .order_by(McpApiKey.created_at.desc())
    )
    keys = result.scalars().all()
    return [
        McpKeyOut(
            id=k.id,
            project_id=k.project_id,
            name=k.name,
            key_prefix=k.key_prefix,
            created_at=str(k.created_at) if k.created_at else None,
            last_used_at=str(k.last_used_at) if k.last_used_at else None,
            is_active=k.is_active,
        )
        for k in keys
    ]


@router.post("/projects/{project_id}/mcp-keys", response_model=McpKeyCreated, status_code=201)
async def create_mcp_key(
    project_id: str,
    body: McpKeyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _check_admin(project_id, current_user, db)

    raw_key = "stept_" + secrets.token_urlsafe(32)
    key_hash = hash_api_key(raw_key)
    key_prefix = raw_key[:12]

    api_key = McpApiKey(
        id=gen_suffix(),
        project_id=project_id,
        name=body.name,
        key_hash=key_hash,
        key_prefix=key_prefix,
        created_by=current_user.id,
    )
    db.add(api_key)
    await db.flush()

    return McpKeyCreated(
        id=api_key.id,
        project_id=api_key.project_id,
        name=api_key.name,
        key_prefix=key_prefix,
        created_at=str(api_key.created_at) if api_key.created_at else None,
        last_used_at=None,
        is_active=True,
        raw_key=raw_key,
    )


@router.delete("/projects/{project_id}/mcp-keys/{key_id}")
async def revoke_mcp_key(
    project_id: str,
    key_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _check_admin(project_id, current_user, db)
    result = await db.execute(
        select(McpApiKey).where(McpApiKey.id == key_id, McpApiKey.project_id == project_id)
    )
    key = result.scalar_one_or_none()
    if not key:
        raise HTTPException(status_code=404, detail="API key not found")
    await db.delete(key)
    return {"ok": True}
