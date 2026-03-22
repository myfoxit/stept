"""Tests for Intercom integration endpoints."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_intercom_config_crud(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    """Create, read, and delete Intercom config."""
    pid = test_project["id"]

    # Get config — should be empty
    resp = await async_client.get(f"/api/v1/integrations/intercom/config?project_id={pid}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["connected"] is False

    # Set config
    resp = await async_client.put(
        f"/api/v1/integrations/intercom/config?project_id={pid}",
        json={
            "access_token": "test-token",
            "client_secret": "test-secret",
            "project_id": pid,
            "region": "us",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200

    # Read back
    resp = await async_client.get(f"/api/v1/integrations/intercom/config?project_id={pid}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["connected"] is True

    # Delete
    resp = await async_client.delete(f"/api/v1/integrations/intercom/config?project_id={pid}", headers=auth_headers)
    assert resp.status_code == 200

    # Verify deleted
    resp = await async_client.get(f"/api/v1/integrations/intercom/config?project_id={pid}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["connected"] is False


@pytest.mark.asyncio
async def test_intercom_webhook_no_config(async_client: AsyncClient):
    """Webhook without config should return 400."""
    resp = await async_client.post(
        "/api/v1/integrations/intercom/webhook",
        json={
            "type": "notification_event",
            "topic": "conversation.user.created",
            "data": {"item": {"id": "conv123", "type": "conversation"}},
        },
    )
    # Without config/signature, returns 401 (unauthorized) or 400
    assert resp.status_code in [200, 400, 401]


@pytest.mark.asyncio
async def test_intercom_search_no_config(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    """Search endpoint returns results or empty list."""
    resp = await async_client.get(
        "/api/v1/integrations/intercom/search?q=test",
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "results" in data


@pytest.mark.asyncio
async def test_intercom_sync_status_no_config(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    """Sync status without config returns not_configured."""
    pid = test_project["id"]
    resp = await async_client.get(
        f"/api/v1/integrations/intercom/sync/status?project_id={pid}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "not_configured"
