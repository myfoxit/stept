"""
Tests for the sharing system: ResourceShare, public links, invites, shared-with-me.
"""

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


# ─────────────────── Helpers ───────────────────────────

async def create_document(client: AsyncClient, headers: dict, project_id: str, name: str = "Test Doc") -> dict:
    resp = await client.post(
        "/api/v1/documents/",
        json={"name": name, "project_id": project_id, "content": {"type": "doc", "content": []}},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


# ─────────────────── Share Settings ───────────────────────────

async def test_get_share_settings_default(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    doc = await create_document(async_client, auth_headers, test_project["id"])
    resp = await async_client.get(f"/api/v1/documents/{doc['id']}/share", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_public"] is False
    assert data["shared_with"] == []


async def test_get_share_settings_requires_auth(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    """Share settings endpoint requires authentication (returns 401 or no access without valid session)."""
    doc = await create_document(async_client, auth_headers, test_project["id"])
    # Create a fresh client with no cookies
    from httpx import ASGITransport, AsyncClient as AC
    from main import app
    async with AC(transport=ASGITransport(app=app), base_url="http://test") as fresh:
        resp = await fresh.get(f"/api/v1/documents/{doc['id']}/share")
        assert resp.status_code in (401, 403)


# ─────────────────── Public Links ───────────────────────────

async def test_enable_public_link(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    doc = await create_document(async_client, auth_headers, test_project["id"])
    resp = await async_client.post(f"/api/v1/documents/{doc['id']}/share/public", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_public"] is True
    assert data["share_token"] is not None


async def test_disable_public_link(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    doc = await create_document(async_client, auth_headers, test_project["id"])
    # Enable first
    await async_client.post(f"/api/v1/documents/{doc['id']}/share/public", headers=auth_headers)
    # Disable
    resp = await async_client.delete(f"/api/v1/documents/{doc['id']}/share/public", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_public"] is False
    # share_token should be preserved (not deleted)
    assert data["share_token"] is not None


async def test_public_link_toggle_preserves_token(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    doc = await create_document(async_client, auth_headers, test_project["id"])
    # Enable
    resp1 = await async_client.post(f"/api/v1/documents/{doc['id']}/share/public", headers=auth_headers)
    token1 = resp1.json()["share_token"]
    # Disable
    await async_client.delete(f"/api/v1/documents/{doc['id']}/share/public", headers=auth_headers)
    # Re-enable
    resp2 = await async_client.post(f"/api/v1/documents/{doc['id']}/share/public", headers=auth_headers)
    token2 = resp2.json()["share_token"]
    # Token should be the same
    assert token1 == token2


async def test_public_document_accessible(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    doc = await create_document(async_client, auth_headers, test_project["id"], "Public Doc")
    resp = await async_client.post(f"/api/v1/documents/{doc['id']}/share/public", headers=auth_headers)
    token = resp.json()["share_token"]
    # Access public endpoint (no auth)
    resp = await async_client.get(f"/api/v1/public/document/{token}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Public Doc"


async def test_disabled_public_link_returns_403(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    doc = await create_document(async_client, auth_headers, test_project["id"])
    # Enable then disable
    resp = await async_client.post(f"/api/v1/documents/{doc['id']}/share/public", headers=auth_headers)
    token = resp.json()["share_token"]
    await async_client.delete(f"/api/v1/documents/{doc['id']}/share/public", headers=auth_headers)
    # Try public access with a fresh client (no auth cookies)
    from httpx import ASGITransport, AsyncClient as AC
    from main import app
    async with AC(transport=ASGITransport(app=app), base_url="http://test") as fresh:
        resp = await fresh.get(f"/api/v1/public/document/{token}")
        assert resp.status_code == 403


async def test_invalid_share_token_returns_404(async_client: AsyncClient):
    resp = await async_client.get("/api/v1/public/document/nonexistent-token")
    assert resp.status_code == 404


# ─────────────────── Invite Users ───────────────────────────

async def test_invite_user_to_document(async_client: AsyncClient, auth_headers: dict, second_auth_headers: dict, test_project: dict):
    doc = await create_document(async_client, auth_headers, test_project["id"])
    resp = await async_client.post(
        f"/api/v1/documents/{doc['id']}/share/invite",
        json={"email": "other@example.com", "permission": "view"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "other@example.com"
    assert data["permission"] == "view"


async def test_invite_user_edit_permission(async_client: AsyncClient, auth_headers: dict, second_auth_headers: dict, test_project: dict):
    doc = await create_document(async_client, auth_headers, test_project["id"])
    resp = await async_client.post(
        f"/api/v1/documents/{doc['id']}/share/invite",
        json={"email": "other@example.com", "permission": "edit"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["permission"] == "edit"


async def test_shared_document_appears_in_share_settings(
    async_client: AsyncClient, auth_headers: dict, second_auth_headers: dict, test_project: dict,
):
    doc = await create_document(async_client, auth_headers, test_project["id"])
    await async_client.post(
        f"/api/v1/documents/{doc['id']}/share/invite",
        json={"email": "other@example.com", "permission": "view"},
        headers=auth_headers,
    )
    resp = await async_client.get(f"/api/v1/documents/{doc['id']}/share", headers=auth_headers)
    assert resp.status_code == 200
    shared_with = resp.json()["shared_with"]
    assert len(shared_with) >= 1
    emails = [s["email"] for s in shared_with]
    assert "other@example.com" in emails


async def test_remove_invite(async_client: AsyncClient, auth_headers: dict, second_auth_headers: dict, test_project: dict):
    doc = await create_document(async_client, auth_headers, test_project["id"])
    resp = await async_client.post(
        f"/api/v1/documents/{doc['id']}/share/invite",
        json={"email": "other@example.com", "permission": "view"},
        headers=auth_headers,
    )
    share_id = resp.json()["id"]
    # Remove
    resp = await async_client.delete(
        f"/api/v1/documents/{doc['id']}/share/invite/{share_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    # Verify removed
    resp = await async_client.get(f"/api/v1/documents/{doc['id']}/share", headers=auth_headers)
    shared_with = resp.json()["shared_with"]
    assert len(shared_with) == 0


async def test_update_invite_permission(
    async_client: AsyncClient, auth_headers: dict, second_auth_headers: dict, test_project: dict,
):
    doc = await create_document(async_client, auth_headers, test_project["id"])
    resp = await async_client.post(
        f"/api/v1/documents/{doc['id']}/share/invite",
        json={"email": "other@example.com", "permission": "view"},
        headers=auth_headers,
    )
    share_id = resp.json()["id"]
    # Update to edit
    resp = await async_client.patch(
        f"/api/v1/documents/{doc['id']}/share/invite/{share_id}",
        json={"permission": "edit"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    # Verify updated
    resp = await async_client.get(f"/api/v1/documents/{doc['id']}/share", headers=auth_headers)
    perms = {s["email"]: s["permission"] for s in resp.json()["shared_with"]}
    assert perms["other@example.com"] == "edit"


# ─────────────────── Shared With Me ───────────────────────────

async def test_shared_with_me_empty(async_client: AsyncClient, auth_headers: dict):
    resp = await async_client.get("/api/v1/shared-with-me", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []


async def test_shared_with_me_shows_shared_documents(
    async_client: AsyncClient, auth_headers: dict, second_auth_headers: dict, test_project: dict,
):
    doc = await create_document(async_client, auth_headers, test_project["id"], "Shared Doc")
    await async_client.post(
        f"/api/v1/documents/{doc['id']}/share/invite",
        json={"email": "other@example.com", "permission": "view"},
        headers=auth_headers,
    )
    # Check from second user's perspective
    resp = await async_client.get("/api/v1/shared-with-me", headers=second_auth_headers)
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) >= 1
    shared_doc = next((i for i in items if i["resource_id"] == doc["id"]), None)
    assert shared_doc is not None
    assert shared_doc["resource_type"] == "document"
    assert shared_doc["permission"] == "view"
    assert shared_doc["resource"]["name"] == "Shared Doc"


async def test_shared_with_me_unauthenticated(async_client: AsyncClient):
    from httpx import ASGITransport, AsyncClient as AC
    from main import app
    async with AC(transport=ASGITransport(app=app), base_url="http://test") as fresh:
        resp = await fresh.get("/api/v1/shared-with-me")
        assert resp.status_code in (401, 403)


# ─────────────────── Document Permission Enforcement ───────────────────────────

async def test_document_returns_permission_field(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    doc = await create_document(async_client, auth_headers, test_project["id"])
    resp = await async_client.get(f"/api/v1/documents/{doc['id']}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["permission"] == "edit"  # Owner always has edit


async def test_view_only_user_cannot_edit(
    async_client: AsyncClient, auth_headers: dict, second_auth_headers: dict, test_project: dict,
):
    doc = await create_document(async_client, auth_headers, test_project["id"])
    # Share with view-only
    await async_client.post(
        f"/api/v1/documents/{doc['id']}/share/invite",
        json={"email": "other@example.com", "permission": "view"},
        headers=auth_headers,
    )
    # Second user tries to update
    resp = await async_client.put(
        f"/api/v1/documents/{doc['id']}",
        json={"name": "Hacked Name", "content": {"type": "doc", "content": []}},
        headers=second_auth_headers,
    )
    assert resp.status_code == 403


async def test_edit_user_can_edit(
    async_client: AsyncClient, auth_headers: dict, second_auth_headers: dict, test_project: dict,
):
    doc = await create_document(async_client, auth_headers, test_project["id"])
    # Share with edit permission
    await async_client.post(
        f"/api/v1/documents/{doc['id']}/share/invite",
        json={"email": "other@example.com", "permission": "edit"},
        headers=auth_headers,
    )
    # Second user updates
    resp = await async_client.put(
        f"/api/v1/documents/{doc['id']}",
        json={"name": "Updated Name", "content": {"type": "doc", "content": []}},
        headers=second_auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Name"


# ─────────────────── Documents default to private ───────────────────────────

async def test_document_default_private(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    doc = await create_document(async_client, auth_headers, test_project["id"])
    assert doc.get("is_private") is True
