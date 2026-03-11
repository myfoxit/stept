import os
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.models import ProcessRecordingSession, MediaProcessingJob
from app.security import get_current_user
from app.models import User
from app.utils import gen_suffix

logger = logging.getLogger(__name__)
router = APIRouter()

UPLOAD_DIR = os.getenv("ONDOKI_UPLOAD_DIR", "/data/uploads/videos")
MAX_SIZE = 2 * 1024 * 1024 * 1024  # 2 GB
ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}


@router.post("/upload")
async def upload_video(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Validate extension
    filename = file.filename or "video.mp4"
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported file type: {ext}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")

    # Read file and check size
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(400, f"File too large. Maximum size is 2 GB.")

    # Create session
    session_id = gen_suffix(16)
    session = ProcessRecordingSession(
        id=session_id,
        user_id=current_user.id,
        name=Path(filename).stem,
        status="uploading",
        source_type="video",
        video_filename=filename,
        video_size_bytes=len(content),
        processing_stage="uploading",
        processing_progress=0,
        client_name="VideoImport",
    )
    db.add(session)
    await db.flush()

    # Save file to disk
    upload_dir = Path(UPLOAD_DIR) / session_id
    upload_dir.mkdir(parents=True, exist_ok=True)
    video_path = upload_dir / filename
    video_path.write_bytes(content)

    # Create processing job
    from app.crud.media_jobs import enqueue_or_get_job
    job = await enqueue_or_get_job(db, session_id, "video_import")

    # Enqueue Celery task
    try:
        from app.tasks.ai_tasks import process_video_import_task
        result = process_video_import_task.delay(session_id, str(video_path))
        job.task_id = result.id
    except Exception as e:
        logger.warning("Could not enqueue video import task: %s", e)
        session.processing_stage = "failed"
        session.processing_error = f"Failed to enqueue task: {e}"

    session.status = "completed"
    session.processing_stage = "queued"
    await db.commit()

    return {
        "session_id": session_id,
        "job_id": job.id,
        "status": "queued",
        "filename": filename,
        "size_bytes": len(content),
    }


@router.get("/status/{session_id}")
async def get_status(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ProcessRecordingSession).where(
            ProcessRecordingSession.id == session_id,
            ProcessRecordingSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Session not found")

    from app.crud.media_jobs import get_job_for_session
    job = await get_job_for_session(db, session_id, "video_import")

    return {
        "session_id": session_id,
        "name": session.name,
        "source_type": session.source_type,
        "processing_stage": session.processing_stage,
        "processing_progress": session.processing_progress,
        "processing_error": session.processing_error,
        "is_processed": session.is_processed,
        "job_status": job.status if job else None,
        "job_progress": job.progress if job else None,
        "job_stage": job.stage if job else None,
    }


@router.get("/list")
async def list_imports(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ProcessRecordingSession)
        .where(
            ProcessRecordingSession.user_id == current_user.id,
            ProcessRecordingSession.source_type == "video",
            ProcessRecordingSession.deleted_at.is_(None),
        )
        .order_by(ProcessRecordingSession.created_at.desc())
    )
    sessions = result.scalars().all()

    return [
        {
            "session_id": s.id,
            "name": s.name,
            "video_filename": s.video_filename,
            "video_size_bytes": s.video_size_bytes,
            "processing_stage": s.processing_stage,
            "processing_progress": s.processing_progress,
            "processing_error": s.processing_error,
            "is_processed": s.is_processed,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in sessions
    ]
