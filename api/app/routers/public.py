"""Public endpoints that don't require authentication."""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_session as get_db
from app.models import ProcessRecordingSession, Document
from app.middleware.rate_limit import RateLimiter

# Rate limit: 60 requests per minute for public endpoints
_public_limiter = RateLimiter(limit=60, window=60)

router = APIRouter()


@router.get("/workflow/{share_token}")
async def get_public_workflow(
    share_token: str,
    db: AsyncSession = Depends(get_db),
    _rl=Depends(_public_limiter),
):
    """Get a publicly shared workflow (no auth required)."""
    stmt = (
        select(ProcessRecordingSession)
        .options(
            selectinload(ProcessRecordingSession.steps),
            selectinload(ProcessRecordingSession.files),
        )
        .where(
            ProcessRecordingSession.share_token == share_token,
            ProcessRecordingSession.is_public == True,
        )
    )
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found or not public")

    steps_data = []
    for step in sorted(session.steps, key=lambda s: s.step_number):
        step_dict = {
            "step_number": step.step_number,
            "step_type": step.step_type,
            "description": step.description,
            "content": step.content,
            "window_title": step.window_title,
            "text_typed": step.text_typed,
            "key_pressed": step.key_pressed,
            "generated_title": step.generated_title,
            "generated_description": step.generated_description,
        }
        steps_data.append(step_dict)

    files_data = {str(f.step_number): f.file_path for f in session.files}

    return {
        "id": session.id,
        "name": session.name,
        "created_at": session.created_at,
        "summary": session.summary,
        "tags": session.tags,
        "estimated_time": session.estimated_time,
        "difficulty": session.difficulty,
        "guide_markdown": session.guide_markdown,
        "steps": steps_data,
        "files": files_data,
        "total_steps": len([s for s in steps_data if s.get("step_type") in ("screenshot", "capture", "gif", "video", None)]),
    }


@router.get("/workflow/{share_token}/image/{step_number}")
async def get_public_workflow_image(
    share_token: str,
    step_number: int,
    db: AsyncSession = Depends(get_db),
    _rl=Depends(_public_limiter),
):
    """Get an image from a publicly shared workflow (no auth required)."""
    from fastapi.responses import FileResponse
    import os

    stmt = (
        select(ProcessRecordingSession)
        .options(selectinload(ProcessRecordingSession.files))
        .where(
            ProcessRecordingSession.share_token == share_token,
            ProcessRecordingSession.is_public == True,
        )
    )
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found or not public")

    file_record = next((f for f in session.files if f.step_number == step_number), None)
    if not file_record:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Image not found")

    file_path = file_record.file_path
    if not os.path.isabs(file_path):
        file_path = os.path.join(session.storage_path or "", file_path)

    if not os.path.exists(file_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Image file not found")

    return FileResponse(file_path, media_type=file_record.mime_type or "image/png")


@router.get("/document/{share_token}")
async def get_public_document(
    share_token: str,
    db: AsyncSession = Depends(get_db),
    _rl=Depends(_public_limiter),
):
    """Get a publicly shared document (no auth required)."""
    stmt = select(Document).where(
        Document.share_token == share_token,
        Document.is_public == True,
    )
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()

    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found or not public")

    return {
        "id": doc.id,
        "name": doc.name,
        "content": doc.content,
        "page_layout": doc.page_layout,
        "created_at": doc.created_at,
        "updated_at": doc.updated_at,
    }
