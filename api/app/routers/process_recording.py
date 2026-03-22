from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query, Request
from fastapi.responses import FileResponse, RedirectResponse, Response, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select
from typing import Optional, List
import os
import json
from datetime import datetime, timezone
import io

from app.database import get_session as get_db
from app.models import ProcessRecordingSession, ProcessRecordingFile, ProcessRecordingStep, ProjectRole, User, WorkflowVersion
from app.services.translation import translate_batch, SUPPORTED_LANGUAGES
from app.schemas.process_recording import (
    SessionCreate, SessionResponse, StepMetadata, 
    SessionStatusResponse, FileUploadResponse,
    StepCreate, StepUpdate, StepResponse, BulkStepReorder,
    WorkflowMove,  # Add this schema
    ProcessingStatus, GuideResponse, StepAnnotation,  # AI schemas
)
from app.crud.process_recording import (
    create_session, upload_metadata, save_uploaded_file,
    finalize_session, get_session_status, get_file_access,
    update_workflow, move_workflow, delete_workflow, duplicate_workflow,
    create_step, update_step, delete_step, reorder_steps,
    get_filtered_workflows,
    restore_workflow, permanent_delete_workflow, get_deleted_workflows,
)
from app.security import get_current_user, ProjectPermissionChecker, check_project_permission
from fastapi import Body  # NEW: accept JSON body in update endpoint
import logging

logger = logging.getLogger(__name__)


async def _maybe_create_workflow_version(
    db: AsyncSession,
    session: ProcessRecordingSession,
    user_id: str,
    change_summary: str | None = None,
) -> bool:
    """Snapshot current steps as a version. Throttled to 60s between snapshots. Returns True if version was created."""
    from sqlalchemy import func as sqlfunc, delete as sa_delete
    from app.utils import gen_suffix

    # Throttle: check last version timestamp
    last_ver = (await db.execute(
        select(WorkflowVersion)
        .where(WorkflowVersion.session_id == session.id)
        .order_by(WorkflowVersion.version_number.desc())
        .limit(1)
    )).scalar_one_or_none()

    if last_ver and last_ver.created_at:
        last_time = last_ver.created_at.replace(tzinfo=None) if last_ver.created_at.tzinfo else last_ver.created_at
        if (datetime.now(timezone.utc).replace(tzinfo=None) - last_time).total_seconds() < 60:
            return False

    # Load current steps
    steps_result = await db.execute(
        select(ProcessRecordingStep)
        .where(ProcessRecordingStep.session_id == session.id)
        .order_by(ProcessRecordingStep.step_number)
    )
    current_steps = steps_result.scalars().all()

    # Build snapshot
    snapshot = []
    for s in current_steps:
        snapshot.append({
            "step_number": s.step_number,
            "step_type": s.step_type,
            "action_type": s.action_type,
            "window_title": s.window_title,
            "description": s.description,
            "content": s.content,
            "url": s.url,
            "owner_app": s.owner_app,
            "generated_title": s.generated_title,
            "generated_description": s.generated_description,
            "ui_element": s.ui_element,
            "step_category": s.step_category,
            "spoken_text": s.spoken_text,
        })

    ver = WorkflowVersion(
        id=gen_suffix(16),
        session_id=session.id,
        version_number=session.version or 1,
        steps_snapshot=snapshot,
        name=session.name,
        total_steps=len(snapshot),
        created_by=user_id,
        change_summary=change_summary,
    )
    db.add(ver)
    session.version = (session.version or 1) + 1

    # Prune: keep max 50 versions
    count_result = await db.execute(
        select(sqlfunc.count()).select_from(WorkflowVersion).where(WorkflowVersion.session_id == session.id)
    )
    total = count_result.scalar() or 0
    if total > 50:
        old_ids = (await db.execute(
            select(WorkflowVersion.id)
            .where(WorkflowVersion.session_id == session.id)
            .order_by(WorkflowVersion.version_number.asc())
            .limit(total - 50)
        )).scalars().all()
        if old_ids:
            await db.execute(
                sa_delete(WorkflowVersion).where(WorkflowVersion.id.in_(old_ids))
            )

    return True


router = APIRouter()


async def _verify_session_access(db: AsyncSession, session_id: str, user_id: str) -> ProcessRecordingSession:
    """Load a session and verify the user has project access. Raises 404/403."""
    session = await db.get(ProcessRecordingSession, session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    if session.project_id:
        await check_project_permission(db, user_id, session.project_id)
    return session


async def _safe_light_process(recording_id: str) -> None:
    """Run light AI processing in the background with its own DB session.

    Safe to fire-and-forget — catches all exceptions and logs them.
    """
    try:
        from app.database import AsyncSessionLocal
        from app.services.auto_processor import auto_processor

        async with AsyncSessionLocal() as db:
            result = await auto_processor.light_process_recording(recording_id, db)
            if result.get("title"):
                logger.info("Auto-titled recording %s: %s", recording_id, result["title"])
    except Exception:
        logger.exception("Light auto-processing failed for recording %s", recording_id)

@router.get("/workflows/filtered")
async def get_filtered_workflows_endpoint(
    project_id: str = Query(...),
    folder_id: Optional[str] = Query(None),
    sort_by: str = Query("created_at", description="Sort by: created_at, updated_at, name"),
    sort_order: str = Query("desc", description="Sort order: asc, desc"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get filtered workflows with sorting for a project"""
    from app.security import check_project_permission
    await check_project_permission(db, current_user.id, project_id)
    try:
        workflows = await get_filtered_workflows(
            db,
            project_id=project_id,
            folder_id=folder_id,
            sort_by=sort_by,
            sort_order=sort_order,
            skip=skip,
            limit=limit,
            user_id=current_user.id,  # NEW: Pass user_id for privacy filtering
        )

        # Compute has_guide for each workflow: True if any step has non-null element_info
        from sqlalchemy import func as sqlfunc
        wf_ids = [w.id for w in workflows]
        has_guide_map = {}
        if wf_ids:
            stmt = (
                select(
                    ProcessRecordingStep.session_id,
                    sqlfunc.count(ProcessRecordingStep.id),
                )
                .where(
                    ProcessRecordingStep.session_id.in_(wf_ids),
                    ProcessRecordingStep.element_info.isnot(None),
                )
                .group_by(ProcessRecordingStep.session_id)
            )
            rows = await db.execute(stmt)
            has_guide_map = {row[0]: row[1] > 0 for row in rows}

        # Serialize with has_guide field
        result = []
        for w in workflows:
            data = {
                c.name: getattr(w, c.name)
                for c in w.__table__.columns
            }
            data["has_guide"] = has_guide_map.get(w.id, False)
            result.append(data)

        return result
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(e))

@router.post("/session/create", response_model=SessionResponse)
async def create_upload_session(
    session_data: SessionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new upload session"""
    # Validate user_id and project_id
    if session_data.user_id and session_data.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="user_id in payload does not match authenticated user",
        )

    if session_data.project_id:
        await check_project_permission(
            db=db,
            user_id=current_user.id,
            project_id=session_data.project_id,
            required_role=ProjectRole.MEMBER,  
        )

    # Default is_private to True if not specified
    is_private = session_data.is_private if session_data.is_private is not None else True

    session = await create_session(
        db=db,
        user_id=current_user.id,
        client_name=session_data.client or "SteptRecorder",
        project_id=session_data.project_id,
        folder_id=session_data.folder_id,
        name=session_data.name,
        is_private=is_private,  # CHANGED: Use computed value
    )

    from app.services.audit import log_audit
    from app.models import AuditAction
    await log_audit(db, AuditAction.CREATE, user_id=current_user.id, project_id=session_data.project_id, resource_type="workflow", resource_id=session.id, resource_name=session_data.name, request=request)

    return SessionResponse(session_id=session.id)


@router.post("/session/{session_id}/metadata", status_code=status.HTTP_200_OK)
async def upload_session_metadata(
    session_id: str,
    metadata: List[StepMetadata],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload metadata for all steps in a session"""
    await _verify_session_access(db, session_id, current_user.id)
    try:
        await upload_metadata(db, session_id, metadata)
        return {"status": "success", "steps_uploaded": len(metadata)}
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(e))

@router.post("/session/{session_id}/image", response_model=FileUploadResponse)
async def upload_image(
    session_id: str,
    file: UploadFile = File(...),
    stepNumber: int = Form(...),
    replace: Optional[bool] = Form(default=False),  # Make it Optional[bool]
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a single image for a step"""
    await _verify_session_access(db, session_id, current_user.id)

    # Validate MIME type
    ALLOWED_MIME = {"image/jpeg", "image/png", "image/gif", "image/webp"}
    MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB
    content_type = file.content_type or ""
    if content_type not in ALLOWED_MIME:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Unsupported file type: {content_type}. Allowed: {', '.join(ALLOWED_MIME)}"
        )

    try:
        # Read file content with size limit
        file_content = await file.read()
        if len(file_content) > MAX_IMAGE_SIZE:
            # Reset session status so it doesn't stay stuck in 'uploading'
            session_obj = await db.get(ProcessRecordingSession, session_id)
            if session_obj and session_obj.status == "uploading":
                session_obj.status = "error"
                await db.commit()
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"File too large. Maximum size: {MAX_IMAGE_SIZE // (1024*1024)}MB"
            )
        
        # Use original filename or generate one
        filename = file.filename or f"step_{stepNumber}.png"
        
        # Convert replace to boolean if it's a string
        is_replacement = replace if isinstance(replace, bool) else str(replace).lower() == 'true'
        
        # Save file with replacement flag
        file_record = await save_uploaded_file(
            db,
            session_id,
            stepNumber,
            file_content,
            filename,
            file.content_type or "image/png",
            is_replacement=is_replacement
        )
        
        return FileUploadResponse(
            success=True,
            step_number=stepNumber,
            filename=file_record.filename,
            file_path=file_record.file_path
        )
    except ValueError as e:
        # More detailed error message
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, 
            detail=f"Upload failed: {str(e)}"
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upload failed unexpectedly: {str(e)}"
        )

@router.post("/session/{session_id}/dom-snapshot", status_code=status.HTTP_200_OK)
async def upload_dom_snapshot(
    session_id: str,
    file: UploadFile = File(...),
    stepNumber: int = Form(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a DOM snapshot for a recording step. Stored in object storage."""
    session = await _verify_session_access(db, session_id, current_user.id)

    MAX_SNAPSHOT_SIZE = 5 * 1024 * 1024  # 5MB
    content = await file.read()
    if len(content) > MAX_SNAPSHOT_SIZE:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"DOM snapshot too large. Maximum size: {MAX_SNAPSHOT_SIZE // (1024*1024)}MB"
        )

    try:
        from app.services.storage import get_storage_backend
        backend = get_storage_backend(session.storage_type)
        session_path = await backend.ensure_session_path(session.id)
        filename = f"step_{stepNumber}_dom.json"
        await backend.save_file(session_path, filename, content, "application/json")

        # Update step record with dom_snapshot_key
        stmt = select(ProcessRecordingStep).where(
            ProcessRecordingStep.session_id == session_id,
            ProcessRecordingStep.step_number == stepNumber,
        )
        result = await db.execute(stmt)
        step = result.scalar_one_or_none()
        if step:
            step.dom_snapshot_key = filename
            await db.commit()
    except Exception as e:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"DOM snapshot upload failed: {str(e)}"
        )

    return {"status": "ok"}


@router.get("/session/{session_id}/dom-snapshot/{step_number}")
async def get_dom_snapshot(
    session_id: str,
    step_number: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve a DOM snapshot JSON for a recording step."""
    await _verify_session_access(db, session_id, current_user.id)

    stmt = select(ProcessRecordingStep).where(
        ProcessRecordingStep.session_id == session_id,
        ProcessRecordingStep.step_number == step_number,
    )
    result = await db.execute(stmt)
    step = result.scalar_one_or_none()
    if not step or not step.dom_snapshot_key:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "DOM snapshot not found")

    session = await db.get(ProcessRecordingSession, session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")

    from app.services.storage import get_storage_backend
    backend = get_storage_backend(session.storage_type)
    try:
        data = await backend.read_file(session.storage_path, step.dom_snapshot_key)
        if not data:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "DOM snapshot file not found")
        from fastapi.responses import Response
        return Response(
            content=data,
            media_type="application/json",
            headers={"Cache-Control": "public, max-age=3600"},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/session/{session_id}/audio", status_code=status.HTTP_200_OK)
async def upload_audio(
    session_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload an audio recording file for a session"""
    await _verify_session_access(db, session_id, current_user.id)

    ALLOWED_AUDIO_MIME = {
        "audio/webm", "audio/wav", "audio/mpeg", "audio/mp3",
        "audio/ogg", "audio/mp4", "audio/x-wav", "video/webm",
    }
    MAX_AUDIO_SIZE = 25 * 1024 * 1024  # 25MB
    content_type = file.content_type or ""
    if content_type not in ALLOWED_AUDIO_MIME:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Unsupported audio type: {content_type}. Allowed: {', '.join(ALLOWED_AUDIO_MIME)}"
        )

    try:
        file_content = await file.read()
        if len(file_content) > MAX_AUDIO_SIZE:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Audio file too large. Maximum size: {MAX_AUDIO_SIZE // (1024*1024)}MB"
            )

        session = await db.get(ProcessRecordingSession, session_id)
        if not session:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")

        from app.services.storage import get_storage_backend
        backend = get_storage_backend(session.storage_type)

        filename = file.filename or "recording.webm"
        stored_path = await backend.save_file(
            session.storage_path, filename, file_content, content_type
        )

        return {"success": True, "filename": filename, "file_path": stored_path}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Audio upload failed for session %s", session_id)
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Audio upload failed: {str(e)}"
        )

@router.post("/session/{session_id}/finalize", status_code=status.HTTP_200_OK)
async def finalize_upload_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),  
):
    """Finalize an upload session"""
    try:
       
        await finalize_session(db, session_id, user_id=current_user.id)
        
        # Auto-index CLI sessions into RAG pipeline
        session = await db.get(ProcessRecordingSession, session_id)
        if session and session.client_name == "stept-cli":
            import asyncio
            from app.services.indexer import index_workflow_background
            asyncio.create_task(index_workflow_background(session_id))
        
        # Heuristic title + icon (always runs, no AI needed)
        if session and (not session.name or session.name.startswith("Untitled") or session.name.startswith("Workflow:")):
            from app.services.heuristic_title import generate_heuristic_title, extract_favicon_icon
            await db.refresh(session, ["steps"])
            steps = sorted(session.steps, key=lambda s: s.step_number)
            title = generate_heuristic_title(steps)
            if title:
                session.name = title
                session.generated_title = title
            icon_type, icon_value = extract_favicon_icon(steps)
            if icon_type and icon_value:
                session.icon_type = icon_type
                session.icon_value = icon_value
            await db.commit()

        # Auto-generate smart title + summary via AI (lightweight, no vision)
        # Only if AI is enabled for the project (or no project set)
        if session and not session.is_processed:
            ai_enabled = True
            if session.project_id:
                from app.models import Project
                project = await db.get(Project, session.project_id)
                if project and not project.ai_enabled:
                    ai_enabled = False
            if ai_enabled:
                import asyncio
                asyncio.create_task(
                    _safe_light_process(session_id)
                )
        
        return {"status": "success", "message": "Session finalized"}
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))


@router.post("/session/{session_id}/cli-session", status_code=status.HTTP_200_OK)
async def upload_cli_session(
    session_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a full CLI terminal session JSON (from stept-cli).
    
    Stores the complete session file (with event stream for replay)
    as an attachment on the recording session.
    """
    try:
        body = await request.body()
        if not body:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Empty body")
        
        # Validate it's valid JSON
        try:
            session_data = json.loads(body)
        except json.JSONDecodeError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid JSON")
        
        # Get the session
        session = await db.get(ProcessRecordingSession, session_id)
        if not session:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
        
        # Store the CLI session data via the storage backend
        filename = f"cli-session-{session_id}.json"
        from app.services.storage import get_storage_backend
        backend = get_storage_backend(session.storage_type)
        stored_path = await backend.save_file(
            session.storage_path, filename, body, "application/json"
        )
        
        # Create a file record
        file_record = ProcessRecordingFile(
            session_id=session_id,
            step_number=0,  # 0 = session-level attachment
            filename=filename,
            filepath=stored_path,
            file_size=len(body),
            mime_type="application/json",
        )
        db.add(file_record)
        
        # Update session metadata with CLI info
        if session_data.get("title") and not session.name:
            session.name = session_data["title"]
        if not session.client_name or session.client_name in ("ProcessRecorder", "SteptRecorder"):
            session.client_name = "stept-cli"
        if session_data.get("ssh_target"):
            session.name = session.name or f"SSH: {session_data['ssh_target']}"
        if session_data.get("summary"):
            session.summary = session_data["summary"]
        
        await db.commit()
        
        return {
            "status": "success",
            "filename": filename,
            "size": len(body),
            "commands": len(session_data.get("commands", [])),
            "events": len(session_data.get("events", [])),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(e))


@router.get("/session/{session_id}/status")  # removed response_model to allow extra fields
async def get_session_status_endpoint(
    session_id: str,
    step_offset: int = Query(default=0, ge=0),
    step_limit: int = Query(default=0, ge=0, description="0 means all steps (backward compat)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get status of an upload session (augmented with icon fields and title)"""
    try:
        await _verify_session_access(db, session_id, current_user.id)
        status_data = await get_session_status(db, session_id)
        # Convert to dict whether it's a Pydantic model or already a dict
        base = status_data.dict() if hasattr(status_data, "dict") else dict(status_data)

        # Augment with icon fields and title expected by the frontend
        session = await db.get(ProcessRecordingSession, session_id)
        if session:
            base.update({
                "icon_type": session.icon_type,
                "icon_value": session.icon_value,
                "icon_color": session.icon_color,
                "title": session.name or "Untitled workflow",
            })

        # Apply step pagination if requested
        if step_limit > 0 and "metadata" in base:
            all_steps = base["metadata"]
            base["total_steps"] = len(all_steps)
            base["step_offset"] = step_offset
            base["step_limit"] = step_limit
            base["metadata"] = all_steps[step_offset:step_offset + step_limit]

        return base
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))


@router.get("/workflow/{session_id}/summary")
async def get_workflow_summary(session_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = await db.get(ProcessRecordingSession, session_id)
    if not session:
        raise HTTPException(404, "Workflow not found")
    if session.project_id:
        await check_project_permission(db=db, user_id=current_user.id, project_id=session.project_id, required_role=ProjectRole.VIEWER)
    # Count steps without loading them
    from sqlalchemy import func as sqlfunc
    step_count = await db.scalar(select(sqlfunc.count(ProcessRecordingStep.id)).where(ProcessRecordingStep.session_id == session_id))
    # Check if workflow has interactive guide data (any step with element_info)
    guide_step_count = await db.scalar(
        select(sqlfunc.count(ProcessRecordingStep.id)).where(
            ProcessRecordingStep.session_id == session_id,
            ProcessRecordingStep.element_info.isnot(None),
        )
    )
    return {
        "id": session.id, "name": session.name, "status": session.status,
        "created_at": session.created_at, "updated_at": session.updated_at,
        "summary": session.summary, "tags": session.tags,
        "generated_title": session.generated_title,
        "is_processed": session.is_processed,
        "total_steps": step_count,
        "guide_markdown": session.guide_markdown,
        "estimated_time": session.estimated_time, "difficulty": session.difficulty,
        "has_guide": (guide_step_count or 0) > 0,
    }


@router.get("/session/{session_id}/image/{step_number}")
async def get_image(
    session_id: str,
    step_number: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve an uploaded image (local file or redirect to signed URL)"""
    await _verify_session_access(db, session_id, current_user.id)
    access = await get_file_access(db, session_id, step_number, expires_in=3600)
    if not access:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Image not found")

    if access["type"] == "local":
        local_path = access["path"]
        if not os.path.exists(local_path):
            logger.debug(f"Docker is looking for image at: {local_path}")
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"Image file not found at {local_path}")
        return FileResponse(
            local_path,
            media_type="image/png",
            headers={
                "Cache-Control": "public, max-age=3600",
            }
        )
    elif access["type"] == "url":
        return RedirectResponse(url=access["url"], status_code=307)

    raise HTTPException(status.HTTP_404_NOT_FOUND, "Image not found")

@router.get("/sessions")
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = 20,
    offset: int = 0
):
    """List recording sessions for the current user"""
    try:
        from sqlalchemy import select
        stmt = (
            select(ProcessRecordingSession)
            .where(ProcessRecordingSession.user_id == current_user.id)
            .order_by(ProcessRecordingSession.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        
        result = await db.execute(stmt)
        sessions = result.scalars().all()
        
        response = []
        for session in sessions:
            status_data = await get_session_status(db, session.id)
            response.append(status_data)
        
        return response
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Error listing sessions: {str(e)}")

# NEW: Workflow management endpoints
@router.put("/workflow/{session_id}")
async def update_workflow_endpoint(
    session_id: str,
    # Back-compat: allow query params
    name: Optional[str] = None,
    folder_id: Optional[str] = None,
    icon_type: Optional[str] = None,
    icon_value: Optional[str] = None,
    icon_color: Optional[str] = None,
    # Preferred: JSON body
    payload: Optional[dict] = Body(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update workflow details"""
    try:
        # Verify ownership/access
        session = await db.get(ProcessRecordingSession, session_id)
        if not session:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")
        if session.project_id:
            await check_project_permission(
                db=db, user_id=current_user.id,
                project_id=session.project_id, required_role=ProjectRole.EDITOR,
            )

        # Prefer values from JSON body when provided
        body = payload or {}
        eff_name = body.get("name", name)
        eff_folder_id = body.get("folder_id", folder_id)
        eff_icon_type = body.get("icon_type", icon_type)
        eff_icon_value = body.get("icon_value", icon_value)
        eff_icon_color = body.get("icon_color", icon_color)

        workflow = await update_workflow(
            db,
            session_id,
            name=eff_name,
            folder_id=eff_folder_id,
            icon_type=eff_icon_type,
            icon_value=eff_icon_value,
            icon_color=eff_icon_color,
        )
        return workflow
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))

@router.put("/workflow/{session_id}/move")
async def move_workflow_endpoint(
    session_id: str,
    move_data: WorkflowMove,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Move workflow to a different folder or position"""
    try:
        session = await db.get(ProcessRecordingSession, session_id)
        if not session:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")
        
        if session.project_id:
            await check_project_permission(
                db=db,
                user_id=current_user.id,
                project_id=session.project_id,
                required_role=ProjectRole.MEMBER,
            )
        
        workflow = await move_workflow(
            db, 
            session_id, 
            move_data.folder_id, 
            move_data.position,
            is_private=move_data.is_private,  # NEW
            owner_id=current_user.id if move_data.is_private else None,  # NEW
        )
        return workflow
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))

@router.delete("/workflow/{session_id}")
async def delete_workflow_endpoint(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a workflow"""
    try:
        session = await db.get(ProcessRecordingSession, session_id)
        if not session:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")
        if session.project_id:
            await check_project_permission(
                db=db, user_id=current_user.id,
                project_id=session.project_id, required_role=ProjectRole.EDITOR,
            )
        await delete_workflow(db, session_id)
        return {"status": "success", "message": "Workflow deleted"}
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))

@router.post("/workflow/{session_id}/duplicate")
async def duplicate_workflow_endpoint(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Duplicate a workflow"""
    try:
        session = await db.get(ProcessRecordingSession, session_id)
        if not session:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")
        if session.project_id:
            await check_project_permission(
                db=db, user_id=current_user.id,
                project_id=session.project_id, required_role=ProjectRole.VIEWER,
            )
        new_workflow = await duplicate_workflow(db, session_id)
        return new_workflow
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))

# Step management endpoints
@router.post("/session/{session_id}/steps", response_model=StepResponse)
async def create_step_endpoint(
    session_id: str,
    position: int,
    step_data: StepCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new step at the specified position"""
    # Check session exists and user has access
    session = await db.get(ProcessRecordingSession, session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    
    if session.project_id:
        await check_project_permission(
            db=db,
            user_id=current_user.id,
            project_id=session.project_id,
            required_role=ProjectRole.EDITOR,
        )
    
    try:
        await _maybe_create_workflow_version(db, session, current_user.id, "Step added")
        step = await create_step(
            db,
            session_id,
            position,
            step_type=step_data.step_type.value,
            description=step_data.description,
            content=step_data.content,
        )
        return step
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(e))

@router.put("/session/{session_id}/steps/{step_number}", response_model=StepResponse)
async def update_step_endpoint(
    session_id: str,
    step_number: int,
    step_data: StepUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an existing step"""
    # Check session exists and user has access
    session = await db.get(ProcessRecordingSession, session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    
    if session.project_id:
        await check_project_permission(
            db=db,
            user_id=current_user.id,
            project_id=session.project_id,
            required_role=ProjectRole.EDITOR,
        )
    
    try:
        await _maybe_create_workflow_version(db, session, current_user.id, "Step updated")
        step = await update_step(
            db,
            session_id,
            step_number,
            description=step_data.description,
            content=step_data.content,
            window_title=step_data.window_title,
        )
        return step
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))

@router.delete("/session/{session_id}/steps/{step_number}")
async def delete_step_endpoint(
    session_id: str,
    step_number: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a step"""
    # Check session exists and user has access
    session = await db.get(ProcessRecordingSession, session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    
    if session.project_id:
        await check_project_permission(
            db=db,
            user_id=current_user.id,
            project_id=session.project_id,
            required_role=ProjectRole.EDITOR,
        )
    
    try:
        await _maybe_create_workflow_version(db, session, current_user.id, "Step deleted")
        await delete_step(db, session_id, step_number)
        return {"status": "success", "message": f"Step {step_number} deleted"}
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(e))

@router.post("/session/{session_id}/steps/reorder")
async def reorder_steps_endpoint(
    session_id: str,
    reorder_data: BulkStepReorder,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reorder multiple steps"""
    # Check session exists and user has access
    session = await db.get(ProcessRecordingSession, session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    
    if session.project_id:
        await check_project_permission(
            db=db,
            user_id=current_user.id,
            project_id=session.project_id,
            required_role=ProjectRole.EDITOR,
        )
    
    try:
        await _maybe_create_workflow_version(db, session, current_user.id, "Steps reordered")
        reorders = [{"step_number": r.step_number, "new_position": r.new_position} for r in reorder_data.reorders]
        await reorder_steps(db, session_id, reorders)
        return {"status": "success", "message": "Steps reordered"}
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(e))


# ──────────────────────────────────────────────────────────────────────────────
# EXPORT ENDPOINTS
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/workflow/{session_id}/export/markdown")
async def export_workflow_markdown(
    session_id: str,
    include_images: bool = Query(default=False, description="Include image URLs in markdown"),
    lang: Optional[str] = Query(default=None, description="Translate to language code"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export workflow as Markdown"""
    from app.workflow_export import generate_markdown
    
    # Get session with steps and files
    stmt = select(ProcessRecordingSession).options(
        selectinload(ProcessRecordingSession.steps),
        selectinload(ProcessRecordingSession.files)
    ).where(ProcessRecordingSession.id == session_id)
    
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")
    
    # Prepare data
    workflow_dict = {
        "id": session.id,
        "name": session.name,
        "created_at": session.created_at,
    }
    
    steps_list = [
        {
            "step_number": step.step_number,
            "step_type": step.step_type,
            "description": step.description,
            "content": step.content,
            "window_title": step.window_title,
            "text_typed": step.text_typed,
            "key_pressed": step.key_pressed,
            "url": step.url,
            "owner_app": step.owner_app,
            "element_info": step.element_info,
        }
        for step in session.steps
    ]
    
    files_dict = {f.step_number: f.file_path for f in session.files}
    
    # Generate base URL for images if requested
    image_base_url = None
    if include_images:
        # Use request context to build URL (simplified)
        image_base_url = "/api/v1/process-recording"
    
    # Translate if requested
    if lang and lang in SUPPORTED_LANGUAGES:
        items = []
        if workflow_dict.get("name"):
            items.append({"key": "name", "text": workflow_dict["name"]})
        for i, step in enumerate(steps_list):
            for field in ("description", "content"):
                if step.get(field):
                    items.append({"key": f"step.{i}.{field}", "text": step[field]})
        if items:
            translated = await translate_batch(items, lang, db)
            lookup = {it["key"]: it["translated"] for it in translated}
            if "name" in lookup:
                workflow_dict["name"] = lookup["name"]
            for i, step in enumerate(steps_list):
                for field in ("description", "content"):
                    k = f"step.{i}.{field}"
                    if k in lookup:
                        step[field] = lookup[k]

    markdown = generate_markdown(
        workflow_dict,
        steps_list,
        files_dict,
        include_images=include_images,
        image_base_url=image_base_url,
    )
    
    filename = f"{session.name or 'workflow'}.md".replace(" ", "_")
    
    return Response(
        content=markdown,
        media_type="text/markdown",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        }
    )


@router.get("/workflow/{session_id}/export/html")
async def export_workflow_html(
    session_id: str,
    embed_images: bool = Query(default=True, description="Embed images as base64"),
    lang: Optional[str] = Query(default=None, description="Translate to language code"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export workflow as HTML"""
    from app.workflow_export import generate_html
    
    # Get session with steps and files
    stmt = select(ProcessRecordingSession).options(
        selectinload(ProcessRecordingSession.steps),
        selectinload(ProcessRecordingSession.files)
    ).where(ProcessRecordingSession.id == session_id)
    
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")
    
    workflow_dict = {
        "id": session.id,
        "name": session.name,
        "created_at": session.created_at,
    }
    
    steps_list = [
        {
            "step_number": step.step_number,
            "step_type": step.step_type,
            "description": step.description,
            "content": step.content,
            "window_title": step.window_title,
            "text_typed": step.text_typed,
            "key_pressed": step.key_pressed,
            "url": step.url,
            "owner_app": step.owner_app,
            "element_info": step.element_info,
        }
        for step in session.steps
    ]
    
    files_dict = {f.step_number: f.file_path for f in session.files}
    
    # Translate if requested
    if lang and lang in SUPPORTED_LANGUAGES:
        items = []
        if workflow_dict.get("name"):
            items.append({"key": "name", "text": workflow_dict["name"]})
        for i, step in enumerate(steps_list):
            for field in ("description", "content"):
                if step.get(field):
                    items.append({"key": f"step.{i}.{field}", "text": step[field]})
        if items:
            translated = await translate_batch(items, lang, db)
            lookup = {it["key"]: it["translated"] for it in translated}
            if "name" in lookup:
                workflow_dict["name"] = lookup["name"]
            for i, step in enumerate(steps_list):
                for field in ("description", "content"):
                    k = f"step.{i}.{field}"
                    if k in lookup:
                        step[field] = lookup[k]

    html = await generate_html(
        workflow_dict,
        steps_list,
        files_dict,
        storage_path=session.storage_path,
        storage_type=session.storage_type,
        embed_images=embed_images,
    )
    
    filename = f"{session.name or 'workflow'}.html".replace(" ", "_")
    
    return Response(
        content=html,
        media_type="text/html",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        }
    )


@router.get("/workflow/{session_id}/export/pdf")
async def export_workflow_pdf(
    session_id: str,
    lang: Optional[str] = Query(default=None, description="Translate to language code"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export workflow as PDF using Gotenberg"""
    from app.workflow_export import generate_pdf_gotenberg, _generate_pdf_reportlab
    
    # Get session with steps and files
    stmt = select(ProcessRecordingSession).options(
        selectinload(ProcessRecordingSession.steps),
        selectinload(ProcessRecordingSession.files)
    ).where(ProcessRecordingSession.id == session_id)
    
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")
    
    workflow_dict = {
        "id": session.id,
        "name": session.name,
        "created_at": session.created_at,
    }
    
    steps_list = [
        {
            "step_number": step.step_number,
            "step_type": step.step_type,
            "description": step.description,
            "content": step.content,
            "window_title": step.window_title,
            "text_typed": step.text_typed,
            "key_pressed": step.key_pressed,
            "url": step.url,
            "owner_app": step.owner_app,
            "element_info": step.element_info,
        }
        for step in session.steps
    ]
    
    # Map step_number to file_path (filename only, stored in DB)
    files_dict = {f.step_number: f.file_path for f in session.files}
    
    # Translate if requested
    if lang and lang in SUPPORTED_LANGUAGES:
        items = []
        if workflow_dict.get("name"):
            items.append({"key": "name", "text": workflow_dict["name"]})
        for i, step in enumerate(steps_list):
            for field in ("description", "content"):
                if step.get(field):
                    items.append({"key": f"step.{i}.{field}", "text": step[field]})
        if items:
            translated = await translate_batch(items, lang, db)
            lookup = {it["key"]: it["translated"] for it in translated}
            if "name" in lookup:
                workflow_dict["name"] = lookup["name"]
            for i, step in enumerate(steps_list):
                for field in ("description", "content"):
                    k = f"step.{i}.{field}"
                    if k in lookup:
                        step[field] = lookup[k]

    # Debug logging
    logger.debug(f"[PDF Export] Session ID: {session_id}")
    logger.debug(f"[PDF Export] Storage path: {session.storage_path}")
    logger.debug(f"[PDF Export] Storage type: {session.storage_type}")
    logger.debug(f"[PDF Export] Files: {[(f.step_number, f.file_path, f.filename) for f in session.files]}")
    
    try:
        # Try Gotenberg first (async)
        pdf_bytes = await generate_pdf_gotenberg(
            workflow_dict,
            steps_list,
            files_dict,
            storage_path=session.storage_path,
            storage_type=session.storage_type,
        )
    except Exception as gotenberg_error:
        logger.debug(f"[PDF Export] Gotenberg error: {gotenberg_error}")
        # Fall back to reportlab if Gotenberg fails
        try:
            pdf_bytes = _generate_pdf_reportlab(
                workflow_dict,
                steps_list,
                files_dict,
                storage_path=session.storage_path,
                storage_type=session.storage_type,
            )
        except Exception as fallback_error:
            raise HTTPException(
                status.HTTP_501_NOT_IMPLEMENTED, 
                f"PDF generation failed. Gotenberg: {gotenberg_error}. Fallback: {fallback_error}"
            )
    
    filename = f"{session.name or 'workflow'}.pdf".replace(" ", "_")
    
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        }
    )


@router.get("/workflow/{session_id}/export/confluence")
async def export_workflow_confluence(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export workflow as Confluence Storage Format"""
    from app.workflow_export import generate_confluence_storage
    
    stmt = select(ProcessRecordingSession).options(
        selectinload(ProcessRecordingSession.steps),
        selectinload(ProcessRecordingSession.files)
    ).where(ProcessRecordingSession.id == session_id)
    
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")
    
    workflow_dict = {"id": session.id, "name": session.name, "created_at": session.created_at}
    steps_list = [{"step_number": s.step_number, "step_type": s.step_type, "description": s.description, "content": s.content, "window_title": s.window_title, "text_typed": s.text_typed, "key_pressed": s.key_pressed, "url": s.url, "owner_app": s.owner_app, "element_info": s.element_info} for s in session.steps]
    files_dict = {f.step_number: f.file_path for f in session.files}
    
    confluence = generate_confluence_storage(workflow_dict, steps_list, files_dict, image_base_url="/api/v1/process-recording")
    filename = f"{session.name or 'workflow'}_confluence.xml".replace(" ", "_")
    
    return Response(content=confluence, media_type="application/xml", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/workflow/{session_id}/export/notion")
async def export_workflow_notion(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export workflow as Notion-compatible Markdown"""
    from app.workflow_export import generate_notion_markdown
    
    stmt = select(ProcessRecordingSession).options(
        selectinload(ProcessRecordingSession.steps),
        selectinload(ProcessRecordingSession.files)
    ).where(ProcessRecordingSession.id == session_id)
    
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")
    
    workflow_dict = {"id": session.id, "name": session.name, "created_at": session.created_at}
    steps_list = [{"step_number": s.step_number, "step_type": s.step_type, "description": s.description, "content": s.content, "window_title": s.window_title, "text_typed": s.text_typed, "key_pressed": s.key_pressed, "url": s.url, "owner_app": s.owner_app, "element_info": s.element_info} for s in session.steps]
    files_dict = {f.step_number: f.file_path for f in session.files}
    
    notion_md = generate_notion_markdown(workflow_dict, steps_list, files_dict, image_base_url="/api/v1/process-recording")
    filename = f"{session.name or 'workflow'}_notion.md".replace(" ", "_")
    
    return Response(content=notion_md, media_type="text/markdown", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/workflow/{session_id}/export/docx")
async def export_workflow_docx(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export workflow as Microsoft Word document"""
    from app.workflow_export import generate_docx
    
    # Get session with steps and files
    stmt = select(ProcessRecordingSession).options(
        selectinload(ProcessRecordingSession.steps),
        selectinload(ProcessRecordingSession.files)
    ).where(ProcessRecordingSession.id == session_id)
    
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")
    
    workflow_dict = {
        "id": session.id,
        "name": session.name,
        "created_at": session.created_at,
    }
    
    steps_list = [
        {
            "step_number": step.step_number,
            "step_type": step.step_type,
            "description": step.description,
            "content": step.content,
            "window_title": step.window_title,
            "text_typed": step.text_typed,
            "key_pressed": step.key_pressed,
            "url": step.url,
            "owner_app": step.owner_app,
            "element_info": step.element_info,
        }
        for step in session.steps
    ]
    
    files_dict = {f.step_number: f.file_path for f in session.files}
    
    try:
        docx_bytes = await generate_docx(
            workflow_dict,
            steps_list,
            files_dict,
            storage_path=session.storage_path,
            storage_type=session.storage_type,
        )
    except RuntimeError as e:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, str(e))
    
    filename = f"{session.name or 'workflow'}.docx".replace(" ", "_")
    
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        }
    )


# ──────────────────────────────────────────────────────────────────────────────
# SHARING ENDPOINTS
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/workflow/{session_id}/share")
async def get_workflow_share_settings(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get share settings for a workflow."""
    from app.models import ResourceShare
    session = await db.get(ProcessRecordingSession, session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")

    # Get shared users
    stmt = select(ResourceShare).where(
        ResourceShare.resource_type == "workflow",
        ResourceShare.resource_id == session_id,
    )
    result = await db.execute(stmt)
    shares = result.scalars().all()

    shared_with = []
    for s in shares:
        user_name = None
        if s.shared_with_user_id:
            u = await db.get(User, s.shared_with_user_id)
            if u:
                user_name = u.name
        shared_with.append({
            "id": s.id,
            "email": s.shared_with_email,
            "permission": s.permission,
            "user_name": user_name,
        })

    return {
        "is_public": session.is_public,
        "share_token": session.share_token,
        "public_url": f"/public/workflow/{session.share_token}" if session.share_token else None,
        "shared_with": shared_with,
    }


@router.post("/workflow/{session_id}/share")
async def share_workflow(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a public share link for a workflow (legacy compat)."""
    import uuid
    session = await db.get(ProcessRecordingSession, session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")
    if not session.share_token:
        session.share_token = uuid.uuid4().hex
    session.is_public = True
    await db.commit()
    return {"share_token": session.share_token, "is_public": True}


@router.delete("/workflow/{session_id}/share")
async def unshare_workflow(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove public share link for a workflow (legacy compat)."""
    session = await db.get(ProcessRecordingSession, session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")
    session.is_public = False
    await db.commit()
    return {"is_public": False}


@router.post("/workflow/{session_id}/share/public")
async def enable_workflow_public_link(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Enable public link sharing for a workflow."""
    import uuid
    session = await db.get(ProcessRecordingSession, session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")
    if not session.share_token:
        session.share_token = uuid.uuid4().hex
    session.is_public = True
    await db.commit()
    return {
        "is_public": True,
        "share_token": session.share_token,
        "public_url": f"/public/workflow/{session.share_token}",
    }


@router.delete("/workflow/{session_id}/share/public")
async def disable_workflow_public_link(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Disable public link sharing for a workflow."""
    session = await db.get(ProcessRecordingSession, session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")
    # Keep the token so re-enabling gives the same URL
    session.is_public = False
    await db.commit()
    return {"is_public": False, "share_token": session.share_token, "public_url": f"/public/workflow/{session.share_token}" if session.share_token else None}


@router.post("/workflow/{session_id}/share/invite")
async def invite_to_workflow(
    session_id: str,
    body: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Invite a user by email to access this workflow."""
    from app.models import ResourceShare
    session = await db.get(ProcessRecordingSession, session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")

    email = body.get("email", "").strip().lower()
    permission = body.get("permission", "view")
    if not email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email is required")
    if permission not in ("view", "edit"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Permission must be 'view' or 'edit'")

    # Check if already shared
    existing = await db.execute(
        select(ResourceShare).where(
            ResourceShare.resource_type == "workflow",
            ResourceShare.resource_id == session_id,
            ResourceShare.shared_with_email == email,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "Already shared with this email")

    # Check if email matches an existing user
    user_result = await db.execute(select(User).where(User.email == email))
    existing_user = user_result.scalar_one_or_none()

    share = ResourceShare(
        resource_type="workflow",
        resource_id=session_id,
        shared_with_email=email,
        shared_with_user_id=existing_user.id if existing_user else None,
        permission=permission,
        shared_by=current_user.id,
    )
    db.add(share)
    await db.commit()
    await db.refresh(share)

    return {
        "id": share.id,
        "email": share.shared_with_email,
        "permission": share.permission,
        "user_name": existing_user.name if existing_user else None,
    }


@router.delete("/workflow/{session_id}/share/invite/{share_id}")
async def remove_workflow_invite(
    session_id: str,
    share_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a user's access to this workflow."""
    from app.models import ResourceShare
    share = await db.get(ResourceShare, share_id)
    if not share or share.resource_id != session_id or share.resource_type != "workflow":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Share not found")
    await db.delete(share)
    await db.commit()
    return {"status": "removed"}


@router.patch("/workflow/{session_id}/share/invite/{share_id}")
async def update_workflow_invite(
    session_id: str,
    share_id: str,
    body: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a user's permission on this workflow."""
    from app.models import ResourceShare
    share = await db.get(ResourceShare, share_id)
    if not share or share.resource_id != session_id or share.resource_type != "workflow":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Share not found")
    permission = body.get("permission", "view")
    if permission not in ("view", "edit"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Permission must be 'view' or 'edit'")
    share.permission = permission
    await db.commit()
    return {"id": share.id, "permission": share.permission}


# ──────────────────────────────────────────────────────────────────────────────
# AI PROCESSING ENDPOINTS
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/workflow/{session_id}/process")
async def process_recording_with_ai(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Trigger AI auto-processing of a recording: annotate all steps and generate summary."""
    from app.services.auto_processor import auto_processor

    session = await db.get(ProcessRecordingSession, session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")

    if session.project_id:
        await check_project_permission(
            db=db,
            user_id=current_user.id,
            project_id=session.project_id,
            required_role=ProjectRole.MEMBER,
        )

    # Check if async Celery processing is available
    from app.tasks import is_celery_available
    if is_celery_available():
        from app.tasks.ai_tasks import process_recording_task
        task = process_recording_task.delay(session_id)
        return {"status": "queued", "task_id": task.id}

    try:
        result = await auto_processor.process_recording(session_id, db)

        # Auto-index embeddings for semantic search (fire-and-forget)
        import asyncio
        from app.services.indexer import index_workflow_background
        asyncio.create_task(index_workflow_background(session_id))

        return ProcessingStatus(
            recording_id=result["recording_id"],
            steps_annotated=result["steps_annotated"],
            total_steps=result["total_steps"],
            has_summary=result["has_summary"],
            is_processed=True,
        )
    except Exception as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail=f"AI processing failed: {exc}",
        )


@router.post("/workflow/{session_id}/generate-guide", response_model=GuideResponse)
async def generate_guide_endpoint(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a polished markdown guide for a recording."""
    from app.services.auto_processor import auto_processor

    session = await db.get(ProcessRecordingSession, session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")

    if session.project_id:
        await check_project_permission(
            db=db,
            user_id=current_user.id,
            project_id=session.project_id,
            required_role=ProjectRole.MEMBER,
        )

    # Check if async Celery processing is available
    from app.tasks import is_celery_available
    if is_celery_available():
        from app.tasks.ai_tasks import generate_guide_task
        task = generate_guide_task.delay(session_id)
        return {"status": "queued", "task_id": task.id}

    try:
        guide_md = await auto_processor.generate_guide(session_id, db)

        # Re-index embeddings after guide generation (fire-and-forget)
        import asyncio
        from app.services.indexer import index_workflow_background
        asyncio.create_task(index_workflow_background(session_id))

        return GuideResponse(
            recording_id=session_id,
            guide_markdown=guide_md,
            generated_title=session.generated_title,
        )
    except Exception as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail=f"Guide generation failed: {exc}",
        )



@router.get("/workflow/{session_id}/task-status/{task_id}")
async def get_task_status(session_id: str, task_id: str, current_user: User = Depends(get_current_user)):
    from app.tasks import celery_app, is_celery_available
    if not is_celery_available():
        raise HTTPException(404, "Async processing not configured")
    result = celery_app.AsyncResult(task_id)
    return {"task_id": task_id, "status": result.state, "result": result.result if result.ready() else None}


@router.get("/workflow/{session_id}/generate-guide/stream")
async def stream_guide_endpoint(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Stream a polished markdown guide via SSE."""
    from app.services.auto_processor import auto_processor

    session = await db.get(ProcessRecordingSession, session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")

    if session.project_id:
        await check_project_permission(
            db=db,
            user_id=current_user.id,
            project_id=session.project_id,
            required_role=ProjectRole.MEMBER,
        )

    return StreamingResponse(
        auto_processor.generate_guide_stream(session_id, db),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/workflow/{session_id}/interactive-guide")
async def get_interactive_guide(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Build an interactive guide JSON for the guide-runtime overlay."""
    session = await db.get(ProcessRecordingSession, session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")
    if session.project_id:
        await check_project_permission(
            db=db, user_id=current_user.id,
            project_id=session.project_id, required_role=ProjectRole.VIEWER,
        )

    # Load steps and files ordered by step_number
    stmt = (
        select(ProcessRecordingStep)
        .where(ProcessRecordingStep.session_id == session_id)
        .order_by(ProcessRecordingStep.step_number)
    )
    result = await db.execute(stmt)
    steps = result.scalars().all()

    # Build files lookup for screenshot URLs
    files_stmt = select(ProcessRecordingFile).where(
        ProcessRecordingFile.session_id == session_id
    )
    files_result = await db.execute(files_stmt)
    files_dict = {f.step_number: f for f in files_result.scalars().all()}

    guide_steps = []
    for step in steps:
        ei = step.element_info or {}

        # Title fallback chain: generated_title → generated_description → description
        step_title = step.generated_title or step.generated_description or step.description or f"Step {step.step_number}"

        is_navigation = (step.action_type or "").lower() == "navigate"

        # Screenshot URL: /api/v1/process-recording/session/{session_id}/image/{step_number}
        has_image = step.step_number in files_dict
        screenshot_url = f"/api/v1/process-recording/session/{session_id}/image/{step.step_number}" if has_image else None

        guide_steps.append({
            "title": step_title,
            "description": step.generated_description or step.description or "",
            "selector": ei.get("selector"),
            "xpath": ei.get("xpath"),
            "testId": ei.get("testId"),
            "element_text": ei.get("text"),
            "element_role": ei.get("role"),
            "ariaLabel": ei.get("ariaLabel"),
            "parentChain": ei.get("parentChain"),
            "element_info": ei,
            "expected_url": step.url,
            "action_type": step.action_type,
            "step_number": step.step_number,
            "is_navigation": is_navigation,
            "screenshot_url": screenshot_url,
            "screenshot_size": step.screenshot_size,
            "screenshot_relative_position": step.screenshot_relative_position,
        })

    return {
        "id": session.id,
        "title": session.generated_title or session.name or "Untitled Workflow",
        "steps": guide_steps,
    }


@router.get("/workflow/{session_id}/guide", response_model=GuideResponse)
async def get_guide_endpoint(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get previously generated guide."""
    session = await db.get(ProcessRecordingSession, session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")

    return GuideResponse(
        recording_id=session_id,
        guide_markdown=session.guide_markdown,
        generated_title=session.generated_title,
    )


@router.get("/workflow/{session_id}/ai-summary")
async def get_ai_summary(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get AI-generated summary and step annotations for a recording."""
    from sqlalchemy.orm import selectinload as _sel

    stmt = (
        select(ProcessRecordingSession)
        .where(ProcessRecordingSession.id == session_id)
        .options(_sel(ProcessRecordingSession.steps))
    )
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")

    steps_data = []
    for step in sorted(session.steps, key=lambda s: s.step_number):
        steps_data.append({
            "step_id": step.id,
            "step_number": step.step_number,
            "generated_title": step.generated_title,
            "generated_description": step.generated_description,
            "ui_element": step.ui_element,
            "step_category": step.step_category,
            "is_annotated": step.is_annotated,
        })

    has_guide = any(s.element_info for s in session.steps)

    return {
        "recording_id": session_id,
        "generated_title": session.generated_title,
        "summary": session.summary,
        "tags": session.tags,
        "estimated_time": session.estimated_time,
        "difficulty": session.difficulty,
        "is_processed": session.is_processed,
        "guide_markdown": session.guide_markdown,
        "has_guide": has_guide,
        "steps": steps_data,
    }


@router.post("/steps/{step_id}/annotate")
async def annotate_single_step(
    step_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Re-annotate a single step with AI."""
    from app.services.auto_processor import auto_processor
    from app.models import ProcessRecordingFile
    from sqlalchemy import and_

    step = await db.get(ProcessRecordingStep, step_id)
    if not step:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Step not found")

    session = await db.get(ProcessRecordingSession, step.session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")

    # Load screenshot if available (works with any storage backend)
    image_b64 = None
    stmt = select(ProcessRecordingFile).where(
        and_(
            ProcessRecordingFile.session_id == step.session_id,
            ProcessRecordingFile.step_number == step.step_number,
        )
    )
    file_result = await db.execute(stmt)
    file_record = file_result.scalar_one_or_none()
    if file_record and session.storage_path:
        import base64 as b64mod
        from app.services.storage import get_storage_backend
        backend = get_storage_backend(session.storage_type)
        file_data = await backend.read_file(session.storage_path, file_record.file_path)
        if file_data:
            image_b64 = b64mod.b64encode(file_data).decode("utf-8")

    try:
        result = await auto_processor.annotate_step(step, image_b64)
        if result:
            step.generated_title = result.get("title", "")
            step.generated_description = result.get("description", "")
            step.ui_element = result.get("ui_element", "")
            step.step_category = result.get("category", "")
            step.is_annotated = True
            await db.commit()

        return StepAnnotation(
            step_id=step.id,
            step_number=step.step_number,
            generated_title=step.generated_title,
            generated_description=step.generated_description,
            ui_element=step.ui_element,
            step_category=step.step_category,
            is_annotated=step.is_annotated,
        )
    except Exception as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail=f"Step annotation failed: {exc}",
        )


@router.post("/steps/{step_id}/improve")
async def improve_step_endpoint(
    step_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Improve a step's description using AI."""
    from app.services.auto_processor import auto_processor

    step = await db.get(ProcessRecordingStep, step_id)
    if not step:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Step not found")

    try:
        result = await auto_processor.improve_step(step)
        if result:
            step.generated_title = result.get("title", step.generated_title)
            step.generated_description = result.get("description", step.generated_description)
            step.ui_element = result.get("ui_element", step.ui_element)
            step.step_category = result.get("category", step.step_category)
            step.is_annotated = True
            await db.commit()

        return StepAnnotation(
            step_id=step.id,
            step_number=step.step_number,
            generated_title=step.generated_title,
            generated_description=step.generated_description,
            ui_element=step.ui_element,
            step_category=step.step_category,
            is_annotated=step.is_annotated,
        )
    except Exception as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail=f"Step improvement failed: {exc}",
        )


# ── Version History endpoints ─────────────────────────────────────────────────

@router.get("/workflow/{session_id}/versions")
async def list_workflow_versions(
    session_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List workflow versions (without steps_snapshot)."""
    from sqlalchemy.orm import aliased
    session = await db.get(ProcessRecordingSession, session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")

    if session.project_id:
        await check_project_permission(db, current_user.id, session.project_id, ProjectRole.VIEWER)

    Creator = aliased(User)
    result = await db.execute(
        select(
            WorkflowVersion.id,
            WorkflowVersion.version_number,
            WorkflowVersion.name,
            WorkflowVersion.total_steps,
            WorkflowVersion.created_by,
            WorkflowVersion.created_at,
            WorkflowVersion.change_summary,
            Creator.name.label("created_by_name"),
            Creator.email.label("created_by_email"),
        )
        .outerjoin(Creator, WorkflowVersion.created_by == Creator.id)
        .where(WorkflowVersion.session_id == session_id)
        .order_by(WorkflowVersion.version_number.desc())
        .offset(offset)
        .limit(limit)
    )
    rows = result.all()
    return [
        {
            "id": r.id,
            "version_number": r.version_number,
            "name": r.name,
            "total_steps": r.total_steps,
            "created_by": r.created_by,
            "created_by_name": r.created_by_name or (r.created_by_email.split("@")[0] if r.created_by_email else None),
            "created_at": r.created_at,
            "change_summary": r.change_summary,
        }
        for r in rows
    ]


@router.get("/workflow/{session_id}/versions/{version_id}")
async def get_workflow_version(
    session_id: str,
    version_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a specific workflow version including steps_snapshot."""
    session = await db.get(ProcessRecordingSession, session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")

    if session.project_id:
        await check_project_permission(db, current_user.id, session.project_id, ProjectRole.VIEWER)

    ver = await db.scalar(
        select(WorkflowVersion).where(
            WorkflowVersion.id == version_id,
            WorkflowVersion.session_id == session_id,
        )
    )
    if not ver:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Version not found")

    return {
        "id": ver.id,
        "version_number": ver.version_number,
        "name": ver.name,
        "total_steps": ver.total_steps,
        "steps_snapshot": ver.steps_snapshot,
        "created_by": ver.created_by,
        "created_at": ver.created_at,
        "change_summary": ver.change_summary,
    }


@router.post("/workflow/{session_id}/versions/{version_id}/restore")
async def restore_workflow_version(
    session_id: str,
    version_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Restore workflow steps from a version snapshot. Saves current state as version first."""
    from sqlalchemy import delete as sa_delete
    from app.utils import gen_suffix

    session = await db.get(ProcessRecordingSession, session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")

    if session.project_id:
        await check_project_permission(db, current_user.id, session.project_id, ProjectRole.EDITOR)

    ver = await db.scalar(
        select(WorkflowVersion).where(
            WorkflowVersion.id == version_id,
            WorkflowVersion.session_id == session_id,
        )
    )
    if not ver:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Version not found")

    # Save current state as a version first (force, skip throttle)
    current_steps_result = await db.execute(
        select(ProcessRecordingStep)
        .where(ProcessRecordingStep.session_id == session_id)
        .order_by(ProcessRecordingStep.step_number)
    )
    current_steps = current_steps_result.scalars().all()
    snapshot = []
    for s in current_steps:
        snapshot.append({
            "step_number": s.step_number,
            "step_type": s.step_type,
            "action_type": s.action_type,
            "window_title": s.window_title,
            "description": s.description,
            "content": s.content,
            "url": s.url,
            "owner_app": s.owner_app,
            "generated_title": s.generated_title,
            "generated_description": s.generated_description,
            "ui_element": s.ui_element,
            "step_category": s.step_category,
            "spoken_text": s.spoken_text,
        })
    save_ver = WorkflowVersion(
        id=gen_suffix(16),
        session_id=session_id,
        version_number=session.version or 1,
        steps_snapshot=snapshot,
        name=session.name,
        total_steps=len(snapshot),
        created_by=current_user.id,
        change_summary=f"Before restore to v{ver.version_number}",
    )
    db.add(save_ver)

    # Delete all current steps
    await db.execute(
        sa_delete(ProcessRecordingStep).where(ProcessRecordingStep.session_id == session_id)
    )

    # Recreate steps from snapshot
    for step_data in ver.steps_snapshot:
        new_step = ProcessRecordingStep(
            id=gen_suffix(16),
            session_id=session_id,
            step_number=step_data.get("step_number", 1),
            step_type=step_data.get("step_type"),
            timestamp=datetime.now(timezone.utc).replace(tzinfo=None),
            action_type=step_data.get("action_type"),
            window_title=step_data.get("window_title"),
            description=step_data.get("description"),
            content=step_data.get("content"),
            url=step_data.get("url"),
            owner_app=step_data.get("owner_app"),
            generated_title=step_data.get("generated_title"),
            generated_description=step_data.get("generated_description"),
            ui_element=step_data.get("ui_element"),
            step_category=step_data.get("step_category"),
            spoken_text=step_data.get("spoken_text"),
        )
        db.add(new_step)

    session.version = (session.version or 1) + 1
    session.total_steps = len(ver.steps_snapshot)
    await db.commit()

    return {
        "status": "success",
        "version": session.version,
        "message": f"Restored from version {ver.version_number}",
        "total_steps": len(ver.steps_snapshot),
    }


# ── Trash endpoints ──────────────────────────────────────────────────────────

@router.get("/workflows/trash/{project_id}")
async def list_deleted_workflows(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all soft-deleted workflows for a project"""
    await check_project_permission(db, current_user.id, project_id, ProjectRole.VIEWER)
    workflows = await get_deleted_workflows(db, project_id, user_id=current_user.id)
    return workflows


@router.post("/workflows/{session_id}/restore")
async def restore_workflow_endpoint(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Restore a soft-deleted workflow"""
    wf = await restore_workflow(db, session_id)
    return wf


@router.delete("/workflows/{session_id}/permanent")
async def permanent_delete_workflow_endpoint(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Permanently delete a workflow (no recovery)"""
    await permanent_delete_workflow(db, session_id)
    return {"ok": True}
