"""
AI Tool: rename_steps — Rename individual steps within a workflow.
Accepts workflow by ID or name, and a list of step renames.
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from sqlalchemy.orm import selectinload

from app.models import ProcessRecordingSession, ProcessRecordingStep

requires_confirmation = True

name = "rename_steps"
description = (
    "Rename individual steps inside a workflow. "
    "Provide the workflow ID or name, and a list of step numbers with new titles. "
    "Use this to give steps more human-readable, descriptive titles."
)
parameters = {
    "type": "object",
    "properties": {
        "workflow_id": {
            "type": "string",
            "description": "The ID of the workflow (optional if name_query is provided)",
        },
        "name_query": {
            "type": "string",
            "description": "A partial name/title to find the workflow (optional if workflow_id is provided)",
        },
        "renames": {
            "type": "array",
            "description": "List of step renames",
            "items": {
                "type": "object",
                "properties": {
                    "step_number": {
                        "type": "integer",
                        "description": "The step number to rename",
                    },
                    "title": {
                        "type": "string",
                        "description": "New descriptive title for the step",
                    },
                    "description": {
                        "type": "string",
                        "description": "Optional new description for the step",
                    },
                },
                "required": ["step_number", "title"],
            },
        },
    },
    "required": ["renames"],
}


async def execute(
    db: AsyncSession,
    user_id: str,
    project_id: Optional[str],
    **kwargs: Any,
) -> dict:
    try:
        from app.services.ai_tools.validation import sanitize_string, validate_id, validate_positive_int

        workflow_id = validate_id(kwargs.get("workflow_id"), "workflow_id")
        name_query = sanitize_string(kwargs.get("name_query"), "name_query")
        renames = kwargs.get("renames", [])

        if not isinstance(renames, list):
            return {"error": "renames must be a list."}
        # Validate each rename entry
        for entry in renames:
            if not isinstance(entry, dict):
                return {"error": "Each rename entry must be an object."}
            validate_positive_int(entry.get("step_number"), "step_number")
            sanitize_string(entry.get("title"), "title")
            if entry.get("description") is not None:
                sanitize_string(entry.get("description"), "description")
    except (ValueError, TypeError) as exc:
        return {"error": f"Invalid input: {exc}"}

    if not renames:
        return {"error": "At least one rename entry is required."}

    if not workflow_id and not name_query:
        return {"error": "Provide workflow_id or name_query to identify the workflow."}

    try:
        # Find the workflow
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

        # Build step lookup by step_number
        step_map = {s.step_number: s for s in workflow.steps}

        renamed = []
        not_found = []

        for entry in renames:
            step_num = entry.get("step_number")
            new_title = entry.get("title", "")
            new_desc = entry.get("description")

            step = step_map.get(step_num)
            if not step:
                not_found.append(step_num)
                continue

            old_title = step.generated_title or step.description or f"Step {step_num}"
            step.generated_title = new_title
            if new_desc is not None:
                step.generated_description = new_desc
            step.is_annotated = True

            renamed.append({
                "step_number": step_num,
                "old_title": old_title,
                "new_title": new_title,
            })

        await db.flush()

        result_msg = f"Renamed {len(renamed)} step(s) in '{workflow.name or workflow.id}'"
        if not_found:
            result_msg += f". Steps not found: {not_found}"

        return {
            "success": True,
            "workflow_id": workflow.id,
            "workflow_name": workflow.name,
            "renamed_count": len(renamed),
            "renamed": renamed,
            "not_found": not_found,
            "message": result_msg,
        }
    except Exception as exc:
        return {"error": f"Failed to rename steps: {exc}"}
