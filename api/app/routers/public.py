"""Public endpoints that don't require authentication."""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_session as get_db
from app.models import ProcessRecordingSession, Document, User
from app.middleware.rate_limit import RateLimiter
from app.security import get_current_user_optional
from app.services.access import can_access_resource
from app.services.translation import SUPPORTED_LANGUAGES, translate_batch

logger = logging.getLogger(__name__)

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
            "screenshot_relative_position": step.screenshot_relative_position,
            "screenshot_size": step.screenshot_size,
            "window_size": step.window_size,
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


async def _translate_workflow_data(data: dict, lang: str, db: AsyncSession) -> dict:
    """Translate translatable fields of a serialized workflow."""
    items = []

    # Workflow-level fields
    if data.get("name"):
        items.append({"key": "name", "text": data["name"]})
    if data.get("summary"):
        items.append({"key": "summary", "text": data["summary"]})

    # Step fields
    for i, step in enumerate(data.get("steps", [])):
        for field in ("description", "content", "generated_title", "generated_description"):
            if step.get(field):
                items.append({"key": f"step.{i}.{field}", "text": step[field]})

    if not items:
        return data

    # Batch translate
    translated_items = await translate_batch(items, lang, db)

    # Map back
    lookup = {item["key"]: item["translated"] for item in translated_items}

    if "name" in lookup:
        data["name"] = lookup["name"]
    if "summary" in lookup:
        data["summary"] = lookup["summary"]

    for i, step in enumerate(data.get("steps", [])):
        for field in ("description", "content", "generated_title", "generated_description"):
            k = f"step.{i}.{field}"
            if k in lookup:
                step[field] = lookup[k]

    data["translated_to"] = lang
    return data


@router.get("/workflow/{share_token}")
async def get_public_workflow(
    share_token: str,
    lang: Optional[str] = Query(None, description="Target language code for translation"),
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
        data = _serialize_workflow(session, permission)

        # Translate if requested
        if lang and lang in SUPPORTED_LANGUAGES:
            try:
                data = await _translate_workflow_data(data, lang, db)
            except Exception as e:
                logger.error(f"Translation failed for workflow {share_token}: {e}")
                # Return untranslated on failure

        return data

    # Not public — check if authenticated user has access via ResourceShare
    if current_user:
        allowed, permission = await can_access_resource("workflow", session.id, current_user, db)
        if allowed:
            data = _serialize_workflow(session, permission)
            if lang and lang in SUPPORTED_LANGUAGES:
                try:
                    data = await _translate_workflow_data(data, lang, db)
                except Exception as e:
                    logger.error(f"Translation failed: {e}")
            return data

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
    from fastapi.responses import FileResponse, RedirectResponse

    stmt = (
        select(ProcessRecordingSession)
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

    # Use the same storage-aware helper as the authenticated endpoint
    from app.crud.process_recording import get_file_access

    access = await get_file_access(db, session.id, step_number, expires_in=3600)
    if not access:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Image not found")

    if access["type"] == "local":
        import os
        if not os.path.exists(access["path"]):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Image file not found")
        return FileResponse(access["path"], media_type="image/png",
                            headers={"Cache-Control": "public, max-age=3600"})
    elif access["type"] == "url":
        return RedirectResponse(url=access["url"], status_code=307)

    raise HTTPException(status.HTTP_404_NOT_FOUND, "Image not found")


@router.get("/document/{share_token}")
async def get_public_document(
    share_token: str,
    lang: Optional[str] = Query(None, description="Target language code for translation"),
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

    data = {
        "id": doc.id,
        "name": doc.name,
        "content": doc.content,
        "page_layout": doc.page_layout,
        "created_at": doc.created_at,
        "updated_at": doc.updated_at,
        "permission": permission,
    }

    # Translate if requested
    if lang and lang in SUPPORTED_LANGUAGES:
        try:
            items = []
            if data.get("name"):
                items.append({"key": "name", "text": data["name"]})
            if data.get("content"):
                items.append({"key": "content", "text": data["content"]})
            if items:
                translated = await translate_batch(items, lang, db)
                lookup = {it["key"]: it["translated"] for it in translated}
                if "name" in lookup:
                    data["name"] = lookup["name"]
                if "content" in lookup:
                    data["content"] = lookup["content"]
            data["translated_to"] = lang
        except Exception as e:
            logger.error(f"Translation failed for document {share_token}: {e}")

    return data


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
    from fastapi.responses import FileResponse, RedirectResponse

    # Verify the document is actually public
    stmt = select(Document).where(Document.share_token == share_token)
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()
    if not doc or not doc.is_public:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found or not public")

    # Load workflow (no need to eager-load files; get_file_access queries them)
    stmt = (
        select(ProcessRecordingSession)
        .where(ProcessRecordingSession.id == session_id)
    )
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")

    # Verify the workflow belongs to the same project as the document (prevent IDOR)
    if doc.project_id and session.project_id and doc.project_id != session.project_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")

    # Use the same storage-aware helper as the authenticated endpoint
    from app.crud.process_recording import get_file_access

    access = await get_file_access(db, session.id, step_number, expires_in=3600)
    if not access:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Image not found")

    if access["type"] == "local":
        import os
        if not os.path.exists(access["path"]):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Image file not found")
        return FileResponse(access["path"], media_type="image/png",
                            headers={"Cache-Control": "public, max-age=3600"})
    elif access["type"] == "url":
        return RedirectResponse(url=access["url"], status_code=307)

    raise HTTPException(status.HTTP_404_NOT_FOUND, "Image not found")
