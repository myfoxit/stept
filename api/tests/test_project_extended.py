"""Extended tests for /api/v1/projects/* endpoints — member management."""

import json
import base64
from datetime import datetime, timedelta

import pytest
from httpx import AsyncClient


# ─────────────────── Add member ─────────────────────────────────


@pytest.mark.asyncio
async def test_add_project_member(
    async_client: AsyncClient,
    auth_headers: dict,
    second_auth_headers: dict,
    test_project: dict,
):
    """Project owner should be able to add a member."""
    # Get user B's ID
    me_resp = await async_client.get("/api/v1/auth/me", headers=second_auth_headers)
    user_b_id = me_resp.json()["id"]

    resp = await async_client.post(
        f"/api/v1/projects/{test_project['id']}/members",
        json={"user_id": user_b_id, "role": "member"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "added"


@pytest.mark.asyncio
async def test_add_member_unauthorized(
    async_client: AsyncClient,
    auth_headers: dict,
    second_auth_headers: dict,
    test_project: dict,
    test_user_id: str,
):
    """Non-admin should not be able to add members."""
    # User B is not a member of the project at all
    resp = await async_client.post(
        f"/api/v1/projects/{test_project['id']}/members",
        json={"user_id": test_user_id, "role": "member"},
        headers=second_auth_headers,
    )
    assert resp.status_code == 403


# ─────────────────── Remove member ──────────────────────────────


@pytest.mark.asyncio
async def test_remove_project_member(
    async_client: AsyncClient,
    auth_headers: dict,
    second_auth_headers: dict,
    test_project: dict,
):
    """Owner can remove a member."""
    # Get user B's ID and add them first
    me_resp = await async_client.get("/api/v1/auth/me", headers=second_auth_headers)
    user_b_id = me_resp.json()["id"]

    await async_client.post(
        f"/api/v1/projects/{test_project['id']}/members",
        json={"user_id": user_b_id, "role": "member"},
        headers=auth_headers,
    )

    # Now remove
    resp = await async_client.delete(
        f"/api/v1/projects/{test_project['id']}/members/{user_b_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "removed"


# ────────────── Update member role ──────────────────────────────


@pytest.mark.asyncio
async def test_update_member_role(
    async_client: AsyncClient,
    auth_headers: dict,
    second_auth_headers: dict,
    test_project: dict,
):
    """Owner can update a member's role."""
    me_resp = await async_client.get("/api/v1/auth/me", headers=second_auth_headers)
    user_b_id = me_resp.json()["id"]

    # Add as member
    await async_client.post(
        f"/api/v1/projects/{test_project['id']}/members",
        json={"user_id": user_b_id, "role": "member"},
        headers=auth_headers,
    )

    # Update to admin
    resp = await async_client.put(
        f"/api/v1/projects/{test_project['id']}/members/{user_b_id}",
        json={"role": "admin"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "updated"


# ─────────────────── List members ───────────────────────────────


@pytest.mark.asyncio
async def test_get_project_members(
    async_client: AsyncClient,
    auth_headers: dict,
    test_project: dict,
    test_user_id: str,
):
    """GET /projects/{id}/members should list project members."""
    resp = await async_client.get(
        f"/api/v1/projects/{test_project['id']}/members",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    # The owner should be in the list
    user_ids = [m["user_id"] for m in data]
    assert test_user_id in user_ids


@pytest.mark.asyncio
async def test_get_members_unauthorized(
    async_client: AsyncClient,
    second_auth_headers: dict,
    test_project: dict,
):
    """Non-member should not be able to list members."""
    resp = await async_client.get(
        f"/api/v1/projects/{test_project['id']}/members",
        headers=second_auth_headers,
    )
    assert resp.status_code == 403


# ─────────────────── Get own role ───────────────────────────────


@pytest.mark.asyncio
async def test_get_user_role(
    async_client: AsyncClient,
    auth_headers: dict,
    test_project: dict,
):
    """GET /projects/{id}/role should return the user's role."""
    resp = await async_client.get(
        f"/api/v1/projects/{test_project['id']}/role",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "role" in data
    assert data["role"] == "owner"


@pytest.mark.asyncio
async def test_get_role_non_member(
    async_client: AsyncClient,
    second_auth_headers: dict,
    test_project: dict,
):
    """Non-member should get null role."""
    resp = await async_client.get(
        f"/api/v1/projects/{test_project['id']}/role",
        headers=second_auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["role"] is None


@pytest.mark.asyncio
async def test_get_role_no_auth(async_client: AsyncClient, test_project: dict):
    async_client.cookies.clear()
    resp = await async_client.get(
        f"/api/v1/projects/{test_project['id']}/role",
    )
    assert resp.status_code == 401


# ─────────────────── Invite link ────────────────────────────────


@pytest.mark.asyncio
async def test_create_invite_link(
    async_client: AsyncClient,
    auth_headers: dict,
    test_project: dict,
):
    """POST /projects/{id}/invite should create an invite token."""
    resp = await async_client.post(
        f"/api/v1/projects/{test_project['id']}/invite",
        json={"role": "viewer", "email": "other@example.com"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert "expires_at" in data
    # Token is HMAC-signed: payload.signature
    parts = data["token"].split(".")
    assert len(parts) == 2, "Token should be payload.signature"
    decoded = json.loads(base64.urlsafe_b64decode(parts[0] + "=="))
    assert decoded["project_id"] == test_project["id"]
    assert decoded["role"] == "viewer"


@pytest.mark.asyncio
async def test_create_invite_link_unauthorized(
    async_client: AsyncClient,
    second_auth_headers: dict,
    test_project: dict,
):
    """Non-admin should not be able to create invites."""
    resp = await async_client.post(
        f"/api/v1/projects/{test_project['id']}/invite",
        json={"role": "viewer", "email": "other@example.com"},
        headers=second_auth_headers,
    )
    assert resp.status_code == 403


# ─────────────────── Join via invite ────────────────────────────


@pytest.mark.asyncio
async def test_join_project_with_invite(
    async_client: AsyncClient,
    auth_headers: dict,
    second_auth_headers: dict,
    test_project: dict,
):
    """User B joins User A's project via invite token."""
    # Create invite
    invite_resp = await async_client.post(
        f"/api/v1/projects/{test_project['id']}/invite",
        json={"role": "viewer", "email": "other@example.com"},
        headers=auth_headers,
    )
    token = invite_resp.json()["token"]

    # User B joins
    resp = await async_client.post(
        "/api/v1/projects/join",
        json={"token": token},
        headers=second_auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("joined", "already_member")
    assert data["project_id"] == test_project["id"]


@pytest.mark.asyncio
async def test_join_project_already_member(
    async_client: AsyncClient,
    auth_headers: dict,
    second_auth_headers: dict,
    test_project: dict,
):
    """Joining a project you're already a member of should indicate that."""
    # Create invite
    invite_resp = await async_client.post(
        f"/api/v1/projects/{test_project['id']}/invite",
        json={"role": "viewer", "email": "other@example.com"},
        headers=auth_headers,
    )
    token = invite_resp.json()["token"]

    # User B joins first time
    await async_client.post(
        "/api/v1/projects/join",
        json={"token": token},
        headers=second_auth_headers,
    )

    # User B joins again
    resp = await async_client.post(
        "/api/v1/projects/join",
        json={"token": token},
        headers=second_auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "already_member"


@pytest.mark.asyncio
async def test_join_project_invalid_token(
    async_client: AsyncClient, auth_headers: dict
):
    """Invalid invite token should return 400."""
    resp = await async_client.post(
        "/api/v1/projects/join",
        json={"token": "completely-invalid-token"},
        headers=auth_headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_join_project_expired_token(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    """Expired invite token should return 400."""
    # Create a manually-expired token
    invite_data = {
        "project_id": test_project["id"],
        "role": "member",
        "invited_by": "fake-user",
        "expires_at": (datetime.utcnow() - timedelta(days=1)).isoformat(),
        "token": "expired-token",
    }
    token = base64.urlsafe_b64encode(json.dumps(invite_data).encode()).decode()

    resp = await async_client.post(
        "/api/v1/projects/join",
        json={"token": token},
        headers=auth_headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_join_project_no_auth(async_client: AsyncClient):
    resp = await async_client.post(
        "/api/v1/projects/join",
        json={"token": "some-token"},
    )
    assert resp.status_code == 401


# ─────────────────── Edge cases ─────────────────────────────────


@pytest.mark.asyncio
async def test_create_invite_invalid_role(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    """Invalid role should be rejected."""
    resp = await async_client.post(
        f"/api/v1/projects/{test_project['id']}/invite",
        json={"role": "superadmin", "email": "other@example.com"},
        headers=auth_headers,
    )
    # Pydantic validation rejects invalid role with 422
    assert resp.status_code in (400, 422)


@pytest.mark.asyncio
async def test_add_member_to_nonexistent_project(
    async_client: AsyncClient, auth_headers: dict, test_user_id: str
):
    """Adding a member to a nonexistent project should fail."""
    resp = await async_client.post(
        "/api/v1/projects/nonexistent/members",
        json={"user_id": test_user_id, "role": "member"},
        headers=auth_headers,
    )
    assert resp.status_code == 403  # Permission check fails first
