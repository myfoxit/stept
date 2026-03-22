"""
Tests for /api/v1/context-links/* endpoints — CRUD, matching, scoring, click tracking.
"""

import pytest
from httpx import AsyncClient
from datetime import datetime, timezone

pytestmark = pytest.mark.asyncio


# ─────────────────── Helpers ───────────────────────────


async def _create_workflow(client: AsyncClient, headers: dict, project_id: str, name: str = "Test WF") -> str:
    """Create and finalize a workflow, return session_id."""
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
    # Finalize
    resp = await client.post(
        f"/api/v1/process-recording/session/{sid}/finalize",
        headers=headers,
    )
    assert resp.status_code == 200
    return sid


async def _create_context_link(
    client: AsyncClient,
    headers: dict,
    project_id: str,
    resource_id: str,
    match_type: str = "url_pattern",
    match_value: str = "*.example.com*",
    resource_type: str = "workflow",
    note: str | None = None,
) -> dict:
    resp = await client.post(
        "/api/v1/context-links",
        json={
            "project_id": project_id,
            "match_type": match_type,
            "match_value": match_value,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "note": note,
        },
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


# ─────────────────── Create ───────────────────────────


async def test_create_context_link(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    wf_id = await _create_workflow(async_client, auth_headers, test_project["id"])
    link = await _create_context_link(
        async_client, auth_headers, test_project["id"], wf_id,
        note="Help for example.com",
    )
    assert link["id"]
    assert link["match_type"] == "url_pattern"
    assert link["match_value"] == "*.example.com*"
    assert link["resource_id"] == wf_id
    assert link["source"] == "user"
    assert link["weight"] == 1000.0
    assert link["note"] == "Help for example.com"


async def test_create_context_link_dedup(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    """Creating the same link twice returns the existing entry."""
    wf_id = await _create_workflow(async_client, auth_headers, test_project["id"])
    link1 = await _create_context_link(async_client, auth_headers, test_project["id"], wf_id)
    link2 = await _create_context_link(async_client, auth_headers, test_project["id"], wf_id)
    assert link1["id"] == link2["id"]


# ─────────────────── List ───────────────────────────


async def test_list_context_links(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    wf_id = await _create_workflow(async_client, auth_headers, test_project["id"])
    await _create_context_link(async_client, auth_headers, test_project["id"], wf_id)

    resp = await async_client.get(
        f"/api/v1/context-links?project_id={test_project['id']}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    links = resp.json()
    assert len(links) >= 1
    assert any(l["resource_id"] == wf_id for l in links)


async def test_list_context_links_empty(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    resp = await async_client.get(
        f"/api/v1/context-links?project_id={test_project['id']}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json() == []


# ─────────────────── Match by URL ───────────────────────────


async def test_match_by_url_pattern(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    wf_id = await _create_workflow(async_client, auth_headers, test_project["id"])
    await _create_context_link(
        async_client, auth_headers, test_project["id"], wf_id,
        match_type="url_pattern", match_value="*.example.com*",
    )

    resp = await async_client.get(
        f"/api/v1/context-links/match?url=https://app.example.com/dashboard&project_id={test_project['id']}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    matches = resp.json()["matches"]
    assert len(matches) >= 1
    assert matches[0]["resource_id"] == wf_id
    assert matches[0]["final_score"] > 0


async def test_match_no_results(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    resp = await async_client.get(
        f"/api/v1/context-links/match?url=https://nomatch.org&project_id={test_project['id']}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["matches"] == []


# ─────────────────── Match by app_name ───────────────────────────


async def test_match_by_app_name(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    wf_id = await _create_workflow(async_client, auth_headers, test_project["id"])
    await _create_context_link(
        async_client, auth_headers, test_project["id"], wf_id,
        match_type="app_name", match_value="Figma",
    )

    resp = await async_client.get(
        f"/api/v1/context-links/match?app_name=Figma&project_id={test_project['id']}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    matches = resp.json()["matches"]
    assert len(matches) >= 1
    assert matches[0]["resource_id"] == wf_id


# ─────────────────── Auto-create ───────────────────────────


async def test_auto_create_from_url(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    wf_id = await _create_workflow(async_client, auth_headers, test_project["id"])
    resp = await async_client.post(
        "/api/v1/context-links/auto",
        json={
            "project_id": test_project["id"],
            "resource_type": "workflow",
            "resource_id": wf_id,
            "url": "https://app.salesforce.com/lightning/r/Account/123",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["source"] == "auto"
    assert data["weight"] == 100.0
    assert data["match_type"] == "url_pattern"
    assert "salesforce.com" in data["match_value"]


async def test_auto_create_dedup(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    """Auto-creating the same link twice returns the existing entry."""
    wf_id = await _create_workflow(async_client, auth_headers, test_project["id"])
    r1 = await async_client.post(
        "/api/v1/context-links/auto",
        json={
            "project_id": test_project["id"],
            "resource_type": "workflow",
            "resource_id": wf_id,
            "url": "https://app.salesforce.com/page1",
        },
        headers=auth_headers,
    )
    r2 = await async_client.post(
        "/api/v1/context-links/auto",
        json={
            "project_id": test_project["id"],
            "resource_type": "workflow",
            "resource_id": wf_id,
            "url": "https://other.salesforce.com/page2",
        },
        headers=auth_headers,
    )
    assert r1.json()["id"] == r2.json()["id"]


# ─────────────────── Click tracking ───────────────────────────


async def test_click_tracking(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    wf_id = await _create_workflow(async_client, auth_headers, test_project["id"])
    link = await _create_context_link(async_client, auth_headers, test_project["id"], wf_id)
    assert link["click_count"] == 0

    resp = await async_client.post(
        f"/api/v1/context-links/{link['id']}/click",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["click_count"] == 1

    # Click again
    resp = await async_client.post(
        f"/api/v1/context-links/{link['id']}/click",
        headers=auth_headers,
    )
    assert resp.json()["click_count"] == 2


async def test_click_nonexistent_link(async_client: AsyncClient, auth_headers: dict):
    resp = await async_client.post(
        "/api/v1/context-links/nonexistent/click",
        headers=auth_headers,
    )
    assert resp.status_code == 404


# ─────────────────── Update ───────────────────────────


async def test_update_context_link(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    wf_id = await _create_workflow(async_client, auth_headers, test_project["id"])
    link = await _create_context_link(async_client, auth_headers, test_project["id"], wf_id)

    resp = await async_client.put(
        f"/api/v1/context-links/{link['id']}",
        json={"note": "Updated note", "match_value": "*.newpattern.com*"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["note"] == "Updated note"
    assert data["match_value"] == "*.newpattern.com*"


async def test_update_nonexistent_link(async_client: AsyncClient, auth_headers: dict):
    resp = await async_client.put(
        "/api/v1/context-links/nonexistent",
        json={"note": "nope"},
        headers=auth_headers,
    )
    assert resp.status_code == 404


# ─────────────────── Delete ───────────────────────────


async def test_delete_context_link(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    wf_id = await _create_workflow(async_client, auth_headers, test_project["id"])
    link = await _create_context_link(async_client, auth_headers, test_project["id"], wf_id)

    resp = await async_client.delete(
        f"/api/v1/context-links/{link['id']}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    # Verify gone
    resp = await async_client.get(
        f"/api/v1/context-links?project_id={test_project['id']}",
        headers=auth_headers,
    )
    assert all(l["id"] != link["id"] for l in resp.json())


async def test_delete_nonexistent_link(async_client: AsyncClient, auth_headers: dict):
    resp = await async_client.delete(
        "/api/v1/context-links/nonexistent",
        headers=auth_headers,
    )
    assert resp.status_code == 404


# ─────────────────── User links outrank auto links ───────────────────────────


async def test_user_links_outrank_auto_links(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    """User-defined links (weight=1000) should score higher than auto links (weight=100)."""
    wf_auto = await _create_workflow(async_client, auth_headers, test_project["id"], name="Auto WF")
    wf_user = await _create_workflow(async_client, auth_headers, test_project["id"], name="User WF")

    # Create auto link
    await async_client.post(
        "/api/v1/context-links/auto",
        json={
            "project_id": test_project["id"],
            "resource_type": "workflow",
            "resource_id": wf_auto,
            "url": "https://app.example.com/page",
        },
        headers=auth_headers,
    )
    # Create user link for same URL pattern
    await _create_context_link(
        async_client, auth_headers, test_project["id"], wf_user,
        match_type="url_pattern", match_value="*.example.com*",
    )

    resp = await async_client.get(
        f"/api/v1/context-links/match?url=https://app.example.com/page&project_id={test_project['id']}",
        headers=auth_headers,
    )
    matches = resp.json()["matches"]
    assert len(matches) == 2
    # User link should be first (higher score)
    assert matches[0]["resource_id"] == wf_user
    assert matches[0]["source"] == "user"
    assert matches[0]["final_score"] > matches[1]["final_score"]


# ─────────────────── Known apps ───────────────────────────


async def test_known_apps_endpoint(async_client: AsyncClient, auth_headers: dict):
    resp = await async_client.get("/api/v1/context-links/known-apps", headers=auth_headers)
    assert resp.status_code == 200
    apps = resp.json()["apps"]
    assert len(apps) > 0
    names = [a["name"] for a in apps]
    assert "Figma" in names
    assert "Google Chrome" in names
    # Each app should have aliases
    figma = next(a for a in apps if a["name"] == "Figma")
    assert "aliases" in figma
    assert len(figma["aliases"]) > 0
