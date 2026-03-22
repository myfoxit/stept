"""Tests for SSO admin endpoints."""
import pytest
from httpx import AsyncClient


pytestmark = pytest.mark.asyncio


async def test_list_sso_configs_empty(async_client: AsyncClient, auth_headers: dict):
    """List SSO configs returns empty list when none configured."""
    resp = await async_client.get("/api/v1/sso/configs", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_create_sso_config(async_client: AsyncClient, auth_headers: dict):
    """Create an SSO config for a domain."""
    resp = await async_client.post(
        "/api/v1/sso/configs",
        json={
            "domain": "testcorp.com",
            "provider_name": "Okta",
            "issuer_url": "https://testcorp.okta.com",
            "client_id": "test-client-id",
            "client_secret": "test-client-secret",
        },
        headers=auth_headers,
    )
    assert resp.status_code in [200, 201]
    data = resp.json()
    assert data["domain"] == "testcorp.com"
    assert data["provider_name"] == "Okta"
    assert data["enabled"] is True


async def test_sso_config_requires_auth(async_client: AsyncClient):
    """SSO config endpoints require authentication."""
    resp = await async_client.get("/api/v1/sso/configs")
    assert resp.status_code == 401


async def test_delete_sso_config(async_client: AsyncClient, auth_headers: dict):
    """Create and delete an SSO config."""
    # Create
    resp = await async_client.post(
        "/api/v1/sso/configs",
        json={
            "domain": "deleteme.com",
            "provider_name": "Azure AD",
            "issuer_url": "https://login.microsoftonline.com/tenant",
            "client_id": "client-123",
            "client_secret": "secret-456",
        },
        headers=auth_headers,
    )
    assert resp.status_code in [200, 201]
    config_id = resp.json()["id"]

    # Delete
    resp = await async_client.delete(f"/api/v1/sso/configs/{config_id}", headers=auth_headers)
    assert resp.status_code in [200, 204]
