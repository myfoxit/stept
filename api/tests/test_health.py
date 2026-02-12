"""Tests for /health and /ready endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_returns_ok(async_client: AsyncClient):
    """GET /health should return 200 with status ok."""
    resp = await async_client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"


@pytest.mark.asyncio
async def test_health_is_always_available(async_client: AsyncClient):
    """Health endpoint requires no authentication."""
    resp = await async_client.get("/health")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_ready_returns_status(async_client: AsyncClient):
    """GET /ready should return 200 when DB is accessible."""
    resp = await async_client.get("/ready")
    # Could be 200 (all ok) or 503 (Redis down) — but should respond
    assert resp.status_code in (200, 503)
    data = resp.json()
    assert "status" in data
    assert "components" in data
    assert "database" in data["components"]


@pytest.mark.asyncio
async def test_ready_db_component_ok(async_client: AsyncClient):
    """The database component in /ready should be ok since we have a test DB."""
    resp = await async_client.get("/ready")
    data = resp.json()
    assert data["components"]["database"] == "ok"
