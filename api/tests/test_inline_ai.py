"""Tests for /api/v1/inline/inline endpoint."""

import pytest
from httpx import AsyncClient
from unittest.mock import patch, AsyncMock


@pytest.mark.asyncio
async def test_inline_ai_unauthenticated(async_client: AsyncClient):
    """POST /chat/inline without auth should return 401/403."""
    resp = await async_client.post(
        "/api/v1/chat/inline",
        json={"prompt": "test", "context": "some text"},
    )
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_inline_ai_no_llm_configured(async_client: AsyncClient, auth_headers: dict):
    """POST /chat/inline with no LLM should return an error."""
    with patch(
        "app.services.llm.chat_completion",
        new_callable=AsyncMock,
        side_effect=RuntimeError("No LLM configured"),
    ):
        resp = await async_client.post(
            "/api/v1/chat/inline",
            json={"prompt": "Improve this text", "context": "Hello world"},
            headers=auth_headers,
        )
        # Should return an error status (500/502/503)
        assert resp.status_code >= 400
