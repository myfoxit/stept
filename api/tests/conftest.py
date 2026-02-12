"""
Test fixtures for the Ondoki backend test suite.

Best-practice approach:
  1. Tests run inside Docker (same container as the app)
  2. Connect to a dedicated 'ondoki_test' database (created by Makefile)
  3. Use alembic migrations to create schema (matches production exactly)
  4. Truncate between tests for isolation
  5. Monkey-patch app.database BEFORE importing app code

Run with:
  make test-backend         (from host — runs inside Docker)
  
Or manually inside the container:
  DATABASE_URL_TEST=postgresql+asyncpg://postgres:postgres@db:5432/ondoki_test \
    python -m pytest tests/ -v
"""

import os
import sys
from unittest.mock import patch, AsyncMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

# ---------------------------------------------------------------------------
# 1. Environment — must be set BEFORE any app imports
# ---------------------------------------------------------------------------
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

_TEST_DB_URL = os.environ.get(
    "DATABASE_URL_TEST",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/ondoki_test",
)

# Force DATABASE_URL to test DB — must happen before app.database import
# This overrides any value set by Docker or .env files
os.environ["DATABASE_URL"] = _TEST_DB_URL
os.environ.setdefault("JWT_SECRET", "test-secret-for-ci")
os.environ.setdefault("ONDOKI_ENCRYPTION_KEY", "dGVzdC1rZXktMzItYnl0ZXMtZm9yLWZlcm5ldC14eA==")

# Prevent dotenv from loading any .env file that might override DATABASE_URL
os.environ["DOTENV_LOADED"] = "1"

# ---------------------------------------------------------------------------
# 2. Monkey-patch app.database BEFORE importing the app
#
#    app.database creates an engine at import time. We replace it with a
#    NullPool engine pointing at the test DB. NullPool = no cached connections
#    = no event-loop mismatch issues with asyncpg.
# ---------------------------------------------------------------------------
import app.database as _db_mod  # noqa: E402 — must be after env setup

# Verify the engine URL (app.database may have read the wrong DATABASE_URL)
_actual_url = str(_db_mod.engine.url)
if "ondoki_test" not in _actual_url:
    # app.database grabbed the production URL — we MUST replace the engine
    import logging
    logging.getLogger(__name__).warning(
        f"app.database.engine points to '{_actual_url}', expected ondoki_test. "
        "Replacing with test engine."
    )

_test_engine = create_async_engine(
    _TEST_DB_URL,
    echo=False,
    poolclass=NullPool,
)
_test_session_factory = async_sessionmaker(
    bind=_test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)

# Patch BEFORE any router/main imports
_db_mod.engine = _test_engine
_db_mod.AsyncSessionLocal = _test_session_factory

# Now safe to import models and app code
from app.database import Base  # noqa: E402
import app.models  # noqa: E402,F401 — registers all models with Base.metadata

# Sanity check at import time
print(f"[conftest] Test DB URL: {_TEST_DB_URL}")
print(f"[conftest] Engine URL:  {_db_mod.engine.url}")
print(f"[conftest] Tables:      {len(Base.metadata.sorted_tables)}")


# ---------------------------------------------------------------------------
# 3. Session-scoped: create schema once using metadata.create_all
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(scope="session", autouse=True)
async def _setup_db():
    """Drop and recreate all tables once for the test session."""
    async with _test_engine.begin() as conn:
        # Ensure pgvector extension exists (needed for Embedding model)
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await _test_engine.dispose()


# ---------------------------------------------------------------------------
# 4. Function-scoped: truncate tables between tests
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(scope="function", autouse=True)
async def _clean_tables():
    """Truncate all tables before each test for full isolation."""
    async with _test_engine.begin() as conn:
        table_names = ", ".join(
            f'"{t.name}"' for t in reversed(Base.metadata.sorted_tables)
        )
        if table_names:
            await conn.execute(text(f"TRUNCATE TABLE {table_names} CASCADE"))
    yield


# ---------------------------------------------------------------------------
# 5. DB session fixture (for tests that need direct DB access)
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture()
async def db():
    """Provide a fresh AsyncSession per test."""
    async with _test_session_factory() as session:
        yield session


# ---------------------------------------------------------------------------
# 6. App client — wired to FastAPI via ASGI transport (no real HTTP)
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture()
async def async_client():
    """HTTPX AsyncClient talking to the FastAPI app in-process."""
    from main import app  # noqa: E402 — import after patching

    with (
        patch("app.emails._send", return_value=None),
        patch("app.crud.auth.send_verification_email", return_value=None),
        patch("app.crud.auth.send_reset_email", return_value=None),
        patch("app.routers.auth.manager.startup", new_callable=AsyncMock),
        patch("app.routers.auth.manager.send_personal_message", new_callable=AsyncMock),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            yield client


# ---------------------------------------------------------------------------
# 7. Auth helpers
# ---------------------------------------------------------------------------

TEST_USER_EMAIL = "test@example.com"
TEST_USER_PASSWORD = "Test1234!"
TEST_USER_NAME = "testuser"


@pytest_asyncio.fixture()
async def auth_headers(async_client: AsyncClient) -> dict:
    """Register + login a test user, return auth headers with session cookie."""
    resp = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD,
            "name": TEST_USER_NAME,
        },
    )
    assert resp.status_code == 200, f"Register failed: {resp.text}"
    cookie = resp.cookies.get("session_ondoki")
    assert cookie, "No session cookie returned on register"
    return {"Cookie": f"session_ondoki={cookie}"}


@pytest_asyncio.fixture()
async def second_auth_headers(async_client: AsyncClient) -> dict:
    """Register a second user for cross-user access tests."""
    resp = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": "other@example.com",
            "password": "Other1234!",
            "name": "otheruser",
        },
    )
    assert resp.status_code == 200, f"Register second user failed: {resp.text}"
    cookie = resp.cookies.get("session_ondoki")
    assert cookie
    return {"Cookie": f"session_ondoki={cookie}"}


# ---------------------------------------------------------------------------
# 8. CRUD helpers
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture()
async def test_user_id(async_client: AsyncClient, auth_headers: dict) -> str:
    """Return the current user's ID."""
    resp = await async_client.get("/api/v1/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    return resp.json()["id"]


@pytest_asyncio.fixture()
async def test_project(async_client: AsyncClient, auth_headers: dict, test_user_id: str) -> dict:
    """Create a project and return its JSON."""
    resp = await async_client.post(
        "/api/v1/projects/",
        json={"name": "TestProject", "user_id": test_user_id},
        headers=auth_headers,
    )
    assert resp.status_code == 200, f"Create project failed: {resp.text}"
    return resp.json()


@pytest_asyncio.fixture()
async def test_folder(
    async_client: AsyncClient,
    auth_headers: dict,
    test_project: dict,
) -> dict:
    """Create a folder inside the test project."""
    resp = await async_client.post(
        "/api/v1/folders/",
        json={
            "name": "TestFolder",
            "project_id": test_project["id"],
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201, f"Create folder failed: {resp.text}"
    return resp.json()
