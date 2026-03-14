"""
Service-level tests for staleness business logic.

These tests use their own isolated DB sessions and never import the FastAPI app,
avoiding background task interference from the app lifespan.
"""

import pytest
import pytest_asyncio
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import text
import os

from app.models import (
    Base,
    ProcessRecordingSession,
    ProcessRecordingStep,
    WorkflowStepCheck,
    StepReliability,
    StalenessAlert,
    User,
    Project,
)
from app.services.staleness import (
    _recency_factor,
    _health_status,
    update_step_reliability,
    recalculate_health_score,
    maybe_create_alerts,
)
from app.utils import gen_suffix


# ─────────────────────────── Isolated DB Setup ───────────────────────────────

_TEST_DB_URL = os.environ.get(
    "DATABASE_URL_TEST",
    os.environ.get(
        "TEST_DATABASE_URL",
        "postgresql+asyncpg://postgres:postgres@localhost:5432/stept_test",
    ),
)

_svc_engine = create_async_engine(_TEST_DB_URL, echo=False, pool_pre_ping=True)
_svc_session_factory = async_sessionmaker(
    bind=_svc_engine, expire_on_commit=False, class_=AsyncSession,
)


@pytest_asyncio.fixture()
async def svc_db():
    """Provide a fully isolated AsyncSession for service tests.
    Tables are truncated before each test."""
    async with _svc_engine.begin() as conn:
        result = await conn.execute(text(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
        ))
        existing = {row[0] for row in result.fetchall()}
        table_names = ", ".join(
            f'"{t.name}"' for t in reversed(Base.metadata.sorted_tables)
            if t.name in existing
        )
        if table_names:
            await conn.execute(text(f"TRUNCATE TABLE {table_names} CASCADE"))

    async with _svc_session_factory() as session:
        yield session

    await _svc_engine.dispose()


async def _make_workflow(db: AsyncSession, num_steps: int = 3) -> ProcessRecordingSession:
    """Create user + project + workflow with steps directly in DB."""
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

    user_id = gen_suffix(16)
    user = User(
        id=user_id,
        name="svc_test_user",
        email=f"svc_{user_id}@test.com",
        normalized_email=f"svc_{user_id}@test.com",
        hashed_password=pwd_context.hash("Test1234!"),
        is_verified=True,
    )
    db.add(user)

    project_id = gen_suffix(16)
    project = Project(
        id=project_id,
        name="SvcTestProject",
        owner_id=user_id,
        user_id=user_id,
    )
    db.add(project)
    await db.flush()

    wf_id = gen_suffix(16)
    wf = ProcessRecordingSession(
        id=wf_id,
        user_id=user_id,
        project_id=project_id,
        client_name="TestRecorder",
        status="completed",
        name="Test Workflow",
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


# ═══════════════════════════════════════════════════════════════════════════════
# Pure functions (no DB needed)
# ═══════════════════════════════════════════════════════════════════════════════


class TestRecencyFactor:
    """Tests for the _recency_factor decay curve."""

    def test_never_verified(self):
        assert _recency_factor(None) == 0.5

    def test_just_verified(self):
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        assert _recency_factor(now - timedelta(days=1)) == 1.0
        assert _recency_factor(now - timedelta(hours=1)) == 1.0
        assert _recency_factor(now - timedelta(days=6)) == 1.0

    def test_one_week(self):
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        assert _recency_factor(now - timedelta(days=10)) == 0.95

    def test_two_weeks(self):
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        assert _recency_factor(now - timedelta(days=20)) == 0.9

    def test_one_month(self):
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        assert _recency_factor(now - timedelta(days=45)) == 0.75

    def test_two_months(self):
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        assert _recency_factor(now - timedelta(days=75)) == 0.6

    def test_three_months_plus(self):
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        assert _recency_factor(now - timedelta(days=120)) == 0.4
        assert _recency_factor(now - timedelta(days=365)) == 0.4

    def test_timezone_aware_input(self):
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


# ═══════════════════════════════════════════════════════════════════════════════
# Service functions with DB (isolated session)
# ═══════════════════════════════════════════════════════════════════════════════


class TestUpdateStepReliability:
    """Tests for update_step_reliability."""

    @pytest.mark.asyncio
    async def test_create_new_reliability(self, svc_db: AsyncSession):
        wf = await _make_workflow(svc_db)

        check = WorkflowStepCheck(
            id=gen_suffix(16),
            workflow_id=wf.id,
            step_number=1,
            check_source="test",
            element_found=True,
            status="passed",
        )
        svc_db.add(check)
        await svc_db.flush()

        rel = await update_step_reliability(svc_db, wf.id, 1, found=True, method="selector")
        assert rel.total_checks == 1
        assert rel.found_count == 1
        assert rel.reliability == 1.0
        assert rel.last_method == "selector"

    @pytest.mark.asyncio
    async def test_reliability_ratio(self, svc_db: AsyncSession):
        wf = await _make_workflow(svc_db)

        for i, found in enumerate([True, True, False]):
            check = WorkflowStepCheck(
                id=gen_suffix(16),
                workflow_id=wf.id,
                step_number=1,
                check_source="test",
                element_found=found,
                status="passed" if found else "failed",
                checked_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(seconds=i),
            )
            svc_db.add(check)
            await svc_db.flush()
            await update_step_reliability(svc_db, wf.id, 1, found=found, method="selector")

        from sqlalchemy import select
        result = await svc_db.execute(
            select(StepReliability).where(
                StepReliability.workflow_id == wf.id,
                StepReliability.step_number == 1,
            )
        )
        rel = result.scalar_one()
        assert rel.total_checks == 3
        assert rel.found_count == 2
        assert abs(rel.reliability - 2 / 3) < 0.01

    @pytest.mark.asyncio
    async def test_is_reliable_threshold(self, svc_db: AsyncSession):
        wf = await _make_workflow(svc_db)

        for i in range(5):
            found = i < 4
            check = WorkflowStepCheck(
                id=gen_suffix(16),
                workflow_id=wf.id,
                step_number=1,
                check_source="test",
                element_found=found,
                status="passed" if found else "failed",
                checked_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(seconds=i),
            )
            svc_db.add(check)
            await svc_db.flush()
            rel = await update_step_reliability(svc_db, wf.id, 1, found=found, method="selector")

        assert rel.is_reliable is True
        assert rel.total_checks == 5

    @pytest.mark.asyncio
    async def test_not_reliable_low_checks(self, svc_db: AsyncSession):
        wf = await _make_workflow(svc_db)

        for i in range(3):
            check = WorkflowStepCheck(
                id=gen_suffix(16),
                workflow_id=wf.id,
                step_number=1,
                check_source="test",
                element_found=True,
                status="passed",
                checked_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(seconds=i),
            )
            svc_db.add(check)
            await svc_db.flush()
            rel = await update_step_reliability(svc_db, wf.id, 1, found=True, method="selector")

        assert rel.is_reliable is False


class TestRecalculateHealthScore:
    """Tests for recalculate_health_score."""

    @pytest.mark.asyncio
    async def test_no_reliable_steps(self, svc_db: AsyncSession):
        wf = await _make_workflow(svc_db)
        score, status = await recalculate_health_score(svc_db, wf.id)
        assert status == "unknown"

    @pytest.mark.asyncio
    async def test_health_formula(self, svc_db: AsyncSession):
        wf = await _make_workflow(svc_db)
        wf.last_verified_at = datetime.now(timezone.utc).replace(tzinfo=None)
        await svc_db.flush()

        for step_num in range(1, 4):
            rel = StepReliability(
                workflow_id=wf.id,
                step_number=step_num,
                total_checks=10,
                found_count=8,
                reliability=0.8,
                is_reliable=True,
                recent_checks=5,
                recent_found=5 if step_num <= 2 else 0,
            )
            svc_db.add(rel)
        await svc_db.flush()

        score, status = await recalculate_health_score(svc_db, wf.id)
        assert abs(score - round(2 / 3, 4)) < 0.01
        assert status == "aging"


class TestMaybeCreateAlerts:
    """Tests for maybe_create_alerts."""

    @pytest.mark.asyncio
    async def test_no_failing_steps(self, svc_db: AsyncSession):
        wf = await _make_workflow(svc_db)
        alerts = await maybe_create_alerts(svc_db, wf.id, wf.project_id)
        assert alerts == []

    @pytest.mark.asyncio
    async def test_creates_alert_on_failure(self, svc_db: AsyncSession):
        wf = await _make_workflow(svc_db)
        rel = StepReliability(
            workflow_id=wf.id,
            step_number=1,
            total_checks=10,
            found_count=7,
            reliability=0.7,
            is_reliable=True,
            recent_checks=5,
            recent_found=0,
        )
        svc_db.add(rel)
        await svc_db.flush()

        alerts = await maybe_create_alerts(svc_db, wf.id, wf.project_id)
        assert len(alerts) == 1
        assert alerts[0].alert_type == "element_missing"
        assert alerts[0].severity == "warning"

    @pytest.mark.asyncio
    async def test_critical_severity_multiple_failures(self, svc_db: AsyncSession):
        wf = await _make_workflow(svc_db)
        for step_num in range(1, 4):
            rel = StepReliability(
                workflow_id=wf.id,
                step_number=step_num,
                total_checks=10,
                found_count=7,
                reliability=0.7,
                is_reliable=True,
                recent_checks=5,
                recent_found=0,
            )
            svc_db.add(rel)
        await svc_db.flush()

        alerts = await maybe_create_alerts(svc_db, wf.id, wf.project_id)
        assert len(alerts) == 1
        assert alerts[0].severity == "critical"

    @pytest.mark.asyncio
    async def test_alert_dedup(self, svc_db: AsyncSession):
        wf = await _make_workflow(svc_db)
        existing = StalenessAlert(
            id=gen_suffix(16),
            project_id=wf.project_id,
            workflow_id=wf.id,
            alert_type="element_missing",
            severity="warning",
            title="Existing alert",
        )
        svc_db.add(existing)

        rel = StepReliability(
            workflow_id=wf.id,
            step_number=1,
            total_checks=10,
            found_count=7,
            reliability=0.7,
            is_reliable=True,
            recent_checks=5,
            recent_found=0,
        )
        svc_db.add(rel)
        await svc_db.flush()

        alerts = await maybe_create_alerts(svc_db, wf.id, wf.project_id)
        assert len(alerts) == 0

    @pytest.mark.asyncio
    async def test_alert_created_after_resolved(self, svc_db: AsyncSession):
        wf = await _make_workflow(svc_db)
        resolved = StalenessAlert(
            id=gen_suffix(16),
            project_id=wf.project_id,
            workflow_id=wf.id,
            alert_type="element_missing",
            severity="warning",
            title="Resolved alert",
            resolved=True,
        )
        svc_db.add(resolved)

        rel = StepReliability(
            workflow_id=wf.id,
            step_number=1,
            total_checks=10,
            found_count=7,
            reliability=0.7,
            is_reliable=True,
            recent_checks=5,
            recent_found=0,
        )
        svc_db.add(rel)
        await svc_db.flush()

        alerts = await maybe_create_alerts(svc_db, wf.id, wf.project_id)
        assert len(alerts) == 1
