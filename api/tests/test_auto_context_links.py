"""Tests for auto-generation of context links from recording URLs."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_auto_context_links_created_on_finalize(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    """Recording finalization creates auto context links from step URLs."""
    project_id = test_project["id"]

    # Create a recording session
    resp = await async_client.post(
        "/api/v1/process-recording/session/create",
        json={"timestamp": "2026-03-22T10:00:00Z", "client": "test", "project_id": project_id},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    session_id = resp.json().get("session_id") or resp.json().get("sessionId")

    # Upload metadata with URLs from different domains
    metadata = [
        {
            "stepNumber": 1, "timestamp": "2026-03-22T10:00:00Z",
            "actionType": "Left Click", "description": "Click login",
            "url": "https://app.salesforce.com/leads/123",
            "windowSize": {"width": 1920, "height": 1080},
        },
        {
            "stepNumber": 2, "timestamp": "2026-03-22T10:00:01Z",
            "actionType": "Left Click", "description": "Click contact",
            "url": "https://app.salesforce.com/contacts/456",
            "windowSize": {"width": 1920, "height": 1080},
        },
        {
            "stepNumber": 3, "timestamp": "2026-03-22T10:00:02Z",
            "actionType": "Left Click", "description": "Click deal",
            "url": "https://app.hubspot.com/deals/789",
            "windowSize": {"width": 1920, "height": 1080},
        },
    ]
    resp = await async_client.post(
        f"/api/v1/process-recording/session/{session_id}/metadata",
        json=metadata,
        headers=auth_headers,
    )
    assert resp.status_code == 200

    # Finalize — this should create auto context links
    resp = await async_client.post(
        f"/api/v1/process-recording/session/{session_id}/finalize",
        headers=auth_headers,
    )
    assert resp.status_code == 200

    # Check context links were created
    resp = await async_client.get(
        f"/api/v1/context-links?project_id={project_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    links = resp.json()

    # Filter to auto-created links for this session
    auto_links = [l for l in links if l.get("source") == "auto" and l.get("resource_id") == session_id]
    patterns = {l["match_value"] for l in auto_links}

    assert "*.salesforce.com*" in patterns
    assert "*.hubspot.com*" in patterns
    assert len(auto_links) == 2


@pytest.mark.asyncio
async def test_auto_context_links_skip_localhost(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    """Does not create links for localhost URLs."""
    project_id = test_project["id"]

    resp = await async_client.post(
        "/api/v1/process-recording/session/create",
        json={"timestamp": "2026-03-22T10:00:00Z", "client": "test", "project_id": project_id},
        headers=auth_headers,
    )
    session_id = resp.json().get("session_id") or resp.json().get("sessionId")

    metadata = [
        {
            "stepNumber": 1, "timestamp": "2026-03-22T10:00:00Z",
            "actionType": "Left Click", "description": "Click",
            "url": "http://localhost:3000/dashboard",
            "windowSize": {"width": 1920, "height": 1080},
        },
    ]
    await async_client.post(
        f"/api/v1/process-recording/session/{session_id}/metadata",
        json=metadata, headers=auth_headers,
    )
    await async_client.post(
        f"/api/v1/process-recording/session/{session_id}/finalize",
        headers=auth_headers,
    )

    resp = await async_client.get(
        f"/api/v1/context-links?project_id={project_id}",
        headers=auth_headers,
    )
    links = resp.json()
    auto_links = [l for l in links if l.get("source") == "auto" and l.get("resource_id") == session_id]
    assert len(auto_links) == 0


@pytest.mark.asyncio
async def test_context_match_after_auto_create(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    """Auto-created links are returned by the match endpoint."""
    project_id = test_project["id"]

    resp = await async_client.post(
        "/api/v1/process-recording/session/create",
        json={"timestamp": "2026-03-22T10:00:00Z", "client": "test", "project_id": project_id},
        headers=auth_headers,
    )
    session_id = resp.json().get("session_id") or resp.json().get("sessionId")

    metadata = [
        {
            "stepNumber": 1, "timestamp": "2026-03-22T10:00:00Z",
            "actionType": "Left Click", "description": "Click",
            "url": "https://app.example.com/page1",
            "windowSize": {"width": 1920, "height": 1080},
        },
    ]
    await async_client.post(
        f"/api/v1/process-recording/session/{session_id}/metadata",
        json=metadata, headers=auth_headers,
    )
    await async_client.post(
        f"/api/v1/process-recording/session/{session_id}/finalize",
        headers=auth_headers,
    )

    # Now check if the match endpoint finds this workflow for example.com
    resp = await async_client.get(
        f"/api/v1/context-links/match?url=https://app.example.com/other-page&project_id={project_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    matches = resp.json().get("matches", [])
    matched_ids = {m["resource_id"] for m in matches}
    assert session_id in matched_ids
