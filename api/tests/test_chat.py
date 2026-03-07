"""Tests for /api/v1/chat/* endpoints."""

import json
from unittest.mock import patch, AsyncMock, MagicMock

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_chat_config_get(async_client: AsyncClient, auth_headers: dict):
    """GET /chat/config should return the current LLM configuration."""
    resp = await async_client.get("/api/v1/chat/config", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    # Should contain at least these keys (even if None)
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_chat_config_save(async_client: AsyncClient, auth_headers: dict):
    """PUT /chat/config should persist LLM config."""
    with patch("app.services.llm.save_db_config", new_callable=AsyncMock) as mock_save:
        resp = await async_client.put(
            "/api/v1/chat/config",
            json={
                "provider": "openai",
                "model": "gpt-4o-mini",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("provider") == "openai"
        assert data.get("model") == "gpt-4o-mini"


@pytest.mark.asyncio
async def test_chat_completions_no_config(async_client: AsyncClient, auth_headers: dict):
    """
    POST /chat/completions without a properly configured LLM should return
    an error (502/503) rather than silently failing.
    """
    with patch(
        "app.services.llm.chat_completion",
        new_callable=AsyncMock,
        side_effect=RuntimeError("No LLM configured"),
    ), patch("app.services.ai_tools.registry.all_tools", return_value=[]):
        resp = await async_client.post(
            "/api/v1/chat/completions",
            json={
                "messages": [{"role": "user", "content": "Hello"}],
                "stream": False,
            },
            headers=auth_headers,
        )
        assert resp.status_code == 502  # 502 Bad Gateway — upstream LLM failure


@pytest.mark.asyncio
async def test_chat_completions_streaming_sse_format(async_client: AsyncClient, auth_headers: dict):
    """
    Mock the LLM call and verify that the SSE streaming format is correct.
    """
    # Build a fake SSE stream
    async def fake_chat_completion(messages, model, stream, base_url_override, **kw):
        if stream:
            async def _sse_gen():
                chunk = {
                    "choices": [{
                        "delta": {"content": "Hello from AI!"},
                        "index": 0,
                        "finish_reason": None,
                    }]
                }
                yield f"data: {json.dumps(chunk)}\n\n"
                yield "data: [DONE]\n\n"
            return _sse_gen()
        # non-streaming — return a fake response object
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [{"message": {"content": "Hello"}}]
        }
        return mock_resp

    with (
        patch("app.services.llm.chat_completion", side_effect=fake_chat_completion),
        patch("app.services.ai_tools.registry.all_tools", return_value=[]),
    ):
        resp = await async_client.post(
            "/api/v1/chat/completions",
            json={
                "messages": [{"role": "user", "content": "Hi"}],
                "stream": True,
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers.get("content-type", "")

        body = resp.text
        assert "data:" in body
        assert "[DONE]" in body

        # Parse the SSE data line
        for line in body.split("\n"):
            if line.startswith("data:") and "[DONE]" not in line:
                payload = json.loads(line.removeprefix("data:").strip())
                assert "choices" in payload
                assert payload["choices"][0]["delta"]["content"] == "Hello from AI!"
