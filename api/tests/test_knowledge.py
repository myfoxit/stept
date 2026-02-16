"""Tests for /api/v1/knowledge/* endpoints — Phase 1: File Upload."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_upload_text_file(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    resp = await async_client.post(
        "/api/v1/knowledge/upload",
        files={"file": ("test.txt", b"Hello world content for testing", "text/plain")},
        data={"project_id": test_project["id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "id" in data
    assert data["name"] == "test.txt"
    assert data["source_type"] == "upload"


@pytest.mark.asyncio
async def test_upload_markdown_file(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    resp = await async_client.post(
        "/api/v1/knowledge/upload",
        files={"file": ("readme.md", b"# Title\n\nSome markdown content", "text/markdown")},
        data={"project_id": test_project["id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "readme.md"
    assert data["source_type"] == "upload"


@pytest.mark.asyncio
async def test_list_knowledge_sources(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    project_id = test_project["id"]
    # Upload two files
    for name in ("a.txt", "b.txt"):
        resp = await async_client.post(
            "/api/v1/knowledge/upload",
            files={"file": (name, b"content", "text/plain")},
            data={"project_id": project_id},
            headers=auth_headers,
        )
        assert resp.status_code == 200

    resp = await async_client.get(
        "/api/v1/knowledge/sources",
        params={"project_id": project_id},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    sources = resp.json()
    assert len(sources) >= 2


@pytest.mark.asyncio
async def test_get_knowledge_source(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    upload_resp = await async_client.post(
        "/api/v1/knowledge/upload",
        files={"file": ("get_me.txt", b"get me content", "text/plain")},
        data={"project_id": test_project["id"]},
        headers=auth_headers,
    )
    source_id = upload_resp.json()["id"]

    resp = await async_client.get(
        f"/api/v1/knowledge/sources/{source_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["id"] == source_id
    assert resp.json()["name"] == "get_me.txt"


@pytest.mark.asyncio
async def test_delete_knowledge_source(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    upload_resp = await async_client.post(
        "/api/v1/knowledge/upload",
        files={"file": ("delete_me.txt", b"delete me", "text/plain")},
        data={"project_id": test_project["id"]},
        headers=auth_headers,
    )
    source_id = upload_resp.json()["id"]

    del_resp = await async_client.delete(
        f"/api/v1/knowledge/sources/{source_id}",
        headers=auth_headers,
    )
    assert del_resp.status_code == 200
    assert del_resp.json()["deleted"] is True

    # Verify 404 on re-fetch
    get_resp = await async_client.get(
        f"/api/v1/knowledge/sources/{source_id}",
        headers=auth_headers,
    )
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_upload_requires_auth(
    async_client: AsyncClient, test_project: dict
):
    resp = await async_client.post(
        "/api/v1/knowledge/upload",
        files={"file": ("noauth.txt", b"no auth", "text/plain")},
        data={"project_id": test_project["id"]},
    )
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_upload_wrong_project(
    async_client: AsyncClient, auth_headers: dict
):
    resp = await async_client.post(
        "/api/v1/knowledge/upload",
        files={"file": ("wrong.txt", b"wrong project", "text/plain")},
        data={"project_id": "nonexistent-project-id"},
        headers=auth_headers,
    )
    assert resp.status_code in (403, 404)
