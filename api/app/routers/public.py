"""Public endpoints that don't require authentication."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_session as get_db
from app.models import ProcessRecordingSession, Document, User
from app.middleware.rate_limit import RateLimiter
from app.security import get_current_user_optional
from app.services.access import can_access_resource

# Rate limit: 60 requests per minute for public endpoints
_public_limiter = RateLimiter(limit=60, window=60)

router = APIRouter()


async def _load_workflow_by_token(share_token: str, db: AsyncSession):
    """Load a workflow by share_token (public link)."""
    stmt = (
        select(ProcessRecordingSession)
        .options(
            selectinload(ProcessRecordingSession.steps),
            selectinload(ProcessRecordingSession.files),
        )
        .where(ProcessRecordingSession.share_token == share_token)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


def _serialize_workflow(session, permission: str = "view"):
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
        "permission": permission,
    }


@router.get("/workflow/{share_token}")
async def get_public_workflow(
    share_token: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
    _rl=Depends(_public_limiter),
):
    """Get a publicly shared workflow (no auth required, optional auth for extra access)."""
    session = await _load_workflow_by_token(share_token, db)

    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found or not public")

    # Check access: public OR user has resource share
    if session.is_public:
        permission = "view"
        if current_user and session.project_id:
            allowed, perm = await can_access_resource("workflow", session.id, current_user, db)
            if allowed:
                permission = perm
        return _serialize_workflow(session, permission)

    # Not public — check if authenticated user has access via ResourceShare
    if current_user:
        allowed, permission = await can_access_resource("workflow", session.id, current_user, db)
        if allowed:
            return _serialize_workflow(session, permission)

    # Resource exists but not accessible — return 403 so frontend can show "Request Access"
    raise HTTPException(status.HTTP_403_FORBIDDEN, "access_denied")


@router.get("/workflow/{share_token}/image/{step_number}")
async def get_public_workflow_image(
    share_token: str,
    step_number: int,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
    _rl=Depends(_public_limiter),
):
    """Get an image from a publicly shared workflow (no auth required)."""
    from fastapi.responses import FileResponse
    import os

    stmt = (
        select(ProcessRecordingSession)
        .options(selectinload(ProcessRecordingSession.files))
        .where(ProcessRecordingSession.share_token == share_token)
    )
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found or not public")

    # Check access
    if not session.is_public:
        if not current_user:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found or not public")
        allowed, _ = await can_access_resource("workflow", session.id, current_user, db)
        if not allowed:
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
    current_user: Optional[User] = Depends(get_current_user_optional),
    _rl=Depends(_public_limiter),
):
    """Get a publicly shared document (no auth required, optional auth for extra access)."""
    stmt = select(Document).where(Document.share_token == share_token)
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()

    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found or not public")

    # Check access
    if doc.is_public:
        permission = "view"
        if current_user:
            allowed, perm = await can_access_resource("document", doc.id, current_user, db)
            if allowed:
                permission = perm
    elif current_user:
        allowed, permission = await can_access_resource("document", doc.id, current_user, db)
        if not allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "access_denied")
    else:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "access_denied")

    return {
        "id": doc.id,
        "name": doc.name,
        "content": doc.content,
        "page_layout": doc.page_layout,
        "created_at": doc.created_at,
        "updated_at": doc.updated_at,
        "permission": permission,
    }


@router.get("/document/{share_token}/embedded-workflow/{session_id}")
async def get_embedded_workflow(
    share_token: str,
    session_id: str,
    db: AsyncSession = Depends(get_db),
    _rl=Depends(_public_limiter),
):
    """Get a workflow embedded in a public document.
    
    Access rule: if the document is public, its embedded workflows are
    readable too — same as Notion. No need to separately share the workflow.
    """
    # Verify the document is actually public
    stmt = select(Document).where(Document.share_token == share_token)
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()
    if not doc or not doc.is_public:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found or not public")

    # Load the workflow by session_id
    stmt = (
        select(ProcessRecordingSession)
        .options(
            selectinload(ProcessRecordingSession.steps),
            selectinload(ProcessRecordingSession.files),
        )
        .where(ProcessRecordingSession.id == session_id)
    )
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")

    # Verify the workflow belongs to the same project as the document (prevent IDOR)
    if doc.project_id and session.project_id and doc.project_id != session.project_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")

    return _serialize_workflow(session, "view")


@router.get("/document/{share_token}/embedded-workflow/{session_id}/image/{step_number}")
async def get_embedded_workflow_image(
    share_token: str,
    session_id: str,
    step_number: int,
    db: AsyncSession = Depends(get_db),
    _rl=Depends(_public_limiter),
):
    """Get an image from a workflow embedded in a public document."""
    from fastapi.responses import FileResponse
    import os

    # Verify the document is actually public
    stmt = select(Document).where(Document.share_token == share_token)
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()
    if not doc or not doc.is_public:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found or not public")

    # Load workflow
    stmt = (
        select(ProcessRecordingSession)
        .options(selectinload(ProcessRecordingSession.files))
        .where(ProcessRecordingSession.id == session_id)
    )
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")

    # Verify the workflow belongs to the same project as the document (prevent IDOR)
    if doc.project_id and session.project_id and doc.project_id != session.project_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")

    file_record = next((f for f in session.files if f.step_number == step_number), None)
    if not file_record:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Image not found")

    file_path = file_record.file_path
    if not os.path.isabs(file_path):
        file_path = os.path.join(session.storage_path or "", file_path)

    if not os.path.exists(file_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Image file not found")

    return FileResponse(file_path, media_type=file_record.mime_type or "image/png")
