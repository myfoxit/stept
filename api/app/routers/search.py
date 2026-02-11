"""
Smart Search router.

Searches across recording titles, summaries, tags, step titles and descriptions.
Returns ranked results with highlighted matches.
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_session as get_db
from app.models import ProcessRecordingSession, ProcessRecordingStep, User
from app.security import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()


def _highlight(text: str, query: str) -> str:
    """Simple case-insensitive highlight using <mark> tags."""
    if not text or not query:
        return text or ""
    import re
    pattern = re.compile(re.escape(query), re.IGNORECASE)
    return pattern.sub(lambda m: f"<mark>{m.group()}</mark>", text)


@router.get("/search")
async def smart_search(
    q: str = Query(..., min_length=1, description="Search query"),
    project_id: str = Query(..., description="Project ID to search within"),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Search across recordings and steps within a project.

    Searches: recording name, generated_title, summary, tags,
    step descriptions, generated_title, generated_description, window_title.
    """
    search_term = f"%{q}%"

    # 1. Search recordings
    recording_conditions = [
        ProcessRecordingSession.project_id == project_id,
        or_(
            ProcessRecordingSession.is_private == False,  # noqa: E712
            and_(
                ProcessRecordingSession.is_private == True,  # noqa: E712
                ProcessRecordingSession.owner_id == current_user.id,
            ),
        ),
        or_(
            ProcessRecordingSession.name.ilike(search_term),
            ProcessRecordingSession.generated_title.ilike(search_term),
            ProcessRecordingSession.summary.ilike(search_term),
            func.cast(ProcessRecordingSession.tags, sa_type=_text_type()).ilike(search_term),
        ),
    ]

    stmt = (
        select(ProcessRecordingSession)
        .where(and_(*recording_conditions))
        .limit(limit)
    )
    result = await db.execute(stmt)
    matched_recordings = result.scalars().all()

    # 2. Search steps (and get their parent recording)
    step_conditions = [
        ProcessRecordingStep.session_id == ProcessRecordingSession.id,
        ProcessRecordingSession.project_id == project_id,
        or_(
            ProcessRecordingSession.is_private == False,  # noqa: E712
            and_(
                ProcessRecordingSession.is_private == True,  # noqa: E712
                ProcessRecordingSession.owner_id == current_user.id,
            ),
        ),
        or_(
            ProcessRecordingStep.description.ilike(search_term),
            ProcessRecordingStep.generated_title.ilike(search_term),
            ProcessRecordingStep.generated_description.ilike(search_term),
            ProcessRecordingStep.window_title.ilike(search_term),
            ProcessRecordingStep.content.ilike(search_term),
        ),
    ]

    step_stmt = (
        select(ProcessRecordingStep, ProcessRecordingSession)
        .join(ProcessRecordingSession, ProcessRecordingStep.session_id == ProcessRecordingSession.id)
        .where(and_(*step_conditions))
        .limit(limit)
    )
    step_result = await db.execute(step_stmt)
    matched_steps = step_result.all()

    # Build response
    recording_results = []
    seen_recording_ids = set()

    for rec in matched_recordings:
        seen_recording_ids.add(rec.id)
        recording_results.append({
            "type": "recording",
            "recording_id": rec.id,
            "name": rec.name,
            "name_highlighted": _highlight(rec.name or "", q),
            "generated_title": rec.generated_title,
            "generated_title_highlighted": _highlight(rec.generated_title or "", q),
            "summary": rec.summary,
            "summary_highlighted": _highlight(rec.summary or "", q),
            "tags": rec.tags,
            "is_processed": rec.is_processed,
            "matching_steps": [],
        })

    # Group step results by recording
    step_by_recording: dict[str, list] = {}
    for step, recording in matched_steps:
        rec_id = recording.id
        if rec_id not in step_by_recording:
            step_by_recording[rec_id] = []
        step_by_recording[rec_id].append({
            "step_id": step.id,
            "step_number": step.step_number,
            "description": step.description,
            "description_highlighted": _highlight(step.description or "", q),
            "generated_title": step.generated_title,
            "generated_title_highlighted": _highlight(step.generated_title or "", q),
            "window_title": step.window_title,
        })

        # If recording wasn't already in results, add it
        if rec_id not in seen_recording_ids:
            seen_recording_ids.add(rec_id)
            recording_results.append({
                "type": "recording",
                "recording_id": recording.id,
                "name": recording.name,
                "name_highlighted": recording.name or "",
                "generated_title": recording.generated_title,
                "generated_title_highlighted": recording.generated_title or "",
                "summary": recording.summary,
                "summary_highlighted": recording.summary or "",
                "tags": recording.tags,
                "is_processed": recording.is_processed,
                "matching_steps": [],
            })

    # Attach matching steps
    for item in recording_results:
        rec_id = item["recording_id"]
        if rec_id in step_by_recording:
            item["matching_steps"] = step_by_recording[rec_id]

    return {
        "query": q,
        "total_results": len(recording_results),
        "results": recording_results[:limit],
    }


def _text_type():
    """Return SQLAlchemy Text type for casting."""
    from sqlalchemy import Text
    return Text
