"""
AI Tool: merge_steps — Merge redundant/duplicate steps in a workflow.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload

from app.models import ProcessRecordingSession, ProcessRecordingStep

logger = logging.getLogger(__name__)

name = "merge_steps"
description = (
    "Merge redundant or duplicate steps in a workflow. "
    "If step_numbers are provided, those specific steps will be removed. "
    "If omitted, auto-detects duplicate steps (same action + same window in sequence)."
)
parameters = {
    "type": "object",
    "properties": {
        "workflow_id": {
            "type": "string",
            "description": "The ID of the workflow to merge steps in",
        },
        "step_numbers": {
            "type": "array",
            "items": {"type": "integer"},
            "description": "Optional specific step numbers to remove. If omitted, auto-detects duplicates.",
        },
    },
    "required": ["workflow_id"],
}


def _auto_detect_duplicates(steps: list) -> list[int]:
    """
    Detect redundant steps: consecutive steps with the same action_type
    and window_title are considered duplicates (keep the last one).
    """
    if len(steps) < 2:
        return []

    sorted_steps = sorted(steps, key=lambda s: s.step_number)
    duplicates = []

    for i in range(len(sorted_steps) - 1):
        curr = sorted_steps[i]
        nxt = sorted_steps[i + 1]

        # Same action on same window in sequence → first is redundant
        if (
            curr.action_type
            and curr.action_type == nxt.action_type
            and curr.window_title
            and curr.window_title == nxt.window_title
            and curr.step_type == nxt.step_type
        ):
            duplicates.append(curr.step_number)

    return duplicates


async def execute(
    db: AsyncSession,
    user_id: str,
    project_id: Optional[str],
    **kwargs: Any,
) -> dict:
    try:
        from app.services.ai_tools.validation import validate_id, validate_positive_int

        workflow_id = validate_id(kwargs.get("workflow_id"), "workflow_id")
        step_numbers = kwargs.get("step_numbers")
        if step_numbers is not None:
            if not isinstance(step_numbers, list):
                return {"error": "step_numbers must be a list of integers."}
            for sn in step_numbers:
                validate_positive_int(sn, "step_number")
    except (ValueError, TypeError) as exc:
        return {"error": f"Invalid input: {exc}"}

    if not workflow_id:
        return {"error": "workflow_id is required."}

    try:
        # Fetch workflow with steps — ensure user owns it
        stmt = (
            select(ProcessRecordingSession)
            .where(
                ProcessRecordingSession.id == workflow_id,
                ProcessRecordingSession.user_id == user_id,
            )
            .options(selectinload(ProcessRecordingSession.steps))
        )
        workflow = await db.scalar(stmt)
        if not workflow:
            return {"error": f"Workflow '{workflow_id}' not found or access denied."}

        steps = sorted(workflow.steps, key=lambda s: s.step_number)
        original_count = len(steps)

        # Determine which steps to remove
        if step_numbers:
            to_remove = set(step_numbers)
        else:
            to_remove = set(_auto_detect_duplicates(steps))

        if not to_remove:
            return {
                "success": True,
                "workflow_id": workflow_id,
                "removed_count": 0,
                "remaining_count": original_count,
                "message": "No duplicate steps detected — workflow is already clean.",
            }

        # Delete the redundant steps
        remove_ids = [s.id for s in steps if s.step_number in to_remove]
        if remove_ids:
            await db.execute(
                delete(ProcessRecordingStep).where(
                    ProcessRecordingStep.id.in_(remove_ids)
                )
            )

        # Renumber remaining steps sequentially
        remaining = [s for s in steps if s.step_number not in to_remove]
        remaining.sort(key=lambda s: s.step_number)
        for idx, step in enumerate(remaining, start=1):
            step.step_number = idx

        # Update total steps count
        workflow.total_steps = len(remaining)
        await db.flush()

        return {
            "success": True,
            "workflow_id": workflow_id,
            "removed_count": len(to_remove),
            "removed_steps": sorted(to_remove),
            "remaining_count": len(remaining),
            "message": f"Merged {len(to_remove)} redundant steps. {len(remaining)} steps remaining.",
        }
    except Exception as exc:
        return {"error": f"Failed to merge steps: {exc}"}
