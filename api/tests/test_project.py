"""Tests for /api/v1/projects/* endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_project(async_client: AsyncClient, auth_headers: dict, test_user_id: str):
    resp = await async_client.post(
        "/api/v1/projects/",
        json={"name": "MyProject", "user_id": test_user_id},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "MyProject"
    assert "id" in data
    assert data["owner_id"] == test_user_id


@pytest.mark.asyncio
async def test_list_projects(async_client: AsyncClient, auth_headers: dict, test_user_id: str):
    # Create two projects
    for name in ("ProjA", "ProjB"):
        await async_client.post(
            "/api/v1/projects/",
            json={"name": name, "user_id": test_user_id},
            headers=auth_headers,
        )

    resp = await async_client.get(
        f"/api/v1/projects/{test_user_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 2
    names = [p["name"] for p in data]
    assert "ProjA" in names
    assert "ProjB" in names


@pytest.mark.asyncio
async def test_get_project(async_client: AsyncClient, auth_headers: dict, test_project: dict, test_user_id: str):
    """List projects should include the test project."""
    resp = await async_client.get(
        f"/api/v1/projects/{test_user_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    ids = [p["id"] for p in resp.json()]
    assert test_project["id"] in ids


@pytest.mark.asyncio
async def test_update_project(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    resp = await async_client.put(
        f"/api/v1/projects/{test_project['id']}",
        json={"name": "Renamed"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Renamed"


@pytest.mark.asyncio
async def test_delete_project(async_client: AsyncClient, auth_headers: dict, test_project: dict, test_user_id: str):
    resp = await async_client.delete(
        f"/api/v1/projects/{test_project['id']}",
        headers=auth_headers,
    )
    assert resp.status_code == 200

    # Verify it's gone
    list_resp = await async_client.get(
        f"/api/v1/projects/{test_user_id}",
        headers=auth_headers,
    )
    ids = [p["id"] for p in list_resp.json()]
    assert test_project["id"] not in ids


@pytest.mark.asyncio
async def test_project_access_unauthorized(
    async_client: AsyncClient,
    auth_headers: dict,
    second_auth_headers: dict,
    test_project: dict,
):
    """User B should not be able to update/delete user A's project."""
    # User B tries to update user A's project
    resp = await async_client.put(
        f"/api/v1/projects/{test_project['id']}",
        json={"name": "Hacked"},
        headers=second_auth_headers,
    )
    assert resp.status_code == 403

    # User B tries to delete user A's project
    resp = await async_client.delete(
        f"/api/v1/projects/{test_project['id']}",
        headers=second_auth_headers,
    )
    assert resp.status_code == 403
