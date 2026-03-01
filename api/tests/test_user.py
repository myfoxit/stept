"""Tests for /api/v1/users/* endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_user(async_client: AsyncClient, auth_headers: dict):
    """POST /users/ — create a user (requires auth)."""
    resp = await async_client.post(
        "/api/v1/users/",
        json={
            "email": "newuser@test.com",
            "password": "NewUser123!",
            "name": "newuser",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "newuser@test.com"
    assert "id" in data


@pytest.mark.asyncio
async def test_create_user_no_auth(async_client: AsyncClient):
    """Creating a user without authentication should fail."""
    resp = await async_client.post(
        "/api/v1/users/",
        json={
            "email": "unauthorized@test.com",
            "password": "Password123!",
            "name": "unauth",
        },
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_users(async_client: AsyncClient, auth_headers: dict):
    """GET /users/ — list users."""
    # The auth_headers fixture already registers a user
    resp = await async_client.get("/api/v1/users/")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    # Each user should have id and email
    for u in data:
        assert "id" in u
        assert "email" in u


@pytest.mark.asyncio
async def test_create_user_returns_data(
    async_client: AsyncClient, auth_headers: dict
):
    """POST /users/ returns the created user with correct fields."""
    resp = await async_client.post(
        "/api/v1/users/",
        json={
            "email": "findme@test.com",
            "password": "FindMe123!",
            "name": "findme",
        },
        headers=auth_headers,
    )
    assert resp.status_code in (200, 201), f"Create user failed: {resp.text}"
    data = resp.json()
    assert data["email"] == "findme@test.com"
    assert data["name"] == "findme"
    assert "id" in data


@pytest.mark.asyncio
async def test_list_users_scoped_to_project_peers(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    """GET /users/ only returns users who share a project."""
    # Create a second user via registration (not in any project)
    await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": "outsider@test.com",
            "password": "Outside123!",
            "name": "outsider",
        },
    )

    # List users — outsider should NOT appear (no shared project)
    resp = await async_client.get("/api/v1/users/", headers=auth_headers)
    assert resp.status_code == 200
    emails = [u["email"] for u in resp.json()]
    assert "outsider@test.com" not in emails

    # The authenticated user themselves should appear
    assert "test@example.com" in emails
