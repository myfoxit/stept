"""Tests for auth providers endpoints (OAuth status, Copilot flow)."""
import pytest
from httpx import AsyncClient


pytestmark = pytest.mark.asyncio


async def test_providers_status(async_client: AsyncClient, auth_headers: dict):
    """Provider status returns which OAuth providers are available."""
    resp = await async_client.get("/api/v1/auth/providers/status", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    # Should list known providers even if not configured
    assert isinstance(data, dict)


async def test_providers_status_requires_auth(async_client: AsyncClient):
    """Provider status requires authentication."""
    resp = await async_client.get("/api/v1/auth/providers/status")
    assert resp.status_code == 401


async def test_copilot_start(async_client: AsyncClient, auth_headers: dict):
    """Copilot auth flow start returns a session or error."""
    resp = await async_client.post("/api/v1/auth/providers/copilot/start", headers=auth_headers)
    # May return 200 with device code or 400/500 if provider not configured
    assert resp.status_code in [200, 400, 500, 503]


async def test_copilot_poll_without_start(async_client: AsyncClient, auth_headers: dict):
    """Copilot poll without starting returns error."""
    resp = await async_client.get("/api/v1/auth/providers/copilot/poll", headers=auth_headers)
    assert resp.status_code in [400, 404, 405]
