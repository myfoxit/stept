"""Tests for /api/v1/links/* endpoints — Phase 4: Knowledge Graph."""

import pytest
from httpx import AsyncClient


async def _create_doc(async_client, auth_headers, project, folder, name="Doc"):
    resp = await async_client.post(
        "/api/v1/documents/",
        json={
            "name": name,
            "content": {},
            "project_id": project["id"],
            "folder_id": folder["id"],
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    return resp.json()


@pytest.mark.asyncio
async def test_create_link(
    async_client: AsyncClient, auth_headers: dict, test_project: dict, test_folder: dict
):
    doc1 = await _create_doc(async_client, auth_headers, test_project, test_folder, "A")
    doc2 = await _create_doc(async_client, auth_headers, test_project, test_folder, "B")

    resp = await async_client.post(
        "/api/v1/links",
        json={
            "project_id": test_project["id"],
            "source_type": "document",
            "source_id": doc1["id"],
            "target_type": "document",
            "target_id": doc2["id"],
            "link_type": "related",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "id" in data
    assert data["source_id"] == doc1["id"]
    assert data["target_id"] == doc2["id"]
    assert data["link_type"] == "related"


@pytest.mark.asyncio
async def test_list_links(
    async_client: AsyncClient, auth_headers: dict, test_project: dict, test_folder: dict
):
    doc1 = await _create_doc(async_client, auth_headers, test_project, test_folder, "L1")
    doc2 = await _create_doc(async_client, auth_headers, test_project, test_folder, "L2")

    await async_client.post(
        "/api/v1/links",
        json={
            "project_id": test_project["id"],
            "source_type": "document",
            "source_id": doc1["id"],
            "target_type": "document",
            "target_id": doc2["id"],
            "link_type": "related",
        },
        headers=auth_headers,
    )

    resp = await async_client.get(
        "/api/v1/links",
        params={"project_id": test_project["id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


@pytest.mark.asyncio
async def test_list_links_filtered(
    async_client: AsyncClient, auth_headers: dict, test_project: dict, test_folder: dict
):
    doc1 = await _create_doc(async_client, auth_headers, test_project, test_folder, "F1")
    doc2 = await _create_doc(async_client, auth_headers, test_project, test_folder, "F2")

    await async_client.post(
        "/api/v1/links",
        json={
            "project_id": test_project["id"],
            "source_type": "document",
            "source_id": doc1["id"],
            "target_type": "document",
            "target_id": doc2["id"],
            "link_type": "depends_on",
        },
        headers=auth_headers,
    )

    resp = await async_client.get(
        "/api/v1/links",
        params={
            "project_id": test_project["id"],
            "resource_type": "document",
            "resource_id": doc1["id"],
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    links = resp.json()
    assert len(links) >= 1
    assert any(l["source_id"] == doc1["id"] or l["target_id"] == doc1["id"] for l in links)


@pytest.mark.asyncio
async def test_delete_link(
    async_client: AsyncClient, auth_headers: dict, test_project: dict, test_folder: dict
):
    doc1 = await _create_doc(async_client, auth_headers, test_project, test_folder, "D1")
    doc2 = await _create_doc(async_client, auth_headers, test_project, test_folder, "D2")

    create_resp = await async_client.post(
        "/api/v1/links",
        json={
            "project_id": test_project["id"],
            "source_type": "document",
            "source_id": doc1["id"],
            "target_type": "document",
            "target_id": doc2["id"],
            "link_type": "related",
        },
        headers=auth_headers,
    )
    link_id = create_resp.json()["id"]

    del_resp = await async_client.delete(
        f"/api/v1/links/{link_id}",
        params={"project_id": test_project["id"]},
        headers=auth_headers,
    )
    assert del_resp.status_code == 200


@pytest.mark.asyncio
async def test_get_graph_empty(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    resp = await async_client.get(
        "/api/v1/links/graph",
        params={"project_id": test_project["id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["nodes"] == []
    assert data["edges"] == []


@pytest.mark.asyncio
async def test_get_graph_with_links(
    async_client: AsyncClient, auth_headers: dict, test_project: dict, test_folder: dict
):
    doc1 = await _create_doc(async_client, auth_headers, test_project, test_folder, "G1")
    doc2 = await _create_doc(async_client, auth_headers, test_project, test_folder, "G2")

    await async_client.post(
        "/api/v1/links",
        json={
            "project_id": test_project["id"],
            "source_type": "document",
            "source_id": doc1["id"],
            "target_type": "document",
            "target_id": doc2["id"],
            "link_type": "related",
        },
        headers=auth_headers,
    )

    resp = await async_client.get(
        "/api/v1/links/graph",
        params={"project_id": test_project["id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["nodes"]) >= 2
    assert len(data["edges"]) >= 1


@pytest.mark.asyncio
async def test_invalid_link_type(
    async_client: AsyncClient, auth_headers: dict, test_project: dict, test_folder: dict
):
    doc1 = await _create_doc(async_client, auth_headers, test_project, test_folder, "I1")
    doc2 = await _create_doc(async_client, auth_headers, test_project, test_folder, "I2")

    resp = await async_client.post(
        "/api/v1/links",
        json={
            "project_id": test_project["id"],
            "source_type": "document",
            "source_id": doc1["id"],
            "target_type": "document",
            "target_id": doc2["id"],
            "link_type": "invalid_type_xyz",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 400
