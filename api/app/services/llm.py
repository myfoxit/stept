"""
Provider-agnostic LLM gateway service.

Supports OpenAI, Anthropic, Ollama, and any OpenAI-compatible endpoint.
Uses httpx async client — no heavy SDK dependencies.

Configuration priority: DB (app_settings) → environment variables → defaults.
"""

from __future__ import annotations

import json
import logging
from typing import AsyncIterator, Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# In-memory cache for DB-sourced config (refreshed on every save)
# ---------------------------------------------------------------------------

_db_config_cache: dict | None = None


def _get_cached_db_config() -> dict:
    """Return cached DB config or empty dict."""
    return _db_config_cache or {}


async def load_db_config() -> dict:
    """Load LLM config from app_settings table and cache it."""
    global _db_config_cache
    try:
        from app.database import AsyncSessionLocal
        from app.models import AppSettings
        from sqlalchemy import select

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(AppSettings).where(AppSettings.key == "llm_config")
            )
            row = result.scalar_one_or_none()
            if row and row.value:
                _db_config_cache = row.value
                return _db_config_cache
    except Exception as exc:
        logger.debug("Could not load LLM config from DB: %s", exc)
    _db_config_cache = {}
    return _db_config_cache


async def save_db_config(config: dict) -> None:
    """Persist LLM config to app_settings and refresh cache."""
    global _db_config_cache
    from app.database import AsyncSessionLocal
    from app.models import AppSettings
    from sqlalchemy import select

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(AppSettings).where(AppSettings.key == "llm_config")
        )
        row = result.scalar_one_or_none()
        if row:
            row.value = config
        else:
            session.add(AppSettings(key="llm_config", value=config))
        await session.commit()

    _db_config_cache = config


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

class ChatMessage:
    """Lightweight message container."""

    __slots__ = ("role", "content")

    def __init__(self, role: str, content: str) -> None:
        self.role = role
        self.content = content

    def to_openai(self) -> dict:
        return {"role": self.role, "content": self.content}

    def to_anthropic(self) -> dict:
        return {"role": self.role, "content": self.content}


# ---------------------------------------------------------------------------
# Helpers — DB config overrides env vars
# ---------------------------------------------------------------------------

def _provider() -> str:
    db = _get_cached_db_config()
    return (db.get("provider") or settings.LLM_PROVIDER or "openai").lower()


def _base_url() -> str:
    """
    Return the base URL *without* a trailing version path.
    All callers append their own path (e.g. /v1/chat/completions).
    Strips trailing /v1 or /v1/ if present so we never get /v1/v1/.
    """
    db = _get_cached_db_config()
    explicit = db.get("base_url") or settings.LLM_BASE_URL
    if explicit:
        url = explicit.rstrip("/")
        # Strip trailing /v1 to avoid double-prefix
        if url.endswith("/v1"):
            url = url[:-3]
        return url
    p = _provider()
    if p == "anthropic":
        return "https://api.anthropic.com"
    if p == "ollama":
        return "http://localhost:11434"
    if p == "copilot":
        return "https://api.githubcopilot.com"
    return "https://api.openai.com"


def _model() -> str:
    db = _get_cached_db_config()
    explicit = db.get("model") or settings.LLM_MODEL
    if explicit:
        return explicit
    p = _provider()
    if p == "anthropic":
        return "claude-sonnet-4-20250514"
    if p == "ollama":
        return "llama3"
    if p == "copilot":
        return "gpt-4o"
    return "gpt-4o-mini"


def _api_key() -> str | None:
    db = _get_cached_db_config()
    return db.get("api_key") or settings.LLM_API_KEY or None


def _headers() -> dict[str, str]:
    p = _provider()
    api_key = _api_key()
    headers: dict[str, str] = {}
    if p == "anthropic":
        headers["x-api-key"] = api_key or ""
        headers["anthropic-version"] = "2023-06-01"
        headers["content-type"] = "application/json"
    elif p == "ollama":
        headers["content-type"] = "application/json"
    else:
        # OpenAI / compatible
        if api_key:
            headers["authorization"] = f"Bearer {api_key}"
        headers["content-type"] = "application/json"
    return headers


# ---------------------------------------------------------------------------
# OpenAI-compatible request
# ---------------------------------------------------------------------------

async def _openai_chat(
    messages: list[dict],
    model: str,
    stream: bool,
    base_url: str,
    tools: list[dict] | None = None,
) -> httpx.Response:
    url = f"{base_url}/v1/chat/completions"
    payload: dict = {
        "model": model,
        "messages": messages,
        "stream": stream,
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"
    client = httpx.AsyncClient(timeout=120.0)
    if stream:
        req = client.build_request("POST", url, json=payload, headers=_headers())
        resp = await client.send(req, stream=True)
        resp._client = client  # type: ignore[attr-defined] # prevent GC
        return resp
    else:
        resp = await client.post(url, json=payload, headers=_headers())
        await client.aclose()
        return resp


# ---------------------------------------------------------------------------
# Anthropic request
# ---------------------------------------------------------------------------

async def _anthropic_chat(
    messages: list[dict],
    model: str,
    stream: bool,
    base_url: str,
    tools: list[dict] | None = None,
) -> httpx.Response:
    url = f"{base_url}/v1/messages"

    # Anthropic: separate system message from user/assistant messages
    system_text = ""
    user_messages = []
    for msg in messages:
        if msg["role"] == "system":
            system_text += msg["content"] + "\n"
        elif msg["role"] == "tool":
            # Convert OpenAI tool result format to Anthropic format
            user_messages.append({
                "role": "user",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": msg.get("tool_call_id", ""),
                        "content": msg["content"],
                    }
                ],
            })
        elif msg.get("tool_calls"):
            # Convert OpenAI assistant tool_calls to Anthropic format
            content_blocks = []
            if msg.get("content"):
                content_blocks.append({"type": "text", "text": msg["content"]})
            for tc in msg["tool_calls"]:
                args = tc["function"]["arguments"]
                if isinstance(args, str):
                    import json as _json
                    try:
                        args = _json.loads(args)
                    except Exception:
                        args = {}
                content_blocks.append({
                    "type": "tool_use",
                    "id": tc["id"],
                    "name": tc["function"]["name"],
                    "input": args,
                })
            user_messages.append({"role": "assistant", "content": content_blocks})
        else:
            user_messages.append({"role": msg["role"], "content": msg["content"]})

    payload: dict = {
        "model": model,
        "max_tokens": 4096,
        "messages": user_messages,
        "stream": stream,
    }
    if system_text.strip():
        payload["system"] = system_text.strip()

    # Convert OpenAI tools format to Anthropic tools format
    if tools:
        anthropic_tools = []
        for t in tools:
            func = t.get("function", {})
            anthropic_tools.append({
                "name": func["name"],
                "description": func.get("description", ""),
                "input_schema": func.get("parameters", {"type": "object", "properties": {}}),
            })
        payload["tools"] = anthropic_tools

    client = httpx.AsyncClient(timeout=120.0)
    if stream:
        req = client.build_request("POST", url, json=payload, headers=_headers())
        resp = await client.send(req, stream=True)
        resp._client = client  # type: ignore[attr-defined]
        return resp
    else:
        resp = await client.post(url, json=payload, headers=_headers())
        await client.aclose()
        return resp


# ---------------------------------------------------------------------------
# Streaming iterators — normalise to SSE (OpenAI format)
# ---------------------------------------------------------------------------

async def _iter_openai_stream(resp: httpx.Response) -> AsyncIterator[str]:
    """Yield SSE data lines from an OpenAI-compatible streaming response."""
    try:
        async for line in resp.aiter_lines():
            line = line.strip()
            if not line:
                continue
            if line.startswith("data: "):
                data = line[6:]
                if data == "[DONE]":
                    yield "data: [DONE]\n\n"
                    break
                yield f"data: {data}\n\n"
    finally:
        await resp.aclose()
        client = getattr(resp, "_client", None)
        if client:
            await client.aclose()


async def _iter_anthropic_stream(resp: httpx.Response) -> AsyncIterator[str]:
    """Convert Anthropic streaming events to OpenAI-format SSE."""
    try:
        async for line in resp.aiter_lines():
            line = line.strip()
            if not line or line.startswith(":"):
                continue
            if line.startswith("data: "):
                raw = line[6:]
                try:
                    event = json.loads(raw)
                except json.JSONDecodeError:
                    continue

                evt_type = event.get("type", "")
                if evt_type == "content_block_delta":
                    delta_obj = event.get("delta", {})
                    text = delta_obj.get("text", "")
                    if text:
                        chunk = {
                            "choices": [{
                                "delta": {"content": text},
                                "index": 0,
                                "finish_reason": None,
                            }]
                        }
                        yield f"data: {json.dumps(chunk)}\n\n"
                elif evt_type == "message_stop":
                    yield "data: [DONE]\n\n"
                    break
    finally:
        await resp.aclose()
        client = getattr(resp, "_client", None)
        if client:
            await client.aclose()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def chat_completion(
    messages: list[dict],
    model: Optional[str] = None,
    stream: bool = True,
    base_url_override: Optional[str] = None,
    tools: list[dict] | None = None,
) -> httpx.Response | AsyncIterator[str]:
    """
    Send a chat completion request.

    When *stream* is True, returns an AsyncIterator[str] of SSE lines.
    When *stream* is False, returns the raw httpx.Response (caller reads JSON).
    
    If *tools* is provided, includes tool definitions for function calling.
    """
    resolved_model = model or _model()
    resolved_url = base_url_override or _base_url()
    provider = _provider()

    logger.info("LLM request: provider=%s model=%s stream=%s tools=%d",
                provider, resolved_model, stream, len(tools) if tools else 0)

    if provider == "anthropic":
        resp = await _anthropic_chat(messages, resolved_model, stream, resolved_url, tools=tools)
        if stream:
            resp.raise_for_status()
            return _iter_anthropic_stream(resp)
        return resp
    else:
        # OpenAI / Ollama / compatible
        resp = await _openai_chat(messages, resolved_model, stream, resolved_url, tools=tools)
        if stream:
            resp.raise_for_status()
            return _iter_openai_stream(resp)
        return resp


def extract_tool_calls_from_response(response_json: dict, provider: str | None = None) -> list[dict]:
    """
    Extract tool calls from a non-streaming LLM response.
    
    Returns list of dicts: [{id, function: {name, arguments}}]
    Works for both OpenAI and Anthropic response formats.
    """
    resolved_provider = provider or _provider()
    
    if resolved_provider == "anthropic":
        # Anthropic format: content blocks with type="tool_use"
        content_blocks = response_json.get("content", [])
        tool_calls = []
        for block in content_blocks:
            if block.get("type") == "tool_use":
                tool_calls.append({
                    "id": block["id"],
                    "type": "function",
                    "function": {
                        "name": block["name"],
                        "arguments": json.dumps(block.get("input", {})),
                    },
                })
        return tool_calls
    else:
        # OpenAI format: choices[0].message.tool_calls
        choices = response_json.get("choices", [])
        if not choices:
            return []
        message = choices[0].get("message", {})
        return message.get("tool_calls", []) or []


def extract_text_from_response(response_json: dict, provider: str | None = None) -> str:
    """Extract text content from a non-streaming LLM response."""
    resolved_provider = provider or _provider()
    
    if resolved_provider == "anthropic":
        content_blocks = response_json.get("content", [])
        texts = [b.get("text", "") for b in content_blocks if b.get("type") == "text"]
        return "".join(texts)
    else:
        choices = response_json.get("choices", [])
        if not choices:
            return ""
        return choices[0].get("message", {}).get("content", "") or ""


async def list_models() -> list[dict]:
    """Fetch available models from the provider."""
    provider = _provider()
    base = _base_url()

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            if provider == "anthropic":
                # Anthropic doesn't have a public models endpoint; return known models.
                return [
                    {"id": "claude-sonnet-4-20250514", "name": "Claude Sonnet 4"},
                    {"id": "claude-3-5-haiku-20241022", "name": "Claude 3.5 Haiku"},
                    {"id": "claude-3-5-sonnet-20241022", "name": "Claude 3.5 Sonnet"},
                ]
            else:
                resp = await client.get(f"{base}/v1/models", headers=_headers())
                resp.raise_for_status()
                data = resp.json()
                models = data.get("data", [])
                return [{"id": m["id"], "name": m.get("name", m["id"])} for m in models]
    except Exception as exc:
        logger.warning("Failed to list models: %s", exc)
        return []


def get_config() -> dict:
    """Return non-sensitive LLM configuration."""
    from app.services.dataveil import is_dataveil_enabled

    return {
        "provider": _provider(),
        "model": _model(),
        "base_url": _base_url() if _provider() == "ollama" else None,
        "dataveil_enabled": is_dataveil_enabled(),
        "configured": bool(_api_key() or _provider() == "ollama"),
    }
