
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import AsyncGenerator

from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base
from sqlmodel import SQLModel

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Environment & engine
# ---------------------------------------------------------------------------

env_path = Path(__file__).resolve().parent / "../.env"
load_dotenv(env_path)

DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./dev.db")

# Pool configuration — tuned for production workloads
_pool_kwargs = {}
if "sqlite" not in DATABASE_URL:
    _pool_kwargs = {
        "pool_size": int(os.getenv("DB_POOL_SIZE", "20")),
        "max_overflow": int(os.getenv("DB_MAX_OVERFLOW", "10")),
        "pool_timeout": int(os.getenv("DB_POOL_TIMEOUT", "30")),
        "pool_recycle": int(os.getenv("DB_POOL_RECYCLE", "1800")),
    }

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    **_pool_kwargs,
)

# ---------------------------------------------------------------------------
# Session factory
# ---------------------------------------------------------------------------

AsyncSessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)

Base = declarative_base()

# ---------------------------------------------------------------------------
# Schema helper
# ---------------------------------------------------------------------------

async def init_db() -> None:
    """Run on application start‑up to create tables."""

    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

# ---------------------------------------------------------------------------
# Dependency & context manager
# ---------------------------------------------------------------------------

async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency wrapping the request in a transaction."""
    async with AsyncSessionLocal() as session:
        try:
            yield session  # ──▶ request handler runs here
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

# Optional: for scripts/tests outside FastAPI
from contextlib import asynccontextmanager

@asynccontextmanager
async def session_scope() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
