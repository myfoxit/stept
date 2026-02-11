"""Common helpers shared by dynamic‑DDL CRUD endpoints."""
from __future__ import annotations

import re
from contextlib import asynccontextmanager
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import quoted_name

# ---------------------------------------------------------------------------
# Identifier validation / quoting
# ---------------------------------------------------------------------------

_IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_NON_NORMALIZED_IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9_ ]+$")


def sanitize_identifier(identifier: str, normalize: bool = True) -> str:
    """
    Validate and optionally normalize an SQL identifier.

    If normalize=True (default), will strip, lowercase, replace spaces with
    underscores, then enforce the standard identifier regex.
    If normalize=False, will only strip and reject any characters outside
    [A-Za-z0-9_ ] but allow spaces/capitals.
    """
    if normalize:
        # strip, lowercase, spaces → underscores
        normalized = re.sub(r'\s+', '_', identifier.strip().lower())
        if not _IDENTIFIER_RE.fullmatch(normalized):
            raise ValueError(f"Illegal SQL identifier after normalization: {normalized!r}")
        return normalized
    else:
        # only check for illegal characters, allow spaces & capitals
        trimmed = identifier.strip()
        if not _NON_NORMALIZED_IDENTIFIER_RE.fullmatch(trimmed):
            raise ValueError(f"Illegal SQL identifier: {trimmed!r}")
        return trimmed


def quote_ident(identifier: str) -> quoted_name:  
    """Return a SQLAlchemy *quoted* identifier for the current dialect."""
    return quoted_name(identifier, quote=True)  

# ---------------------------------------------------------------------------
# Transaction wrapper
# ---------------------------------------------------------------------------

@asynccontextmanager
async def transaction(session: AsyncSession) -> AsyncIterator[None]:
    """Context‑manager that commits, or rolls back on *any* exception."""
    try:
        async with session.begin():
            yield
    except Exception:  # noqa: BLE001
        await session.rollback()
        raise

def _get_dialect_name(db: AsyncSession) -> str:
    """Return the lowercase SQLAlchemy dialect name (e.g. ``"postgresql"``)."""
    return db.bind.dialect.name