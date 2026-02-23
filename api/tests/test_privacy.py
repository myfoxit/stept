from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_privacy_status_returns_sendcloak_stats(
    async_client: AsyncClient,
    auth_headers: dict,
    monkeypatch,
):
    mock_stats = {"enabled": True, "requests": 12, "pii_detected": 4}
    monkeypatch.setattr(
        "app.routers.privacy.sendcloak.get_stats",
        AsyncMock(return_value=mock_stats),
    )

    resp = await async_client.get("/api/v1/privacy/status", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == mock_stats


@pytest.mark.asyncio
async def test_privacy_analyze_returns_entities(
    async_client: AsyncClient,
    auth_headers: dict,
    monkeypatch,
):
    entities = [
        {"type": "email", "start": 3, "end": 18, "text": "alice@example.com"}
    ]
    analyze_mock = AsyncMock(return_value=entities)
    monkeypatch.setattr("app.routers.privacy.sendcloak.analyze", analyze_mock)

    resp = await async_client.post(
        "/api/v1/privacy/analyze",
        json={"text": "hi alice@example.com"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json() == {"entities": entities}
    analyze_mock.assert_awaited_once_with("hi alice@example.com")


@pytest.mark.asyncio
async def test_privacy_endpoints_require_auth(async_client: AsyncClient):
    status_resp = await async_client.get("/api/v1/privacy/status")
    assert status_resp.status_code == 401

    analyze_resp = await async_client.post(
        "/api/v1/privacy/analyze", json={"text": "test"}
    )
    assert analyze_resp.status_code == 401
