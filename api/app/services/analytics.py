"""Analytics service — aggregated views over audit log data."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import select, func as sa_func, and_, text, case, distinct
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AuditLog, AuditAction, Document, ProcessRecordingSession, KnowledgeSource,
)

logger = logging.getLogger(__name__)


async def top_accessed_resources(
    project_id: str, db: AsyncSession, days: int = 30, limit: int = 10
) -> list[dict]:
    """Top accessed resources by view/access count."""
    since = datetime.utcnow() - timedelta(days=days)
    stmt = (
        select(
            AuditLog.resource_type,
            AuditLog.resource_id,
            AuditLog.resource_name,
            sa_func.count().label("access_count"),
        )
        .where(
            and_(
                AuditLog.project_id == project_id,
                AuditLog.created_at >= since,
                AuditLog.resource_id.isnot(None),
                AuditLog.action.in_([
                    AuditAction.VIEW,
                    AuditAction.MCP_ACCESS,
                    AuditAction.RAG_QUERY,
                ]),
            )
        )
        .group_by(AuditLog.resource_type, AuditLog.resource_id, AuditLog.resource_name)
        .order_by(sa_func.count().desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()
    return [
        {
            "resource_type": r[0],
            "resource_id": r[1],
            "resource_name": r[2],
            "access_count": r[3],
        }
        for r in rows
    ]


async def access_by_channel(
    project_id: str, db: AsyncSession, days: int = 30
) -> dict:
    """Breakdown of access counts by channel."""
    since = datetime.utcnow() - timedelta(days=days)
    # Infer channel from action type
    stmt = (
        select(
            AuditLog.action,
            sa_func.count().label("cnt"),
        )
        .where(
            and_(
                AuditLog.project_id == project_id,
                AuditLog.created_at >= since,
                AuditLog.action.in_([
                    AuditAction.VIEW,
                    AuditAction.MCP_ACCESS,
                    AuditAction.RAG_QUERY,
                ]),
            )
        )
        .group_by(AuditLog.action)
    )
    rows = (await db.execute(stmt)).all()
    channel_map = {
        AuditAction.VIEW: "web_ui",
        AuditAction.MCP_ACCESS: "mcp",
        AuditAction.RAG_QUERY: "rag_chat",
    }
    result = {"web_ui": 0, "mcp": 0, "rag_chat": 0}
    for action, cnt in rows:
        ch = channel_map.get(action, "other")
        result[ch] = result.get(ch, 0) + cnt
    return result


async def stale_resources(
    project_id: str, db: AsyncSession, days: int = 90
) -> list[dict]:
    """Resources that haven't been accessed in N days."""
    since = datetime.utcnow() - timedelta(days=days)

    # Get all resources that HAVE been accessed recently
    accessed = (
        select(AuditLog.resource_type, AuditLog.resource_id)
        .where(
            and_(
                AuditLog.project_id == project_id,
                AuditLog.created_at >= since,
                AuditLog.resource_id.isnot(None),
            )
        )
        .distinct()
    ).subquery()

    results = []

    # Documents not accessed
    doc_stmt = (
        select(Document.id, Document.name, Document.created_at)
        .where(Document.project_id == project_id)
        .outerjoin(
            accessed,
            and_(
                accessed.c.resource_type == "document",
                accessed.c.resource_id == Document.id,
            ),
        )
        .where(accessed.c.resource_id.is_(None))
    )
    for row in (await db.execute(doc_stmt)).all():
        results.append({
            "resource_type": "document",
            "resource_id": row[0],
            "resource_name": row[1] or "Untitled",
            "created_at": row[2].isoformat() if row[2] else None,
        })

    # Workflows not accessed
    wf_stmt = (
        select(ProcessRecordingSession.id, ProcessRecordingSession.name, ProcessRecordingSession.created_at)
        .where(ProcessRecordingSession.project_id == project_id)
        .outerjoin(
            accessed,
            and_(
                accessed.c.resource_type == "workflow",
                accessed.c.resource_id == ProcessRecordingSession.id,
            ),
        )
        .where(accessed.c.resource_id.is_(None))
    )
    for row in (await db.execute(wf_stmt)).all():
        results.append({
            "resource_type": "workflow",
            "resource_id": row[0],
            "resource_name": row[1] or "Untitled Workflow",
            "created_at": row[2].isoformat() if row[2] else None,
        })

    return results


async def query_log(
    project_id: str, db: AsyncSession, days: int = 30, limit: int = 50
) -> list[dict]:
    """Recent search/RAG queries."""
    since = datetime.utcnow() - timedelta(days=days)
    stmt = (
        select(AuditLog)
        .where(
            and_(
                AuditLog.project_id == project_id,
                AuditLog.created_at >= since,
                AuditLog.action == AuditAction.RAG_QUERY,
            )
        )
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [
        {
            "query": r.detail.get("query") if r.detail else None,
            "results_count": r.detail.get("results_count") if r.detail else None,
            "user_id": r.user_id,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


async def knowledge_gaps(
    project_id: str, db: AsyncSession, days: int = 30
) -> list[dict]:
    """Queries that returned no or low results — knowledge gaps."""
    since = datetime.utcnow() - timedelta(days=days)
    stmt = (
        select(AuditLog)
        .where(
            and_(
                AuditLog.project_id == project_id,
                AuditLog.created_at >= since,
                AuditLog.action == AuditAction.RAG_QUERY,
            )
        )
        .order_by(AuditLog.created_at.desc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    gaps = []
    for r in rows:
        count = r.detail.get("results_count", 0) if r.detail else 0
        if count == 0:
            gaps.append({
                "query": r.detail.get("query") if r.detail else None,
                "user_id": r.user_id,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            })
    return gaps
