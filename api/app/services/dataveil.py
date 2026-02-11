"""
DataVeil integration — optional PII privacy proxy for LLM requests.

When enabled, LLM requests are routed through DataVeil (a Go MITM proxy)
which automatically obfuscates PII before it reaches the LLM provider.
"""

from __future__ import annotations

import logging
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


def is_dataveil_enabled() -> bool:
    """Check if DataVeil proxy is enabled via config."""
    return bool(settings.DATAVEIL_ENABLED)


def get_dataveil_url() -> str:
    """Get the DataVeil proxy URL."""
    return (settings.DATAVEIL_URL or "http://localhost:8080").rstrip("/")


async def check_dataveil_health() -> bool:
    """Check if DataVeil proxy is reachable."""
    if not is_dataveil_enabled():
        return False

    url = get_dataveil_url()
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{url}/health")
            return resp.status_code == 200
    except Exception as exc:
        logger.warning("DataVeil health check failed: %s", exc)
        return False


def get_proxied_base_url() -> Optional[str]:
    """
    Return the DataVeil proxy URL to use as base_url for LLM calls,
    or None if DataVeil is not enabled / should fall back.

    DataVeil acts as a transparent proxy: the app sends requests to
    DataVeil's endpoint instead of directly to the LLM provider.
    DataVeil then forwards to the real provider after PII obfuscation.
    """
    if not is_dataveil_enabled():
        return None

    return get_dataveil_url()


async def get_proxied_base_url_with_fallback() -> Optional[str]:
    """
    Return DataVeil URL if healthy, else fall back to direct if allowed.
    """
    if not is_dataveil_enabled():
        return None

    if await check_dataveil_health():
        return get_dataveil_url()

    if settings.DATAVEIL_FALLBACK:
        logger.warning("DataVeil is down — falling back to direct LLM connection")
        return None

    # DataVeil enabled but down, no fallback allowed
    raise RuntimeError("DataVeil proxy is not available and fallback is disabled")


def get_dataveil_config() -> dict:
    """Return non-sensitive DataVeil configuration."""
    return {
        "enabled": is_dataveil_enabled(),
        "url": get_dataveil_url() if is_dataveil_enabled() else None,
        "fallback": bool(settings.DATAVEIL_FALLBACK),
    }
