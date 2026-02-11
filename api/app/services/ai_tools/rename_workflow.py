"""
AI Tool: rename_workflow — Change a workflow's title.
Accepts workflow by ID or by name (fuzzy match).
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.models import ProcessRecordingSession

name = "rename_workflow"
description = (
    "Rename a workflow (process recording). "
    "You can identify the workflow by its ID or by a partial name match."
)
parameters = {
    "type": "object",
    "properties": {
        "workflow_id": {
            "type": "string",
            "description": "The ID of the workflow to rename (optional if name_query is provided)",
        },
        "name_query": {
            "type": "string",
            "description": "A partial name/title to find the workflow (optional if workflow_id is provided)",
        },
        "new_name": {
            "type": "string",
            "description": "The new name for the workflow",
        },
    },
    "required": ["new_name"],
}


async def _find_workflow(
    db: AsyncSession,
    user_id: str,
    project_id: Optional[str],
    workflow_id: Optional[str] = None,
    name_query: Optional[str] = None,
) -> ProcessRecordingSession | None:
    """Find a workflow by ID or name."""
    if workflow_id:
        stmt = select(ProcessRecordingSession).where(
            ProcessRecordingSession.id == workflow_id,
            ProcessRecordingSession.user_id == user_id,
        )
        return await db.scalar(stmt)

    if name_query:
        pattern = f"%{name_query}%"
        conditions = [
            ProcessRecordingSession.user_id == user_id,
            or_(
                ProcessRecordingSession.name.ilike(pattern),
                ProcessRecordingSession.generated_title.ilike(pattern),
            ),
        ]
        if project_id:
            conditions.append(ProcessRecordingSession.project_id == project_id)

        stmt = select(ProcessRecordingSession).where(*conditions).limit(1)
        return await db.scalar(stmt)

    return None


async def execute(
    db: AsyncSession,
    user_id: str,
    project_id: Optional[str],
    **kwargs: Any,
) -> dict:
    workflow_id = kwargs.get("workflow_id")
    name_query = kwargs.get("name_query")
    new_name = kwargs.get("new_name")

    if not new_name:
        return {"error": "new_name is required."}

    if not workflow_id and not name_query:
        return {"error": "Provide workflow_id or name_query to identify the workflow."}

    workflow = await _find_workflow(db, user_id, project_id, workflow_id, name_query)
    if not workflow:
        identifier = workflow_id or name_query
        return {"error": f"Workflow matching '{identifier}' not found or access denied."}

    old_name = workflow.name or "Untitled Workflow"
    workflow.name = new_name
    await db.flush()

    return {
        "success": True,
        "workflow_id": workflow.id,
        "old_name": old_name,
        "new_name": new_name,
        "message": f"Renamed workflow from '{old_name}' to '{new_name}'",
    }
