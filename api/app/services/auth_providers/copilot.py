"""
GitHub Copilot OAuth device-flow authentication.

Flow:
1. POST https://github.com/login/device/code  → device_code + user_code
2. User visits verification_uri and enters user_code
3. Poll https://github.com/login/oauth/access_token until authorized → ghu_ token
4. Exchange ghu_ token at /copilot_internal/v2/token → session token (exp ~30min)
5. Use session token against https://api.githubcopilot.com (OpenAI-compatible)

The session token is cached and auto-refreshed on expiry.
"""

from __future__ import annotations

import logging
import time
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# VS Code's public client ID for GitHub Copilot
GITHUB_CLIENT_ID = "Iv1.b507a08c87ecfe98"
GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code"
GITHUB_OAUTH_TOKEN_URL = "https://github.com/login/oauth/access_token"
COPILOT_TOKEN_URL = "https://api.github.com/copilot_internal/v2/token"
COPILOT_API_BASE = "https://api.githubcopilot.com"

# Headers required by Copilot API
COPILOT_HEADERS = {
    "Editor-Version": "vscode/1.96.0",
    "Editor-Plugin-Version": "copilot/1.250.0",
    "Copilot-Integration-Id": "vscode-chat",
    "Openai-Organization": "github-copilot",
    "Openai-Intent": "conversation-panel",
}

# In-memory token cache
_device_flow_state: dict = {}  # active device flow: {device_code, user_code, ...}
_github_token: Optional[str] = None  # the ghu_ token from device flow
_session_token: Optional[str] = None  # the actual Copilot API session token
_session_token_expires: float = 0  # unix timestamp when session token expires


# ---------------------------------------------------------------------------
# Step 1: Initiate device flow
# ---------------------------------------------------------------------------

async def start_device_flow() -> dict:
    """
    Start GitHub device flow. Returns dict with:
    - device_code, user_code, verification_uri, interval, expires_in
    """
    global _device_flow_state

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            GITHUB_DEVICE_CODE_URL,
            data={
                "client_id": GITHUB_CLIENT_ID,
                "scope": "",  # Copilot doesn't need specific scopes
            },
            headers={"Accept": "application/json"},
        )
        resp.raise_for_status()
        data = resp.json()

    _device_flow_state = {
        "device_code": data["device_code"],
        "user_code": data["user_code"],
        "verification_uri": data["verification_uri"],
        "interval": data.get("interval", 5),
        "expires_in": data.get("expires_in", 900),
        "started_at": time.time(),
    }

    logger.info("Copilot device flow started: user_code=%s", data["user_code"])

    return {
        "user_code": data["user_code"],
        "verification_uri": data["verification_uri"],
        "interval": data.get("interval", 5),
        "expires_in": data.get("expires_in", 900),
    }


# ---------------------------------------------------------------------------
# Step 2: Poll for device flow completion
# ---------------------------------------------------------------------------

async def poll_device_flow() -> dict:
    """
    Poll GitHub OAuth for device flow completion.

    Returns:
    - {"status": "pending"} — user hasn't authorized yet
    - {"status": "success"} — authorized, token stored
    - {"status": "expired"} — device flow expired
    - {"status": "error", "message": "..."} — something went wrong
    """
    global _github_token, _device_flow_state

    if not _device_flow_state:
        return {"status": "error", "message": "No active device flow. Call /start first."}

    # Check expiry
    elapsed = time.time() - _device_flow_state.get("started_at", 0)
    if elapsed > _device_flow_state.get("expires_in", 900):
        _device_flow_state = {}
        return {"status": "expired", "message": "Device flow expired. Please start again."}

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            GITHUB_OAUTH_TOKEN_URL,
            data={
                "client_id": GITHUB_CLIENT_ID,
                "device_code": _device_flow_state["device_code"],
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            },
            headers={"Accept": "application/json"},
        )

    data = resp.json()
    error = data.get("error")

    if error == "authorization_pending":
        return {"status": "pending"}
    elif error == "slow_down":
        # Increase interval
        _device_flow_state["interval"] = _device_flow_state.get("interval", 5) + 5
        return {"status": "pending", "interval": _device_flow_state["interval"]}
    elif error == "expired_token":
        _device_flow_state = {}
        return {"status": "expired", "message": "Device flow expired."}
    elif error:
        return {"status": "error", "message": data.get("error_description", error)}

    # Success — we got the token
    access_token = data.get("access_token")
    if not access_token:
        return {"status": "error", "message": "No access_token in response."}

    _github_token = access_token
    _device_flow_state = {}
    logger.info("Copilot device flow completed. Got GitHub token: %s...", access_token[:10])

    # Immediately exchange for a Copilot session token
    try:
        await _refresh_session_token()
    except Exception as exc:
        logger.error("Failed to exchange GitHub token for Copilot session: %s", exc)
        return {"status": "error", "message": f"Got GitHub token but Copilot exchange failed: {exc}"}

    # Persist the ghu_ token to DB for survival across restarts
    await _persist_token()

    return {"status": "success"}


# ---------------------------------------------------------------------------
# Step 3: Exchange ghu_ token for Copilot session token
# ---------------------------------------------------------------------------

async def _refresh_session_token() -> None:
    """Exchange the GitHub token for a Copilot session token."""
    global _session_token, _session_token_expires

    if not _github_token:
        raise RuntimeError("No GitHub token available for Copilot exchange")

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            COPILOT_TOKEN_URL,
            headers={
                "Authorization": f"token {_github_token}",
                "Accept": "application/json",
                **COPILOT_HEADERS,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    _session_token = data.get("token")
    expires_at = data.get("expires_at")

    if not _session_token:
        raise RuntimeError(f"No token in Copilot response: {data}")

    if expires_at:
        _session_token_expires = float(expires_at)
    else:
        # Default to 25 minutes from now (tokens usually last ~30min)
        _session_token_expires = time.time() + 25 * 60

    logger.info("Copilot session token refreshed, expires at %s", _session_token_expires)


async def get_session_token() -> str:
    """
    Get a valid Copilot session token, refreshing if needed.
    This is the token used for API requests.
    """
    global _session_token, _session_token_expires

    if not _github_token:
        raise RuntimeError("Copilot not authenticated. Complete device flow first.")

    # Refresh if expired or about to expire (60s buffer)
    if not _session_token or time.time() > (_session_token_expires - 60):
        await _refresh_session_token()

    return _session_token  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Token persistence (store ghu_ token in app_settings)
# ---------------------------------------------------------------------------

async def _persist_token() -> None:
    """Save the GitHub token to DB for survival across restarts."""
    if not _github_token:
        return

    from app.services.llm import load_db_config, save_db_config

    config = await load_db_config()
    config["copilot_github_token"] = _github_token
    await save_db_config(config)


async def load_persisted_token() -> bool:
    """
    Load a previously persisted GitHub token from DB.
    Returns True if a token was found and validated.
    """
    global _github_token

    from app.services.llm import load_db_config

    config = await load_db_config()
    token = config.get("copilot_github_token")

    if not token:
        return False

    _github_token = token

    # Try to refresh the session token to validate it still works
    try:
        await _refresh_session_token()
        logger.info("Loaded persisted Copilot token, session refreshed.")
        return True
    except Exception as exc:
        logger.warning("Persisted Copilot token is invalid: %s", exc)
        _github_token = None
        return False


def is_authenticated() -> bool:
    """Check if we have a valid GitHub token for Copilot."""
    return _github_token is not None


def get_copilot_headers() -> dict[str, str]:
    """Return the headers needed for Copilot API requests (without auth)."""
    return {**COPILOT_HEADERS}


async def disconnect() -> None:
    """Clear all Copilot tokens and remove from DB."""
    global _github_token, _session_token, _session_token_expires, _device_flow_state

    _github_token = None
    _session_token = None
    _session_token_expires = 0
    _device_flow_state = {}

    # Remove from DB
    from app.services.llm import load_db_config, save_db_config

    config = await load_db_config()
    config.pop("copilot_github_token", None)

    # If current provider is copilot, don't reset it — just clear the token
    await save_db_config(config)
    logger.info("Copilot disconnected and tokens cleared.")
