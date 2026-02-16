"""Analytics endpoints — aggregated knowledge usage insights."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.models import User, ProjectRole
from app.security import get_current_user, check_project_permission
from app.services.analytics import (
    top_accessed_resources,
    access_by_channel,
    stale_resources,
    query_log,
    knowledge_gaps,
)

router = APIRouter()


@router.get("/top-accessed")
async def get_top_accessed(
    project_id: str = Query(...),
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await check_project_permission(db, current_user.id, project_id, ProjectRole.ADMIN)
    return await top_accessed_resources(project_id, db, days=days, limit=limit)


@router.get("/access-by-channel")
async def get_access_by_channel(
    project_id: str = Query(...),
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await check_project_permission(db, current_user.id, project_id, ProjectRole.ADMIN)
    return await access_by_channel(project_id, db, days=days)


@router.get("/stale")
async def get_stale_resources(
    project_id: str = Query(...),
    days: int = Query(90, ge=1, le=730),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await check_project_permission(db, current_user.id, project_id, ProjectRole.ADMIN)
    return await stale_resources(project_id, db, days=days)


@router.get("/queries")
async def get_query_log(
    project_id: str = Query(...),
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await check_project_permission(db, current_user.id, project_id, ProjectRole.ADMIN)
    return await query_log(project_id, db, days=days, limit=limit)


@router.get("/gaps")
async def get_knowledge_gaps(
    project_id: str = Query(...),
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await check_project_permission(db, current_user.id, project_id, ProjectRole.ADMIN)
    return await knowledge_gaps(project_id, db, days=days)
