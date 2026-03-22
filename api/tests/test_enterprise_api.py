"""Tests for Enterprise API endpoints (API key auth)."""
import pytest
from httpx import AsyncClient


pytestmark = pytest.mark.asyncio


async def _create_api_key(async_client: AsyncClient, auth_headers: dict, project_id: str) -> str:
    """Helper: create an MCP API key and return the raw key."""
    resp = await async_client.post(
        f"/api/v1/projects/{project_id}/mcp-keys",
        json={"name": "Enterprise Test Key"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["raw_key"]


async def test_enterprise_search(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    """Enterprise search endpoint returns results with API key auth."""
    pid = test_project["id"]
    api_key = await _create_api_key(async_client, auth_headers, pid)

    resp = await async_client.post(
        "/api/v1/enterprise/search",
        json={"query": "test workflow"},
        headers={"Authorization": f"Bearer {api_key}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "results" in data
    assert "total" in data
    assert data["query"] == "test workflow"


async def test_enterprise_search_no_auth(async_client: AsyncClient):
    """Enterprise search without API key returns 401/403."""
    resp = await async_client.post(
        "/api/v1/enterprise/search",
        json={"query": "test"},
    )
    assert resp.status_code in [401, 403]


async def test_enterprise_projects(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    """Enterprise projects endpoint lists accessible projects."""
    pid = test_project["id"]
    api_key = await _create_api_key(async_client, auth_headers, pid)

    resp = await async_client.get(
        "/api/v1/enterprise/projects",
        headers={"Authorization": f"Bearer {api_key}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "projects" in data


async def test_enterprise_stats(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    """Enterprise stats endpoint returns counts."""
    pid = test_project["id"]
    api_key = await _create_api_key(async_client, auth_headers, pid)

    resp = await async_client.get(
        "/api/v1/enterprise/stats",
        headers={"Authorization": f"Bearer {api_key}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "total_workflows" in data
    assert "total_documents" in data
    assert "total_steps" in data


async def test_enterprise_search_empty_query(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    """Enterprise search with empty query returns 422."""
    pid = test_project["id"]
    api_key = await _create_api_key(async_client, auth_headers, pid)

    resp = await async_client.post(
        "/api/v1/enterprise/search",
        json={"query": ""},
        headers={"Authorization": f"Bearer {api_key}"},
    )
    assert resp.status_code == 422


async def test_enterprise_invalid_api_key(async_client: AsyncClient):
    """Enterprise endpoints reject invalid API keys."""
    resp = await async_client.post(
        "/api/v1/enterprise/search",
        json={"query": "test"},
        headers={"Authorization": "Bearer stept_invalid_key_12345"},
    )
    assert resp.status_code in [401, 403]
