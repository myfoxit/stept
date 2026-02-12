"""
Shared Pydantic validators and helpers for AI tool input sanitization.
"""

from __future__ import annotations

import re
from typing import Optional

from pydantic import BaseModel, field_validator


# ---------------------------------------------------------------------------
# Reusable validators
# ---------------------------------------------------------------------------

_PATH_TRAVERSAL_RE = re.compile(r"\.\./|\.\.\\")
_MAX_STR_LEN = 500


def sanitize_string(v: str | None, field_name: str = "field") -> str | None:
    """Enforce max length and reject path-traversal sequences."""
    if v is None:
        return v
    if len(v) > _MAX_STR_LEN:
        raise ValueError(f"{field_name} must be at most {_MAX_STR_LEN} characters")
    if _PATH_TRAVERSAL_RE.search(v):
        raise ValueError(f"{field_name} must not contain path traversal sequences")
    return v


def validate_id(v: str | None, field_name: str = "id") -> str | None:
    """IDs should be short alphanumeric strings."""
    if v is None:
        return v
    v = v.strip()
    if len(v) > 64:
        raise ValueError(f"{field_name} is too long")
    if _PATH_TRAVERSAL_RE.search(v):
        raise ValueError(f"{field_name} must not contain path traversal sequences")
    return v


def validate_positive_int(v: int | None, field_name: str = "value") -> int | None:
    if v is None:
        return v
    if v < 0:
        raise ValueError(f"{field_name} must be non-negative")
    return v
