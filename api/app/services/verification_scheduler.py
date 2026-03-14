"""
Verification Scheduler — Periodic background task that creates verification
jobs based on verification_configs schedule settings.

Runs every 5 minutes, checks for configs where enabled=True and next_run_at <= now,
creates verification jobs, and calculates the next run time.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models import (
    ProcessRecordingSession,
    VerificationConfig,
    VerificationJob,
)
from app.utils import gen_suffix

logger = logging.getLogger(__name__)

# Check interval (seconds)
CHECK_INTERVAL = 300  # 5 minutes

_running = False


def _calculate_next_run(
    schedule: str,
    schedule_day: int,
    schedule_hour: int,
    from_time: datetime | None = None,
) -> datetime:
    """
    Calculate the next run time based on schedule settings.
    
    Args:
        schedule: 'daily', 'weekly', 'monthly', 'manual'
        schedule_day: 0=Monday .. 6=Sunday (for weekly), 1-28 (for monthly)
        schedule_hour: 0-23 hour of day (UTC)
        from_time: base time to calculate from (defaults to now)
    """
    now = from_time or datetime.now(timezone.utc).replace(tzinfo=None)
    
    if schedule == "manual":
        # No automatic scheduling — return far future
        return now + timedelta(days=36500)

    if schedule == "daily":
        # Next occurrence at schedule_hour
        candidate = now.replace(hour=schedule_hour, minute=0, second=0, microsecond=0)
        if candidate <= now:
            candidate += timedelta(days=1)
        return candidate

    elif schedule == "weekly":
        # Next occurrence on schedule_day at schedule_hour
        # schedule_day: 0=Monday, 6=Sunday
        days_ahead = schedule_day - now.weekday()
        if days_ahead < 0:
            days_ahead += 7
        candidate = now + timedelta(days=days_ahead)
        candidate = candidate.replace(hour=schedule_hour, minute=0, second=0, microsecond=0)
        if candidate <= now:
            candidate += timedelta(weeks=1)
        return candidate

    elif schedule == "monthly":
        # Next occurrence on schedule_day (1-28) at schedule_hour
        day = min(schedule_day or 1, 28)
        try:
            candidate = now.replace(day=day, hour=schedule_hour, minute=0, second=0, microsecond=0)
        except ValueError:
            candidate = now.replace(day=28, hour=schedule_hour, minute=0, second=0, microsecond=0)
        if candidate <= now:
            # Move to next month
            if now.month == 12:
                candidate = candidate.replace(year=now.year + 1, month=1)
            else:
                candidate = candidate.replace(month=now.month + 1)
        return candidate

    else:
        # Fallback: weekly
        return _calculate_next_run("weekly", schedule_day, schedule_hour, from_time)


async def _check_and_create_jobs() -> int:
    """
    Check for verification configs that need to run and create jobs.
    Returns number of jobs created.
    """
    jobs_created = 0
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    async with AsyncSessionLocal() as db:
        # Find configs that are enabled and due to run
        result = await db.execute(
            select(VerificationConfig).where(
                VerificationConfig.enabled == True,
                VerificationConfig.next_run_at <= now,
            )
        )
        configs = result.scalars().all()

        for vc in configs:
            try:
                # Determine workflow IDs based on scope
                if vc.schedule_scope == "stale":
                    wf_result = await db.execute(
                        select(ProcessRecordingSession.id).where(
                            ProcessRecordingSession.project_id == vc.project_id,
                            ProcessRecordingSession.deleted_at.is_(None),
                            ProcessRecordingSession.health_status.in_(["stale", "aging"]),
                        )
                    )
                else:
                    # scope = "all" or default
                    wf_result = await db.execute(
                        select(ProcessRecordingSession.id).where(
                            ProcessRecordingSession.project_id == vc.project_id,
                            ProcessRecordingSession.deleted_at.is_(None),
                        )
                    )

                workflow_ids = [row[0] for row in wf_result.all()]

                if not workflow_ids:
                    # No workflows to verify — just update next_run
                    vc.next_run_at = _calculate_next_run(
                        vc.schedule or "weekly",
                        vc.schedule_day or 0,
                        vc.schedule_hour or 3,
                    )
                    continue

                # Check if there's already a queued/running job for this project
                existing = await db.execute(
                    select(VerificationJob).where(
                        VerificationJob.project_id == vc.project_id,
                        VerificationJob.status.in_(["queued", "running"]),
                    )
                )
                if existing.scalar_one_or_none():
                    # Don't create duplicate jobs
                    continue

                # Create the verification job
                job = VerificationJob(
                    id=gen_suffix(16),
                    project_id=vc.project_id,
                    workflow_ids=workflow_ids,
                    trigger="scheduled",
                    triggered_by=None,
                    status="queued",
                    progress={"total": len(workflow_ids), "completed": 0},
                )
                db.add(job)

                # Calculate next run time
                vc.next_run_at = _calculate_next_run(
                    vc.schedule or "weekly",
                    vc.schedule_day or 0,
                    vc.schedule_hour or 3,
                )

                jobs_created += 1
                logger.info(
                    "Created scheduled verification job %s for project %s (%d workflows)",
                    job.id, vc.project_id, len(workflow_ids),
                )

            except Exception as e:
                logger.error(
                    "Error creating job for config %s: %s", vc.id, e
                )

        await db.commit()

    return jobs_created


async def verification_scheduler_loop() -> None:
    """
    Background scheduler loop. Runs every 5 minutes to check for
    verification configs that need new jobs created.
    """
    global _running
    _running = True
    logger.info("Verification scheduler started (interval: %ds)", CHECK_INTERVAL)

    # Initialize next_run_at for configs that don't have it set
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(VerificationConfig).where(
                    VerificationConfig.enabled == True,
                    VerificationConfig.next_run_at.is_(None),
                )
            )
            configs = result.scalars().all()
            for vc in configs:
                vc.next_run_at = _calculate_next_run(
                    vc.schedule or "weekly",
                    vc.schedule_day or 0,
                    vc.schedule_hour or 3,
                )
            if configs:
                await db.commit()
                logger.info("Initialized next_run_at for %d configs", len(configs))
    except Exception as e:
        logger.warning("Failed to initialize scheduler state: %s", e)

    while _running:
        try:
            jobs = await _check_and_create_jobs()
            if jobs > 0:
                logger.info("Scheduler created %d verification job(s)", jobs)
        except asyncio.CancelledError:
            logger.info("Verification scheduler cancelled")
            break
        except Exception as e:
            logger.error("Scheduler error: %s", e)

        await asyncio.sleep(CHECK_INTERVAL)

    _running = False
    logger.info("Verification scheduler stopped")


def stop_scheduler() -> None:
    """Signal the scheduler loop to stop."""
    global _running
    _running = False
