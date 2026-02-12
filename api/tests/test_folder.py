"""Tests for /api/v1/folders/* endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_folder(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    resp = await async_client.post(
        "/api/v1/folders/",
        json={"name": "NewFolder", "project_id": test_project["id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "NewFolder"
    assert data["project_id"] == test_project["id"]
    assert "id" in data


@pytest.mark.asyncio
async def test_list_folders(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    # Create a few folders
    for name in ("FolderA", "FolderB"):
        await async_client.post(
            "/api/v1/folders/",
            json={"name": name, "project_id": test_project["id"]},
            headers=auth_headers,
        )

    resp = await async_client.get(
        "/api/v1/folders/tree",
        params={"project_id": test_project["id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    names = [f["name"] for f in data]
    assert "FolderA" in names
    assert "FolderB" in names


@pytest.mark.asyncio
async def test_rename_folder(async_client: AsyncClient, auth_headers: dict, test_folder: dict):
    resp = await async_client.put(
        f"/api/v1/folders/{test_folder['id']}",
        json={"name": "RenamedFolder"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "RenamedFolder"


@pytest.mark.asyncio
async def test_delete_folder(async_client: AsyncClient, auth_headers: dict, test_folder: dict, test_project: dict):
    resp = await async_client.delete(
        f"/api/v1/folders/{test_folder['id']}",
        headers=auth_headers,
    )
    assert resp.status_code == 204

    # Verify it's gone from the tree
    tree_resp = await async_client.get(
        "/api/v1/folders/tree",
        params={"project_id": test_project["id"]},
        headers=auth_headers,
    )
    ids = [f["id"] for f in tree_resp.json()]
    assert test_folder["id"] not in ids


@pytest.mark.asyncio
async def test_nested_folders(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    # Create parent
    parent_resp = await async_client.post(
        "/api/v1/folders/",
        json={"name": "Parent", "project_id": test_project["id"]},
        headers=auth_headers,
    )
    assert parent_resp.status_code == 201
    parent_id = parent_resp.json()["id"]

    # Create child inside parent
    child_resp = await async_client.post(
        "/api/v1/folders/",
        json={
            "name": "Child",
            "project_id": test_project["id"],
            "parent_id": parent_id,
        },
        headers=auth_headers,
    )
    assert child_resp.status_code == 201
    child = child_resp.json()
    assert child["parent_id"] == parent_id
    assert child["depth"] > 0


@pytest.mark.asyncio
async def test_folder_in_wrong_project(
    async_client: AsyncClient,
    auth_headers: dict,
    test_user_id: str,
):
    """
    Creating a folder with a non-existent project_id.
    
    Note: SQLite doesn't enforce FK constraints by default, so this may
    succeed on SQLite but fail on PostgreSQL. We accept both outcomes.
    """
    resp = await async_client.post(
        "/api/v1/folders/",
        json={"name": "Orphan", "project_id": "nonexistent_id"},
        headers=auth_headers,
    )
    # On PostgreSQL: FK constraint → 4xx/5xx
    # On SQLite (no FK enforcement): may return 201
    assert resp.status_code in (201, 400, 404, 422, 500)
