"""Tests for /api/v1/auth/* endpoints."""

import pytest
from httpx import AsyncClient

from conftest import _verify_user_by_email


# ───────────────────────────── Registration ──────────────────────────────


@pytest.mark.asyncio
async def test_register_new_user(async_client: AsyncClient):
    resp = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": "new@example.com",
            "password": "StrongP4ss!",
            "name": "newbie",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "new@example.com"
    assert "id" in data
    # Should set session cookie
    assert "session_stept" in resp.cookies


@pytest.mark.asyncio
async def test_register_duplicate_email(async_client: AsyncClient):
    payload = {
        "email": "dup@example.com",
        "password": "Pass1234!",
        "name": "dup1",
    }
    resp1 = await async_client.post("/api/v1/auth/register", json=payload)
    assert resp1.status_code == 200

    # Same email again → 409
    resp2 = await async_client.post("/api/v1/auth/register", json=payload)
    assert resp2.status_code == 409
    assert resp2.json()["detail"] == "EMAIL_TAKEN"


# ─────────────────────────────── Login ───────────────────────────────────


@pytest.mark.asyncio
async def test_login_valid_credentials(async_client: AsyncClient):
    # First register
    await async_client.post(
        "/api/v1/auth/register",
        json={"email": "login@example.com", "password": "Pass1234!", "name": "loginuser"},
    )

    # Verify email (required after #92 enforcement)
    await _verify_user_by_email("login@example.com")

    resp = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "login@example.com", "password": "Pass1234!"},
    )
    assert resp.status_code == 200
    assert "session_stept" in resp.cookies
    data = resp.json()
    assert data["email"] == "login@example.com"


@pytest.mark.asyncio
async def test_login_invalid_password(async_client: AsyncClient):
    await async_client.post(
        "/api/v1/auth/register",
        json={"email": "wrongpw@example.com", "password": "Correct1!", "name": "wpwuser"},
    )

    resp = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "wrongpw@example.com", "password": "WrongPassword!"},
    )
    assert resp.status_code == 401
    assert resp.json()["detail"] == "BAD_CREDENTIALS"


@pytest.mark.asyncio
async def test_login_nonexistent_user(async_client: AsyncClient):
    resp = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "ghost@example.com", "password": "Whatever1!"},
    )
    assert resp.status_code == 401
    assert resp.json()["detail"] == "BAD_CREDENTIALS"


# ─────────────────────────── Current user ────────────────────────────────


@pytest.mark.asyncio
async def test_get_current_user(async_client: AsyncClient, auth_headers: dict):
    resp = await async_client.get("/api/v1/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "test@example.com"
    assert "id" in data


@pytest.mark.asyncio
async def test_get_current_user_no_auth(async_client: AsyncClient):
    resp = await async_client.get("/api/v1/auth/me")
    assert resp.status_code == 401


# ──────────────────────────── Token refresh ──────────────────────────────


@pytest.mark.asyncio
async def test_token_refresh(async_client: AsyncClient, auth_headers: dict):
    """
    The web flow uses cookie-based sessions, so the 'refresh' is simply
    that the session cookie keeps working on subsequent requests.
    """
    # First request — validates the session
    resp1 = await async_client.get("/api/v1/auth/me", headers=auth_headers)
    assert resp1.status_code == 200

    # Second request — same cookie, should still work
    resp2 = await async_client.get("/api/v1/auth/me", headers=auth_headers)
    assert resp2.status_code == 200
    assert resp2.json()["email"] == resp1.json()["email"]
