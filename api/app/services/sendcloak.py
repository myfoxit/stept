"""
SendCloak PII obfuscation client.

Calls the SendCloak API to obfuscate text before sending to AI providers
and deobfuscate responses before returning to users.

Disabled by default. Enable with SENDCLOAK_ENABLED=true.
"""
import logging
import httpx
from typing import Optional
from app.core.config import settings

logger = logging.getLogger(__name__)

_client: Optional[httpx.AsyncClient] = None

def is_enabled() -> bool:
    return getattr(settings, 'SENDCLOAK_ENABLED', False)

def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            base_url=getattr(settings, 'SENDCLOAK_URL', 'http://sendcloak:9090'),
            timeout=10.0,
        )
    return _client

async def create_session(user_id: str, project_id: str, doc_id: str = None) -> Optional[str]:
    """Create a scoped obfuscation session. Returns session_id or None if disabled."""
    if not is_enabled():
        return None
    try:
        client = _get_client()
        resp = await client.post("/v1/sessions", json={
            "scope": {"user_id": user_id, "project_id": project_id, "doc_id": doc_id or ""}
        })
        resp.raise_for_status()
        return resp.json().get("session_id")
    except Exception as e:
        logger.warning("SendCloak session creation failed: %s", e)
        return None

async def obfuscate(text: str, session_id: str, content_type: str = "prose") -> str:
    """Obfuscate text. Returns original if SendCloak unavailable."""
    if not session_id or not is_enabled():
        return text
    try:
        client = _get_client()
        resp = await client.post("/v1/obfuscate", json={
            "session_id": session_id, "text": text, "content_type": content_type
        })
        resp.raise_for_status()
        return resp.json().get("text", text)
    except Exception as e:
        logger.warning("SendCloak obfuscation failed: %s", e)
        return text

async def deobfuscate(text: str, session_id: str) -> str:
    """Restore obfuscated text. Returns original if SendCloak unavailable."""
    if not session_id or not is_enabled():
        return text
    try:
        client = _get_client()
        resp = await client.post("/v1/deobfuscate", json={
            "session_id": session_id, "text": text
        })
        resp.raise_for_status()
        return resp.json().get("text", text)
    except Exception as e:
        logger.warning("SendCloak deobfuscation failed: %s", e)
        return text

async def analyze(text: str) -> list:
    """Detect PII entities without replacing. Returns entity spans for UI highlighting."""
    if not is_enabled():
        return []
    try:
        client = _get_client()
        resp = await client.post("/v1/analyze", json={"text": text})
        resp.raise_for_status()
        return resp.json().get("entities", [])
    except Exception as e:
        logger.warning("SendCloak analysis failed: %s", e)
        return []

async def get_stats() -> dict:
    """Get aggregated statistics from SendCloak."""
    if not is_enabled():
        return {"enabled": False}
    try:
        client = _get_client()
        resp = await client.get("/v1/stats")
        resp.raise_for_status()
        data = resp.json()
        data["enabled"] = True
        return data
    except Exception as e:
        logger.warning("SendCloak stats failed: %s", e)
        return {"enabled": True, "error": str(e)}

async def close_session(session_id: str):
    """Close/delete a session."""
    if not session_id or not is_enabled():
        return
    try:
        client = _get_client()
        await client.delete(f"/v1/sessions/{session_id}")
    except Exception:
        pass
