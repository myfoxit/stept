"""
AI Tool: analyze_workflow — Get AI-powered analysis of a workflow.
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models import ProcessRecordingSession

name = "analyze_workflow"
description = (
    "Analyze a workflow and return a summary with suggestions for improvement. "
    "Provides step count, estimated time, complexity assessment, and optimization tips."
)
parameters = {
    "type": "object",
    "properties": {
        "workflow_id": {
            "type": "string",
            "description": "The ID of the workflow to analyze",
        },
    },
    "required": ["workflow_id"],
}


async def execute(
    db: AsyncSession,
    user_id: str,
    project_id: Optional[str],
    **kwargs: Any,
) -> dict:
    workflow_id = kwargs.get("workflow_id")

    if not workflow_id:
        return {"error": "workflow_id is required."}

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

    # Build analysis
    step_types = {}
    windows = set()
    has_typing = False
    has_clicks = False

    for step in steps:
        stype = step.action_type or step.step_type or "unknown"
        step_types[stype] = step_types.get(stype, 0) + 1
        if step.window_title:
            windows.add(step.window_title)
        if step.text_typed:
            has_typing = True
        if step.action_type and "click" in step.action_type.lower():
            has_clicks = True

    # Detect potential duplicates
    duplicate_count = 0
    for i in range(len(steps) - 1):
        curr, nxt = steps[i], steps[i + 1]
        if (
            curr.action_type
            and curr.action_type == nxt.action_type
            and curr.window_title
            and curr.window_title == nxt.window_title
        ):
            duplicate_count += 1

    analysis = {
        "success": True,
        "workflow_id": workflow_id,
        "name": workflow.name or workflow.generated_title or "Untitled Workflow",
        "total_steps": len(steps),
        "step_breakdown": step_types,
        "applications_used": sorted(windows),
        "has_data_entry": has_typing,
        "has_clicks": has_clicks,
        "potential_duplicates": duplicate_count,
        "difficulty": workflow.difficulty or _estimate_difficulty(len(steps), len(windows)),
        "summary": workflow.summary,
        "tags": workflow.tags or [],
        "suggestions": [],
    }

    # Generate suggestions
    if duplicate_count > 0:
        analysis["suggestions"].append(
            f"Found {duplicate_count} potential duplicate steps. "
            f"Consider using merge_steps to clean up."
        )
    if len(steps) > 20:
        analysis["suggestions"].append(
            "This is a long workflow. Consider breaking it into smaller sub-workflows."
        )
    if len(windows) > 5:
        analysis["suggestions"].append(
            f"This workflow spans {len(windows)} different applications. "
            "Consider documenting the required software."
        )
    if not workflow.summary:
        analysis["suggestions"].append(
            "This workflow hasn't been AI-processed yet. The summary will be richer after processing."
        )

    analysis["message"] = (
        f"Workflow '{analysis['name']}': {len(steps)} steps across "
        f"{len(windows)} application(s). "
        f"{duplicate_count} potential duplicate(s) found."
    )

    return analysis


def _estimate_difficulty(step_count: int, app_count: int) -> str:
    score = step_count + (app_count * 3)
    if score < 10:
        return "easy"
    elif score < 25:
        return "medium"
    return "advanced"
