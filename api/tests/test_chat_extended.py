"""Extended tests for /api/v1/chat/* endpoints."""

import json
from unittest.mock import patch, AsyncMock, MagicMock

import pytest
from httpx import AsyncClient


# ─────────────────── GET /chat/models ───────────────────────────


@pytest.mark.asyncio
async def test_chat_models_list(async_client: AsyncClient, auth_headers: dict):
    """GET /chat/models should return a list of models."""
    with patch("app.services.llm.list_models", new_callable=AsyncMock) as mock_list:
        mock_list.return_value = [
            {"id": "gpt-4o", "name": "GPT-4o"},
            {"id": "claude-3", "name": "Claude 3"},
        ]
        resp = await async_client.get("/api/v1/chat/models", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "models" in data
        assert len(data["models"]) == 2


@pytest.mark.asyncio
async def test_chat_models_no_auth(async_client: AsyncClient):
    resp = await async_client.get("/api/v1/chat/models")
    assert resp.status_code == 401


# ─────────────────── GET /chat/tools ────────────────────────────


@pytest.mark.asyncio
async def test_chat_tools_list(async_client: AsyncClient, auth_headers: dict):
    """GET /chat/tools should return available tools."""
    resp = await async_client.get("/api/v1/chat/tools", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "tools" in data
    assert isinstance(data["tools"], list)
    # Each tool should have name, description, parameters
    for tool in data["tools"]:
        assert "name" in tool
        assert "description" in tool
        assert "parameters" in tool


@pytest.mark.asyncio
async def test_chat_tools_no_auth(async_client: AsyncClient):
    resp = await async_client.get("/api/v1/chat/tools")
    assert resp.status_code == 401


# ─────────── POST /chat/completions — with context ──────────────


@pytest.mark.asyncio
async def test_chat_completions_with_recording_context(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    """Chat with recording context should inject recording steps."""
    from datetime import datetime, timezone

    # Create a recording session
    session_resp = await async_client.post(
        "/api/v1/process-recording/session/create",
        json={
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "project_id": test_project["id"],
            "name": "Context Test",
        },
        headers=auth_headers,
    )
    sid = session_resp.json().get("session_id") or session_resp.json().get("sessionId")

    # Add metadata
    await async_client.post(
        f"/api/v1/process-recording/session/{sid}/metadata",
        json=[
            {
                "stepNumber": 1,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "actionType": "click",
                "windowTitle": "Browser",
                "description": "Click login",
            }
        ],
    )

    # Build fake SSE stream
    async def fake_chat_completion(messages, model, stream, base_url_override, **kw):
        if stream:
            async def _gen():
                chunk = {
                    "choices": [{
                        "delta": {"content": "Based on the recording..."},
                        "index": 0,
                        "finish_reason": None,
                    }]
                }
                yield f"data: {json.dumps(chunk)}\n\n"
                yield "data: [DONE]\n\n"
            return _gen()

    with (
        patch("app.services.dataveil.get_proxied_base_url_with_fallback", new_callable=AsyncMock, return_value=None),
        patch("app.services.llm.chat_completion", side_effect=fake_chat_completion),
        patch("app.services.ai_tools.registry.all_tools", return_value=[]),
    ):
        resp = await async_client.post(
            "/api/v1/chat/completions",
            json={
                "messages": [{"role": "user", "content": "What does this workflow do?"}],
                "stream": True,
                "context": {"recording_id": sid},
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200


@pytest.mark.asyncio
async def test_chat_completions_no_auth(async_client: AsyncClient):
    """Unauthenticated chat request should return 401."""
    resp = await async_client.post(
        "/api/v1/chat/completions",
        json={
            "messages": [{"role": "user", "content": "Hello"}],
            "stream": False,
        },
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_chat_completions_non_streaming(
    async_client: AsyncClient, auth_headers: dict
):
    """Non-streaming chat should return JSON response."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "choices": [{"message": {"content": "Hello!"}}]
    }

    with (
        patch("app.services.dataveil.get_proxied_base_url_with_fallback", new_callable=AsyncMock, return_value=None),
        patch("app.services.llm.chat_completion", new_callable=AsyncMock, return_value=mock_resp),
        patch("app.services.ai_tools.registry.all_tools", return_value=[]),
    ):
        resp = await async_client.post(
            "/api/v1/chat/completions",
            json={
                "messages": [{"role": "user", "content": "Hi"}],
                "stream": False,
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "choices" in data


@pytest.mark.asyncio
async def test_chat_completions_llm_error(
    async_client: AsyncClient, auth_headers: dict
):
    """When LLM call fails, should return 502."""
    with (
        patch("app.services.dataveil.get_proxied_base_url_with_fallback", new_callable=AsyncMock, return_value=None),
        patch("app.services.llm.chat_completion", new_callable=AsyncMock, side_effect=Exception("LLM down")),
        patch("app.services.ai_tools.registry.all_tools", return_value=[]),
    ):
        resp = await async_client.post(
            "/api/v1/chat/completions",
            json={
                "messages": [{"role": "user", "content": "Hi"}],
                "stream": False,
            },
            headers=auth_headers,
        )
        assert resp.status_code == 502


# ─────────── GET /chat/config ───────────────────────────────────


@pytest.mark.asyncio
async def test_chat_config_no_auth(async_client: AsyncClient):
    resp = await async_client.get("/api/v1/chat/config")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_chat_config_update_partial(
    async_client: AsyncClient, auth_headers: dict
):
    """PUT /chat/config with partial data should only update provided fields."""
    with patch("app.services.llm.save_db_config", new_callable=AsyncMock):
        resp = await async_client.put(
            "/api/v1/chat/config",
            json={"model": "gpt-4o-mini"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
