"""
Test fixtures for the Ondoki backend test suite.

Uses a real PostgreSQL test database (ondoki_test) on localhost.
Requires: docker compose up db (or any Postgres on localhost:5432).
Override with DATABASE_URL_TEST env var.
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
# Path setup — must happen before any app imports
# ---------------------------------------------------------------------------
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

_TEST_DB_URL = os.environ.get(
    "DATABASE_URL_TEST",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/ondoki_test",
)
os.environ["DATABASE_URL"] = _TEST_DB_URL
os.environ.setdefault("JWT_SECRET", "test-secret-for-ci")
os.environ.setdefault("ONDOKI_ENCRYPTION_KEY", "dGVzdC1rZXktMzItYnl0ZXMtZm9yLWZlcm5ldC14eA==")

# ---------------------------------------------------------------------------
# Monkey-patch app.database BEFORE importing main (which wires middleware)
# Use NullPool to avoid connection caching issues across event loops.
# ---------------------------------------------------------------------------
import app.database as _db_mod

# Replace the import-time engine with NullPool so each connection is fresh
# and not bound to the wrong event loop
_test_engine = create_async_engine(
    _TEST_DB_URL,
    echo=False,
    pool_pre_ping=True,
    poolclass=NullPool,
)
_test_session_factory = async_sessionmaker(
    bind=_test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)
_db_mod.engine = _test_engine
_db_mod.AsyncSessionLocal = _test_session_factory

from app.database import get_session, Base
from app.models import User, Project, Folder, Document, project_members, ProjectRole
import app.models  # noqa: F401


# ---------------------------------------------------------------------------
# Session-scoped: create tables once, drop at end
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(scope="session", autouse=True)
async def _setup_db():
    """Create all tables once for the entire test session."""
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await _test_engine.dispose()


# ---------------------------------------------------------------------------
# Function-scoped: truncate all tables between tests
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(scope="function", autouse=True)
async def _clean_tables():
    """Truncate all tables before each test for isolation."""
    async with _test_engine.begin() as conn:
        table_names = ", ".join(
            f'"{t.name}"' for t in reversed(Base.metadata.sorted_tables)
        )
        if table_names:
            await conn.execute(text(f"TRUNCATE TABLE {table_names} CASCADE"))
    yield


# ---------------------------------------------------------------------------
# DB session fixture
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(scope="function")
async def async_db():
    """Provide a fresh AsyncSession per test."""
    async with _test_session_factory() as session:
        yield session


@pytest_asyncio.fixture(scope="function")
async def db(async_db):
    yield async_db


# ---------------------------------------------------------------------------
# App / Client
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(scope="function")
async def async_client():
    """HTTPX AsyncClient wired to the FastAPI app."""
    from main import app

    with (
        patch("app.emails._send", return_value=None),
        patch("app.crud.auth.send_verification_email", return_value=None),
        patch("app.crud.auth.send_reset_email", return_value=None),
        patch("app.routers.auth.manager.startup", new_callable=AsyncMock),
        patch("app.routers.auth.manager.send_personal_message", new_callable=AsyncMock),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://localhost",
        ) as client:
            yield client


# ---------------------------------------------------------------------------
# Auth helper fixtures
# ---------------------------------------------------------------------------

TEST_USER_EMAIL = "test@example.com"
TEST_USER_PASSWORD = "Test1234!"
TEST_USER_NAME = "testuser"


@pytest_asyncio.fixture()
async def auth_headers(async_client: AsyncClient) -> dict:
    """Register + login a test user and return auth headers."""
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
    """Register + login a second test user for cross-user access tests."""
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
# CRUD helper fixtures
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
    """Create a folder inside the test project and return its JSON."""
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
