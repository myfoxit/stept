"""Shared JWT secret resolution — single source of truth."""

import os
from typing import List
from app.config import settings


def get_jwt_secrets() -> List[str]:
    """Return the list of JWT secrets (supports comma-separated rotation)."""
    raw = os.environ.get("JWT_SECRET", settings.JWT_SECRET)
    secrets = [s.strip() for s in raw.split(",") if s.strip()]
    if not secrets:
        secrets = [settings.JWT_SECRET]
    return secrets


def get_signing_secret() -> str:
    """Return the primary (first) JWT secret used for signing new tokens."""
    return get_jwt_secrets()[0]
