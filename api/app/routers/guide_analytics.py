"""Analytics endpoints for guide walkthroughs and widgets."""
from __future__ import annotations

import csv
import io
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, Query, Request, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, func as sa_func, and_, distinct
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.models import GuideAnalyticsEvent, User, ProjectRole, ProcessRecordingSession
from app.security import get_current_user, check_project_permission

router = APIRouter()


EVENT_TYPE_ALIASES = {
    "guide.started": "guide_started",
    "guide.completed": "guide_completed",
    "guide.abandoned": "guide_abandoned",
    "guide.step.viewed": "step_viewed",
    "guide.step.completed": "step_completed",
    "guide.step.skipped": "step_skipped",
}


def normalize_event_type(event_type: str) -> str:
    """Normalize analytics event names across widget/backend versions."""
    if not event_type:
        return event_type
    return EVENT_TYPE_ALIASES.get(event_type, event_type.replace(".", "_"))


class AnalyticsEventCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    type: str
    timestamp: datetime
    pageUrl: str
    guideId: Optional[str] = None
    stepIndex: Optional[int] = None
    widgetId: Optional[str] = None
    userExternalId: Optional[str] = Field(default=None, alias="userId")
    sessionId: Optional[str] = None
    data: Optional[Dict[str, Any]] = None


def _parse_period(period: str) -> datetime:
    """Convert period string to start datetime."""
    now = datetime.utcnow()
    if period == "7d":
        return now - timedelta(days=7)
    elif period == "30d":
        return now - timedelta(days=30)
    elif period == "90d":
        return now - timedelta(days=90)
    else:
        raise ValueError(f"Invalid period: {period}")


async def _get_guide_name_map(db: AsyncSession, guide_ids: List[str]) -> Dict[str, str]:
    if not guide_ids:
        return {}

    stmt = select(ProcessRecordingSession.id, ProcessRecordingSession.name).where(
        ProcessRecordingSession.id.in_(guide_ids)
    )
    rows = (await db.execute(stmt)).all()
    return {guide_id: name for guide_id, name in rows}


@router.post("/widget/events", status_code=204)
async def receive_analytics_events(
    events: List[AnalyticsEventCreate],
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_api_key: Optional[str] = Header(None, alias="X-Api-Key"),
):
    """Receive batched analytics events from widget/extension."""
    # TODO: Add authentication via X-Api-Key or session cookie
    # For now, allow unauthenticated events for faster widget performance

    guide_ids = sorted({event.guideId for event in events if event.guideId})
    project_lookup: Dict[str, Optional[str]] = {}
    if guide_ids:
        stmt = select(ProcessRecordingSession.id, ProcessRecordingSession.project_id).where(
            ProcessRecordingSession.id.in_(guide_ids)
        )
        project_lookup = {guide_id: project_id for guide_id, project_id in (await db.execute(stmt)).all()}

    event_records = []
    for event in events:
        event_record = GuideAnalyticsEvent(
            project_id=project_lookup.get(event.guideId),
            event_type=normalize_event_type(event.type),
            guide_id=event.guideId,
            step_index=event.stepIndex,
            widget_id=event.widgetId,
            user_external_id=event.userExternalId,
            session_id=event.sessionId,
            data=event.data,
            page_url=event.pageUrl,
            created_at=event.timestamp,
        )
        event_records.append(event_record)

    db.add_all(event_records)
    await db.commit()


@router.get("/analytics/overview")
async def get_analytics_overview(
    project_id: str = Query(...),
    period: str = Query("7d", pattern="^(7d|30d|90d)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get analytics overview cards."""
    await check_project_permission(db, current_user.id, project_id, ProjectRole.VIEWER)

    start_date = _parse_period(period)

    base_filter = and_(
        GuideAnalyticsEvent.project_id == project_id,
        GuideAnalyticsEvent.created_at >= start_date,
    )

    active_guides_stmt = select(sa_func.count(distinct(GuideAnalyticsEvent.guide_id))).where(
        base_filter,
        GuideAnalyticsEvent.guide_id.is_not(None),
    )
    active_guides = (await db.execute(active_guides_stmt)).scalar() or 0

    started_stmt = select(sa_func.count()).where(
        base_filter,
        GuideAnalyticsEvent.event_type == "guide_started",
    )
    started_count = (await db.execute(started_stmt)).scalar() or 0

    completed_stmt = select(sa_func.count()).where(
        base_filter,
        GuideAnalyticsEvent.event_type == "guide_completed",
    )
    completed_count = (await db.execute(completed_stmt)).scalar() or 0

    completion_rate = (completed_count / started_count * 100) if started_count > 0 else 0.0

    users_guided_stmt = select(sa_func.count(distinct(GuideAnalyticsEvent.user_external_id))).where(
        base_filter,
        GuideAnalyticsEvent.user_external_id.is_not(None),
    )
    users_guided = (await db.execute(users_guided_stmt)).scalar() or 0

    self_healing_stmt = select(sa_func.count()).where(
        base_filter,
        GuideAnalyticsEvent.event_type == "self_healing_triggered",
    )
    self_healing_count = (await db.execute(self_healing_stmt)).scalar() or 0

    self_healing_success_stmt = select(sa_func.count()).where(
        base_filter,
        GuideAnalyticsEvent.event_type == "self_healing_success",
    )
    self_healing_success_count = (await db.execute(self_healing_success_stmt)).scalar() or 0

    self_healing_success_rate = (
        (self_healing_success_count / self_healing_count * 100)
        if self_healing_count > 0 else 0.0
    )

    return {
        "active_guides": active_guides,
        "guide_starts": started_count,
        "guide_completions": completed_count,
        "completion_rate": round(completion_rate, 1),
        "users_guided": users_guided,
        "self_healing_count": self_healing_count,
        "self_healing_success_rate": round(self_healing_success_rate, 1),
        "period": period,
    }


@router.get("/analytics/guides")
async def get_guides_analytics(
    project_id: str = Query(...),
    period: str = Query("7d", pattern="^(7d|30d|90d)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get per-guide performance table."""
    await check_project_permission(db, current_user.id, project_id, ProjectRole.VIEWER)

    start_date = _parse_period(period)

    stmt = select(
        GuideAnalyticsEvent.guide_id,
        GuideAnalyticsEvent.event_type,
        GuideAnalyticsEvent.session_id,
        GuideAnalyticsEvent.created_at,
    ).where(
        and_(
            GuideAnalyticsEvent.project_id == project_id,
            GuideAnalyticsEvent.created_at >= start_date,
            GuideAnalyticsEvent.guide_id.is_not(None),
            GuideAnalyticsEvent.event_type.in_([
                "guide_started",
                "guide_completed",
                "step_viewed",
                "step_completed",
                "guide_abandoned",
            ]),
        )
    ).order_by(GuideAnalyticsEvent.guide_id, GuideAnalyticsEvent.created_at.asc())

    rows = (await db.execute(stmt)).all()
    guide_ids = sorted({row.guide_id for row in rows if row.guide_id})
    guide_names = await _get_guide_name_map(db, guide_ids)

    guide_stats: Dict[str, Dict[str, Any]] = {}
    start_times: Dict[tuple[str, str], datetime] = {}
    duration_buckets: Dict[str, List[int]] = defaultdict(list)

    for guide_id in guide_ids:
        guide_stats[guide_id] = {
            "guide_id": guide_id,
            "name": guide_names.get(guide_id, "Unknown Guide"),
            "views": 0,
            "completions": 0,
            "abandonments": 0,
            "step_views": 0,
            "step_completions": 0,
            "avg_time_ms": 0,
        }

    for row in rows:
        stats = guide_stats[row.guide_id]
        if row.event_type == "guide_started":
            stats["views"] += 1
            if row.session_id:
                start_times[(row.guide_id, row.session_id)] = row.created_at
        elif row.event_type == "guide_completed":
            stats["completions"] += 1
            if row.session_id:
                started_at = start_times.get((row.guide_id, row.session_id))
                if started_at and row.created_at >= started_at:
                    duration_buckets[row.guide_id].append(int((row.created_at - started_at).total_seconds() * 1000))
        elif row.event_type == "guide_abandoned":
            stats["abandonments"] += 1
        elif row.event_type == "step_viewed":
            stats["step_views"] += 1
        elif row.event_type == "step_completed":
            stats["step_completions"] += 1

    guides = []
    for guide_id, stats in guide_stats.items():
        views = stats["views"]
        completions = stats["completions"]
        step_views = stats["step_views"]
        step_completions = stats["step_completions"]
        completion_rate = (completions / views * 100) if views > 0 else 0.0
        step_completion_rate = (step_completions / step_views * 100) if step_views > 0 else 0.0
        durations = duration_buckets.get(guide_id, [])
        avg_time_ms = int(sum(durations) / len(durations)) if durations else 0

        guides.append({
            **stats,
            "completion_rate": round(completion_rate, 1),
            "step_completion_rate": round(step_completion_rate, 1),
            "avg_time_ms": avg_time_ms,
        })

    guides.sort(key=lambda guide: (-guide["views"], guide["name"].lower()))
    return {"guides": guides}


@router.get("/analytics/guide/{guide_id}/funnel")
async def get_guide_funnel(
    guide_id: str,
    project_id: str = Query(...),
    period: str = Query("7d", pattern="^(7d|30d|90d)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get step funnel for a specific guide."""
    await check_project_permission(db, current_user.id, project_id, ProjectRole.VIEWER)

    start_date = _parse_period(period)

    steps_stmt = select(distinct(GuideAnalyticsEvent.step_index)).where(
        and_(
            GuideAnalyticsEvent.project_id == project_id,
            GuideAnalyticsEvent.created_at >= start_date,
            GuideAnalyticsEvent.guide_id == guide_id,
            GuideAnalyticsEvent.event_type == "step_viewed",
            GuideAnalyticsEvent.step_index.is_not(None),
        )
    ).order_by(GuideAnalyticsEvent.step_index)
    step_indices = (await db.execute(steps_stmt)).scalars().all()

    steps = []
    for step_index in step_indices:
        views_stmt = select(sa_func.count(distinct(GuideAnalyticsEvent.session_id))).where(
            and_(
                GuideAnalyticsEvent.project_id == project_id,
                GuideAnalyticsEvent.created_at >= start_date,
                GuideAnalyticsEvent.guide_id == guide_id,
                GuideAnalyticsEvent.step_index == step_index,
                GuideAnalyticsEvent.event_type == "step_viewed",
            )
        )
        views = (await db.execute(views_stmt)).scalar() or 0

        completions_stmt = select(sa_func.count(distinct(GuideAnalyticsEvent.session_id))).where(
            and_(
                GuideAnalyticsEvent.project_id == project_id,
                GuideAnalyticsEvent.created_at >= start_date,
                GuideAnalyticsEvent.guide_id == guide_id,
                GuideAnalyticsEvent.step_index == step_index,
                GuideAnalyticsEvent.event_type == "step_completed",
            )
        )
        completions = (await db.execute(completions_stmt)).scalar() or 0

        rate = (completions / views * 100) if views > 0 else 0.0

        steps.append({
            "step_index": step_index,
            "views": views,
            "completions": completions,
            "rate": round(rate, 1),
        })

    return {
        "guide_id": guide_id,
        "steps": steps,
    }


@router.get("/analytics/guide/{guide_id}/steps")
async def get_guide_step_metrics(
    guide_id: str,
    project_id: str = Query(...),
    period: str = Query("7d", pattern="^(7d|30d|90d)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get per-step metrics for a specific guide."""
    await check_project_permission(db, current_user.id, project_id, ProjectRole.VIEWER)

    return await get_guide_funnel(guide_id, project_id, period, db, current_user)


@router.post("/analytics/export")
async def export_analytics(
    project_id: str = Query(...),
    period: str = Query("7d", pattern="^(7d|30d|90d)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export analytics data as CSV."""
    await check_project_permission(db, current_user.id, project_id, ProjectRole.ADMIN)

    start_date = _parse_period(period)

    stmt = select(GuideAnalyticsEvent).where(
        and_(
            GuideAnalyticsEvent.project_id == project_id,
            GuideAnalyticsEvent.created_at >= start_date,
        )
    ).order_by(GuideAnalyticsEvent.created_at.desc())

    events = (await db.execute(stmt)).scalars().all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "id", "event_type", "guide_id", "step_index", "widget_id",
        "user_external_id", "session_id", "page_url", "data", "created_at",
    ])

    for event in events:
        writer.writerow([
            event.id,
            event.event_type,
            event.guide_id or "",
            event.step_index or "",
            event.widget_id or "",
            event.user_external_id or "",
            event.session_id or "",
            event.page_url or "",
            str(event.data or ""),
            event.created_at.isoformat() if event.created_at else "",
        ])

    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=analytics_{period}.csv"},
    )
