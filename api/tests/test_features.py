"""Tests for feature flags endpoint."""
import pytest
from httpx import AsyncClient


pytestmark = pytest.mark.asyncio


async def test_features_returns_flags(async_client: AsyncClient):
    """Features endpoint returns all feature flags (no auth required)."""
    resp = await async_client.get("/api/v1/features")
    assert resp.status_code == 200
    data = resp.json()
    # Must include all known feature flags
    assert "video_import" in data
    assert "knowledge_base" in data
    assert "ai_chat" in data
    assert "mcp" in data
    # All flags are booleans
    for key in ("video_import", "knowledge_base", "ai_chat", "mcp"):
        assert isinstance(data[key], bool)


async def test_features_no_auth_required(async_client: AsyncClient):
    """Features endpoint is public — no auth needed."""
    resp = await async_client.get("/api/v1/features")
    assert resp.status_code == 200
