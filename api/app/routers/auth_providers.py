"""
Auth providers router — OAuth / device-flow login for LLM providers.

Endpoints:
    POST /auth/providers/copilot/start   — start GitHub device flow
    POST /auth/providers/copilot/poll    — poll for device flow completion
    POST /auth/providers/copilot/disconnect — disconnect Copilot
    GET  /auth/providers/status          — which providers are authenticated
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.models import User
from app.security import get_current_user
from app.services.auth_providers import copilot as copilot_service

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------

class DeviceFlowStartResponse(BaseModel):
    user_code: str
    verification_uri: str
    interval: int
    expires_in: int


class DeviceFlowPollResponse(BaseModel):
    status: str  # "pending" | "success" | "expired" | "error"
    message: str | None = None
    interval: int | None = None


class ProviderStatus(BaseModel):
    provider: str
    connected: bool


class ProvidersStatusResponse(BaseModel):
    providers: list[ProviderStatus]


# ---------------------------------------------------------------------------
# Copilot endpoints
# ---------------------------------------------------------------------------

@router.post("/copilot/start", response_model=DeviceFlowStartResponse)
async def copilot_start_device_flow(
    current_user: User = Depends(get_current_user),
):
    """Initiate GitHub Copilot device flow. Returns user_code and verification URL."""
    try:
        result = await copilot_service.start_device_flow()
        return DeviceFlowStartResponse(**result)
    except Exception as exc:
        logger.error("Failed to start Copilot device flow: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to start device flow: {exc}",
        )


@router.post("/copilot/poll", response_model=DeviceFlowPollResponse)
async def copilot_poll_device_flow(
    current_user: User = Depends(get_current_user),
):
    """Poll for GitHub Copilot device flow completion."""
    try:
        result = await copilot_service.poll_device_flow()
        return DeviceFlowPollResponse(**result)
    except Exception as exc:
        logger.error("Failed to poll Copilot device flow: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Poll failed: {exc}",
        )


@router.post("/copilot/disconnect")
async def copilot_disconnect(
    current_user: User = Depends(get_current_user),
):
    """Disconnect Copilot and clear tokens."""
    await copilot_service.disconnect()
    return {"status": "disconnected"}


# ---------------------------------------------------------------------------
# Provider status
# ---------------------------------------------------------------------------

@router.get("/status", response_model=ProvidersStatusResponse)
async def providers_status(
    current_user: User = Depends(get_current_user),
):
    """Return which LLM providers are authenticated via OAuth/device-flow."""
    providers = [
        ProviderStatus(
            provider="copilot",
            connected=copilot_service.is_authenticated(),
        ),
        # Future: add Google, Azure, etc. here
    ]
    return ProvidersStatusResponse(providers=providers)
