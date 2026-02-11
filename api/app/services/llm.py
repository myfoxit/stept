"""
Provider-agnostic LLM gateway service.

Supports OpenAI, Anthropic, Ollama, and any OpenAI-compatible endpoint.
Uses httpx async client — no heavy SDK dependencies.
"""

from __future__ import annotations

import json
import logging
from typing import AsyncIterator, Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


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
# Helpers
# ---------------------------------------------------------------------------

def _provider() -> str:
    return (settings.LLM_PROVIDER or "openai").lower()


def _base_url() -> str:
    p = _provider()
    if settings.LLM_BASE_URL:
        return settings.LLM_BASE_URL.rstrip("/")
    if p == "anthropic":
        return "https://api.anthropic.com"
    if p == "ollama":
        return "http://localhost:11434"
    # Default: OpenAI
    return "https://api.openai.com"


def _model() -> str:
    p = _provider()
    if settings.LLM_MODEL:
        return settings.LLM_MODEL
    if p == "anthropic":
        return "claude-sonnet-4-20250514"
    if p == "ollama":
        return "llama3"
    return "gpt-4o-mini"


def _headers() -> dict[str, str]:
    p = _provider()
    headers: dict[str, str] = {}
    if p == "anthropic":
        headers["x-api-key"] = settings.LLM_API_KEY or ""
        headers["anthropic-version"] = "2023-06-01"
        headers["content-type"] = "application/json"
    elif p == "ollama":
        headers["content-type"] = "application/json"
    else:
        # OpenAI / compatible
        if settings.LLM_API_KEY:
            headers["authorization"] = f"Bearer {settings.LLM_API_KEY}"
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
) -> httpx.Response:
    url = f"{base_url}/v1/chat/completions"
    payload = {
        "model": model,
        "messages": messages,
        "stream": stream,
    }
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
) -> httpx.Response:
    url = f"{base_url}/v1/messages"

    # Anthropic: separate system message from user/assistant messages
    system_text = ""
    user_messages = []
    for msg in messages:
        if msg["role"] == "system":
            system_text += msg["content"] + "\n"
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
) -> httpx.Response | AsyncIterator[str]:
    """
    Send a chat completion request.

    When *stream* is True, returns an AsyncIterator[str] of SSE lines.
    When *stream* is False, returns the raw httpx.Response (caller reads JSON).
    """
    resolved_model = model or _model()
    resolved_url = base_url_override or _base_url()
    provider = _provider()

    logger.info("LLM request: provider=%s model=%s stream=%s", provider, resolved_model, stream)

    if provider == "anthropic":
        resp = await _anthropic_chat(messages, resolved_model, stream, resolved_url)
        if stream:
            resp.raise_for_status()
            return _iter_anthropic_stream(resp)
        return resp
    else:
        # OpenAI / Ollama / compatible
        resp = await _openai_chat(messages, resolved_model, stream, resolved_url)
        if stream:
            resp.raise_for_status()
            return _iter_openai_stream(resp)
        return resp


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
        "configured": bool(settings.LLM_API_KEY or _provider() == "ollama"),
    }
