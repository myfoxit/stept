"""
Test fixtures for the Ondoki backend test suite.

Uses SQLite async in-memory by default (no external DB required).
Set DATABASE_URL_TEST to override with e.g. PostgreSQL.
"""

import os
import sys
from unittest.mock import patch, AsyncMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool, NullPool
from sqlmodel import SQLModel

# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.database import get_session, Base
from app.models import User, Project, Folder, Document, project_members, ProjectRole

# Import all models so Base.metadata knows every table
import app.models  # noqa: F401

# ---------------------------------------------------------------------------
# Engine — SQLite in-memory by default, override via DATABASE_URL_TEST
# ---------------------------------------------------------------------------

_TEST_DB_URL = os.environ.get("DATABASE_URL_TEST", "sqlite+aiosqlite://")

if _TEST_DB_URL.startswith("sqlite"):
    async_engine = create_async_engine(
        _TEST_DB_URL,
        echo=False,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
else:
    async_engine = create_async_engine(
        _TEST_DB_URL,
        echo=False,
        poolclass=NullPool,
    )


# ---------------------------------------------------------------------------
# DB fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(scope="function")
async def async_db_engine():
    """Create all tables before each test, drop after."""
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield async_engine
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture(scope="function")
async def async_db(async_db_engine):
    """Provide an AsyncSession wrapped in a transaction that rolls back."""
    _async_session = async_sessionmaker(
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
        bind=async_db_engine,
        class_=AsyncSession,
    )
    async with _async_session() as session:
        await session.begin()
        yield session
        await session.rollback()


# Alias for convenience
@pytest_asyncio.fixture(scope="function")
async def db(async_db):
    yield async_db


# ---------------------------------------------------------------------------
# App / Client
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(scope="function")
async def async_client(async_db):
    """
    HTTPX AsyncClient wired to the FastAPI app with DB override.

    We stub out:
      - emails (no real SMTP)
      - Redis connections in auth router
    """
    from main import app

    # Override the DB dependency to use the test session
    # Must match the async generator signature of get_session
    async def _override_get_session():
        yield async_db
        # Note: we do NOT commit/rollback here because the
        # conftest async_db fixture manages the session lifecycle.

    app.dependency_overrides[get_session] = _override_get_session

    # Patch email sending so no real SMTP is needed
    with (
        patch("app.emails._send", return_value=None),
        patch("app.crud.auth.send_verification_email", return_value=None),
        patch("app.crud.auth.send_reset_email", return_value=None),
        # Prevent Redis connection attempts in auth router
        patch("app.routers.auth.manager.startup", new_callable=AsyncMock),
        patch("app.routers.auth.manager.send_personal_message", new_callable=AsyncMock),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://localhost",
        ) as client:
            yield client

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Auth helper fixtures
# ---------------------------------------------------------------------------

TEST_USER_EMAIL = "test@example.com"
TEST_USER_PASSWORD = "Test1234!"
TEST_USER_NAME = "testuser"


@pytest_asyncio.fixture()
async def auth_headers(async_client: AsyncClient) -> dict:
    """
    Register + login a test user and return auth headers.

    The register endpoint sets a session cookie — we capture it and return
    a dict suitable for passing as `headers` to requests.
    """
    # Register
    resp = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD,
            "name": TEST_USER_NAME,
        },
    )
    assert resp.status_code == 200, f"Register failed: {resp.text}"

    # Extract session cookie
    cookie = resp.cookies.get("session_ondoki")
    assert cookie, "No session cookie returned on register"
    return {"Cookie": f"session_ondoki={cookie}"}


@pytest_asyncio.fixture()
async def second_auth_headers(async_client: AsyncClient) -> dict:
    """Register + login a *second* test user for cross-user access tests."""
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
