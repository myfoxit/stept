"""Tests for Microsoft Teams integration endpoints."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_teams_config_crud(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    """Create, read, and delete Teams config."""
    pid = test_project["id"]

    # Get config — should be empty
    resp = await async_client.get(f"/api/v1/integrations/teams/config?project_id={pid}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["connected"] is False

    # Set config
    resp = await async_client.put(
        f"/api/v1/integrations/teams/config?project_id={pid}",
        json={"webhook_url": "https://test.webhook.office.com/webhook", "enabled": True},
        headers=auth_headers,
    )
    assert resp.status_code == 200

    # Read back
    resp = await async_client.get(f"/api/v1/integrations/teams/config?project_id={pid}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["connected"] is True
    assert resp.json()["enabled"] is True

    # Delete
    resp = await async_client.delete(f"/api/v1/integrations/teams/config?project_id={pid}", headers=auth_headers)
    assert resp.status_code == 200

    # Verify deleted
    resp = await async_client.get(f"/api/v1/integrations/teams/config?project_id={pid}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["connected"] is False


@pytest.mark.asyncio
async def test_teams_webhook_message_activity(async_client: AsyncClient):
    """Teams message activity should not crash without config."""
    resp = await async_client.post(
        "/api/v1/integrations/teams/webhook",
        json={
            "type": "message",
            "text": "<at>Bot</at> how do I create API key",
            "conversation": {"id": "conv123"},
            "serviceUrl": "https://smba.trafficmanager.net/teams/",
            "from": {"id": "user123"},
        },
    )
    # Should succeed even without config
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_teams_webhook_conversation_update(async_client: AsyncClient):
    """Teams conversation update (bot added) should return 200."""
    resp = await async_client.post(
        "/api/v1/integrations/teams/webhook",
        json={
            "type": "conversationUpdate",
            "membersAdded": [{"id": "bot123"}],
            "conversation": {"id": "conv456"},
            "serviceUrl": "https://smba.trafficmanager.net/teams/",
        },
    )
    assert resp.status_code == 200
