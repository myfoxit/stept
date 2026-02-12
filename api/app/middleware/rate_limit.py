"""
Token-bucket rate limiter for LLM / chat endpoints.

Uses Redis when available; falls back to an in-memory ``defaultdict`` so the
app still works (with per-process limits) when Redis is down or absent.
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict
from typing import Optional

from fastapi import HTTPException, Request
from starlette.status import HTTP_429_TOO_MANY_REQUESTS

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DEFAULT_RATE = 30          # requests
DEFAULT_WINDOW = 60        # seconds
REDIS_PREFIX = "rl:chat:"  # Redis key prefix


# ---------------------------------------------------------------------------
# In-memory fallback
# ---------------------------------------------------------------------------

_mem_buckets: dict[str, list[float]] = defaultdict(list)


def _mem_check(key: str, limit: int, window: int) -> tuple[bool, int]:
    """
    Return ``(allowed, retry_after_seconds)``.
    """
    now = time.time()
    bucket = _mem_buckets[key]
    # Prune old entries
    _mem_buckets[key] = bucket = [t for t in bucket if now - t < window]
    if len(bucket) >= limit:
        oldest = bucket[0]
        retry_after = int(window - (now - oldest)) + 1
        return False, retry_after
    bucket.append(now)
    return True, 0


# ---------------------------------------------------------------------------
# Redis-backed check
# ---------------------------------------------------------------------------

async def _redis_check(key: str, limit: int, window: int) -> tuple[bool, int]:
    """
    Sliding-window rate limit via Redis sorted set.
    Returns ``(allowed, retry_after_seconds)``.
    Falls back to in-memory on any Redis error.
    """
    try:
        import redis.asyncio as aioredis
        from app.config import settings

        redis_url: str = getattr(settings, "REDIS_URL", "redis://localhost:6379/0")
        r = aioredis.from_url(redis_url, decode_responses=True)

        now = time.time()
        window_start = now - window
        rkey = f"{REDIS_PREFIX}{key}"

        pipe = r.pipeline()
        pipe.zremrangebyscore(rkey, "-inf", window_start)
        pipe.zcard(rkey)
        results = await pipe.execute()

        current_count: int = results[1]

        if current_count >= limit:
            # Find oldest remaining entry to compute retry-after
            oldest = await r.zrange(rkey, 0, 0, withscores=True)
            retry_after = int(window - (now - oldest[0][1])) + 1 if oldest else window
            await r.aclose()
            return False, max(retry_after, 1)

        # Add the current request
        await r.zadd(rkey, {f"{now}": now})
        await r.expire(rkey, window + 10)
        await r.aclose()
        return True, 0

    except Exception as exc:
        logger.debug("Redis rate-limit unavailable, falling back to in-memory: %s", exc)
        return _mem_check(key, limit, window)


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------

class RateLimiter:
    """
    FastAPI dependency that enforces per-user request rate limiting.

    Usage::

        limiter = RateLimiter(limit=30, window=60)

        @router.post("/completions")
        async def chat(... , _rl=Depends(limiter)):
            ...
    """

    def __init__(self, limit: int = DEFAULT_RATE, window: int = DEFAULT_WINDOW):
        self.limit = limit
        self.window = window

    async def __call__(self, request: Request) -> None:
        # Prefer user id (set by auth middleware) over IP
        user_id: Optional[str] = None
        if hasattr(request.state, "user"):
            user_id = getattr(request.state.user, "id", None)
        if not user_id:
            user_id = request.client.host if request.client else "anon"

        allowed, retry_after = await _redis_check(
            key=str(user_id),
            limit=self.limit,
            window=self.window,
        )

        if not allowed:
            raise HTTPException(
                status_code=HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded. Please try again later.",
                headers={"Retry-After": str(retry_after)},
            )


# Pre-built instance for chat endpoints
chat_rate_limiter = RateLimiter(limit=DEFAULT_RATE, window=DEFAULT_WINDOW)
