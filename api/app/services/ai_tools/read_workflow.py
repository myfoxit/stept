"""
AI Tool: read_workflow — Read a workflow's steps and details.
Use this to inspect steps before renaming or analyzing them.
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from sqlalchemy.orm import selectinload

from app.models import ProcessRecordingSession

name = "read_workflow"
description = (
    "Read a workflow's details and all its steps. "
    "Use this to see step titles, descriptions, and window context before renaming. "
    "Accepts workflow by ID or partial name."
)
parameters = {
    "type": "object",
    "properties": {
        "workflow_id": {
            "type": "string",
            "description": "The workflow ID (optional if name_query is provided)",
        },
        "name_query": {
            "type": "string",
            "description": "Partial name to find the workflow (optional if workflow_id is provided)",
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
    try:
        from app.services.ai_tools.validation import sanitize_string, validate_id

        workflow_id = validate_id(kwargs.get("workflow_id"), "workflow_id")
        name_query = sanitize_string(kwargs.get("name_query"), "name_query")
    except (ValueError, TypeError) as exc:
        return {"error": f"Invalid input: {exc}"}

    if not workflow_id and not name_query:
        return {"error": "Provide workflow_id or name_query."}

    try:
        if workflow_id:
            stmt = (
                select(ProcessRecordingSession)
                .where(
                    ProcessRecordingSession.id == workflow_id,
                    ProcessRecordingSession.user_id == user_id,
                )
                .options(selectinload(ProcessRecordingSession.steps))
            )
        else:
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
            stmt = (
                select(ProcessRecordingSession)
                .where(*conditions)
                .options(selectinload(ProcessRecordingSession.steps))
                .limit(1)
            )

        result = await db.execute(stmt)
        workflow = result.scalar_one_or_none()

        if not workflow:
            identifier = workflow_id or name_query
            return {"error": f"Workflow matching '{identifier}' not found or access denied."}

        steps = sorted(workflow.steps, key=lambda s: s.step_number)
        step_list = []
        for s in steps:
            step_list.append({
                "step_number": s.step_number,
                "title": s.generated_title or None,
                "description": s.generated_description or s.description or None,
                "window_title": s.window_title or None,
                "action_type": s.action_type or None,
            })

        return {
            "success": True,
            "workflow_id": workflow.id,
            "name": workflow.name,
            "generated_title": workflow.generated_title,
            "summary": workflow.summary,
            "total_steps": len(steps),
            "steps": step_list,
            "message": f"Workflow '{workflow.name or workflow.id}' has {len(steps)} step(s)",
        }
    except Exception as exc:
        return {"error": f"Failed to read workflow: {exc}"}
