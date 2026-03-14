"""
Staleness Detection API — health check ingestion, workflow/project health,
verification config, manual verification runs, alerts.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.models import (
    ProcessRecordingSession,
    ProcessRecordingStep,
    WorkflowStepCheck,
    StepReliability,
    VerificationConfig,
    VerificationJob,
    StalenessAlert,
    User,
)
from app.security import get_current_user
from app.services.staleness import (
    update_step_reliability,
    recalculate_health_score,
    maybe_create_alerts,
)
from app.utils import gen_suffix

logger = logging.getLogger(__name__)
router = APIRouter(tags=["staleness"])


# ── Pydantic Schemas ─────────────────────────────────────────────────────────

class StepCheckIn(BaseModel):
    stepNumber: int
    elementFound: bool
    finderMethod: Optional[str] = None
    finderConfidence: float = 0.0
    expectedUrl: Optional[str] = None
    actualUrl: Optional[str] = None
    urlMatched: Optional[bool] = None
    timestamp: Optional[int] = None  # epoch ms from extension


class HealthCheckRequest(BaseModel):
    steps: List[StepCheckIn]
    source: str = "guide_replay"


class HealthCheckResponse(BaseModel):
    health_score: float
    health_status: str


class StepHealthOut(BaseModel):
    step_number: int
    status: str
    reliability: float
    is_reliable: bool = True
    last_method: Optional[str] = None
    last_checked: Optional[str] = None
    llm_explanation: Optional[str] = None
    failing_since: Optional[str] = None


class AlertOut(BaseModel):
    id: str
    type: str
    severity: str
    title: str
    details: Optional[dict] = None
    created_at: str


class WorkflowHealthResponse(BaseModel):
    health_score: Optional[float] = None
    health_status: str = "unknown"
    coverage: Optional[float] = None
    last_verified_at: Optional[str] = None
    last_verified_source: Optional[str] = None
    steps: List[StepHealthOut] = []
    alerts: List[AlertOut] = []


class ProjectHealthResponse(BaseModel):
    total_workflows: int = 0
    healthy: int = 0
    aging: int = 0
    stale: int = 0
    unknown: int = 0
    total_steps: int = 0
    coverage: float = 0.0
    stale_workflows: list = []
    aging_workflows: list = []
    last_run: Optional[dict] = None
    next_run: Optional[str] = None


class VerificationConfigOut(BaseModel):
    enabled: bool = False
    login_url: Optional[str] = None
    has_credentials: bool = False
    email_selector: Optional[str] = None
    password_selector: Optional[str] = None
    submit_selector: Optional[str] = None
    post_login_wait_ms: int = 2000
    schedule: str = "weekly"
    schedule_day: int = 0
    schedule_hour: int = 3
    schedule_scope: str = "all"
    llm_enabled: bool = False
    notify_email: bool = True
    notify_in_app: bool = True
    last_run_at: Optional[str] = None
    last_run_status: Optional[str] = None
    next_run_at: Optional[str] = None


class VerificationConfigUpdate(BaseModel):
    enabled: Optional[bool] = None
    login_url: Optional[str] = None
    email: Optional[str] = None  # plaintext, encrypted on save
    password: Optional[str] = None  # plaintext, encrypted on save
    email_selector: Optional[str] = None
    password_selector: Optional[str] = None
    submit_selector: Optional[str] = None
    post_login_wait_ms: Optional[int] = None
    schedule: Optional[str] = None
    schedule_day: Optional[int] = None
    schedule_hour: Optional[int] = None
    schedule_scope: Optional[str] = None
    llm_enabled: Optional[bool] = None
    notify_email: Optional[bool] = None
    notify_in_app: Optional[bool] = None


class RunVerificationRequest(BaseModel):
    workflow_ids: Optional[List[str]] = None
    project_id: Optional[str] = None
    filter: Optional[str] = None  # all | stale | aging


class RunVerificationResponse(BaseModel):
    job_id: str
    workflows_queued: int
    estimated_seconds: int


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    progress: Optional[dict] = None
    results: Optional[dict] = None
    error: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    created_at: str


class AlertActionResponse(BaseModel):
    id: str
    resolved: bool
    dismissed: bool


# ── Helpers ───────────────────────────────────────────────────────────────────

def _dt_str(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    return dt.isoformat() + "Z" if dt.tzinfo is None else dt.isoformat()


async def _get_workflow_or_404(db: AsyncSession, workflow_id: str) -> ProcessRecordingSession:
    wf = await db.get(ProcessRecordingSession, workflow_id)
    if wf is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return wf


async def _verify_project_access(db: AsyncSession, project_id: str, user: User):
    """Verify user has access to the project. Raises 404 if not found or no access."""
    from app.models import Project, project_members
    project = await db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    # Check ownership or membership
    if project.owner_id == user.id:
        return project
    member_q = await db.execute(
        select(project_members).where(
            project_members.c.user_id == user.id,
            project_members.c.project_id == project_id,
        )
    )
    if member_q.first() is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


# ── 1. Health Check Ingestion ─────────────────────────────────────────────────

@router.post(
    "/workflows/{workflow_id}/health-check",
    response_model=HealthCheckResponse,
)
async def ingest_health_check(
    workflow_id: str,
    body: HealthCheckRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Ingest per-step health check results (from extension guide replay or other sources)."""
    wf = await _get_workflow_or_404(db, workflow_id)

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    for step_data in body.steps:
        step_status = "passed" if step_data.elementFound else "failed"

        check = WorkflowStepCheck(
            id=gen_suffix(16),
            workflow_id=workflow_id,
            step_number=step_data.stepNumber,
            check_source=body.source,
            element_found=step_data.elementFound,
            finder_method=step_data.finderMethod,
            finder_confidence=step_data.finderConfidence,
            expected_url=step_data.expectedUrl,
            actual_url=step_data.actualUrl,
            url_matched=step_data.urlMatched,
            status=step_status,
            checked_by=user.id,
            checked_at=now,
        )
        db.add(check)

        # Update step reliability
        await update_step_reliability(
            db, workflow_id, step_data.stepNumber,
            found=step_data.elementFound,
            method=step_data.finderMethod,
        )

    # Update last_verified
    wf.last_verified_at = now
    wf.last_verified_source = body.source

    # Recalculate health score
    health_score, health_status = await recalculate_health_score(db, workflow_id)

    # Maybe create alerts
    if wf.project_id:
        await maybe_create_alerts(db, workflow_id, wf.project_id)

    await db.commit()

    return HealthCheckResponse(health_score=health_score, health_status=health_status)


# ── 2. Per-Workflow Health ────────────────────────────────────────────────────

@router.get(
    "/workflows/{workflow_id}/health",
    response_model=WorkflowHealthResponse,
)
async def get_workflow_health(
    workflow_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get the health score, step details, and alerts for a workflow."""
    wf = await _get_workflow_or_404(db, workflow_id)

    # Step reliability
    rel_result = await db.execute(
        select(StepReliability)
        .where(StepReliability.workflow_id == workflow_id)
        .order_by(StepReliability.step_number)
    )
    reliabilities = rel_result.scalars().all()

    steps_out: List[StepHealthOut] = []
    for r in reliabilities:
        if not r.is_reliable:
            step_status = "unreliable"
        elif r.recent_found == 0 and r.recent_checks >= 3:
            step_status = "failed"
        elif r.recent_found > 0:
            step_status = "passed"
        else:
            step_status = "unknown"

        # Find failing_since: earliest consecutive failure
        failing_since = None
        if step_status == "failed":
            fail_q = await db.execute(
                select(WorkflowStepCheck)
                .where(
                    WorkflowStepCheck.workflow_id == workflow_id,
                    WorkflowStepCheck.step_number == r.step_number,
                    WorkflowStepCheck.element_found == False,
                )
                .order_by(WorkflowStepCheck.checked_at.asc())
                .limit(1)
            )
            first_fail = fail_q.scalar_one_or_none()
            if first_fail:
                failing_since = _dt_str(first_fail.checked_at)

        # Get latest LLM explanation if any
        llm_q = await db.execute(
            select(WorkflowStepCheck)
            .where(
                WorkflowStepCheck.workflow_id == workflow_id,
                WorkflowStepCheck.step_number == r.step_number,
                WorkflowStepCheck.llm_explanation.isnot(None),
            )
            .order_by(WorkflowStepCheck.checked_at.desc())
            .limit(1)
        )
        llm_check = llm_q.scalar_one_or_none()

        steps_out.append(StepHealthOut(
            step_number=r.step_number,
            status=step_status,
            reliability=round(r.reliability, 4),
            is_reliable=r.is_reliable,
            last_method=r.last_method,
            last_checked=_dt_str(r.last_checked_at),
            llm_explanation=llm_check.llm_explanation if llm_check else None,
            failing_since=failing_since,
        ))

    # Alerts
    alert_result = await db.execute(
        select(StalenessAlert)
        .where(
            StalenessAlert.workflow_id == workflow_id,
            StalenessAlert.resolved == False,
            StalenessAlert.dismissed == False,
        )
        .order_by(StalenessAlert.created_at.desc())
    )
    alerts = alert_result.scalars().all()
    alerts_out = [
        AlertOut(
            id=a.id,
            type=a.alert_type,
            severity=a.severity,
            title=a.title,
            details=a.details,
            created_at=_dt_str(a.created_at),
        )
        for a in alerts
    ]

    return WorkflowHealthResponse(
        health_score=wf.health_score,
        health_status=wf.health_status or "unknown",
        coverage=wf.coverage,
        last_verified_at=_dt_str(wf.last_verified_at),
        last_verified_source=wf.last_verified_source,
        steps=steps_out,
        alerts=alerts_out,
    )


# ── 3. Project Health Summary ────────────────────────────────────────────────

@router.get(
    "/projects/{project_id}/health",
    response_model=ProjectHealthResponse,
)
async def get_project_health(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get aggregated health summary for all workflows in a project."""
    await _verify_project_access(db, project_id, user)

    # Get all non-deleted workflows in project
    wf_result = await db.execute(
        select(ProcessRecordingSession).where(
            ProcessRecordingSession.project_id == project_id,
            ProcessRecordingSession.deleted_at.is_(None),
        )
    )
    workflows = wf_result.scalars().all()

    healthy = aging = stale = unknown = 0
    total_steps = 0
    total_reliable = 0
    stale_wfs = []
    aging_wfs = []

    for wf in workflows:
        # Count steps
        step_count_q = await db.execute(
            select(func.count()).select_from(ProcessRecordingStep).where(
                ProcessRecordingStep.session_id == wf.id,
            )
        )
        wf_steps = step_count_q.scalar() or 0
        total_steps += wf_steps

        if wf.reliable_step_count:
            total_reliable += wf.reliable_step_count

        hs = wf.health_status or "unknown"
        if hs == "healthy":
            healthy += 1
        elif hs == "aging":
            aging += 1
            aging_wfs.append({
                "id": wf.id,
                "name": wf.name or "Untitled",
                "health_score": wf.health_score,
                "last_verified_at": _dt_str(wf.last_verified_at),
            })
        elif hs == "stale":
            stale += 1
            stale_wfs.append({
                "id": wf.id,
                "name": wf.name or "Untitled",
                "health_score": wf.health_score,
                "last_verified_at": _dt_str(wf.last_verified_at),
            })
        else:
            unknown += 1

    total_workflows = len(workflows)
    coverage = total_reliable / total_steps if total_steps > 0 else 0.0

    # Get verification config for last/next run info
    vc_result = await db.execute(
        select(VerificationConfig).where(VerificationConfig.project_id == project_id)
    )
    vc = vc_result.scalar_one_or_none()

    last_run = None
    next_run = None
    if vc:
        if vc.last_run_at:
            last_run = {
                "at": _dt_str(vc.last_run_at),
                "status": vc.last_run_status,
                "stats": vc.last_run_stats,
            }
        next_run = _dt_str(vc.next_run_at)

    return ProjectHealthResponse(
        total_workflows=total_workflows,
        healthy=healthy,
        aging=aging,
        stale=stale,
        unknown=unknown,
        total_steps=total_steps,
        coverage=round(coverage, 4),
        stale_workflows=stale_wfs,
        aging_workflows=aging_wfs,
        last_run=last_run,
        next_run=next_run,
    )


# ── 4. Verification Config ──────────────────────────────────────────────────

@router.get(
    "/projects/{project_id}/verification-config",
    response_model=VerificationConfigOut,
)
async def get_verification_config(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get verification configuration for a project."""
    await _verify_project_access(db, project_id, user)

    result = await db.execute(
        select(VerificationConfig).where(VerificationConfig.project_id == project_id)
    )
    vc = result.scalar_one_or_none()

    if vc is None:
        return VerificationConfigOut()

    return VerificationConfigOut(
        enabled=vc.enabled,
        login_url=vc.login_url,
        has_credentials=bool(vc.encrypted_email and vc.encrypted_password),
        email_selector=vc.email_selector,
        password_selector=vc.password_selector,
        submit_selector=vc.submit_selector,
        post_login_wait_ms=vc.post_login_wait_ms or 2000,
        schedule=vc.schedule or "weekly",
        schedule_day=vc.schedule_day if vc.schedule_day is not None else 0,
        schedule_hour=vc.schedule_hour if vc.schedule_hour is not None else 3,
        schedule_scope=vc.schedule_scope or "all",
        llm_enabled=vc.llm_enabled,
        notify_email=vc.notify_email,
        notify_in_app=vc.notify_in_app,
        last_run_at=_dt_str(vc.last_run_at),
        last_run_status=vc.last_run_status,
        next_run_at=_dt_str(vc.next_run_at),
    )


@router.put(
    "/projects/{project_id}/verification-config",
    response_model=VerificationConfigOut,
)
async def update_verification_config(
    project_id: str,
    body: VerificationConfigUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create or update verification configuration for a project."""
    await _verify_project_access(db, project_id, user)

    result = await db.execute(
        select(VerificationConfig).where(VerificationConfig.project_id == project_id)
    )
    vc = result.scalar_one_or_none()

    if vc is None:
        vc = VerificationConfig(
            id=gen_suffix(16),
            project_id=project_id,
        )
        db.add(vc)

    # Update fields that were provided
    if body.enabled is not None:
        vc.enabled = body.enabled
    if body.login_url is not None:
        vc.login_url = body.login_url
    if body.email is not None:
        from app.services.crypto import encrypt
        vc.encrypted_email = encrypt(body.email)
    if body.password is not None:
        from app.services.crypto import encrypt
        vc.encrypted_password = encrypt(body.password)
    if body.email_selector is not None:
        vc.email_selector = body.email_selector
    if body.password_selector is not None:
        vc.password_selector = body.password_selector
    if body.submit_selector is not None:
        vc.submit_selector = body.submit_selector
    if body.post_login_wait_ms is not None:
        vc.post_login_wait_ms = body.post_login_wait_ms
    if body.schedule is not None:
        vc.schedule = body.schedule
    if body.schedule_day is not None:
        vc.schedule_day = body.schedule_day
    if body.schedule_hour is not None:
        vc.schedule_hour = body.schedule_hour
    if body.schedule_scope is not None:
        vc.schedule_scope = body.schedule_scope
    if body.llm_enabled is not None:
        vc.llm_enabled = body.llm_enabled
    if body.notify_email is not None:
        vc.notify_email = body.notify_email
    if body.notify_in_app is not None:
        vc.notify_in_app = body.notify_in_app

    await db.commit()
    await db.refresh(vc)

    return VerificationConfigOut(
        enabled=vc.enabled,
        login_url=vc.login_url,
        has_credentials=bool(vc.encrypted_email and vc.encrypted_password),
        email_selector=vc.email_selector,
        password_selector=vc.password_selector,
        submit_selector=vc.submit_selector,
        post_login_wait_ms=vc.post_login_wait_ms or 2000,
        schedule=vc.schedule or "weekly",
        schedule_day=vc.schedule_day if vc.schedule_day is not None else 0,
        schedule_hour=vc.schedule_hour if vc.schedule_hour is not None else 3,
        schedule_scope=vc.schedule_scope or "all",
        llm_enabled=vc.llm_enabled,
        notify_email=vc.notify_email,
        notify_in_app=vc.notify_in_app,
        last_run_at=_dt_str(vc.last_run_at),
        last_run_status=vc.last_run_status,
        next_run_at=_dt_str(vc.next_run_at),
    )


@router.post(
    "/projects/{project_id}/verification-config/test",
)
async def test_verification_config(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Test the verification config by launching Playwright, logging in, and verifying redirect."""
    await _verify_project_access(db, project_id, user)

    result = await db.execute(
        select(VerificationConfig).where(VerificationConfig.project_id == project_id)
    )
    vc = result.scalar_one_or_none()

    if vc is None or not vc.login_url:
        return {"success": False, "message": "No login URL configured."}

    if not vc.encrypted_email or not vc.encrypted_password:
        return {"success": False, "message": "Credentials not configured."}

    from app.services.crypto import decrypt

    email = decrypt(vc.encrypted_email)
    password = decrypt(vc.encrypted_password)

    if not email or not password:
        return {"success": False, "message": "Could not decrypt credentials. Please re-save them."}

    try:
        from playwright.async_api import async_playwright
    except ImportError:
        return {"success": False, "message": "Playwright is not installed on the server."}

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                viewport={"width": 1280, "height": 720},
                ignore_https_errors=True,
            )
            page = await context.new_page()

            # Navigate to login URL
            await page.goto(vc.login_url, wait_until="networkidle", timeout=30000)
            login_page_url = page.url

            # Use configured selectors or auto-detect
            email_sel = vc.email_selector or 'input[type="email"], input[name="email"], input[name="username"], input#email, input#username'
            password_sel = vc.password_selector or 'input[type="password"], input[name="password"], input#password'
            submit_sel = vc.submit_selector or 'button[type="submit"], input[type="submit"], button:has-text("Log in"), button:has-text("Sign in")'

            # Auto-detect form fields and report what was found
            detected = {}

            email_field = await page.query_selector(email_sel)
            if not email_field:
                await browser.close()
                return {
                    "success": False,
                    "message": f"Email/username field not found. Tried: {email_sel}",
                    "page_url": login_page_url,
                }
            detected["email_field"] = True

            password_field = await page.query_selector(password_sel)
            if not password_field:
                await browser.close()
                return {
                    "success": False,
                    "message": f"Password field not found. Tried: {password_sel}",
                    "page_url": login_page_url,
                }
            detected["password_field"] = True

            submit_btn = await page.query_selector(submit_sel)
            detected["submit_button"] = submit_btn is not None

            # Fill and submit
            await email_field.fill(email)
            await password_field.fill(password)

            if submit_btn:
                await submit_btn.click()
            else:
                await password_field.press("Enter")

            # Wait for navigation / post-login
            wait_ms = vc.post_login_wait_ms or 2000
            await page.wait_for_timeout(wait_ms)

            post_login_url = page.url

            # Check if URL changed (indicates successful redirect)
            url_changed = post_login_url != login_page_url

            # Check for common error indicators
            error_selectors = [
                '.error', '.alert-danger', '.alert-error',
                '[role="alert"]', '.login-error', '.form-error',
            ]
            has_error = False
            for es in error_selectors:
                err_el = await page.query_selector(es)
                if err_el:
                    err_text = await err_el.text_content()
                    if err_text and err_text.strip():
                        has_error = True
                        break

            await browser.close()

            if has_error:
                return {
                    "success": False,
                    "message": "Login appeared to fail — error message detected on page.",
                    "page_url": post_login_url,
                    "detected_fields": detected,
                }

            if url_changed:
                return {
                    "success": True,
                    "message": "Login successful — redirected after authentication.",
                    "login_url": login_page_url,
                    "redirect_url": post_login_url,
                    "detected_fields": detected,
                }
            else:
                return {
                    "success": False,
                    "message": "Login may have failed — URL did not change after submission. Check credentials or selectors.",
                    "page_url": post_login_url,
                    "detected_fields": detected,
                }

    except Exception as e:
        logger.error("Test connection failed: %s", e)
        return {
            "success": False,
            "message": f"Connection test error: {str(e)[:200]}",
        }


# ── 5. Manual Verification Run ──────────────────────────────────────────────

@router.post(
    "/verification/run",
    response_model=RunVerificationResponse,
    status_code=202,
)
async def run_verification(
    body: RunVerificationRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Queue a manual verification run for one or more workflows."""
    # Determine which workflows to queue
    workflow_ids: list[str] = []

    if body.workflow_ids:
        workflow_ids = body.workflow_ids
        # Validate they exist and get project_id from first one
        first_wf = await db.get(ProcessRecordingSession, workflow_ids[0])
        if first_wf is None:
            raise HTTPException(status_code=404, detail="Workflow not found")
        project_id = first_wf.project_id
    elif body.project_id:
        project_id = body.project_id
        await _verify_project_access(db, project_id, user)

        query = select(ProcessRecordingSession.id).where(
            ProcessRecordingSession.project_id == project_id,
            ProcessRecordingSession.deleted_at.is_(None),
        )
        if body.filter == "stale":
            query = query.where(ProcessRecordingSession.health_status == "stale")
        elif body.filter == "aging":
            query = query.where(
                ProcessRecordingSession.health_status.in_(["stale", "aging"])
            )

        result = await db.execute(query)
        workflow_ids = [row[0] for row in result.all()]
    else:
        raise HTTPException(
            status_code=400,
            detail="Provide either workflow_ids or project_id",
        )

    if not workflow_ids:
        raise HTTPException(status_code=400, detail="No workflows to verify")

    if not project_id:
        raise HTTPException(status_code=400, detail="Could not determine project")

    # Create verification job
    job = VerificationJob(
        id=gen_suffix(16),
        project_id=project_id,
        workflow_ids=workflow_ids,
        trigger="manual",
        triggered_by=user.id,
        status="queued",
        progress={"total": len(workflow_ids), "completed": 0},
    )
    db.add(job)
    await db.commit()

    estimated_seconds = len(workflow_ids) * 15  # rough estimate

    return RunVerificationResponse(
        job_id=job.id,
        workflows_queued=len(workflow_ids),
        estimated_seconds=estimated_seconds,
    )


# ── 6. Job Status ────────────────────────────────────────────────────────────

@router.get(
    "/verification/jobs/{job_id}",
    response_model=JobStatusResponse,
)
async def get_job_status(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get the status of a verification job."""
    job = await db.get(VerificationJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    return JobStatusResponse(
        job_id=job.id,
        status=job.status,
        progress=job.progress,
        results=job.results,
        error=job.error,
        started_at=_dt_str(job.started_at),
        completed_at=_dt_str(job.completed_at),
        created_at=_dt_str(job.created_at),
    )


@router.post(
    "/verification/jobs/{job_id}/cancel",
    status_code=200,
)
async def cancel_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Cancel a queued or running verification job."""
    job = await db.get(VerificationJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.status in ("completed", "failed", "cancelled"):
        raise HTTPException(status_code=400, detail=f"Job already {job.status}")

    job.status = "cancelled"
    job.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()

    return {"job_id": job.id, "status": "cancelled"}


# ── 7. Staleness Alerts ─────────────────────────────────────────────────────

@router.get(
    "/projects/{project_id}/staleness-alerts",
    response_model=List[AlertOut],
)
async def get_staleness_alerts(
    project_id: str,
    include_resolved: bool = False,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get staleness alerts for a project."""
    await _verify_project_access(db, project_id, user)

    query = select(StalenessAlert).where(
        StalenessAlert.project_id == project_id,
    )
    if not include_resolved:
        query = query.where(
            StalenessAlert.resolved == False,
            StalenessAlert.dismissed == False,
        )

    query = query.order_by(StalenessAlert.created_at.desc())
    result = await db.execute(query)
    alerts = result.scalars().all()

    return [
        AlertOut(
            id=a.id,
            type=a.alert_type,
            severity=a.severity,
            title=a.title,
            details=a.details,
            created_at=_dt_str(a.created_at),
        )
        for a in alerts
    ]


@router.post(
    "/staleness-alerts/{alert_id}/resolve",
    response_model=AlertActionResponse,
)
async def resolve_alert(
    alert_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Mark a staleness alert as resolved."""
    alert = await db.get(StalenessAlert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.resolved = True
    alert.resolved_by = user.id
    alert.resolved_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()

    return AlertActionResponse(id=alert.id, resolved=True, dismissed=alert.dismissed)


@router.post(
    "/staleness-alerts/{alert_id}/dismiss",
    response_model=AlertActionResponse,
)
async def dismiss_alert(
    alert_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Dismiss a staleness alert without fixing it."""
    alert = await db.get(StalenessAlert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.dismissed = True
    await db.commit()

    return AlertActionResponse(id=alert.id, resolved=alert.resolved, dismissed=True)
