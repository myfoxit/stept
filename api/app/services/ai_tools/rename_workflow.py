"""
AI Tool: rename_workflow — Change a workflow's title.
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models import ProcessRecordingSession

name = "rename_workflow"
description = (
    "Rename a workflow (process recording). "
    "Changes the workflow's display name."
)
parameters = {
    "type": "object",
    "properties": {
        "workflow_id": {
            "type": "string",
            "description": "The ID of the workflow to rename",
        },
        "new_name": {
            "type": "string",
            "description": "The new name for the workflow",
        },
    },
    "required": ["workflow_id", "new_name"],
}


async def execute(
    db: AsyncSession,
    user_id: str,
    project_id: Optional[str],
    **kwargs: Any,
) -> dict:
    workflow_id = kwargs.get("workflow_id")
    new_name = kwargs.get("new_name")

    if not workflow_id or not new_name:
        return {"error": "Both workflow_id and new_name are required."}

    # Fetch workflow — ensure user owns it
    stmt = select(ProcessRecordingSession).where(
        ProcessRecordingSession.id == workflow_id,
        ProcessRecordingSession.user_id == user_id,
    )
    workflow = await db.scalar(stmt)
    if not workflow:
        return {"error": f"Workflow '{workflow_id}' not found or access denied."}

    old_name = workflow.name or "Untitled Workflow"
    workflow.name = new_name
    await db.flush()

    return {
        "success": True,
        "workflow_id": workflow_id,
        "old_name": old_name,
        "new_name": new_name,
        "message": f"Renamed workflow from '{old_name}' to '{new_name}'",
    }
