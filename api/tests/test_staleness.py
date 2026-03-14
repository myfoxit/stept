"""
Comprehensive tests for staleness detection API endpoints and business logic.

Covers:
  1. POST /workflows/{id}/health-check — ingestion
  2. GET  /workflows/{id}/health — per-workflow health
  3. GET  /projects/{id}/health — project summary
  4. GET/PUT /projects/{id}/verification-config — config CRUD
  5. POST /verification/run — manual trigger
  6. GET  /verification/jobs/{id} — job status
  7. POST /verification/jobs/{id}/cancel — cancel job
  8. GET  /projects/{id}/staleness-alerts — list alerts
  9. POST /staleness-alerts/{id}/resolve + /dismiss — alert actions
  10. Business logic: _recency_factor, update_step_reliability,
      recalculate_health_score, maybe_create_alerts
"""

import pytest
import pytest_asyncio
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ProcessRecordingSession,
    ProcessRecordingStep,
    WorkflowStepCheck,
    StepReliability,
    VerificationConfig,
    VerificationJob,
    StalenessAlert,
)
from app.services.staleness import (
    _recency_factor,
    _health_status,
    update_step_reliability,
    recalculate_health_score,
    maybe_create_alerts,
)
from app.utils import gen_suffix


# ─────────────────────────── Helpers ─────────────────────────────────────────


async def _create_workflow(
    client: AsyncClient,
    headers: dict,
    project_id: str,
    name: str = "Test Workflow",
) -> str:
    """Create a workflow session via the API and return the session_id."""
    resp = await client.post(
        "/api/v1/process-recording/session/create",
        json={
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "client": "TestRecorder",
            "project_id": project_id,
            "name": name,
        },
        headers=headers,
    )
    assert resp.status_code == 200, f"Create session failed: {resp.text}"
    data = resp.json()
    return data.get("session_id") or data.get("sessionId")


async def _create_workflow_with_steps(
    db: AsyncSession,
    project_id: str,
    user_id: str,
    num_steps: int = 3,
    name: str = "Test Workflow",
    health_status: str | None = None,
    health_score: float | None = None,
) -> ProcessRecordingSession:
    """Create a workflow with steps directly in the DB for testing."""
    wf_id = gen_suffix(16)
    wf = ProcessRecordingSession(
        id=wf_id,
        user_id=user_id,
        project_id=project_id,
        client_name="TestRecorder",
        status="completed",
        name=name,
        health_status=health_status,
        health_score=health_score,
    )
    db.add(wf)

    for i in range(1, num_steps + 1):
        step = ProcessRecordingStep(
            id=gen_suffix(16),
            session_id=wf_id,
            step_number=i,
            step_type="click",
            timestamp=datetime.now(timezone.utc),
            action_type="click",
        )
        db.add(step)

    await db.commit()
    await db.refresh(wf)
    return wf


async def _ingest_health_check(
    client: AsyncClient,
    headers: dict,
    workflow_id: str,
    steps: list[dict] | None = None,
    source: str = "guide_replay",
) -> dict:
    """Post a health check and return the response JSON."""
    if steps is None:
        steps = [
            {"stepNumber": 1, "elementFound": True, "finderMethod": "selector", "finderConfidence": 0.95},
            {"stepNumber": 2, "elementFound": True, "finderMethod": "testid", "finderConfidence": 0.99},
            {"stepNumber": 3, "elementFound": True, "finderMethod": "role+text", "finderConfidence": 0.8},
        ]
    resp = await client.post(
        f"/api/v1/workflows/{workflow_id}/health-check",
        json={"steps": steps, "source": source},
        headers=headers,
    )
    return resp


# ─────────────────────────── Fixtures ────────────────────────────────────────


@pytest_asyncio.fixture()
async def workflow(
    async_client: AsyncClient,
    auth_headers: dict,
    test_project: dict,
    db: AsyncSession,
    test_user_id: str,
) -> ProcessRecordingSession:
    """Create a workflow with 3 steps for staleness tests."""
    return await _create_workflow_with_steps(
        db, test_project["id"], test_user_id, num_steps=3
    )


# ═══════════════════════════════════════════════════════════════════════════════
# 1. POST /workflows/{id}/health-check — Ingestion
# ═══════════════════════════════════════════════════════════════════════════════


class TestHealthCheckIngestion:
    """Tests for the health check ingestion endpoint."""

    @pytest.mark.asyncio
    async def test_valid_multi_step_ingestion(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        workflow: ProcessRecordingSession,
    ):
        """Ingest a multi-step health check and verify the response."""
        resp = await _ingest_health_check(
            async_client, auth_headers, workflow.id
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "health_score" in data
        assert "health_status" in data
        assert isinstance(data["health_score"], float)
        assert data["health_status"] in ("healthy", "aging", "stale", "unknown")

    @pytest.mark.asyncio
    async def test_ingestion_creates_step_checks(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        workflow: ProcessRecordingSession,
        db: AsyncSession,
    ):
        """After ingestion, WorkflowStepCheck records are created."""
        await _ingest_health_check(async_client, auth_headers, workflow.id)

        from sqlalchemy import select

        result = await db.execute(
            select(WorkflowStepCheck).where(
                WorkflowStepCheck.workflow_id == workflow.id
            )
        )
        checks = result.scalars().all()
        assert len(checks) == 3
        assert all(c.check_source == "guide_replay" for c in checks)

    @pytest.mark.asyncio
    async def test_ingestion_updates_reliability(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        workflow: ProcessRecordingSession,
        db: AsyncSession,
    ):
        """After ingestion, StepReliability records are created/updated."""
        await _ingest_health_check(async_client, auth_headers, workflow.id)

        from sqlalchemy import select

        result = await db.execute(
            select(StepReliability).where(
                StepReliability.workflow_id == workflow.id
            )
        )
        rels = result.scalars().all()
        assert len(rels) == 3
        for r in rels:
            assert r.total_checks == 1
            assert r.found_count == 1
            assert r.reliability == 1.0

    @pytest.mark.asyncio
    async def test_ingestion_recalculates_health_score(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        workflow: ProcessRecordingSession,
        db: AsyncSession,
    ):
        """After ingestion, the workflow's health_score and health_status are updated."""
        resp = await _ingest_health_check(async_client, auth_headers, workflow.id)
        assert resp.status_code == 200

        await db.refresh(workflow)
        assert workflow.health_score is not None
        assert workflow.health_status is not None
        assert workflow.last_verified_at is not None
        assert workflow.last_verified_source == "guide_replay"

    @pytest.mark.asyncio
    async def test_ingestion_with_failures(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        workflow: ProcessRecordingSession,
    ):
        """Steps that fail (elementFound=false) should work correctly."""
        steps = [
            {"stepNumber": 1, "elementFound": True, "finderMethod": "selector", "finderConfidence": 0.95},
            {"stepNumber": 2, "elementFound": False, "finderMethod": "testid", "finderConfidence": 0.0},
            {"stepNumber": 3, "elementFound": False, "finderMethod": "role+text", "finderConfidence": 0.0},
        ]
        resp = await _ingest_health_check(
            async_client, auth_headers, workflow.id, steps=steps
        )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_ingestion_with_url_check(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        workflow: ProcessRecordingSession,
    ):
        """URL-related fields should be stored correctly."""
        steps = [
            {
                "stepNumber": 1,
                "elementFound": True,
                "finderMethod": "selector",
                "finderConfidence": 0.9,
                "expectedUrl": "https://example.com/page",
                "actualUrl": "https://example.com/page",
                "urlMatched": True,
            },
        ]
        resp = await _ingest_health_check(
            async_client, auth_headers, workflow.id, steps=steps
        )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_ingestion_workflow_not_found(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
    ):
        """404 when workflow doesn't exist."""
        resp = await _ingest_health_check(
            async_client, auth_headers, "nonexistent12345"
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_ingestion_custom_source(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        workflow: ProcessRecordingSession,
        db: AsyncSession,
    ):
        """Source field is stored correctly."""
        resp = await _ingest_health_check(
            async_client, auth_headers, workflow.id, source="scheduled"
        )
        assert resp.status_code == 200

        from sqlalchemy import select

        result = await db.execute(
            select(WorkflowStepCheck).where(
                WorkflowStepCheck.workflow_id == workflow.id
            )
        )
        checks = result.scalars().all()
        assert all(c.check_source == "scheduled" for c in checks)

    @pytest.mark.asyncio
    async def test_ingestion_unauthenticated(
        self,
        async_client: AsyncClient,
        workflow: ProcessRecordingSession,
    ):
        """401 when no auth headers provided."""
        resp = await async_client.post(
            f"/api/v1/workflows/{workflow.id}/health-check",
            json={
                "steps": [{"stepNumber": 1, "elementFound": True}],
                "source": "guide_replay",
            },
        )
        assert resp.status_code in (401, 403)


# ═══════════════════════════════════════════════════════════════════════════════
# 2. GET /workflows/{id}/health — Per-Workflow Health
# ═══════════════════════════════════════════════════════════════════════════════


class TestWorkflowHealth:
    """Tests for the per-workflow health endpoint."""

    @pytest.mark.asyncio
    async def test_health_unknown_no_checks(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        workflow: ProcessRecordingSession,
    ):
        """A workflow with no health checks returns unknown status."""
        resp = await async_client.get(
            f"/api/v1/workflows/{workflow.id}/health",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["health_status"] == "unknown"
        assert data["health_score"] is None
        assert data["steps"] == []
        assert data["alerts"] == []

    @pytest.mark.asyncio
    async def test_health_after_ingestion(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        workflow: ProcessRecordingSession,
    ):
        """After ingesting checks, health data should be populated."""
        await _ingest_health_check(async_client, auth_headers, workflow.id)

        resp = await async_client.get(
            f"/api/v1/workflows/{workflow.id}/health",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["health_score"] is not None
        assert data["last_verified_at"] is not None
        assert data["last_verified_source"] == "guide_replay"
        assert len(data["steps"]) == 3

    @pytest.mark.asyncio
    async def test_health_step_details(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        workflow: ProcessRecordingSession,
    ):
        """Step health details include correct fields."""
        await _ingest_health_check(async_client, auth_headers, workflow.id)

        resp = await async_client.get(
            f"/api/v1/workflows/{workflow.id}/health",
            headers=auth_headers,
        )
        data = resp.json()
        step = data["steps"][0]
        assert "step_number" in step
        assert "status" in step
        assert "reliability" in step
        assert "is_reliable" in step
        assert "last_method" in step
        assert "last_checked" in step

    @pytest.mark.asyncio
    async def test_health_404(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
    ):
        """404 when workflow doesn't exist."""
        resp = await async_client.get(
            "/api/v1/workflows/nonexistent12345/health",
            headers=auth_headers,
        )
        assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
# 3. GET /projects/{id}/health — Project Summary
# ═══════════════════════════════════════════════════════════════════════════════


class TestProjectHealth:
    """Tests for the project health summary endpoint."""

    @pytest.mark.asyncio
    async def test_empty_project_health(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        test_project: dict,
    ):
        """An empty project has zero counts."""
        resp = await async_client.get(
            f"/api/v1/projects/{test_project['id']}/health",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_workflows"] == 0
        assert data["healthy"] == 0
        assert data["aging"] == 0
        assert data["stale"] == 0
        assert data["unknown"] == 0

    @pytest.mark.asyncio
    async def test_project_health_with_workflows(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        test_project: dict,
        db: AsyncSession,
        test_user_id: str,
    ):
        """Project health counts match workflow health statuses."""
        # Create workflows with different statuses
        await _create_workflow_with_steps(
            db, test_project["id"], test_user_id, name="Healthy",
            health_status="healthy", health_score=0.9,
        )
        await _create_workflow_with_steps(
            db, test_project["id"], test_user_id, name="Aging",
            health_status="aging", health_score=0.65,
        )
        await _create_workflow_with_steps(
            db, test_project["id"], test_user_id, name="Stale",
            health_status="stale", health_score=0.3,
        )
        await _create_workflow_with_steps(
            db, test_project["id"], test_user_id, name="Unknown",
        )

        resp = await async_client.get(
            f"/api/v1/projects/{test_project['id']}/health",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_workflows"] == 4
        assert data["healthy"] == 1
        assert data["aging"] == 1
        assert data["stale"] == 1
        assert data["unknown"] == 1
        assert len(data["stale_workflows"]) == 1
        assert len(data["aging_workflows"]) == 1

    @pytest.mark.asyncio
    async def test_project_health_access_control(
        self,
        async_client: AsyncClient,
        second_auth_headers: dict,
        test_project: dict,
    ):
        """Another user cannot access project health."""
        resp = await async_client.get(
            f"/api/v1/projects/{test_project['id']}/health",
            headers=second_auth_headers,
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_project_health_not_found(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
    ):
        """404 for nonexistent project."""
        resp = await async_client.get(
            "/api/v1/projects/nonexistent12345/health",
            headers=auth_headers,
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_project_health_excludes_deleted(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        test_project: dict,
        db: AsyncSession,
        test_user_id: str,
    ):
        """Soft-deleted workflows are excluded from project health."""
        wf = await _create_workflow_with_steps(
            db, test_project["id"], test_user_id, name="Deleted WF",
            health_status="stale", health_score=0.2,
        )
        wf.deleted_at = datetime.now(timezone.utc)
        await db.commit()

        resp = await async_client.get(
            f"/api/v1/projects/{test_project['id']}/health",
            headers=auth_headers,
        )
        data = resp.json()
        assert data["total_workflows"] == 0
        assert data["stale"] == 0


# ═══════════════════════════════════════════════════════════════════════════════
# 4. GET/PUT /projects/{id}/verification-config — Config CRUD
# ═══════════════════════════════════════════════════════════════════════════════


class TestVerificationConfig:
    """Tests for verification config CRUD."""

    @pytest.mark.asyncio
    async def test_get_default_config(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        test_project: dict,
    ):
        """GET returns defaults when no config exists."""
        resp = await async_client.get(
            f"/api/v1/projects/{test_project['id']}/verification-config",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["enabled"] is False
        assert data["has_credentials"] is False
        assert data["schedule"] == "weekly"
        assert data["schedule_day"] == 0
        assert data["schedule_hour"] == 3

    @pytest.mark.asyncio
    async def test_create_config(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        test_project: dict,
    ):
        """PUT creates a config when none exists."""
        resp = await async_client.put(
            f"/api/v1/projects/{test_project['id']}/verification-config",
            json={
                "enabled": True,
                "login_url": "https://example.com/login",
                "schedule": "daily",
                "schedule_hour": 6,
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["enabled"] is True
        assert data["login_url"] == "https://example.com/login"
        assert data["schedule"] == "daily"
        assert data["schedule_hour"] == 6

    @pytest.mark.asyncio
    async def test_update_config(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        test_project: dict,
    ):
        """PUT updates an existing config."""
        # Create
        await async_client.put(
            f"/api/v1/projects/{test_project['id']}/verification-config",
            json={"enabled": True, "schedule": "daily"},
            headers=auth_headers,
        )
        # Update
        resp = await async_client.put(
            f"/api/v1/projects/{test_project['id']}/verification-config",
            json={"schedule": "monthly", "llm_enabled": True},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["enabled"] is True  # not overwritten
        assert data["schedule"] == "monthly"
        assert data["llm_enabled"] is True

    @pytest.mark.asyncio
    async def test_config_credential_encryption(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        test_project: dict,
        db: AsyncSession,
    ):
        """Credentials are encrypted and has_credentials flag is set."""
        resp = await async_client.put(
            f"/api/v1/projects/{test_project['id']}/verification-config",
            json={
                "email": "admin@example.com",
                "password": "supersecret123",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["has_credentials"] is True
        # Plaintext should NOT appear in the response
        assert "admin@example.com" not in str(data)
        assert "supersecret123" not in str(data)

        # Verify encrypted in DB
        from sqlalchemy import select

        result = await db.execute(
            select(VerificationConfig).where(
                VerificationConfig.project_id == test_project["id"]
            )
        )
        vc = result.scalar_one()
        assert vc.encrypted_email is not None
        assert vc.encrypted_password is not None
        assert vc.encrypted_email != "admin@example.com"
        assert vc.encrypted_password != "supersecret123"

    @pytest.mark.asyncio
    async def test_config_access_control(
        self,
        async_client: AsyncClient,
        second_auth_headers: dict,
        test_project: dict,
    ):
        """Another user cannot access the project's config."""
        resp = await async_client.get(
            f"/api/v1/projects/{test_project['id']}/verification-config",
            headers=second_auth_headers,
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_config_partial_update(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        test_project: dict,
    ):
        """Only provided fields are updated (PATCH semantics on PUT)."""
        # Create with multiple fields
        await async_client.put(
            f"/api/v1/projects/{test_project['id']}/verification-config",
            json={
                "enabled": True,
                "login_url": "https://example.com/login",
                "notify_email": True,
                "notify_in_app": True,
            },
            headers=auth_headers,
        )
        # Update only notify_email
        resp = await async_client.put(
            f"/api/v1/projects/{test_project['id']}/verification-config",
            json={"notify_email": False},
            headers=auth_headers,
        )
        data = resp.json()
        assert data["notify_email"] is False
        assert data["notify_in_app"] is True  # unchanged
        assert data["enabled"] is True  # unchanged
        assert data["login_url"] == "https://example.com/login"  # unchanged


# ═══════════════════════════════════════════════════════════════════════════════
# 5. POST /verification/run — Manual Trigger
# ═══════════════════════════════════════════════════════════════════════════════


class TestVerificationRun:
    """Tests for the manual verification run endpoint."""

    @pytest.mark.asyncio
    async def test_run_with_workflow_ids(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        workflow: ProcessRecordingSession,
    ):
        """Trigger verification for specific workflow IDs."""
        resp = await async_client.post(
            "/api/v1/verification/run",
            json={"workflow_ids": [workflow.id]},
            headers=auth_headers,
        )
        assert resp.status_code == 202
        data = resp.json()
        assert "job_id" in data
        assert data["workflows_queued"] == 1
        assert data["estimated_seconds"] == 15

    @pytest.mark.asyncio
    async def test_run_with_project_id(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        test_project: dict,
        db: AsyncSession,
        test_user_id: str,
    ):
        """Trigger verification for all workflows in a project."""
        wf1 = await _create_workflow_with_steps(
            db, test_project["id"], test_user_id, name="WF1"
        )
        wf2 = await _create_workflow_with_steps(
            db, test_project["id"], test_user_id, name="WF2"
        )

        resp = await async_client.post(
            "/api/v1/verification/run",
            json={"project_id": test_project["id"]},
            headers=auth_headers,
        )
        assert resp.status_code == 202
        data = resp.json()
        assert data["workflows_queued"] == 2
        assert data["estimated_seconds"] == 30

    @pytest.mark.asyncio
    async def test_run_filter_stale(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        test_project: dict,
        db: AsyncSession,
        test_user_id: str,
    ):
        """Filter=stale only queues stale workflows."""
        await _create_workflow_with_steps(
            db, test_project["id"], test_user_id, name="Healthy",
            health_status="healthy", health_score=0.9,
        )
        await _create_workflow_with_steps(
            db, test_project["id"], test_user_id, name="Stale",
            health_status="stale", health_score=0.2,
        )

        resp = await async_client.post(
            "/api/v1/verification/run",
            json={"project_id": test_project["id"], "filter": "stale"},
            headers=auth_headers,
        )
        assert resp.status_code == 202
        data = resp.json()
        assert data["workflows_queued"] == 1

    @pytest.mark.asyncio
    async def test_run_filter_aging(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        test_project: dict,
        db: AsyncSession,
        test_user_id: str,
    ):
        """Filter=aging queues stale + aging workflows."""
        await _create_workflow_with_steps(
            db, test_project["id"], test_user_id, name="Healthy",
            health_status="healthy", health_score=0.9,
        )
        await _create_workflow_with_steps(
            db, test_project["id"], test_user_id, name="Aging",
            health_status="aging", health_score=0.65,
        )
        await _create_workflow_with_steps(
            db, test_project["id"], test_user_id, name="Stale",
            health_status="stale", health_score=0.2,
        )

        resp = await async_client.post(
            "/api/v1/verification/run",
            json={"project_id": test_project["id"], "filter": "aging"},
            headers=auth_headers,
        )
        assert resp.status_code == 202
        data = resp.json()
        assert data["workflows_queued"] == 2

    @pytest.mark.asyncio
    async def test_run_no_ids_or_project(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
    ):
        """400 when neither workflow_ids nor project_id is provided."""
        resp = await async_client.post(
            "/api/v1/verification/run",
            json={},
            headers=auth_headers,
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_run_empty_filter_result(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        test_project: dict,
        db: AsyncSession,
        test_user_id: str,
    ):
        """400 when filter matches no workflows."""
        await _create_workflow_with_steps(
            db, test_project["id"], test_user_id, name="Healthy",
            health_status="healthy", health_score=0.9,
        )

        resp = await async_client.post(
            "/api/v1/verification/run",
            json={"project_id": test_project["id"], "filter": "stale"},
            headers=auth_headers,
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_run_nonexistent_workflow(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
    ):
        """404 when workflow ID doesn't exist."""
        resp = await async_client.post(
            "/api/v1/verification/run",
            json={"workflow_ids": ["nonexistent12345"]},
            headers=auth_headers,
        )
        assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
# 6. GET /verification/jobs/{id} — Job Status
# ═══════════════════════════════════════════════════════════════════════════════


class TestJobStatus:
    """Tests for the verification job status endpoint."""

    @pytest.mark.asyncio
    async def test_get_job_status(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        workflow: ProcessRecordingSession,
    ):
        """Get status of a created job."""
        # Create a job first
        run_resp = await async_client.post(
            "/api/v1/verification/run",
            json={"workflow_ids": [workflow.id]},
            headers=auth_headers,
        )
        job_id = run_resp.json()["job_id"]

        resp = await async_client.get(
            f"/api/v1/verification/jobs/{job_id}",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["job_id"] == job_id
        assert data["status"] == "queued"
        assert data["progress"] is not None
        assert data["created_at"] is not None

    @pytest.mark.asyncio
    async def test_get_job_not_found(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
    ):
        """404 when job doesn't exist."""
        resp = await async_client.get(
            "/api/v1/verification/jobs/nonexistent12345",
            headers=auth_headers,
        )
        assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
# 7. POST /verification/jobs/{id}/cancel — Cancel Job
# ═══════════════════════════════════════════════════════════════════════════════


class TestCancelJob:
    """Tests for job cancellation."""

    @pytest.mark.asyncio
    async def test_cancel_queued_job(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        workflow: ProcessRecordingSession,
    ):
        """Cancel a queued job succeeds."""
        run_resp = await async_client.post(
            "/api/v1/verification/run",
            json={"workflow_ids": [workflow.id]},
            headers=auth_headers,
        )
        job_id = run_resp.json()["job_id"]

        resp = await async_client.post(
            f"/api/v1/verification/jobs/{job_id}/cancel",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "cancelled"

    @pytest.mark.asyncio
    async def test_cancel_already_completed(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        test_project: dict,
        db: AsyncSession,
    ):
        """400 when trying to cancel an already completed job."""
        job = VerificationJob(
            id=gen_suffix(16),
            project_id=test_project["id"],
            workflow_ids=["dummy"],
            trigger="manual",
            status="completed",
            completed_at=datetime.now(timezone.utc),
        )
        db.add(job)
        await db.commit()

        resp = await async_client.post(
            f"/api/v1/verification/jobs/{job.id}/cancel",
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert "already" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_cancel_already_cancelled(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        test_project: dict,
        db: AsyncSession,
    ):
        """400 when trying to cancel an already cancelled job."""
        job = VerificationJob(
            id=gen_suffix(16),
            project_id=test_project["id"],
            workflow_ids=["dummy"],
            trigger="manual",
            status="cancelled",
        )
        db.add(job)
        await db.commit()

        resp = await async_client.post(
            f"/api/v1/verification/jobs/{job.id}/cancel",
            headers=auth_headers,
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_cancel_not_found(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
    ):
        """404 when job doesn't exist."""
        resp = await async_client.post(
            "/api/v1/verification/jobs/nonexistent12345/cancel",
            headers=auth_headers,
        )
        assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
# 8. GET /projects/{id}/staleness-alerts — List Alerts
# ═══════════════════════════════════════════════════════════════════════════════


class TestStalenessAlerts:
    """Tests for staleness alert listing."""

    @pytest.mark.asyncio
    async def test_list_empty_alerts(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        test_project: dict,
    ):
        """Empty list when no alerts exist."""
        resp = await async_client.get(
            f"/api/v1/projects/{test_project['id']}/staleness-alerts",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_list_unresolved_alerts(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        test_project: dict,
        workflow: ProcessRecordingSession,
        db: AsyncSession,
    ):
        """Only unresolved, non-dismissed alerts are returned by default."""
        # Create unresolved alert
        alert1 = StalenessAlert(
            id=gen_suffix(16),
            project_id=test_project["id"],
            workflow_id=workflow.id,
            alert_type="element_missing",
            severity="warning",
            title="Step 1 missing",
        )
        # Create resolved alert
        alert2 = StalenessAlert(
            id=gen_suffix(16),
            project_id=test_project["id"],
            workflow_id=workflow.id,
            alert_type="element_missing",
            severity="critical",
            title="Step 2 missing",
            resolved=True,
        )
        # Create dismissed alert
        alert3 = StalenessAlert(
            id=gen_suffix(16),
            project_id=test_project["id"],
            workflow_id=workflow.id,
            alert_type="url_changed",
            severity="warning",
            title="URL changed",
            dismissed=True,
        )
        db.add_all([alert1, alert2, alert3])
        await db.commit()

        resp = await async_client.get(
            f"/api/v1/projects/{test_project['id']}/staleness-alerts",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["id"] == alert1.id

    @pytest.mark.asyncio
    async def test_list_include_resolved(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        test_project: dict,
        workflow: ProcessRecordingSession,
        db: AsyncSession,
    ):
        """include_resolved=true returns all alerts."""
        alert1 = StalenessAlert(
            id=gen_suffix(16),
            project_id=test_project["id"],
            workflow_id=workflow.id,
            alert_type="element_missing",
            severity="warning",
            title="Active alert",
        )
        alert2 = StalenessAlert(
            id=gen_suffix(16),
            project_id=test_project["id"],
            workflow_id=workflow.id,
            alert_type="element_missing",
            severity="critical",
            title="Resolved alert",
            resolved=True,
        )
        db.add_all([alert1, alert2])
        await db.commit()

        resp = await async_client.get(
            f"/api/v1/projects/{test_project['id']}/staleness-alerts",
            params={"include_resolved": "true"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2

    @pytest.mark.asyncio
    async def test_alert_structure(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        test_project: dict,
        workflow: ProcessRecordingSession,
        db: AsyncSession,
    ):
        """Alert response has correct structure."""
        alert = StalenessAlert(
            id=gen_suffix(16),
            project_id=test_project["id"],
            workflow_id=workflow.id,
            alert_type="element_missing",
            severity="critical",
            title="Steps missing",
            details={"step_numbers": [1, 2]},
        )
        db.add(alert)
        await db.commit()

        resp = await async_client.get(
            f"/api/v1/projects/{test_project['id']}/staleness-alerts",
            headers=auth_headers,
        )
        data = resp.json()[0]
        assert data["id"] == alert.id
        assert data["type"] == "element_missing"
        assert data["severity"] == "critical"
        assert data["title"] == "Steps missing"
        assert data["details"] == {"step_numbers": [1, 2]}
        assert "created_at" in data


# ═══════════════════════════════════════════════════════════════════════════════
# 9. POST /staleness-alerts/{id}/resolve + /dismiss — Alert Actions
# ═══════════════════════════════════════════════════════════════════════════════


class TestAlertActions:
    """Tests for resolving and dismissing alerts."""

    @pytest.mark.asyncio
    async def test_resolve_alert(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        test_project: dict,
        workflow: ProcessRecordingSession,
        db: AsyncSession,
    ):
        """Resolve an alert marks it as resolved."""
        alert = StalenessAlert(
            id=gen_suffix(16),
            project_id=test_project["id"],
            workflow_id=workflow.id,
            alert_type="element_missing",
            severity="warning",
            title="Test alert",
        )
        db.add(alert)
        await db.commit()

        resp = await async_client.post(
            f"/api/v1/staleness-alerts/{alert.id}/resolve",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["resolved"] is True
        assert data["dismissed"] is False

    @pytest.mark.asyncio
    async def test_dismiss_alert(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        test_project: dict,
        workflow: ProcessRecordingSession,
        db: AsyncSession,
    ):
        """Dismiss an alert marks it as dismissed."""
        alert = StalenessAlert(
            id=gen_suffix(16),
            project_id=test_project["id"],
            workflow_id=workflow.id,
            alert_type="element_missing",
            severity="warning",
            title="Test alert",
        )
        db.add(alert)
        await db.commit()

        resp = await async_client.post(
            f"/api/v1/staleness-alerts/{alert.id}/dismiss",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["dismissed"] is True

    @pytest.mark.asyncio
    async def test_resolve_not_found(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
    ):
        """404 when alert doesn't exist."""
        resp = await async_client.post(
            "/api/v1/staleness-alerts/nonexistent12345/resolve",
            headers=auth_headers,
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_dismiss_not_found(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
    ):
        """404 when alert doesn't exist."""
        resp = await async_client.post(
            "/api/v1/staleness-alerts/nonexistent12345/dismiss",
            headers=auth_headers,
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_resolved_alert_excluded_from_list(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        test_project: dict,
        workflow: ProcessRecordingSession,
        db: AsyncSession,
    ):
        """After resolving, alert is excluded from default listing."""
        alert = StalenessAlert(
            id=gen_suffix(16),
            project_id=test_project["id"],
            workflow_id=workflow.id,
            alert_type="element_missing",
            severity="warning",
            title="Test alert",
        )
        db.add(alert)
        await db.commit()

        # Resolve it
        await async_client.post(
            f"/api/v1/staleness-alerts/{alert.id}/resolve",
            headers=auth_headers,
        )

        # Default listing should exclude it
        resp = await async_client.get(
            f"/api/v1/projects/{test_project['id']}/staleness-alerts",
            headers=auth_headers,
        )
        assert len(resp.json()) == 0

        # include_resolved should include it
        resp = await async_client.get(
            f"/api/v1/projects/{test_project['id']}/staleness-alerts",
            params={"include_resolved": "true"},
            headers=auth_headers,
        )
        assert len(resp.json()) == 1


# ═══════════════════════════════════════════════════════════════════════════════
# 10. Business Logic — staleness.py Service Functions
# ═══════════════════════════════════════════════════════════════════════════════


class TestRecencyFactor:
    """Tests for the _recency_factor decay curve."""

    def test_never_verified(self):
        """None → 0.5 (default)."""
        assert _recency_factor(None) == 0.5

    def test_just_verified(self):
        """< 7 days → 1.0."""
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        assert _recency_factor(now - timedelta(days=1)) == 1.0
        assert _recency_factor(now - timedelta(hours=1)) == 1.0
        assert _recency_factor(now - timedelta(days=6)) == 1.0

    def test_one_week(self):
        """7-14 days → 0.95."""
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        assert _recency_factor(now - timedelta(days=10)) == 0.95

    def test_two_weeks(self):
        """14-30 days → 0.9."""
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        assert _recency_factor(now - timedelta(days=20)) == 0.9

    def test_one_month(self):
        """30-60 days → 0.75."""
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        assert _recency_factor(now - timedelta(days=45)) == 0.75

    def test_two_months(self):
        """60-90 days → 0.6."""
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        assert _recency_factor(now - timedelta(days=75)) == 0.6

    def test_three_months_plus(self):
        """90+ days → 0.4."""
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        assert _recency_factor(now - timedelta(days=120)) == 0.4
        assert _recency_factor(now - timedelta(days=365)) == 0.4

    def test_timezone_aware_input(self):
        """Should handle timezone-aware datetimes."""
        now = datetime.now(timezone.utc)
        assert _recency_factor(now - timedelta(days=1)) == 1.0


class TestHealthStatus:
    """Tests for _health_status derivation."""

    def test_no_reliable_data(self):
        assert _health_status(0.9, has_reliable=False) == "unknown"

    def test_healthy(self):
        assert _health_status(0.85, has_reliable=True) == "healthy"
        assert _health_status(0.8, has_reliable=True) == "healthy"
        assert _health_status(1.0, has_reliable=True) == "healthy"

    def test_aging(self):
        assert _health_status(0.7, has_reliable=True) == "aging"
        assert _health_status(0.6, has_reliable=True) == "aging"

    def test_stale(self):
        assert _health_status(0.5, has_reliable=True) == "stale"
        assert _health_status(0.0, has_reliable=True) == "stale"


class TestUpdateStepReliability:
    """Tests for update_step_reliability service function."""

    @pytest.mark.asyncio
    async def test_create_new_reliability(
        self,
        db: AsyncSession,
        async_client: AsyncClient,
        auth_headers: dict,
        workflow: ProcessRecordingSession,
    ):
        """First check creates a new StepReliability record."""
        # We need a WorkflowStepCheck first (the function queries recent checks)
        check = WorkflowStepCheck(
            id=gen_suffix(16),
            workflow_id=workflow.id,
            step_number=1,
            check_source="test",
            element_found=True,
            status="passed",
        )
        db.add(check)
        await db.flush()

        rel = await update_step_reliability(
            db, workflow.id, 1, found=True, method="selector"
        )
        assert rel.total_checks == 1
        assert rel.found_count == 1
        assert rel.reliability == 1.0
        assert rel.last_method == "selector"

    @pytest.mark.asyncio
    async def test_reliability_ratio(
        self,
        db: AsyncSession,
        async_client: AsyncClient,
        auth_headers: dict,
        workflow: ProcessRecordingSession,
    ):
        """Reliability is found_count / total_checks."""
        # Add step checks to DB
        for i, found in enumerate([True, True, False]):
            check = WorkflowStepCheck(
                id=gen_suffix(16),
                workflow_id=workflow.id,
                step_number=1,
                check_source="test",
                element_found=found,
                status="passed" if found else "failed",
                checked_at=datetime.now(timezone.utc) + timedelta(seconds=i),
            )
            db.add(check)
            await db.flush()

            await update_step_reliability(
                db, workflow.id, 1, found=found, method="selector"
            )

        from sqlalchemy import select

        result = await db.execute(
            select(StepReliability).where(
                StepReliability.workflow_id == workflow.id,
                StepReliability.step_number == 1,
            )
        )
        rel = result.scalar_one()
        assert rel.total_checks == 3
        assert rel.found_count == 2
        assert abs(rel.reliability - 2 / 3) < 0.01

    @pytest.mark.asyncio
    async def test_is_reliable_threshold(
        self,
        db: AsyncSession,
        async_client: AsyncClient,
        auth_headers: dict,
        workflow: ProcessRecordingSession,
    ):
        """is_reliable requires reliability >= 0.3 AND total_checks >= 5."""
        # Add 5 checks (4 found, 1 not)
        for i in range(5):
            found = i < 4
            check = WorkflowStepCheck(
                id=gen_suffix(16),
                workflow_id=workflow.id,
                step_number=1,
                check_source="test",
                element_found=found,
                status="passed" if found else "failed",
                checked_at=datetime.now(timezone.utc) + timedelta(seconds=i),
            )
            db.add(check)
            await db.flush()
            rel = await update_step_reliability(
                db, workflow.id, 1, found=found, method="selector"
            )

        assert rel.is_reliable is True
        assert rel.total_checks == 5

    @pytest.mark.asyncio
    async def test_not_reliable_low_checks(
        self,
        db: AsyncSession,
        async_client: AsyncClient,
        auth_headers: dict,
        workflow: ProcessRecordingSession,
    ):
        """< 5 checks → not reliable even with 100% found."""
        for i in range(3):
            check = WorkflowStepCheck(
                id=gen_suffix(16),
                workflow_id=workflow.id,
                step_number=1,
                check_source="test",
                element_found=True,
                status="passed",
                checked_at=datetime.now(timezone.utc) + timedelta(seconds=i),
            )
            db.add(check)
            await db.flush()
            rel = await update_step_reliability(
                db, workflow.id, 1, found=True, method="selector"
            )

        assert rel.is_reliable is False


class TestRecalculateHealthScore:
    """Tests for recalculate_health_score."""

    @pytest.mark.asyncio
    async def test_no_reliable_steps(
        self,
        db: AsyncSession,
        async_client: AsyncClient,
        auth_headers: dict,
        workflow: ProcessRecordingSession,
    ):
        """No reliable steps → unknown status."""
        score, status = await recalculate_health_score(db, workflow.id)
        assert status == "unknown"

    @pytest.mark.asyncio
    async def test_health_formula(
        self,
        db: AsyncSession,
        async_client: AsyncClient,
        auth_headers: dict,
        workflow: ProcessRecordingSession,
    ):
        """Health score = step_health * recency_factor."""
        # Set last_verified_at to now (recency = 1.0)
        workflow.last_verified_at = datetime.now(timezone.utc).replace(tzinfo=None)
        await db.flush()

        # Create reliable steps: 2 recently found, 1 not
        for step_num in range(1, 4):
            rel = StepReliability(
                workflow_id=workflow.id,
                step_number=step_num,
                total_checks=10,
                found_count=8,
                reliability=0.8,
                is_reliable=True,
                recent_checks=5,
                recent_found=5 if step_num <= 2 else 0,
            )
            db.add(rel)
        await db.flush()

        score, status = await recalculate_health_score(db, workflow.id)
        # step_health = 2/3, recency = 1.0 → score ≈ 0.6667
        assert abs(score - round(2 / 3, 4)) < 0.01
        assert status == "aging"


class TestMaybeCreateAlerts:
    """Tests for maybe_create_alerts."""

    @pytest.mark.asyncio
    async def test_no_failing_steps(
        self,
        db: AsyncSession,
        async_client: AsyncClient,
        auth_headers: dict,
        workflow: ProcessRecordingSession,
        test_project: dict,
    ):
        """No alerts when no steps are failing."""
        alerts = await maybe_create_alerts(db, workflow.id, test_project["id"])
        assert alerts == []

    @pytest.mark.asyncio
    async def test_creates_alert_on_failure(
        self,
        db: AsyncSession,
        async_client: AsyncClient,
        auth_headers: dict,
        workflow: ProcessRecordingSession,
        test_project: dict,
    ):
        """Creates an alert when reliable steps have consecutive failures."""
        # Create a reliable step with recent failures
        rel = StepReliability(
            workflow_id=workflow.id,
            step_number=1,
            total_checks=10,
            found_count=7,
            reliability=0.7,
            is_reliable=True,
            recent_checks=5,
            recent_found=0,  # All recent checks failed
        )
        db.add(rel)
        await db.flush()

        alerts = await maybe_create_alerts(db, workflow.id, test_project["id"])
        assert len(alerts) == 1
        assert alerts[0].alert_type == "element_missing"
        assert alerts[0].severity == "warning"

    @pytest.mark.asyncio
    async def test_critical_severity_multiple_failures(
        self,
        db: AsyncSession,
        async_client: AsyncClient,
        auth_headers: dict,
        workflow: ProcessRecordingSession,
        test_project: dict,
    ):
        """Severity is critical when >= 3 steps are failing."""
        for step_num in range(1, 4):
            rel = StepReliability(
                workflow_id=workflow.id,
                step_number=step_num,
                total_checks=10,
                found_count=7,
                reliability=0.7,
                is_reliable=True,
                recent_checks=5,
                recent_found=0,
            )
            db.add(rel)
        await db.flush()

        alerts = await maybe_create_alerts(db, workflow.id, test_project["id"])
        assert len(alerts) == 1
        assert alerts[0].severity == "critical"

    @pytest.mark.asyncio
    async def test_alert_dedup(
        self,
        db: AsyncSession,
        async_client: AsyncClient,
        auth_headers: dict,
        workflow: ProcessRecordingSession,
        test_project: dict,
    ):
        """Doesn't create duplicate alerts for the same workflow."""
        # Create existing unresolved alert
        existing = StalenessAlert(
            id=gen_suffix(16),
            project_id=test_project["id"],
            workflow_id=workflow.id,
            alert_type="element_missing",
            severity="warning",
            title="Existing alert",
        )
        db.add(existing)

        # Create a failing reliable step
        rel = StepReliability(
            workflow_id=workflow.id,
            step_number=1,
            total_checks=10,
            found_count=7,
            reliability=0.7,
            is_reliable=True,
            recent_checks=5,
            recent_found=0,
        )
        db.add(rel)
        await db.flush()

        alerts = await maybe_create_alerts(db, workflow.id, test_project["id"])
        assert len(alerts) == 0  # Deduped — existing alert already present

    @pytest.mark.asyncio
    async def test_alert_created_after_resolved(
        self,
        db: AsyncSession,
        async_client: AsyncClient,
        auth_headers: dict,
        workflow: ProcessRecordingSession,
        test_project: dict,
    ):
        """A new alert can be created if the old one was resolved."""
        resolved = StalenessAlert(
            id=gen_suffix(16),
            project_id=test_project["id"],
            workflow_id=workflow.id,
            alert_type="element_missing",
            severity="warning",
            title="Resolved alert",
            resolved=True,
        )
        db.add(resolved)

        rel = StepReliability(
            workflow_id=workflow.id,
            step_number=1,
            total_checks=10,
            found_count=7,
            reliability=0.7,
            is_reliable=True,
            recent_checks=5,
            recent_found=0,
        )
        db.add(rel)
        await db.flush()

        alerts = await maybe_create_alerts(db, workflow.id, test_project["id"])
        assert len(alerts) == 1  # New alert created since old was resolved


# ═══════════════════════════════════════════════════════════════════════════════
# Integration: Full Flow
# ═══════════════════════════════════════════════════════════════════════════════


class TestIntegrationFlow:
    """End-to-end flow: ingest → check health → run verification → alerts."""

    @pytest.mark.asyncio
    async def test_full_staleness_flow(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        test_project: dict,
        workflow: ProcessRecordingSession,
        db: AsyncSession,
    ):
        """Full flow: ingest health checks, get health, check project health."""
        # 1. Ingest health check — all passing
        resp = await _ingest_health_check(
            async_client, auth_headers, workflow.id
        )
        assert resp.status_code == 200

        # 2. Get workflow health
        resp = await async_client.get(
            f"/api/v1/workflows/{workflow.id}/health",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["health_score"] is not None
        assert len(data["steps"]) == 3

        # 3. Get project health
        resp = await async_client.get(
            f"/api/v1/projects/{test_project['id']}/health",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_workflows"] >= 1

        # 4. Trigger verification run
        resp = await async_client.post(
            "/api/v1/verification/run",
            json={"workflow_ids": [workflow.id]},
            headers=auth_headers,
        )
        assert resp.status_code == 202
        job_id = resp.json()["job_id"]

        # 5. Check job status
        resp = await async_client.get(
            f"/api/v1/verification/jobs/{job_id}",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "queued"

        # 6. Cancel job
        resp = await async_client.post(
            f"/api/v1/verification/jobs/{job_id}/cancel",
            headers=auth_headers,
        )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_repeated_ingestion_builds_reliability(
        self,
        async_client: AsyncClient,
        auth_headers: dict,
        workflow: ProcessRecordingSession,
        db: AsyncSession,
    ):
        """Multiple ingestions build up step reliability over time."""
        # Ingest 6 times (past the is_reliable threshold of 5)
        for _ in range(6):
            resp = await _ingest_health_check(
                async_client, auth_headers, workflow.id
            )
            assert resp.status_code == 200

        # Check reliability records
        from sqlalchemy import select

        result = await db.execute(
            select(StepReliability).where(
                StepReliability.workflow_id == workflow.id
            )
        )
        rels = result.scalars().all()
        for r in rels:
            assert r.total_checks == 6
            assert r.found_count == 6
            assert r.reliability == 1.0
            assert r.is_reliable is True
