import os, sys

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool
from sqlmodel import SQLModel
from sqlalchemy import text




sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.database import get_session
from main import app
from app.models import User, Project, TableMeta
from app.utils import gen_suffix

async_engine = create_async_engine(
    url=os.environ["DATABASE_URL_TEST"],
    echo=False,
    poolclass=NullPool,
)


# Drop all tables after each test
@pytest_asyncio.fixture(scope="function")
async def async_db_engine():
    async with async_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

    yield async_engine

    async with async_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)


@pytest_asyncio.fixture(scope="function")
async def async_db(async_db_engine):
    async_session = async_sessionmaker(
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
        bind=async_db_engine,
        class_=AsyncSession,
    )

    async with async_session() as session:
        await session.begin()

        yield session

        await session.rollback()


@pytest_asyncio.fixture(scope="function", autouse=True)
async def async_client(async_db):
    def override_get_db():
        yield async_db

    app.dependency_overrides[get_session] = override_get_db
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://localhost")


# Add alias so tests can use `async_session`
@pytest_asyncio.fixture(scope="function")
async def db(async_db):
    yield async_db

