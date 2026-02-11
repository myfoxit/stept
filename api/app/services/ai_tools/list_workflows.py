"""
AI Tool: list_workflows — Search and list workflows the user has access to.
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.models import ProcessRecordingSession

name = "list_workflows"
description = (
    "List or search workflows (process recordings) the user has. "
    "Can filter by name/title query. Returns workflow IDs, names, and metadata."
)
parameters = {
    "type": "object",
    "properties": {
        "query": {
            "type": "string",
            "description": "Optional search query to filter workflows by name or generated title",
        },
        "limit": {
            "type": "integer",
            "description": "Maximum number of results to return (default 10, max 50)",
        },
    },
    "required": [],
}


async def execute(
    db: AsyncSession,
    user_id: str,
    project_id: Optional[str],
    **kwargs: Any,
) -> dict:
    query = kwargs.get("query", "")
    limit = min(kwargs.get("limit", 10), 50)

    # Base query — only user's own workflows
    stmt = select(ProcessRecordingSession).where(
        ProcessRecordingSession.user_id == user_id,
        ProcessRecordingSession.status == "completed",
    )

    # Add project filter if in project context
    if project_id:
        stmt = stmt.where(ProcessRecordingSession.project_id == project_id)

    # Search filter
    if query:
        pattern = f"%{query}%"
        stmt = stmt.where(
            or_(
                ProcessRecordingSession.name.ilike(pattern),
                ProcessRecordingSession.generated_title.ilike(pattern),
                ProcessRecordingSession.summary.ilike(pattern),
            )
        )

    stmt = stmt.order_by(ProcessRecordingSession.created_at.desc()).limit(limit)
    result = await db.execute(stmt)
    workflows = result.scalars().all()

    items = []
    for w in workflows:
        items.append({
            "id": w.id,
            "name": w.name or w.generated_title or "Untitled Workflow",
            "status": w.status,
            "total_steps": w.total_steps,
            "created_at": w.created_at.isoformat() if w.created_at else None,
            "tags": w.tags or [],
            "difficulty": w.difficulty,
            "summary": (w.summary[:150] + "...") if w.summary and len(w.summary) > 150 else w.summary,
        })

    return {
        "success": True,
        "count": len(items),
        "workflows": items,
        "query": query or None,
        "message": f"Found {len(items)} workflow(s)" + (f" matching '{query}'" if query else ""),
    }
