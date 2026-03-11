from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime

from app.models import MediaProcessingJob
from app.utils import gen_suffix

# Allowed state transitions
_TRANSITIONS = {
    "queued": {"running", "failed"},
    "running": {"succeeded", "failed"},
    "failed": {"queued"},  # retry resets to queued
}


async def get_job_for_session(
    db: AsyncSession, session_id: str, job_type: str = "video_import"
) -> MediaProcessingJob | None:
    result = await db.execute(
        select(MediaProcessingJob).where(
            MediaProcessingJob.session_id == session_id,
            MediaProcessingJob.job_type == job_type,
        )
    )
    return result.scalar_one_or_none()


async def enqueue_or_get_job(
    db: AsyncSession, session_id: str, job_type: str = "video_import"
) -> MediaProcessingJob:
    job = await get_job_for_session(db, session_id, job_type)
    if job is not None:
        if job.status in ("queued", "running", "succeeded"):
            return job
        # failed — reset for retry
        job.status = "queued"
        job.progress = 0
        job.stage = None
        job.error = None
        job.task_id = None
        await db.flush()
        return job

    job = MediaProcessingJob(
        id=gen_suffix(16),
        session_id=session_id,
        job_type=job_type,
    )
    db.add(job)
    await db.flush()
    return job


async def transition_job(
    db: AsyncSession,
    job_id: str,
    to_state: str,
    progress: int | None = None,
    stage: str | None = None,
    error: str | None = None,
    task_id: str | None = None,
    increment_attempt: bool = False,
) -> MediaProcessingJob:
    result = await db.execute(
        select(MediaProcessingJob).where(MediaProcessingJob.id == job_id)
    )
    job = result.scalar_one()

    allowed = _TRANSITIONS.get(job.status, set())
    if to_state not in allowed:
        raise ValueError(f"Cannot transition from {job.status} to {to_state}")

    job.status = to_state
    if progress is not None:
        job.progress = progress
    if stage is not None:
        job.stage = stage
    if error is not None:
        job.error = error
    if task_id is not None:
        job.task_id = task_id
    if increment_attempt:
        job.attempts += 1

    now = datetime.utcnow()
    if to_state == "running":
        job.started_at = now
    elif to_state in ("succeeded", "failed"):
        job.finished_at = now

    await db.flush()
    return job
