"""
API-level tests for staleness detection endpoints.

Service-level business logic tests are in test_staleness_service.py.
"""

import pytest
import pytest_asyncio
from datetime import datetime, timezone
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ProcessRecordingSession, ProcessRecordingStep
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
) -> ProcessRecordingSession:
    """Create a workflow with steps directly in the DB."""
    wf_id = gen_suffix(16)
    wf = ProcessRecordingSession(
        id=wf_id,
        user_id=user_id,
        project_id=project_id,
        client_name="TestRecorder",
        status="completed",
        name=name,
    )
    db.add(wf)

    for i in range(1, num_steps + 1):
        step = ProcessRecordingStep(
            id=gen_suffix(16),
            session_id=wf_id,
            step_number=i,
            step_type="click",
            timestamp=datetime.now(timezone.utc).replace(tzinfo=None),
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
):
    """Post a health check and return the response."""
    if steps is None:
        steps = [
            {"stepNumber": 1, "elementFound": True, "finderMethod": "selector", "finderConfidence": 0.95},
            {"stepNumber": 2, "elementFound": True, "finderMethod": "testid", "finderConfidence": 0.99},
            {"stepNumber": 3, "elementFound": True, "finderMethod": "role+text", "finderConfidence": 0.8},
        ]
    return await client.post(
        f"/api/v1/workflows/{workflow_id}/health-check",
        json={"steps": steps, "source": source},
        headers=headers,
    )


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
# POST /workflows/{id}/health-check — Ingestion
# ═══════════════════════════════════════════════════════════════════════════════


class TestHealthCheckIngestion:

    @pytest.mark.asyncio
    async def test_valid_multi_step_ingestion(
        self, async_client, auth_headers, workflow,
    ):
        resp = await _ingest_health_check(async_client, auth_headers, workflow.id)
        assert resp.status_code == 200
        data = resp.json()
        assert "health_score" in data
        assert "health_status" in data
        assert isinstance(data["health_score"], float)
        assert data["health_status"] in ("healthy", "aging", "stale", "unknown")

    @pytest.mark.asyncio
    async def test_ingestion_with_failures(
        self, async_client, auth_headers, workflow,
    ):
        steps = [
            {"stepNumber": 1, "elementFound": True, "finderMethod": "selector", "finderConfidence": 0.95},
            {"stepNumber": 2, "elementFound": False, "finderMethod": "testid", "finderConfidence": 0.0},
            {"stepNumber": 3, "elementFound": False, "finderMethod": "role+text", "finderConfidence": 0.0},
        ]
        resp = await _ingest_health_check(async_client, auth_headers, workflow.id, steps=steps)
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_ingestion_with_url_check(
        self, async_client, auth_headers, workflow,
    ):
        steps = [{
            "stepNumber": 1, "elementFound": True, "finderMethod": "selector",
            "finderConfidence": 0.9, "expectedUrl": "https://example.com/page",
            "actualUrl": "https://example.com/page", "urlMatched": True,
        }]
        resp = await _ingest_health_check(async_client, auth_headers, workflow.id, steps=steps)
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_ingestion_workflow_not_found(self, async_client, auth_headers):
        resp = await _ingest_health_check(async_client, auth_headers, "nonexistent12345")
        assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
# GET /workflows/{id}/health — Per-Workflow Health
# ═══════════════════════════════════════════════════════════════════════════════


class TestWorkflowHealth:

    @pytest.mark.asyncio
    async def test_health_unknown_no_checks(self, async_client, auth_headers, workflow):
        resp = await async_client.get(
            f"/api/v1/workflows/{workflow.id}/health", headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["health_status"] == "unknown"
        assert data["health_score"] is None

    @pytest.mark.asyncio
    async def test_health_after_ingestion(self, async_client, auth_headers, workflow):
        await _ingest_health_check(async_client, auth_headers, workflow.id)
        resp = await async_client.get(
            f"/api/v1/workflows/{workflow.id}/health", headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["health_score"] is not None
        assert data["last_verified_at"] is not None
        assert data["last_verified_source"] == "guide_replay"
        assert len(data["steps"]) == 3

    @pytest.mark.asyncio
    async def test_health_step_details(self, async_client, auth_headers, workflow):
        await _ingest_health_check(async_client, auth_headers, workflow.id)
        resp = await async_client.get(
            f"/api/v1/workflows/{workflow.id}/health", headers=auth_headers,
        )
        step = resp.json()["steps"][0]
        for key in ("step_number", "status", "reliability", "is_reliable", "last_method", "last_checked"):
            assert key in step

    @pytest.mark.asyncio
    async def test_health_404(self, async_client, auth_headers):
        resp = await async_client.get(
            "/api/v1/workflows/nonexistent12345/health", headers=auth_headers,
        )
        assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
# GET /projects/{id}/health — Project Summary
# ═══════════════════════════════════════════════════════════════════════════════


class TestProjectHealth:

    @pytest.mark.asyncio
    async def test_empty_project_health(self, async_client, auth_headers, test_project):
        resp = await async_client.get(
            f"/api/v1/projects/{test_project['id']}/health", headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_workflows"] == 0

    @pytest.mark.asyncio
    async def test_project_health_with_workflows(self, async_client, auth_headers, test_project):
        await _create_workflow(async_client, auth_headers, test_project["id"], name="WF1")
        await _create_workflow(async_client, auth_headers, test_project["id"], name="WF2")
        resp = await async_client.get(
            f"/api/v1/projects/{test_project['id']}/health", headers=auth_headers,
        )
        data = resp.json()
        assert data["total_workflows"] == 2
        assert data["unknown"] == 2

    @pytest.mark.asyncio
    async def test_project_health_access_control(self, async_client, second_auth_headers, test_project):
        resp = await async_client.get(
            f"/api/v1/projects/{test_project['id']}/health", headers=second_auth_headers,
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_project_health_not_found(self, async_client, auth_headers):
        resp = await async_client.get(
            "/api/v1/projects/nonexistent12345/health", headers=auth_headers,
        )
        assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
# GET/PUT /projects/{id}/verification-config
# ═══════════════════════════════════════════════════════════════════════════════


class TestVerificationConfig:

    @pytest.mark.asyncio
    async def test_get_default_config(self, async_client, auth_headers, test_project):
        resp = await async_client.get(
            f"/api/v1/projects/{test_project['id']}/verification-config", headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["enabled"] is False
        assert data["has_credentials"] is False

    @pytest.mark.asyncio
    async def test_create_config(self, async_client, auth_headers, test_project):
        resp = await async_client.put(
            f"/api/v1/projects/{test_project['id']}/verification-config",
            json={"enabled": True, "login_url": "https://example.com/login", "schedule": "daily", "schedule_hour": 6},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["enabled"] is True
        assert data["schedule"] == "daily"

    @pytest.mark.asyncio
    async def test_update_config(self, async_client, auth_headers, test_project):
        await async_client.put(
            f"/api/v1/projects/{test_project['id']}/verification-config",
            json={"enabled": True, "schedule": "daily"}, headers=auth_headers,
        )
        resp = await async_client.put(
            f"/api/v1/projects/{test_project['id']}/verification-config",
            json={"schedule": "monthly", "llm_enabled": True}, headers=auth_headers,
        )
        data = resp.json()
        assert data["enabled"] is True
        assert data["schedule"] == "monthly"

    @pytest.mark.asyncio
    async def test_config_access_control(self, async_client, second_auth_headers, test_project):
        resp = await async_client.get(
            f"/api/v1/projects/{test_project['id']}/verification-config", headers=second_auth_headers,
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_config_partial_update(self, async_client, auth_headers, test_project):
        await async_client.put(
            f"/api/v1/projects/{test_project['id']}/verification-config",
            json={"enabled": True, "login_url": "https://example.com/login", "notify_email": True, "notify_in_app": True},
            headers=auth_headers,
        )
        resp = await async_client.put(
            f"/api/v1/projects/{test_project['id']}/verification-config",
            json={"notify_email": False}, headers=auth_headers,
        )
        data = resp.json()
        assert data["notify_email"] is False
        assert data["notify_in_app"] is True
        assert data["enabled"] is True


# ═══════════════════════════════════════════════════════════════════════════════
# POST /verification/run
# ═══════════════════════════════════════════════════════════════════════════════


class TestVerificationRun:

    @pytest.mark.asyncio
    async def test_run_with_workflow_ids(self, async_client, auth_headers, workflow):
        resp = await async_client.post(
            "/api/v1/verification/run",
            json={"workflow_ids": [workflow.id]}, headers=auth_headers,
        )
        assert resp.status_code == 202
        data = resp.json()
        assert "job_id" in data
        assert data["workflows_queued"] == 1

    @pytest.mark.asyncio
    async def test_run_with_project_id(self, async_client, auth_headers, test_project):
        await _create_workflow(async_client, auth_headers, test_project["id"], name="WF1")
        await _create_workflow(async_client, auth_headers, test_project["id"], name="WF2")
        resp = await async_client.post(
            "/api/v1/verification/run",
            json={"project_id": test_project["id"]}, headers=auth_headers,
        )
        assert resp.status_code == 202
        assert resp.json()["workflows_queued"] == 2

    @pytest.mark.asyncio
    async def test_run_no_ids_or_project(self, async_client, auth_headers):
        resp = await async_client.post(
            "/api/v1/verification/run", json={}, headers=auth_headers,
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_run_nonexistent_workflow(self, async_client, auth_headers):
        resp = await async_client.post(
            "/api/v1/verification/run",
            json={"workflow_ids": ["nonexistent12345"]}, headers=auth_headers,
        )
        assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
# GET /verification/jobs/{id} & POST cancel
# ═══════════════════════════════════════════════════════════════════════════════


class TestJobStatus:

    @pytest.mark.asyncio
    async def test_get_job_status(self, async_client, auth_headers, workflow):
        run_resp = await async_client.post(
            "/api/v1/verification/run",
            json={"workflow_ids": [workflow.id]}, headers=auth_headers,
        )
        job_id = run_resp.json()["job_id"]
        resp = await async_client.get(f"/api/v1/verification/jobs/{job_id}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["status"] == "queued"

    @pytest.mark.asyncio
    async def test_get_job_not_found(self, async_client, auth_headers):
        resp = await async_client.get("/api/v1/verification/jobs/nonexistent12345", headers=auth_headers)
        assert resp.status_code == 404


class TestCancelJob:

    @pytest.mark.asyncio
    async def test_cancel_queued_job(self, async_client, auth_headers, workflow):
        run_resp = await async_client.post(
            "/api/v1/verification/run",
            json={"workflow_ids": [workflow.id]}, headers=auth_headers,
        )
        job_id = run_resp.json()["job_id"]
        resp = await async_client.post(f"/api/v1/verification/jobs/{job_id}/cancel", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["status"] == "cancelled"

    @pytest.mark.asyncio
    async def test_cancel_already_cancelled(self, async_client, auth_headers, workflow):
        run_resp = await async_client.post(
            "/api/v1/verification/run",
            json={"workflow_ids": [workflow.id]}, headers=auth_headers,
        )
        job_id = run_resp.json()["job_id"]
        await async_client.post(f"/api/v1/verification/jobs/{job_id}/cancel", headers=auth_headers)
        resp = await async_client.post(f"/api/v1/verification/jobs/{job_id}/cancel", headers=auth_headers)
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_cancel_not_found(self, async_client, auth_headers):
        resp = await async_client.post("/api/v1/verification/jobs/nonexistent12345/cancel", headers=auth_headers)
        assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
# Staleness Alerts — API only
# ═══════════════════════════════════════════════════════════════════════════════


class TestStalenessAlerts:

    @pytest.mark.asyncio
    async def test_list_empty_alerts(self, async_client, auth_headers, test_project):
        resp = await async_client.get(
            f"/api/v1/projects/{test_project['id']}/staleness-alerts", headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json() == []


class TestAlertActions:

    @pytest.mark.asyncio
    async def test_resolve_not_found(self, async_client, auth_headers):
        resp = await async_client.post("/api/v1/staleness-alerts/nonexistent12345/resolve", headers=auth_headers)
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_dismiss_not_found(self, async_client, auth_headers):
        resp = await async_client.post("/api/v1/staleness-alerts/nonexistent12345/dismiss", headers=auth_headers)
        assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
# Business Logic — Pure Functions (no DB)
# ═══════════════════════════════════════════════════════════════════════════════

from app.services.staleness import _recency_factor, _health_status


class TestRecencyFactor:

    def test_never_verified(self):
        assert _recency_factor(None) == 0.5

    def test_just_verified(self):
        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        assert _recency_factor(now - timedelta(days=1)) == 1.0
        assert _recency_factor(now - timedelta(hours=1)) == 1.0
        assert _recency_factor(now - timedelta(days=6)) == 1.0

    def test_one_week(self):
        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        assert _recency_factor(now - timedelta(days=10)) == 0.95

    def test_two_weeks(self):
        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        assert _recency_factor(now - timedelta(days=20)) == 0.9

    def test_one_month(self):
        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        assert _recency_factor(now - timedelta(days=45)) == 0.75

    def test_two_months(self):
        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        assert _recency_factor(now - timedelta(days=75)) == 0.6

    def test_three_months_plus(self):
        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        assert _recency_factor(now - timedelta(days=120)) == 0.4
        assert _recency_factor(now - timedelta(days=365)) == 0.4

    def test_timezone_aware_input(self):
        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone.utc)
        assert _recency_factor(now - timedelta(days=1)) == 1.0


class TestHealthStatus:

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
