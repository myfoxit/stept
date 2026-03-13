"""
Staleness Detection — Health score calculation and step reliability tracking.

Phase 1+2: Passive replay ingestion, scheduled/manual verification job queue,
health score formula with recency decay, step reliability baseline, alert creation.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ProcessRecordingSession,
    ProcessRecordingStep,
    WorkflowStepCheck,
    StepReliability,
    StalenessAlert,
)
from app.utils import gen_suffix

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Recency decay curve
# ---------------------------------------------------------------------------

def _recency_factor(last_verified_at: Optional[datetime]) -> float:
    """Return a multiplier (0.4–1.0) based on time since last verification."""
    if last_verified_at is None:
        return 0.5  # never verified

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    last = last_verified_at.replace(tzinfo=None) if last_verified_at.tzinfo else last_verified_at
    days = (now - last).total_seconds() / 86400

    if days < 7:
        return 1.0
    elif days < 14:
        return 0.95
    elif days < 30:
        return 0.9
    elif days < 60:
        return 0.75
    elif days < 90:
        return 0.6
    else:
        return 0.4


def _health_status(score: float, has_reliable: bool) -> str:
    """Derive status string from health score."""
    if not has_reliable:
        return "unknown"
    if score >= 0.8:
        return "healthy"
    elif score >= 0.6:
        return "aging"
    else:
        return "stale"


# ---------------------------------------------------------------------------
# Step reliability update
# ---------------------------------------------------------------------------

async def update_step_reliability(
    db: AsyncSession,
    workflow_id: str,
    step_number: int,
    found: bool,
    method: Optional[str],
) -> StepReliability:
    """
    Update (or create) the reliability record for a single step.
    Called after each health check event is stored.
    """
    result = await db.execute(
        select(StepReliability).where(
            StepReliability.workflow_id == workflow_id,
            StepReliability.step_number == step_number,
        )
    )
    rel = result.scalar_one_or_none()

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    if rel is None:
        rel = StepReliability(
            workflow_id=workflow_id,
            step_number=step_number,
            total_checks=0,
            found_count=0,
            recent_checks=0,
            recent_found=0,
        )
        db.add(rel)

    rel.total_checks += 1
    if found:
        rel.found_count += 1

    # Reliability ratio
    rel.reliability = rel.found_count / rel.total_checks if rel.total_checks > 0 else 0.0
    rel.is_reliable = rel.reliability >= 0.3 and rel.total_checks >= 5

    # Recent window: last 5 checks — we recalculate from DB for accuracy
    recent_q = await db.execute(
        select(WorkflowStepCheck)
        .where(
            WorkflowStepCheck.workflow_id == workflow_id,
            WorkflowStepCheck.step_number == step_number,
        )
        .order_by(WorkflowStepCheck.checked_at.desc())
        .limit(5)
    )
    recent_checks = recent_q.scalars().all()
    rel.recent_checks = len(recent_checks)
    rel.recent_found = sum(1 for c in recent_checks if c.element_found)

    rel.last_checked_at = now
    if found:
        rel.last_found_at = now
        rel.last_method = method

    rel.updated_at = now
    return rel


# ---------------------------------------------------------------------------
# Health score recalculation
# ---------------------------------------------------------------------------

async def recalculate_health_score(
    db: AsyncSession,
    workflow_id: str,
) -> tuple[float, str]:
    """
    Recalculate and persist the health score for a workflow.
    Returns (health_score, health_status).
    """
    # Fetch the workflow session
    wf = await db.get(ProcessRecordingSession, workflow_id)
    if wf is None:
        raise ValueError(f"Workflow {workflow_id} not found")

    # Get all step reliability records
    rel_result = await db.execute(
        select(StepReliability).where(StepReliability.workflow_id == workflow_id)
    )
    all_reliability = rel_result.scalars().all()

    # Get total step count from workflow
    step_count_result = await db.execute(
        select(func.count()).select_from(ProcessRecordingStep).where(
            ProcessRecordingStep.session_id == workflow_id,
        )
    )
    total_steps = step_count_result.scalar() or 0

    reliable_steps = [r for r in all_reliability if r.is_reliable]
    unreliable_steps = [r for r in all_reliability if not r.is_reliable]

    if not reliable_steps:
        step_health = 0.5  # unknown — not enough data
        has_reliable = False
    else:
        # Count recently found among reliable steps (recent_found > 0 in last window)
        recently_found = sum(1 for r in reliable_steps if r.recent_found > 0)
        step_health = recently_found / len(reliable_steps)
        has_reliable = True

    recency = _recency_factor(wf.last_verified_at)
    health_score = round(step_health * recency, 4)
    health_status = _health_status(health_score, has_reliable)

    # Count failed reliable steps (recent_found == 0 among reliable)
    failed_count = sum(1 for r in reliable_steps if r.recent_found == 0)

    # Coverage
    coverage = len(reliable_steps) / total_steps if total_steps > 0 else 0.0

    # Persist on the workflow
    wf.health_score = health_score
    wf.health_status = health_status
    wf.reliable_step_count = len(reliable_steps)
    wf.unreliable_step_count = len(unreliable_steps)
    wf.failed_step_count = failed_count
    wf.coverage = round(coverage, 4)

    return health_score, health_status


# ---------------------------------------------------------------------------
# Alert creation — call after recalculating health
# ---------------------------------------------------------------------------

async def maybe_create_alerts(
    db: AsyncSession,
    workflow_id: str,
    project_id: str,
) -> list[StalenessAlert]:
    """
    Check reliable steps that are now failing and create alerts if needed.
    Only creates an alert if one doesn't already exist (unresolved) for
    the same workflow + alert_type combination.
    """
    created_alerts: list[StalenessAlert] = []

    # Get workflow info
    wf = await db.get(ProcessRecordingSession, workflow_id)
    if wf is None:
        return created_alerts

    # Find reliable steps with recent failures
    rel_result = await db.execute(
        select(StepReliability).where(
            StepReliability.workflow_id == workflow_id,
            StepReliability.is_reliable == True,
        )
    )
    reliable_steps = rel_result.scalars().all()

    failing_steps = [
        r for r in reliable_steps
        if r.recent_checks >= 3 and r.recent_found == 0
    ]

    if not failing_steps:
        return created_alerts

    # Check for existing unresolved element_missing alert
    existing = await db.execute(
        select(StalenessAlert).where(
            StalenessAlert.workflow_id == workflow_id,
            StalenessAlert.alert_type == "element_missing",
            StalenessAlert.resolved == False,
            StalenessAlert.dismissed == False,
        )
    )
    if existing.scalar_one_or_none() is not None:
        return created_alerts  # already have an active alert

    step_numbers = [s.step_number for s in failing_steps]
    severity = "critical" if len(failing_steps) >= 3 else "warning"
    wf_name = wf.name or "Untitled Workflow"

    if len(failing_steps) == 1:
        title = f"Step {step_numbers[0]} in '{wf_name}' — element not found"
    else:
        title = f"{len(failing_steps)} steps in '{wf_name}' — elements not found"

    alert = StalenessAlert(
        id=gen_suffix(16),
        project_id=project_id,
        workflow_id=workflow_id,
        alert_type="element_missing",
        severity=severity,
        title=title,
        details={"step_numbers": step_numbers},
    )
    db.add(alert)
    created_alerts.append(alert)

    return created_alerts
