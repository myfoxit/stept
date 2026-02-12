"""Extended tests for /api/v1/documents/* endpoints."""

import pytest
from httpx import AsyncClient


# ─────────────────── Duplicate document ─────────────────────────


@pytest.mark.asyncio
async def test_duplicate_document(
    async_client: AsyncClient,
    auth_headers: dict,
    test_project: dict,
    test_folder: dict,
):
    # Create original
    create_resp = await async_client.post(
        "/api/v1/documents/",
        json={
            "name": "Original Doc",
            "content": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Hello"}]}]},
            "project_id": test_project["id"],
            "folder_id": test_folder["id"],
        },
        headers=auth_headers,
    )
    assert create_resp.status_code == 201
    doc_id = create_resp.json()["id"]

    # Duplicate
    resp = await async_client.post(
        f"/api/v1/documents/{doc_id}/duplicate",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    dup = resp.json()
    assert dup["id"] != doc_id
    assert dup["project_id"] == test_project["id"]


@pytest.mark.asyncio
async def test_duplicate_nonexistent_document(
    async_client: AsyncClient, auth_headers: dict
):
    resp = await async_client.post(
        "/api/v1/documents/nonexistent/duplicate",
        headers=auth_headers,
    )
    assert resp.status_code == 404


# ─────────────────── Move document ──────────────────────────────


@pytest.mark.asyncio
async def test_move_document_to_different_folder(
    async_client: AsyncClient,
    auth_headers: dict,
    test_project: dict,
    test_folder: dict,
):
    # Create a second folder
    folder2_resp = await async_client.post(
        "/api/v1/folders/",
        json={"name": "Folder2", "project_id": test_project["id"]},
        headers=auth_headers,
    )
    folder2_id = folder2_resp.json()["id"]

    # Create document in first folder
    doc_resp = await async_client.post(
        "/api/v1/documents/",
        json={
            "name": "Movable Doc",
            "content": {},
            "project_id": test_project["id"],
            "folder_id": test_folder["id"],
        },
        headers=auth_headers,
    )
    doc_id = doc_resp.json()["id"]

    # Move to second folder
    resp = await async_client.put(
        f"/api/v1/documents/{doc_id}/move",
        json={"parent_id": folder2_id, "position": 0},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["folder_id"] == folder2_id


@pytest.mark.asyncio
async def test_move_document_to_root(
    async_client: AsyncClient,
    auth_headers: dict,
    test_project: dict,
    test_folder: dict,
):
    doc_resp = await async_client.post(
        "/api/v1/documents/",
        json={
            "name": "RootBound",
            "content": {},
            "project_id": test_project["id"],
            "folder_id": test_folder["id"],
        },
        headers=auth_headers,
    )
    doc_id = doc_resp.json()["id"]

    resp = await async_client.put(
        f"/api/v1/documents/{doc_id}/move",
        json={"parent_id": None, "position": 0},
        headers=auth_headers,
    )
    assert resp.status_code == 200


# ─────────────────── Filtered documents ─────────────────────────


@pytest.mark.asyncio
async def test_get_filtered_documents(
    async_client: AsyncClient,
    auth_headers: dict,
    test_project: dict,
    test_folder: dict,
):
    # Create some documents
    for name in ("DocA", "DocB", "DocC"):
        await async_client.post(
            "/api/v1/documents/",
            json={
                "name": name,
                "content": {},
                "project_id": test_project["id"],
                "folder_id": test_folder["id"],
            },
            headers=auth_headers,
        )

    resp = await async_client.get(
        "/api/v1/documents/filtered",
        params={"project_id": test_project["id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 3


@pytest.mark.asyncio
async def test_get_filtered_documents_sorted_by_name(
    async_client: AsyncClient,
    auth_headers: dict,
    test_project: dict,
    test_folder: dict,
):
    for name in ("Zebra", "Apple", "Mango"):
        await async_client.post(
            "/api/v1/documents/",
            json={
                "name": name,
                "content": {},
                "project_id": test_project["id"],
                "folder_id": test_folder["id"],
            },
            headers=auth_headers,
        )

    resp = await async_client.get(
        "/api/v1/documents/filtered",
        params={
            "project_id": test_project["id"],
            "sort_by": "name",
            "sort_order": "asc",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    names = [d["name"] for d in resp.json()]
    assert names == sorted(names)


@pytest.mark.asyncio
async def test_get_filtered_documents_by_folder(
    async_client: AsyncClient,
    auth_headers: dict,
    test_project: dict,
    test_folder: dict,
):
    # Create doc in the folder
    await async_client.post(
        "/api/v1/documents/",
        json={
            "name": "InFolder",
            "content": {},
            "project_id": test_project["id"],
            "folder_id": test_folder["id"],
        },
        headers=auth_headers,
    )

    resp = await async_client.get(
        "/api/v1/documents/filtered",
        params={
            "project_id": test_project["id"],
            "folder_id": test_folder["id"],
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    for doc in data:
        assert doc["folder_id"] == test_folder["id"]


@pytest.mark.asyncio
async def test_get_filtered_documents_no_auth(
    async_client: AsyncClient, test_project: dict
):
    async_client.cookies.clear()
    resp = await async_client.get(
        "/api/v1/documents/filtered",
        params={"project_id": test_project["id"]},
    )
    assert resp.status_code == 401


# ─────────────────── Delete edge cases ──────────────────────────


@pytest.mark.asyncio
async def test_delete_nonexistent_document(async_client: AsyncClient):
    resp = await async_client.delete("/api/v1/documents/nonexistent")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_nonexistent_document(async_client: AsyncClient):
    resp = await async_client.get("/api/v1/documents/nonexistent")
    assert resp.status_code == 404


# ─────────────────── Export endpoints ───────────────────────────


@pytest.mark.asyncio
async def test_export_document_markdown(
    async_client: AsyncClient,
    auth_headers: dict,
    test_project: dict,
    test_folder: dict,
):
    doc_resp = await async_client.post(
        "/api/v1/documents/",
        json={
            "name": "Export MD",
            "content": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Hello world"}]}]},
            "project_id": test_project["id"],
            "folder_id": test_folder["id"],
        },
        headers=auth_headers,
    )
    doc_id = doc_resp.json()["id"]

    resp = await async_client.get(f"/api/v1/documents/{doc_id}/export/markdown")
    assert resp.status_code == 200
    assert "text/markdown" in resp.headers.get("content-type", "")


@pytest.mark.asyncio
async def test_export_document_html(
    async_client: AsyncClient,
    auth_headers: dict,
    test_project: dict,
    test_folder: dict,
):
    doc_resp = await async_client.post(
        "/api/v1/documents/",
        json={
            "name": "Export HTML",
            "content": {"type": "doc", "content": []},
            "project_id": test_project["id"],
            "folder_id": test_folder["id"],
        },
        headers=auth_headers,
    )
    doc_id = doc_resp.json()["id"]

    resp = await async_client.get(f"/api/v1/documents/{doc_id}/export/html")
    assert resp.status_code == 200
    assert "text/html" in resp.headers.get("content-type", "")


@pytest.mark.asyncio
async def test_export_nonexistent_document_markdown(async_client: AsyncClient):
    resp = await async_client.get("/api/v1/documents/nonexistent/export/markdown")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_export_nonexistent_document_html(async_client: AsyncClient):
    resp = await async_client.get("/api/v1/documents/nonexistent/export/html")
    assert resp.status_code == 404


# ────────────── Document belongs to correct project ─────────────


@pytest.mark.asyncio
async def test_document_belongs_to_correct_project(
    async_client: AsyncClient,
    auth_headers: dict,
    test_project: dict,
    test_folder: dict,
):
    resp = await async_client.post(
        "/api/v1/documents/",
        json={
            "name": "Check Project",
            "content": {},
            "project_id": test_project["id"],
            "folder_id": test_folder["id"],
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    doc = resp.json()
    assert doc["project_id"] == test_project["id"]

    # Fetch it again
    get_resp = await async_client.get(f"/api/v1/documents/{doc['id']}")
    assert get_resp.status_code == 200
    assert get_resp.json()["project_id"] == test_project["id"]


# ─────────────── Create document without folder ─────────────────


@pytest.mark.asyncio
async def test_create_document_without_folder(
    async_client: AsyncClient,
    auth_headers: dict,
    test_project: dict,
):
    resp = await async_client.post(
        "/api/v1/documents/",
        json={
            "name": "RootDoc",
            "content": {},
            "project_id": test_project["id"],
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    # API may auto-assign a default folder; just verify the doc was created
    assert "id" in resp.json()


# ────────────── List all documents ──────────────────────────────


@pytest.mark.asyncio
async def test_list_all_documents(
    async_client: AsyncClient,
    auth_headers: dict,
    test_project: dict,
    test_folder: dict,
):
    for name in ("ListA", "ListB"):
        await async_client.post(
            "/api/v1/documents/",
            json={
                "name": name,
                "content": {},
                "project_id": test_project["id"],
                "folder_id": test_folder["id"],
            },
            headers=auth_headers,
        )

    resp = await async_client.get("/api/v1/documents/")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 2
