"""Audit log endpoints for GDPR/SOC2 compliance."""
from __future__ import annotations

import csv
import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.models import AuditLog, AuditAction, User, ProjectRole
from app.security import get_current_user, check_project_permission

router = APIRouter()


def _base_query(
    project_id: str,
    action: Optional[str],
    resource_type: Optional[str],
    user_id: Optional[str],
    from_date: Optional[datetime],
    to_date: Optional[datetime],
):
    stmt = select(AuditLog).where(AuditLog.project_id == project_id)
    if action:
        stmt = stmt.where(AuditLog.action == AuditAction(action))
    if resource_type:
        stmt = stmt.where(AuditLog.resource_type == resource_type)
    if user_id:
        stmt = stmt.where(AuditLog.user_id == user_id)
    if from_date:
        stmt = stmt.where(AuditLog.created_at >= from_date)
    if to_date:
        stmt = stmt.where(AuditLog.created_at <= to_date)
    return stmt


@router.get("/logs")
async def get_audit_logs(
    project_id: str = Query(...),
    action: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    from_date: Optional[datetime] = Query(None),
    to_date: Optional[datetime] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await check_project_permission(db, current_user.id, project_id, ProjectRole.ADMIN)
    stmt = _base_query(project_id, action, resource_type, user_id, from_date, to_date)
    stmt = stmt.order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)
    rows = (await db.execute(stmt)).scalars().all()
    return [
        {
            "id": r.id,
            "action": r.action.value if r.action else None,
            "user_id": r.user_id,
            "api_key_id": r.api_key_id,
            "resource_type": r.resource_type,
            "resource_id": r.resource_id,
            "resource_name": r.resource_name,
            "detail": r.detail,
            "ip_address": r.ip_address,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.get("/logs/export")
async def export_audit_logs(
    project_id: str = Query(...),
    action: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    from_date: Optional[datetime] = Query(None),
    to_date: Optional[datetime] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await check_project_permission(db, current_user.id, project_id, ProjectRole.ADMIN)
    stmt = _base_query(project_id, action, resource_type, user_id, from_date, to_date)
    stmt = stmt.order_by(AuditLog.created_at.desc())
    rows = (await db.execute(stmt)).scalars().all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "action", "user_id", "api_key_id", "resource_type", "resource_id", "resource_name", "detail", "ip_address", "created_at"])
    for r in rows:
        writer.writerow([
            r.id,
            r.action.value if r.action else "",
            r.user_id or "",
            r.api_key_id or "",
            r.resource_type or "",
            r.resource_id or "",
            r.resource_name or "",
            r.detail or "",
            r.ip_address or "",
            r.created_at.isoformat() if r.created_at else "",
        ])

    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit_logs.csv"},
    )


@router.get("/logs/stats")
async def audit_log_stats(
    project_id: str = Query(...),
    from_date: Optional[datetime] = Query(None),
    to_date: Optional[datetime] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await check_project_permission(db, current_user.id, project_id, ProjectRole.ADMIN)
    stmt = select(AuditLog.action, sa_func.count()).where(AuditLog.project_id == project_id)
    if from_date:
        stmt = stmt.where(AuditLog.created_at >= from_date)
    if to_date:
        stmt = stmt.where(AuditLog.created_at <= to_date)
    stmt = stmt.group_by(AuditLog.action)
    rows = (await db.execute(stmt)).all()
    return {r[0].value: r[1] for r in rows}
