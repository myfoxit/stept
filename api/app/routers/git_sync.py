"""
Git Sync router — configure and trigger bidirectional Git sync for projects.
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.models import GitSyncConfig, ProjectRole, User
from app.security import get_current_user, check_project_permission
from app.services.crypto import encrypt, decrypt
from app.utils import gen_suffix

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────

class GitSyncConfigIn(BaseModel):
    provider: str = Field(..., pattern="^(github|gitlab|bitbucket)$")
    repo_url: str = Field(..., max_length=500)
    branch: str = Field("main", max_length=100)
    directory: str = Field("/", max_length=500)
    access_token: str = Field(..., max_length=500)
    sync_format: str = Field("markdown", pattern="^(markdown|html)$")
    auto_sync: bool = False


class GitSyncConfigOut(BaseModel):
    id: str
    project_id: str
    provider: str
    repo_url: str
    branch: str
    directory: str
    access_token_masked: str
    sync_format: str
    auto_sync: bool
    last_sync_at: Optional[datetime] = None
    last_sync_status: Optional[str] = None
    last_sync_error: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class GitSyncStatusOut(BaseModel):
    last_sync_at: Optional[datetime] = None
    last_sync_status: Optional[str] = None
    last_sync_error: Optional[str] = None


def _mask_token(token: str) -> str:
    """Mask access token for display — show last 4 chars only."""
    if not token or len(token) <= 4:
        return "****"
    return "****" + token[-4:]


def _config_to_out(config: GitSyncConfig) -> GitSyncConfigOut:
    raw_token = decrypt(config.access_token)
    return GitSyncConfigOut(
        id=config.id,
        project_id=config.project_id,
        provider=config.provider,
        repo_url=config.repo_url,
        branch=config.branch,
        directory=config.directory,
        access_token_masked=_mask_token(raw_token),
        sync_format=config.sync_format,
        auto_sync=config.auto_sync,
        last_sync_at=config.last_sync_at,
        last_sync_status=config.last_sync_status,
        last_sync_error=config.last_sync_error,
        created_at=config.created_at,
        updated_at=config.updated_at,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────

@router.get("/git-sync/{project_id}", response_model=GitSyncConfigOut)
async def get_git_sync_config(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await check_project_permission(db, current_user.id, project_id, ProjectRole.ADMIN)
    config = await db.scalar(
        select(GitSyncConfig).where(GitSyncConfig.project_id == project_id)
    )
    if not config:
        raise HTTPException(404, "Git sync not configured for this project")
    return _config_to_out(config)


@router.put("/git-sync/{project_id}", response_model=GitSyncConfigOut)
async def upsert_git_sync_config(
    project_id: str,
    body: GitSyncConfigIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await check_project_permission(db, current_user.id, project_id, ProjectRole.ADMIN)

    config = await db.scalar(
        select(GitSyncConfig).where(GitSyncConfig.project_id == project_id)
    )
    encrypted_token = encrypt(body.access_token)

    if config:
        config.provider = body.provider
        config.repo_url = body.repo_url
        config.branch = body.branch
        config.directory = body.directory
        config.access_token = encrypted_token
        config.sync_format = body.sync_format
        config.auto_sync = body.auto_sync
    else:
        config = GitSyncConfig(
            id=gen_suffix(),
            project_id=project_id,
            provider=body.provider,
            repo_url=body.repo_url,
            branch=body.branch,
            directory=body.directory,
            access_token=encrypted_token,
            sync_format=body.sync_format,
            auto_sync=body.auto_sync,
        )
        db.add(config)

    await db.commit()
    await db.refresh(config)
    return _config_to_out(config)


@router.delete("/git-sync/{project_id}", status_code=204)
async def delete_git_sync_config(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await check_project_permission(db, current_user.id, project_id, ProjectRole.ADMIN)
    config = await db.scalar(
        select(GitSyncConfig).where(GitSyncConfig.project_id == project_id)
    )
    if not config:
        raise HTTPException(404, "Git sync not configured")
    await db.delete(config)
    await db.commit()


@router.post("/git-sync/{project_id}/push")
async def push_to_git(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await check_project_permission(db, current_user.id, project_id, ProjectRole.ADMIN)
    config = await db.scalar(
        select(GitSyncConfig).where(GitSyncConfig.project_id == project_id)
    )
    if not config:
        raise HTTPException(404, "Git sync not configured")

    from app.services.git_sync_service import push_to_git as do_push
    try:
        result = await do_push(db, config)
        return result
    except Exception as e:
        raise HTTPException(500, f"Push failed: {str(e)[:200]}")


@router.post("/git-sync/{project_id}/pull")
async def pull_from_git(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await check_project_permission(db, current_user.id, project_id, ProjectRole.ADMIN)
    config = await db.scalar(
        select(GitSyncConfig).where(GitSyncConfig.project_id == project_id)
    )
    if not config:
        raise HTTPException(404, "Git sync not configured")

    from app.services.git_sync_service import pull_from_git as do_pull
    try:
        result = await do_pull(db, config)
        return result
    except Exception as e:
        raise HTTPException(500, f"Pull failed: {str(e)[:200]}")


@router.get("/git-sync/{project_id}/status", response_model=GitSyncStatusOut)
async def get_git_sync_status(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await check_project_permission(db, current_user.id, project_id, ProjectRole.ADMIN)
    config = await db.scalar(
        select(GitSyncConfig).where(GitSyncConfig.project_id == project_id)
    )
    if not config:
        raise HTTPException(404, "Git sync not configured")
    return GitSyncStatusOut(
        last_sync_at=config.last_sync_at,
        last_sync_status=config.last_sync_status,
        last_sync_error=config.last_sync_error,
    )


@router.post("/git-sync/{project_id}/test")
async def test_git_connection(
    project_id: str,
    body: GitSyncConfigIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Test connection without saving config."""
    await check_project_permission(db, current_user.id, project_id, ProjectRole.ADMIN)

    # Create a temporary config object for testing
    temp_config = GitSyncConfig(
        provider=body.provider,
        repo_url=body.repo_url,
        branch=body.branch,
        directory=body.directory,
        access_token=encrypt(body.access_token),
        sync_format=body.sync_format,
    )

    from app.services.git_sync_service import test_connection
    result = await test_connection(temp_config)
    if result["status"] != "ok":
        raise HTTPException(400, result.get("detail", "Connection failed"))
    return result
