"""MCP API key authentication helper."""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import McpApiKey


def hash_api_key(raw_key: str) -> str:
    """SHA-256 hash of a raw API key."""
    return hashlib.sha256(raw_key.encode()).hexdigest()


async def validate_api_key(raw_key: str, db: AsyncSession) -> McpApiKey | None:
    """Validate a raw API key and return the McpApiKey row (or None)."""
    key_hash = hash_api_key(raw_key)
    result = await db.execute(
        select(McpApiKey).where(
            McpApiKey.key_hash == key_hash,
            McpApiKey.is_active == True,  # noqa: E712
        )
    )
    api_key = result.scalar_one_or_none()
    if api_key:
        # Update last_used_at
        await db.execute(
            update(McpApiKey)
            .where(McpApiKey.id == api_key.id)
            .values(last_used_at=datetime.now(timezone.utc).replace(tzinfo=None))
        )
        await db.commit()
    return api_key
