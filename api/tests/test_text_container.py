"""Tests for /api/v1/text_container/* endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_text_container(async_client: AsyncClient, auth_headers: dict):
    """POST /text_container should create a new container."""
    resp = await async_client.post(
        "/api/v1/text_container/",
        json={"name": "Test Container", "content": {"type": "doc", "content": []}},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Test Container"
    assert "id" in data


@pytest.mark.asyncio
async def test_list_text_containers(async_client: AsyncClient, auth_headers: dict):
    """GET /text_container should list containers."""
    # Create one first
    await async_client.post(
        "/api/v1/text_container/",
        json={"name": "List Test", "content": {}},
        headers=auth_headers,
    )

    resp = await async_client.get("/api/v1/text_container/", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1


@pytest.mark.asyncio
async def test_get_text_container(async_client: AsyncClient, auth_headers: dict):
    """GET /text_container/<id> should return the container."""
    create_resp = await async_client.post(
        "/api/v1/text_container/",
        json={"name": "Get Test", "content": {"key": "value"}},
        headers=auth_headers,
    )
    tc_id = create_resp.json()["id"]

    resp = await async_client.get(f"/api/v1/text_container/{tc_id}", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == tc_id
    assert data["name"] == "Get Test"
    assert data["content"] == {"key": "value"}


@pytest.mark.asyncio
async def test_get_text_container_not_found(async_client: AsyncClient, auth_headers: dict):
    """GET /text_container/<nonexistent> should return 404."""
    resp = await async_client.get("/api/v1/text_container/nonexistent-id", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_text_container(async_client: AsyncClient, auth_headers: dict):
    """PUT /text_container/<id> should update the container."""
    create_resp = await async_client.post(
        "/api/v1/text_container/",
        json={"name": "Update Test", "content": {"old": True}},
        headers=auth_headers,
    )
    tc_id = create_resp.json()["id"]

    resp = await async_client.put(
        f"/api/v1/text_container/{tc_id}/",
        json={"id": tc_id, "name": "Updated Name", "content": {"new": True}},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Updated Name"
    assert data["content"] == {"new": True}


@pytest.mark.asyncio
async def test_text_container_unauthenticated(async_client: AsyncClient):
    """Endpoints should require auth."""
    resp = await async_client.get("/api/v1/text_container/")
    assert resp.status_code in (401, 403)
