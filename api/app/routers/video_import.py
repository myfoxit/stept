"""Video import: upload screen recordings and convert to guides."""

import os
import logging
from typing import Optional

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_session as get_db
from app.models import ProcessRecordingSession, MediaProcessingJob, User
from app.crud.media_jobs import enqueue_or_get_job
from app.security import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(tags=["video-import"])

UPLOAD_DIR = os.environ.get("ONDOKI_UPLOAD_DIR", "/data/uploads/videos")
MAX_FILE_SIZE = int(os.environ.get("ONDOKI_MAX_VIDEO_SIZE", str(2 * 1024 * 1024 * 1024)))  # 2GB
ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}


@router.post("/upload")
async def upload_video(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    project_id: Optional[str] = Form(None),
    folder_id: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a video file and queue it for processing."""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported format: {ext}. Use: {', '.join(ALLOWED_EXTENSIONS)}")

    session = ProcessRecordingSession(
        user_id=current_user.id,
        owner_id=current_user.id,
        client_name="VideoImport",
        name=title or file.filename or "Video Import",
        source_type="video",
        video_filename=file.filename,
        status="uploading",
        processing_stage="uploading",
        processing_progress=0,
        project_id=project_id,
        folder_id=folder_id,
    )
    db.add(session)
    await db.flush()

    session_dir = os.path.join(UPLOAD_DIR, session.id)
    os.makedirs(session_dir, exist_ok=True)
    video_path = os.path.join(session_dir, f"video{ext}")

    total_size = 0
    with open(video_path, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            total_size += len(chunk)
            if total_size > MAX_FILE_SIZE:
                os.remove(video_path)
                raise HTTPException(413, f"File too large (max {MAX_FILE_SIZE // (1024*1024)}MB)")
            f.write(chunk)

    session.storage_path = video_path
    session.video_size_bytes = total_size
    session.status = "processing"
    session.processing_stage = "queued"

    job = await enqueue_or_get_job(db, session.id, "video_import")
    await db.commit()

    from app.tasks import is_celery_available
    if is_celery_available():
        from app.tasks.ai_tasks import process_video_import_task
        task = process_video_import_task.delay(session.id, job.id)
        job.task_id = task.id
        await db.commit()
        return {
            "session_id": session.id,
            "job_id": job.id,
            "task_id": task.id,
            "status": "queued",
            "message": "Video uploaded and queued for processing",
        }
    else:
        job.status = "failed"
        job.stage = "failed"
        job.error = "Media worker not available. Start the ondoki-media-worker container."
        session.processing_stage = "failed"
        session.processing_error = "Media worker not available. Start the ondoki-media-worker container."
        await db.commit()
        raise HTTPException(503, "Video processing worker not available. Deploy the ondoki-media-worker container.")


@router.get("/status/{session_id}")
async def get_import_status(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the processing status of a video import."""
    result = await db.execute(
        select(ProcessRecordingSession).where(
            ProcessRecordingSession.id == session_id,
            ProcessRecordingSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Import not found")

    job_result = await db.execute(
        select(MediaProcessingJob).where(MediaProcessingJob.session_id == session.id, MediaProcessingJob.job_type == "video_import")
    )
    job = job_result.scalar_one_or_none()

    return {
        "session_id": session.id,
        "status": session.status,
        "stage": session.processing_stage,
        "progress": session.processing_progress or 0,
        "error": session.processing_error,
        "title": session.name,
        "video_filename": session.video_filename,
        "video_size_bytes": session.video_size_bytes,
        "has_guide": session.guide_markdown is not None,
        "created_at": session.created_at.isoformat() if session.created_at else None,
        "job": {
            "id": job.id,
            "status": job.status,
            "stage": job.stage,
            "progress": job.progress,
            "task_id": job.task_id,
            "attempts": job.attempts,
            "max_attempts": job.max_attempts,
            "error": job.error,
        } if job else None,
    }


@router.get("/jobs/{job_id}")
async def get_media_job_status(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(MediaProcessingJob)
        .join(ProcessRecordingSession, ProcessRecordingSession.id == MediaProcessingJob.session_id)
        .where(
            MediaProcessingJob.id == job_id,
            ProcessRecordingSession.user_id == current_user.id,
        )
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")

    return {
        "job_id": job.id,
        "session_id": job.session_id,
        "status": job.status,
        "progress": job.progress,
        "stage": job.stage,
        "attempts": job.attempts,
        "max_attempts": job.max_attempts,
        "error": job.error,
        "task_id": job.task_id,
    }


@router.get("/list")
async def list_imports(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all video imports for the current user."""
    result = await db.execute(
        select(ProcessRecordingSession)
        .where(
            ProcessRecordingSession.user_id == current_user.id,
            ProcessRecordingSession.source_type == "video",
        )
        .order_by(ProcessRecordingSession.created_at.desc())
    )
    sessions = result.scalars().all()

    return [
        {
            "session_id": s.id,
            "title": s.name,
            "status": s.status,
            "stage": s.processing_stage,
            "progress": s.processing_progress or 0,
            "video_filename": s.video_filename,
            "video_size_bytes": s.video_size_bytes,
            "has_guide": s.guide_markdown is not None,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "error": s.processing_error,
        }
        for s in sessions
    ]
