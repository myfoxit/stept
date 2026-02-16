from __future__ import annotations
import logging
from typing import Optional
from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import AuditLog, AuditAction

logger = logging.getLogger(__name__)


async def log_audit(
    db: AsyncSession,
    action: AuditAction,
    *,
    user_id: str | None = None,
    project_id: str | None = None,
    api_key_id: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    resource_name: str | None = None,
    detail: dict | None = None,
    request: Request | None = None,
) -> None:
    """Fire-and-forget audit log entry. Never raises."""
    try:
        ip = None
        ua = None
        if request:
            ip = request.client.host if request.client else None
            ua = request.headers.get("user-agent", "")[:500]

        entry = AuditLog(
            action=action,
            user_id=user_id,
            project_id=project_id,
            api_key_id=api_key_id,
            resource_type=resource_type,
            resource_id=resource_id,
            resource_name=resource_name,
            detail=detail,
            ip_address=ip,
            user_agent=ua,
        )
        db.add(entry)
        await db.flush()
    except Exception as exc:
        logger.error("Audit log failed: %s", exc)
