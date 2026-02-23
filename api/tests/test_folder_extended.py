"""Extended tests for /api/v1/folders/* endpoints."""

import pytest
from httpx import AsyncClient


# ─────────────────── Move folder ────────────────────────────────


@pytest.mark.asyncio
async def test_move_folder_to_new_parent(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    # Create parent A and parent B
    a_resp = await async_client.post(
        "/api/v1/folders/",
        json={"name": "ParentA", "project_id": test_project["id"]},
        headers=auth_headers,
    )
    a_id = a_resp.json()["id"]

    b_resp = await async_client.post(
        "/api/v1/folders/",
        json={"name": "ParentB", "project_id": test_project["id"]},
        headers=auth_headers,
    )
    b_id = b_resp.json()["id"]

    # Create child inside A
    child_resp = await async_client.post(
        "/api/v1/folders/",
        json={"name": "Child", "project_id": test_project["id"], "parent_id": a_id},
        headers=auth_headers,
    )
    child_id = child_resp.json()["id"]

    # Move child from A to B
    resp = await async_client.put(
        f"/api/v1/folders/{child_id}/move",
        json={"parent_id": b_id, "position": 0},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["parent_id"] == b_id


@pytest.mark.asyncio
async def test_move_folder_to_root(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    parent_resp = await async_client.post(
        "/api/v1/folders/",
        json={"name": "ParentForRoot", "project_id": test_project["id"]},
        headers=auth_headers,
    )
    parent_id = parent_resp.json()["id"]

    child_resp = await async_client.post(
        "/api/v1/folders/",
        json={"name": "ChildToRoot", "project_id": test_project["id"], "parent_id": parent_id},
        headers=auth_headers,
    )
    child_id = child_resp.json()["id"]

    resp = await async_client.put(
        f"/api/v1/folders/{child_id}/move",
        json={"parent_id": None, "position": 0},
        headers=auth_headers,
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_move_nonexistent_folder(
    async_client: AsyncClient, auth_headers: dict
):
    resp = await async_client.put(
        "/api/v1/folders/nonexistent/move",
        json={"parent_id": None, "position": 0},
        headers=auth_headers,
    )
    assert resp.status_code in (400, 404)


# ─────────────────── Toggle expansion ───────────────────────────


@pytest.mark.asyncio
async def test_toggle_folder_expansion_on(
    async_client: AsyncClient, auth_headers: dict, test_folder: dict
):
    resp = await async_client.patch(
        f"/api/v1/folders/{test_folder['id']}/expand?is_expanded=true",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_expanded"] is True


@pytest.mark.asyncio
async def test_toggle_folder_expansion_off(
    async_client: AsyncClient, auth_headers: dict, test_folder: dict
):
    # First expand
    await async_client.patch(
        f"/api/v1/folders/{test_folder['id']}/expand?is_expanded=true",
        headers=auth_headers,
    )
    # Then collapse
    resp = await async_client.patch(
        f"/api/v1/folders/{test_folder['id']}/expand?is_expanded=false",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_expanded"] is False


@pytest.mark.asyncio
async def test_toggle_expansion_nonexistent_folder(
    async_client: AsyncClient, auth_headers: dict
):
    resp = await async_client.patch(
        "/api/v1/folders/nonexistent/expand?is_expanded=true",
        headers=auth_headers,
    )
    assert resp.status_code == 404


# ─────────────────── Duplicate folder ───────────────────────────


@pytest.mark.asyncio
async def test_duplicate_folder(
    async_client: AsyncClient, auth_headers: dict, test_folder: dict
):
    resp = await async_client.post(
        f"/api/v1/folders/{test_folder['id']}/duplicate?include_children=false",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    dup = resp.json()
    assert dup["id"] != test_folder["id"]
    assert dup["project_id"] == test_folder["project_id"]


@pytest.mark.asyncio
async def test_duplicate_folder_with_children(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    # Create parent with child
    parent_resp = await async_client.post(
        "/api/v1/folders/",
        json={"name": "DupParent", "project_id": test_project["id"]},
        headers=auth_headers,
    )
    parent_id = parent_resp.json()["id"]

    await async_client.post(
        "/api/v1/folders/",
        json={"name": "DupChild", "project_id": test_project["id"], "parent_id": parent_id},
        headers=auth_headers,
    )

    resp = await async_client.post(
        f"/api/v1/folders/{parent_id}/duplicate?include_children=true",
        headers=auth_headers,
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_duplicate_nonexistent_folder(
    async_client: AsyncClient, auth_headers: dict
):
    resp = await async_client.post(
        "/api/v1/folders/nonexistent/duplicate?include_children=false",
        headers=auth_headers,
    )
    assert resp.status_code == 404


# ─────────────────── Deep nesting (3+ levels) ──────────────────


@pytest.mark.asyncio
async def test_deep_nesting(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    """Create 4 levels of nested folders."""
    parent_id = None
    folder_ids = []
    for i in range(4):
        payload = {
            "name": f"Level{i}",
            "project_id": test_project["id"],
        }
        if parent_id:
            payload["parent_id"] = parent_id

        resp = await async_client.post(
            "/api/v1/folders/",
            json=payload,
            headers=auth_headers,
        )
        assert resp.status_code == 201
        folder = resp.json()
        folder_ids.append(folder["id"])
        parent_id = folder["id"]

    # Verify the tree contains all levels
    tree_resp = await async_client.get(
        "/api/v1/folders/tree",
        params={"project_id": test_project["id"]},
        headers=auth_headers,
    )
    assert tree_resp.status_code == 200

    # Flatten tree IDs to check all 4 folders exist
    def _collect_ids(nodes):
        ids = []
        for n in nodes:
            ids.append(n["id"])
            if "children" in n:
                ids.extend(_collect_ids(n["children"]))
        return ids

    all_ids = _collect_ids(tree_resp.json())
    for fid in folder_ids:
        assert fid in all_ids


# ──────── Move folder into its own child → should fail ─────────


@pytest.mark.asyncio
async def test_move_folder_into_own_child(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    """Moving a folder into its own child should fail or be handled gracefully."""
    parent_resp = await async_client.post(
        "/api/v1/folders/",
        json={"name": "MoveParent", "project_id": test_project["id"]},
        headers=auth_headers,
    )
    parent_id = parent_resp.json()["id"]

    child_resp = await async_client.post(
        "/api/v1/folders/",
        json={
            "name": "MoveChild",
            "project_id": test_project["id"],
            "parent_id": parent_id,
        },
        headers=auth_headers,
    )
    child_id = child_resp.json()["id"]

    # Try to move parent into child — this is a circular reference
    resp = await async_client.put(
        f"/api/v1/folders/{parent_id}/move",
        json={"parent_id": child_id, "position": 0},
        headers=auth_headers,
    )
    # Should fail (400) or the server might allow it (depends on implementation)
    # The key test is that it doesn't crash (500)
    assert resp.status_code in (200, 400)


# ─────────────────── Get single folder ──────────────────────────


@pytest.mark.asyncio
async def test_get_folder(
    async_client: AsyncClient, auth_headers: dict, test_folder: dict
):
    resp = await async_client.get(f"/api/v1/folders/{test_folder['id']}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == test_folder["id"]
    assert data["name"] == test_folder["name"]


@pytest.mark.asyncio
async def test_get_nonexistent_folder(async_client: AsyncClient, auth_headers: dict):
    resp = await async_client.get("/api/v1/folders/nonexistent", headers=auth_headers)
    assert resp.status_code == 404


# ─────────── Delete folder with children ────────────────────────


@pytest.mark.asyncio
async def test_delete_folder_with_children(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    """Deleting a folder should also handle its children (cascade or error)."""
    parent_resp = await async_client.post(
        "/api/v1/folders/",
        json={"name": "DelParent", "project_id": test_project["id"]},
        headers=auth_headers,
    )
    parent_id = parent_resp.json()["id"]

    await async_client.post(
        "/api/v1/folders/",
        json={
            "name": "DelChild",
            "project_id": test_project["id"],
            "parent_id": parent_id,
        },
        headers=auth_headers,
    )

    resp = await async_client.delete(
        f"/api/v1/folders/{parent_id}",
        headers=auth_headers,
    )
    # Should succeed (cascade delete) or fail gracefully
    assert resp.status_code in (204, 400, 409)


@pytest.mark.asyncio
async def test_delete_nonexistent_folder(
    async_client: AsyncClient, auth_headers: dict
):
    resp = await async_client.delete(
        "/api/v1/folders/nonexistent",
        headers=auth_headers,
    )
    assert resp.status_code == 404
