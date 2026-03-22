"""
Tests for MCP API key management endpoints.

Routes are at /api/v1/projects/{project_id}/mcp-keys.
"""

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


# ─────────────────── Create ───────────────────────────


async def test_create_mcp_key(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    resp = await async_client.post(
        f"/api/v1/projects/{test_project['id']}/mcp-keys",
        json={"name": "Test Key"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["name"] == "Test Key"
    assert data["project_id"] == test_project["id"]
    assert data["is_active"] is True
    assert "raw_key" in data
    assert data["raw_key"].startswith("stept_")
    assert data["key_prefix"] == data["raw_key"][:12]


async def test_create_mcp_key_returns_raw_key_once(
    async_client: AsyncClient, auth_headers: dict, test_project: dict,
):
    """The raw key is only returned on creation, not on list."""
    resp = await async_client.post(
        f"/api/v1/projects/{test_project['id']}/mcp-keys",
        json={"name": "One-Time Key"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    raw_key = resp.json()["raw_key"]
    assert raw_key

    # List should not include raw_key
    resp = await async_client.get(
        f"/api/v1/projects/{test_project['id']}/mcp-keys",
        headers=auth_headers,
    )
    keys = resp.json()
    assert len(keys) >= 1
    assert "raw_key" not in keys[0]


# ─────────────────── List ───────────────────────────


async def test_list_mcp_keys(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    # Create two keys
    await async_client.post(
        f"/api/v1/projects/{test_project['id']}/mcp-keys",
        json={"name": "Key A"},
        headers=auth_headers,
    )
    await async_client.post(
        f"/api/v1/projects/{test_project['id']}/mcp-keys",
        json={"name": "Key B"},
        headers=auth_headers,
    )

    resp = await async_client.get(
        f"/api/v1/projects/{test_project['id']}/mcp-keys",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    keys = resp.json()
    assert len(keys) == 2
    names = {k["name"] for k in keys}
    assert names == {"Key A", "Key B"}


async def test_list_mcp_keys_empty(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    resp = await async_client.get(
        f"/api/v1/projects/{test_project['id']}/mcp-keys",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json() == []


# ─────────────────── Delete ───────────────────────────


async def test_delete_mcp_key(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    resp = await async_client.post(
        f"/api/v1/projects/{test_project['id']}/mcp-keys",
        json={"name": "Doomed Key"},
        headers=auth_headers,
    )
    key_id = resp.json()["id"]

    resp = await async_client.delete(
        f"/api/v1/projects/{test_project['id']}/mcp-keys/{key_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    # Verify gone
    resp = await async_client.get(
        f"/api/v1/projects/{test_project['id']}/mcp-keys",
        headers=auth_headers,
    )
    assert all(k["id"] != key_id for k in resp.json())


async def test_delete_nonexistent_mcp_key(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    resp = await async_client.delete(
        f"/api/v1/projects/{test_project['id']}/mcp-keys/nonexistent",
        headers=auth_headers,
    )
    assert resp.status_code == 404


# ─────────────────── Non-admin cannot manage keys ───────────────────────────


async def test_non_admin_cannot_create_keys(
    async_client: AsyncClient, auth_headers: dict, second_auth_headers: dict, test_project: dict,
):
    """A user who is not admin/owner of the project cannot create MCP keys."""
    resp = await async_client.post(
        f"/api/v1/projects/{test_project['id']}/mcp-keys",
        json={"name": "Unauthorized Key"},
        headers=second_auth_headers,
    )
    assert resp.status_code == 403


async def test_non_admin_cannot_list_keys(
    async_client: AsyncClient, auth_headers: dict, second_auth_headers: dict, test_project: dict,
):
    resp = await async_client.get(
        f"/api/v1/projects/{test_project['id']}/mcp-keys",
        headers=second_auth_headers,
    )
    assert resp.status_code == 403


async def test_non_admin_cannot_delete_keys(
    async_client: AsyncClient, auth_headers: dict, second_auth_headers: dict, test_project: dict,
):
    # Create a key as admin
    resp = await async_client.post(
        f"/api/v1/projects/{test_project['id']}/mcp-keys",
        json={"name": "Admin Key"},
        headers=auth_headers,
    )
    key_id = resp.json()["id"]

    # Try to delete as non-admin
    resp = await async_client.delete(
        f"/api/v1/projects/{test_project['id']}/mcp-keys/{key_id}",
        headers=second_auth_headers,
    )
    assert resp.status_code == 403
