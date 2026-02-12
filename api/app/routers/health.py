"""
Health-check and readiness endpoints.

- ``GET /health``  — shallow liveness probe (always 200 if the process is up)
- ``GET /ready``   — deep readiness probe (checks DB + Redis connectivity)
"""

from __future__ import annotations

import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    """Liveness probe — always returns 200 when the process is alive."""
    return {"status": "ok"}


@router.get("/ready")
async def ready() -> JSONResponse:
    """
    Readiness probe — checks database and Redis.

    Returns 200 with per-component status when **all** components are healthy,
    or 503 with details when any component is degraded.
    """
    components: dict[str, str] = {}
    overall_ok = True

    # ── Database ────────────────────────────────────────────────
    try:
        from app.database import AsyncSessionLocal

        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        components["database"] = "ok"
    except Exception as exc:
        logger.warning("Readiness: DB check failed: %s", exc)
        components["database"] = f"error: {exc}"
        overall_ok = False

    # ── Redis ───────────────────────────────────────────────────
    try:
        import redis.asyncio as aioredis
        from app.config import settings

        redis_url: str = getattr(settings, "REDIS_URL", "redis://localhost:6379/0")
        r = aioredis.from_url(redis_url, decode_responses=True)
        pong = await r.ping()
        await r.aclose()
        components["redis"] = "ok" if pong else "error: no pong"
        if not pong:
            overall_ok = False
    except Exception as exc:
        logger.warning("Readiness: Redis check failed: %s", exc)
        components["redis"] = f"error: {exc}"
        overall_ok = False

    status_code = 200 if overall_ok else 503
    return JSONResponse(
        status_code=status_code,
        content={"status": "ok" if overall_ok else "degraded", "components": components},
    )
