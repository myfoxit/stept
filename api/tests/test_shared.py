"""Tests for /api/v1/shared-with-me endpoint."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_shared_with_me_returns_list(async_client: AsyncClient, auth_headers: dict):
    """GET /shared-with-me should return a list (possibly empty)."""
    resp = await async_client.get("/api/v1/shared-with-me", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    # Response may be a list or paginated {"items": [...]}
    items = data if isinstance(data, list) else data.get("items", [])
    assert isinstance(items, list)


@pytest.mark.asyncio
async def test_shared_with_me_unauthenticated(async_client: AsyncClient):
    """GET /shared-with-me without auth should return 401/403."""
    resp = await async_client.get("/api/v1/shared-with-me")
    assert resp.status_code in (401, 403)
