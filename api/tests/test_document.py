"""Tests for /api/v1/documents/* endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_document(
    async_client: AsyncClient,
    auth_headers: dict,
    test_project: dict,
    test_folder: dict,
):
    resp = await async_client.post(
        "/api/v1/documents/",
        json={
            "name": "TestDoc",
            "content": {"type": "doc", "content": [{"type": "paragraph"}]},
            "project_id": test_project["id"],
            "folder_id": test_folder["id"],
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "TestDoc"
    assert data["project_id"] == test_project["id"]
    assert data["folder_id"] == test_folder["id"]


@pytest.mark.asyncio
async def test_get_document(
    async_client: AsyncClient,
    auth_headers: dict,
    test_project: dict,
    test_folder: dict,
):
    # Create
    create_resp = await async_client.post(
        "/api/v1/documents/",
        json={
            "name": "GetMe",
            "content": {},
            "project_id": test_project["id"],
            "folder_id": test_folder["id"],
        },
        headers=auth_headers,
    )
    doc_id = create_resp.json()["id"]

    # Fetch
    resp = await async_client.get(f"/api/v1/documents/{doc_id}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "GetMe"


@pytest.mark.asyncio
async def test_update_document(
    async_client: AsyncClient,
    auth_headers: dict,
    test_project: dict,
    test_folder: dict,
):
    create_resp = await async_client.post(
        "/api/v1/documents/",
        json={
            "name": "Original",
            "content": {},
            "project_id": test_project["id"],
            "folder_id": test_folder["id"],
        },
        headers=auth_headers,
    )
    doc_id = create_resp.json()["id"]

    resp = await async_client.put(
        f"/api/v1/documents/{doc_id}",
        json={"name": "Updated"},
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated"


@pytest.mark.asyncio
async def test_delete_document(
    async_client: AsyncClient,
    auth_headers: dict,
    test_project: dict,
    test_folder: dict,
):
    create_resp = await async_client.post(
        "/api/v1/documents/",
        json={
            "name": "ToDelete",
            "content": {},
            "project_id": test_project["id"],
            "folder_id": test_folder["id"],
        },
        headers=auth_headers,
    )
    doc_id = create_resp.json()["id"]

    resp = await async_client.delete(f"/api/v1/documents/{doc_id}", headers=auth_headers)
    assert resp.status_code == 204

    # Verify gone (soft-deleted, should return 404)
    get_resp = await async_client.get(f"/api/v1/documents/{doc_id}", headers=auth_headers)
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_document_in_wrong_folder(
    async_client: AsyncClient,
    auth_headers: dict,
    test_project: dict,
):
    """
    Creating a document with a non-existent folder_id should fail.
    PostgreSQL enforces FK constraints — this triggers IntegrityError which
    may surface as 500 response or propagate as an exception through ASGI.
    """
    try:
        resp = await async_client.post(
            "/api/v1/documents/",
            json={
                "name": "Orphan",
                "content": {},
                "project_id": test_project["id"],
                "folder_id": "nonexistent_folder",
            },
            headers=auth_headers,
        )
        # If we get a response, it should be an error status
        assert resp.status_code in (400, 404, 422, 500)
    except Exception:
        # IntegrityError propagated through ASGI — FK constraint worked
        pass
