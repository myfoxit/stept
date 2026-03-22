"""Tests for Slack integration endpoints."""
import json
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_slack_config_crud(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    """Create, read, and delete Slack config."""
    pid = test_project["id"]

    # Get config — should be empty/disconnected
    resp = await async_client.get(f"/api/v1/integrations/slack/config?project_id={pid}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["connected"] is False

    # Set config
    resp = await async_client.put(
        f"/api/v1/integrations/slack/config?project_id={pid}",
        json={"bot_token": "xoxb-test-token", "signing_secret": "test-secret", "enabled": True},
        headers=auth_headers,
    )
    assert resp.status_code == 200

    # Read back
    resp = await async_client.get(f"/api/v1/integrations/slack/config?project_id={pid}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["connected"] is True
    assert resp.json()["enabled"] is True

    # Delete
    resp = await async_client.delete(f"/api/v1/integrations/slack/config?project_id={pid}", headers=auth_headers)
    assert resp.status_code == 200

    # Verify deleted
    resp = await async_client.get(f"/api/v1/integrations/slack/config?project_id={pid}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["connected"] is False


@pytest.mark.asyncio
async def test_slack_webhook_url_verification(async_client: AsyncClient):
    """Slack URL verification challenge should be echoed back."""
    resp = await async_client.post(
        "/api/v1/integrations/slack/webhook",
        json={"type": "url_verification", "challenge": "test_challenge_value"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("challenge") == "test_challenge_value"


@pytest.mark.asyncio
async def test_slack_webhook_no_config(async_client: AsyncClient):
    """Event callback without config should not crash."""
    resp = await async_client.post(
        "/api/v1/integrations/slack/webhook",
        json={
            "type": "event_callback",
            "event": {"type": "app_mention", "text": "<@BOT> how do I reset password", "channel": "C12345"},
        },
    )
    # Should succeed (200) even without config — just won't post back to Slack
    assert resp.status_code == 200
