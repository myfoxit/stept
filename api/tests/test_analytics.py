"""Tests for /api/v1/analytics/* endpoints — Phase 3: Usage Analytics."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_top_accessed_empty(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    resp = await async_client.get(
        "/api/v1/analytics/top-accessed",
        params={"project_id": test_project["id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_access_by_channel(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    resp = await async_client.get(
        "/api/v1/analytics/access-by-channel",
        params={"project_id": test_project["id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)
    for key in ("web_ui", "mcp", "rag_chat"):
        assert key in data


@pytest.mark.asyncio
async def test_stale_resources(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    resp = await async_client.get(
        "/api/v1/analytics/stale",
        params={"project_id": test_project["id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_query_log(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    resp = await async_client.get(
        "/api/v1/analytics/queries",
        params={"project_id": test_project["id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_knowledge_gaps(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    resp = await async_client.get(
        "/api/v1/analytics/gaps",
        params={"project_id": test_project["id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_analytics_require_admin(
    async_client: AsyncClient, second_auth_headers: dict, test_project: dict
):
    """Non-member should be denied access to analytics."""
    resp = await async_client.get(
        "/api/v1/analytics/top-accessed",
        params={"project_id": test_project["id"]},
        headers=second_auth_headers,
    )
    assert resp.status_code in (403, 404)
