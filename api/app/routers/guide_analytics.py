"""Analytics endpoints for guide walkthroughs and widgets."""
from __future__ import annotations

import csv
import io
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, func as sa_func, and_, distinct
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.models import GuideAnalyticsEvent, User, ProjectRole, ProcessRecordingSession
from app.security import get_current_user, check_project_permission

router = APIRouter()


class AnalyticsEventCreate(BaseModel):
    type: str
    timestamp: datetime
    pageUrl: str
    guideId: Optional[str] = None
    stepIndex: Optional[int] = None
    widgetId: Optional[str] = None
    userExternalId: Optional[str] = None
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
    
    # Bulk insert events
    event_records = []
    for event in events:
        # Extract project_id from guideId (assumes guideId is workflow session_id)
        project_id = None
        if event.guideId:
            # Look up the workflow to get project_id
            stmt = select(ProcessRecordingSession.project_id).where(
                ProcessRecordingSession.id == event.guideId
            )
            result = await db.execute(stmt)
            project_id = result.scalar_one_or_none()
        
        event_record = GuideAnalyticsEvent(
            project_id=project_id,
            event_type=event.type,
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
    
    # Base filter
    base_filter = and_(
        GuideAnalyticsEvent.project_id == project_id,
        GuideAnalyticsEvent.created_at >= start_date
    )
    
    # Active guides (distinct guide_ids with events)
    active_guides_stmt = select(sa_func.count(distinct(GuideAnalyticsEvent.guide_id))).where(
        base_filter,
        GuideAnalyticsEvent.guide_id.is_not(None)
    )
    active_guides = (await db.execute(active_guides_stmt)).scalar() or 0
    
    # Completion rate (guide_completed events / guide_started events)
    started_stmt = select(sa_func.count()).where(
        base_filter,
        GuideAnalyticsEvent.event_type == "guide_started"
    )
    started_count = (await db.execute(started_stmt)).scalar() or 0
    
    completed_stmt = select(sa_func.count()).where(
        base_filter,
        GuideAnalyticsEvent.event_type == "guide_completed"
    )
    completed_count = (await db.execute(completed_stmt)).scalar() or 0
    
    completion_rate = (completed_count / started_count * 100) if started_count > 0 else 0.0
    
    # Users guided (distinct user_external_id)
    users_guided_stmt = select(sa_func.count(distinct(GuideAnalyticsEvent.user_external_id))).where(
        base_filter,
        GuideAnalyticsEvent.user_external_id.is_not(None)
    )
    users_guided = (await db.execute(users_guided_stmt)).scalar() or 0
    
    # Self-healing events
    self_healing_stmt = select(sa_func.count()).where(
        base_filter,
        GuideAnalyticsEvent.event_type == "self_healing_triggered"
    )
    self_healing_count = (await db.execute(self_healing_stmt)).scalar() or 0
    
    self_healing_success_stmt = select(sa_func.count()).where(
        base_filter,
        GuideAnalyticsEvent.event_type == "self_healing_success"
    )
    self_healing_success_count = (await db.execute(self_healing_success_stmt)).scalar() or 0
    
    self_healing_success_rate = (
        (self_healing_success_count / self_healing_count * 100) 
        if self_healing_count > 0 else 0.0
    )
    
    return {
        "active_guides": active_guides,
        "completion_rate": round(completion_rate, 1),
        "users_guided": users_guided,
        "self_healing_count": self_healing_count,
        "self_healing_success_rate": round(self_healing_success_rate, 1),
        "period": period
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
    
    # Get all unique guide_ids with events in this period
    guides_stmt = select(distinct(GuideAnalyticsEvent.guide_id)).where(
        and_(
            GuideAnalyticsEvent.project_id == project_id,
            GuideAnalyticsEvent.created_at >= start_date,
            GuideAnalyticsEvent.guide_id.is_not(None)
        )
    )
    guide_ids = (await db.execute(guides_stmt)).scalars().all()
    
    guides = []
    for guide_id in guide_ids:
        # Get guide name from ProcessRecordingSession
        guide_name_stmt = select(ProcessRecordingSession.name).where(
            ProcessRecordingSession.id == guide_id
        )
        guide_name = (await db.execute(guide_name_stmt)).scalar_one_or_none() or "Unknown Guide"
        
        # Views (guide_started events)
        views_stmt = select(sa_func.count()).where(
            and_(
                GuideAnalyticsEvent.project_id == project_id,
                GuideAnalyticsEvent.created_at >= start_date,
                GuideAnalyticsEvent.guide_id == guide_id,
                GuideAnalyticsEvent.event_type == "guide_started"
            )
        )
        views = (await db.execute(views_stmt)).scalar() or 0
        
        # Completions (guide_completed events)
        completions_stmt = select(sa_func.count()).where(
            and_(
                GuideAnalyticsEvent.project_id == project_id,
                GuideAnalyticsEvent.created_at >= start_date,
                GuideAnalyticsEvent.guide_id == guide_id,
                GuideAnalyticsEvent.event_type == "guide_completed"
            )
        )
        completions = (await db.execute(completions_stmt)).scalar() or 0
        
        completion_rate = (completions / views * 100) if views > 0 else 0.0
        
        # Average time (assuming we track guide_duration in data field of completed events)
        avg_time_stmt = select(sa_func.avg(
            sa_func.cast(GuideAnalyticsEvent.data['duration'], sa_func.INTEGER)
        )).where(
            and_(
                GuideAnalyticsEvent.project_id == project_id,
                GuideAnalyticsEvent.created_at >= start_date,
                GuideAnalyticsEvent.guide_id == guide_id,
                GuideAnalyticsEvent.event_type == "guide_completed",
                GuideAnalyticsEvent.data.has_key('duration')
            )
        )
        avg_time_ms = (await db.execute(avg_time_stmt)).scalar() or 0
        
        # Drop-off step (find step with highest drop-off rate)
        # This would require more complex analysis - simplified for now
        drop_off_step = 0  # TODO: implement step-level drop-off analysis
        
        guides.append({
            "guide_id": guide_id,
            "name": guide_name,
            "views": views,
            "completions": completions,
            "completion_rate": round(completion_rate, 1),
            "avg_time_ms": int(avg_time_ms or 0),
            "drop_off_step": drop_off_step
        })
    
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
    
    # Get all step indices for this guide
    steps_stmt = select(distinct(GuideAnalyticsEvent.step_index)).where(
        and_(
            GuideAnalyticsEvent.project_id == project_id,
            GuideAnalyticsEvent.created_at >= start_date,
            GuideAnalyticsEvent.guide_id == guide_id,
            GuideAnalyticsEvent.event_type == "step_viewed",
            GuideAnalyticsEvent.step_index.is_not(None)
        )
    ).order_by(GuideAnalyticsEvent.step_index)
    step_indices = (await db.execute(steps_stmt)).scalars().all()
    
    steps = []
    for step_index in step_indices:
        # Views for this step
        views_stmt = select(sa_func.count(distinct(GuideAnalyticsEvent.session_id))).where(
            and_(
                GuideAnalyticsEvent.project_id == project_id,
                GuideAnalyticsEvent.created_at >= start_date,
                GuideAnalyticsEvent.guide_id == guide_id,
                GuideAnalyticsEvent.step_index == step_index,
                GuideAnalyticsEvent.event_type == "step_viewed"
            )
        )
        views = (await db.execute(views_stmt)).scalar() or 0
        
        # Completions for this step (users who made it past this step)
        completions_stmt = select(sa_func.count(distinct(GuideAnalyticsEvent.session_id))).where(
            and_(
                GuideAnalyticsEvent.project_id == project_id,
                GuideAnalyticsEvent.created_at >= start_date,
                GuideAnalyticsEvent.guide_id == guide_id,
                GuideAnalyticsEvent.step_index == step_index,
                GuideAnalyticsEvent.event_type == "step_completed"
            )
        )
        completions = (await db.execute(completions_stmt)).scalar() or 0
        
        rate = (completions / views * 100) if views > 0 else 0.0
        
        steps.append({
            "step_index": step_index,
            "views": views,
            "completions": completions,
            "rate": round(rate, 1)
        })
    
    return {
        "guide_id": guide_id,
        "steps": steps
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
    
    # For now, return the same data as funnel - could be enhanced with additional metrics
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
    
    # Get all events for the period
    stmt = select(GuideAnalyticsEvent).where(
        and_(
            GuideAnalyticsEvent.project_id == project_id,
            GuideAnalyticsEvent.created_at >= start_date
        )
    ).order_by(GuideAnalyticsEvent.created_at.desc())
    
    events = (await db.execute(stmt)).scalars().all()
    
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "id", "event_type", "guide_id", "step_index", "widget_id",
        "user_external_id", "session_id", "page_url", "data", "created_at"
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
            event.created_at.isoformat() if event.created_at else ""
        ])
    
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=analytics_{period}.csv"}
    )