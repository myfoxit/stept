"""
Tests for /api/v1/public/* endpoints — public workflow and document serving.
"""

import pytest
from httpx import AsyncClient, ASGITransport
from datetime import datetime, timezone

pytestmark = pytest.mark.asyncio


# ─────────────────── Helpers ───────────────────────────


async def _create_and_finalize_workflow(
    client: AsyncClient, headers: dict, project_id: str, name: str = "Public Test WF"
) -> str:
    """Create, upload metadata, and finalize a workflow. Return session_id."""
    resp = await client.post(
        "/api/v1/process-recording/session/create",
        json={
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "client": "TestRecorder",
            "project_id": project_id,
            "name": name,
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    sid = data.get("session_id") or data.get("sessionId")

    # Upload metadata with a step
    metadata = [
        {
            "stepNumber": 1,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "actionType": "click",
            "windowTitle": "Browser",
            "description": "Clicked button",
        },
    ]
    await client.post(
        f"/api/v1/process-recording/session/{sid}/metadata",
        json=metadata,
        headers=headers,
    )

    # Finalize
    resp = await client.post(
        f"/api/v1/process-recording/session/{sid}/finalize",
        headers=headers,
    )
    assert resp.status_code == 200
    return sid


async def _make_workflow_public(client: AsyncClient, headers: dict, session_id: str) -> str:
    """Enable public sharing for a workflow. Return share_token."""
    resp = await client.post(
        f"/api/v1/process-recording/workflow/{session_id}/share/public",
        json={"is_public": True},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["share_token"]


async def _create_public_document(client: AsyncClient, headers: dict, project_id: str, name: str = "Public Doc") -> tuple[str, str]:
    """Create a document, make it public. Return (doc_id, share_token)."""
    resp = await client.post(
        "/api/v1/documents/",
        json={"name": name, "project_id": project_id, "content": {"type": "doc", "content": []}},
        headers=headers,
    )
    assert resp.status_code == 201
    doc_id = resp.json()["id"]

    resp = await client.post(
        f"/api/v1/documents/{doc_id}/share/public",
        headers=headers,
    )
    assert resp.status_code == 200
    token = resp.json()["share_token"]
    return doc_id, token


# ─────────────────── Public workflow: happy path ───────────────────────────


async def test_public_workflow_get_by_share_token(
    async_client: AsyncClient, auth_headers: dict, test_project: dict,
):
    sid = await _create_and_finalize_workflow(async_client, auth_headers, test_project["id"])
    token = await _make_workflow_public(async_client, auth_headers, sid)

    # Access without auth
    resp = await async_client.get(f"/api/v1/public/workflow/{token}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == sid
    assert data["name"] == "Public Test WF"
    assert data["permission"] in ("view", "owner", "edit")


async def test_public_workflow_returns_steps(
    async_client: AsyncClient, auth_headers: dict, test_project: dict,
):
    sid = await _create_and_finalize_workflow(async_client, auth_headers, test_project["id"])
    token = await _make_workflow_public(async_client, auth_headers, sid)

    resp = await async_client.get(f"/api/v1/public/workflow/{token}")
    assert resp.status_code == 200
    data = resp.json()
    steps = data["steps"]
    assert len(steps) >= 1
    step = steps[0]
    assert "step_number" in step
    assert "action_type" in step
    assert "description" in step


# ─────────────────── Public workflow: image endpoint ───────────────────────────


async def test_public_workflow_image_nonexistent_step(
    async_client: AsyncClient, auth_headers: dict, test_project: dict,
):
    """Image endpoint returns 404 for step with no uploaded image."""
    sid = await _create_and_finalize_workflow(async_client, auth_headers, test_project["id"])
    token = await _make_workflow_public(async_client, auth_headers, sid)

    resp = await async_client.get(f"/api/v1/public/workflow/{token}/image/999")
    assert resp.status_code == 404


# ─────────────────── Public workflow: DOM snapshot endpoint ───────────────────


async def test_public_workflow_dom_snapshot_not_found(
    async_client: AsyncClient, auth_headers: dict, test_project: dict,
):
    """DOM snapshot endpoint returns 404 when no snapshot exists."""
    sid = await _create_and_finalize_workflow(async_client, auth_headers, test_project["id"])
    token = await _make_workflow_public(async_client, auth_headers, sid)

    resp = await async_client.get(f"/api/v1/public/workflow/{token}/dom-snapshot/1")
    assert resp.status_code == 404


# ─────────────────── Invalid / expired token ───────────────────────────


async def test_invalid_token_returns_404(async_client: AsyncClient):
    resp = await async_client.get("/api/v1/public/workflow/nonexistent-token-abc")
    assert resp.status_code == 404


# ─────────────────── Non-public workflow returns 403 ───────────────────────────


async def test_non_public_workflow_returns_403(
    async_client: AsyncClient, auth_headers: dict, test_project: dict,
):
    """A workflow that exists but is not public should return 403 for unauthenticated users."""
    sid = await _create_and_finalize_workflow(async_client, auth_headers, test_project["id"])
    # Make public, get token, then disable
    token = await _make_workflow_public(async_client, auth_headers, sid)
    await async_client.delete(
        f"/api/v1/process-recording/workflow/{sid}/share/public",
        headers=auth_headers,
    )

    # Access without auth using a fresh client
    from main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as fresh:
        resp = await fresh.get(f"/api/v1/public/workflow/{token}")
        assert resp.status_code == 403


# ─────────────────── Public document endpoint ───────────────────────────


async def test_public_document_accessible(
    async_client: AsyncClient, auth_headers: dict, test_project: dict,
):
    doc_id, token = await _create_public_document(async_client, auth_headers, test_project["id"])

    resp = await async_client.get(f"/api/v1/public/document/{token}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == doc_id
    assert data["name"] == "Public Doc"
    assert data["permission"] in ("view", "owner", "edit")


async def test_public_document_invalid_token(async_client: AsyncClient):
    resp = await async_client.get("/api/v1/public/document/bad-token")
    assert resp.status_code == 404


async def test_non_public_document_returns_403(
    async_client: AsyncClient, auth_headers: dict, test_project: dict,
):
    """A document that exists but is not public should return 403 for unauthenticated users."""
    doc_id, token = await _create_public_document(async_client, auth_headers, test_project["id"])
    # Disable public access
    await async_client.delete(
        f"/api/v1/documents/{doc_id}/share/public",
        headers=auth_headers,
    )

    from main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as fresh:
        resp = await fresh.get(f"/api/v1/public/document/{token}")
        assert resp.status_code == 403
