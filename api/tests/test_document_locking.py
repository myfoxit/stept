"""Tests for document locking endpoints."""

import pytest
from httpx import AsyncClient


@pytest.fixture
async def _doc(async_client: AsyncClient, auth_headers: dict, test_project: dict, test_folder: dict):
    """Create a non-private test document."""
    resp = await async_client.post(
        "/api/v1/documents/",
        json={
            "name": "LockDoc",
            "content": {"type": "doc", "content": [{"type": "paragraph"}]},
            "project_id": test_project["id"],
            "folder_id": test_folder["id"],
            "is_private": False,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    return resp.json()


async def _add_second_user_to_project(async_client, auth_headers, second_auth_headers, project_id):
    """Helper: get second user's ID and add them as editor to the project."""
    me = await async_client.get("/api/v1/auth/me", headers=second_auth_headers)
    user_b_id = me.json()["id"]
    resp = await async_client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"user_id": user_b_id, "role": "editor"},
        headers=auth_headers,
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_lock_status_unlocked(
    async_client: AsyncClient,
    auth_headers: dict,
    test_project: dict,
    test_folder: dict,
    _doc: dict,
):
    resp = await async_client.get(f"/api/v1/documents/{_doc['id']}/lock", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["locked"] is False
    assert data["locked_by"] is None


@pytest.mark.asyncio
async def test_acquire_lock(
    async_client: AsyncClient,
    auth_headers: dict,
    test_project: dict,
    test_folder: dict,
    _doc: dict,
):
    resp = await async_client.post(f"/api/v1/documents/{_doc['id']}/lock", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["locked"] is True

    # Check status
    status = await async_client.get(f"/api/v1/documents/{_doc['id']}/lock", headers=auth_headers)
    assert status.json()["locked"] is True
    assert status.json()["is_mine"] is True


@pytest.mark.asyncio
async def test_lock_conflict(
    async_client: AsyncClient,
    auth_headers: dict,
    second_auth_headers: dict,
    test_project: dict,
    test_folder: dict,
    _doc: dict,
):
    await _add_second_user_to_project(async_client, auth_headers, second_auth_headers, test_project["id"])

    # First user locks
    resp = await async_client.post(f"/api/v1/documents/{_doc['id']}/lock", headers=auth_headers)
    assert resp.status_code == 200

    # Second user tries to lock → 409
    resp2 = await async_client.post(f"/api/v1/documents/{_doc['id']}/lock", headers=second_auth_headers)
    assert resp2.status_code == 409


@pytest.mark.asyncio
async def test_unlock(
    async_client: AsyncClient,
    auth_headers: dict,
    test_project: dict,
    test_folder: dict,
    _doc: dict,
):
    await async_client.post(f"/api/v1/documents/{_doc['id']}/lock", headers=auth_headers)
    resp = await async_client.post(f"/api/v1/documents/{_doc['id']}/unlock", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["locked"] is False


@pytest.mark.asyncio
async def test_update_locked_by_other_returns_423(
    async_client: AsyncClient,
    auth_headers: dict,
    second_auth_headers: dict,
    test_project: dict,
    test_folder: dict,
    _doc: dict,
):
    await _add_second_user_to_project(async_client, auth_headers, second_auth_headers, test_project["id"])

    # First user locks
    await async_client.post(f"/api/v1/documents/{_doc['id']}/lock", headers=auth_headers)

    # Second user tries to update → 423
    resp = await async_client.put(
        f"/api/v1/documents/{_doc['id']}",
        json={"name": "Hacked"},
        headers=second_auth_headers,
    )
    assert resp.status_code == 423


@pytest.mark.asyncio
async def test_update_unlocked_still_works(
    async_client: AsyncClient,
    auth_headers: dict,
    test_project: dict,
    test_folder: dict,
    _doc: dict,
):
    """Backwards compatible: updating without a lock should still work."""
    resp = await async_client.put(
        f"/api/v1/documents/{_doc['id']}",
        json={"name": "NoLockNeeded"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "NoLockNeeded"


@pytest.mark.asyncio
async def test_lock_holder_can_update(
    async_client: AsyncClient,
    auth_headers: dict,
    test_project: dict,
    test_folder: dict,
    _doc: dict,
):
    await async_client.post(f"/api/v1/documents/{_doc['id']}/lock", headers=auth_headers)
    resp = await async_client.put(
        f"/api/v1/documents/{_doc['id']}",
        json={"name": "LockedUpdate"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "LockedUpdate"
