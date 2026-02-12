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
async def test_list_users_returns_created_user(
    async_client: AsyncClient, auth_headers: dict
):
    """Users created via /users/ should appear in the list."""
    # Create a user
    await async_client.post(
        "/api/v1/users/",
        json={
            "email": "findme@test.com",
            "password": "FindMe123!",
            "name": "findme",
        },
        headers=auth_headers,
    )

    # List users
    resp = await async_client.get("/api/v1/users/")
    assert resp.status_code == 200
    emails = [u["email"] for u in resp.json()]
    assert "findme@test.com" in emails
