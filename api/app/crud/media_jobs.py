from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import MediaProcessingJob

TERMINAL_STATES = {"succeeded", "failed"}
ALLOWED_TRANSITIONS = {
    "queued": {"running", "failed"},
    "running": {"succeeded", "failed"},
    "failed": {"queued"},
    "succeeded": set(),
}


async def get_job_for_session(db: AsyncSession, session_id: str, job_type: str = "video_import") -> Optional[MediaProcessingJob]:
    result = await db.execute(
        select(MediaProcessingJob).where(
            MediaProcessingJob.session_id == session_id,
            MediaProcessingJob.job_type == job_type,
        )
    )
    return result.scalar_one_or_none()


async def enqueue_or_get_job(db: AsyncSession, session_id: str, job_type: str = "video_import") -> MediaProcessingJob:
    existing = await get_job_for_session(db, session_id, job_type)
    if existing and existing.status in {"queued", "running", "succeeded"}:
        return existing

    if existing and existing.status == "failed":
        existing.status = "queued"
        existing.progress = 0
        existing.stage = "queued"
        existing.error = None
        existing.finished_at = None
        existing.updated_at = datetime.utcnow()
        return existing

    job = MediaProcessingJob(
        session_id=session_id,
        job_type=job_type,
        status="queued",
        stage="queued",
        progress=0,
    )
    db.add(job)
    await db.flush()
    return job


async def transition_job(
    db: AsyncSession,
    job_id: str,
    to_state: str,
    *,
    progress: Optional[int] = None,
    stage: Optional[str] = None,
    error: Optional[str] = None,
    task_id: Optional[str] = None,
    increment_attempt: bool = False,
) -> MediaProcessingJob:
    job = await db.get(MediaProcessingJob, job_id)
    if not job:
        raise ValueError("Job not found")

    current = job.status
    if to_state != current and to_state not in ALLOWED_TRANSITIONS.get(current, set()):
        raise ValueError(f"Invalid transition: {current} -> {to_state}")

    if increment_attempt:
        job.attempts += 1

    job.status = to_state
    if progress is not None:
        job.progress = max(0, min(100, progress))
    if stage is not None:
        job.stage = stage
    if error is not None:
        job.error = error[:500]
    if task_id is not None:
        job.task_id = task_id

    if to_state == "running" and not job.started_at:
        job.started_at = datetime.utcnow()
    if to_state in TERMINAL_STATES:
        job.finished_at = datetime.utcnow()

    await db.flush()
    return job
