"""Tests for soft-delete / trash functionality."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_soft_delete_document_restores(
    async_client: AsyncClient,
    auth_headers: dict,
    test_project: dict,
    test_folder: dict,
):
    """Test that soft-deleted documents can be restored."""
    # Create a document
    create_resp = await async_client.post(
        "/api/v1/documents/",
        json={
            "name": "TrashTest",
            "content": {},
            "project_id": test_project["id"],
            "folder_id": test_folder["id"],
        },
        headers=auth_headers,
    )
    assert create_resp.status_code == 201
    doc_id = create_resp.json()["id"]

    # Delete it (soft delete)
    del_resp = await async_client.delete(
        f"/api/v1/documents/{doc_id}", headers=auth_headers
    )
    assert del_resp.status_code == 204

    # Verify it's gone from normal GET
    get_resp = await async_client.get(
        f"/api/v1/documents/{doc_id}", headers=auth_headers
    )
    assert get_resp.status_code == 404

    # Verify it appears in trash
    trash_resp = await async_client.get(
        f"/api/v1/documents/trash/{test_project['id']}", headers=auth_headers
    )
    assert trash_resp.status_code == 200
    trash_items = trash_resp.json()
    assert any(d["id"] == doc_id for d in trash_items)

    # Restore it
    restore_resp = await async_client.post(
        f"/api/v1/documents/{doc_id}/restore", headers=auth_headers
    )
    assert restore_resp.status_code == 200
    assert restore_resp.json()["id"] == doc_id

    # Verify it's accessible again
    get_resp2 = await async_client.get(
        f"/api/v1/documents/{doc_id}", headers=auth_headers
    )
    assert get_resp2.status_code == 200
    assert get_resp2.json()["name"] == "TrashTest"


@pytest.mark.asyncio
async def test_permanent_delete_document(
    async_client: AsyncClient,
    auth_headers: dict,
    test_project: dict,
    test_folder: dict,
):
    """Test that permanently deleted documents cannot be restored."""
    # Create a document
    create_resp = await async_client.post(
        "/api/v1/documents/",
        json={
            "name": "PermDeleteTest",
            "content": {},
            "project_id": test_project["id"],
            "folder_id": test_folder["id"],
        },
        headers=auth_headers,
    )
    assert create_resp.status_code == 201
    doc_id = create_resp.json()["id"]

    # Soft delete first
    await async_client.delete(
        f"/api/v1/documents/{doc_id}", headers=auth_headers
    )

    # Permanently delete
    perm_resp = await async_client.delete(
        f"/api/v1/documents/{doc_id}/permanent", headers=auth_headers
    )
    assert perm_resp.status_code == 200

    # Verify it's not in trash
    trash_resp = await async_client.get(
        f"/api/v1/documents/trash/{test_project['id']}", headers=auth_headers
    )
    trash_items = trash_resp.json()
    assert not any(d["id"] == doc_id for d in trash_items)


@pytest.mark.asyncio
async def test_soft_deleted_not_in_listing(
    async_client: AsyncClient,
    auth_headers: dict,
    test_project: dict,
    test_folder: dict,
):
    """Test that soft-deleted documents don't appear in normal listings."""
    # Create two documents
    resp1 = await async_client.post(
        "/api/v1/documents/",
        json={
            "name": "VisibleDoc",
            "content": {},
            "project_id": test_project["id"],
            "folder_id": test_folder["id"],
        },
        headers=auth_headers,
    )
    assert resp1.status_code == 201
    resp2 = await async_client.post(
        "/api/v1/documents/",
        json={
            "name": "DeletedDoc",
            "content": {},
            "project_id": test_project["id"],
            "folder_id": test_folder["id"],
        },
        headers=auth_headers,
    )
    assert resp2.status_code == 201
    doc1_id = resp1.json()["id"]
    doc2_id = resp2.json()["id"]

    # Delete one
    await async_client.delete(
        f"/api/v1/documents/{doc2_id}", headers=auth_headers
    )

    # List documents - should only show the visible one
    list_resp = await async_client.get(
        f"/api/v1/documents/filtered?project_id={test_project['id']}",
        headers=auth_headers,
    )
    assert list_resp.status_code == 200
    doc_ids = [d["id"] for d in list_resp.json()]
    assert doc1_id in doc_ids
    assert doc2_id not in doc_ids
