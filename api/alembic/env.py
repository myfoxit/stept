import asyncio
from logging.config import fileConfig
import re
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context
from app.database import Base, DATABASE_URL, engine
from app.models import (
    User, Project, Folder, Document, TextContainer, Session,
    ProcessRecordingSession, ProcessRecordingStep, ProcessRecordingFile,
    AuthCode, RefreshToken, AppSettings, project_members,
)

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
target_metadata = Base.metadata

DYNAMIC_TABLE_RE = re.compile(r"^sr_[A-Za-z0-9]{5}_")

# -------------------------------------------------------------------------
# Tell Alembic which DB objects to keep or skip
# -------------------------------------------------------------------------
def include_object(obj, name, type_, reflected, compare_to):
    """
    Skip tenant-specific runtime tables (sr_XXXXX_…).
    Keep everything else (tables, indexes, FKs, etc.).
    """
    if type_ == "table" and reflected and DYNAMIC_TABLE_RE.match(name):
        return False          # exclude from autogenerate
    return True


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_object=include_object,
        compare_type=True,
        render_as_batch=True,  # keeps SQLite happy
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        {
            **config.get_section(config.config_ini_section),
            "sqlalchemy.url": DATABASE_URL,  # keeps env & .ini in one place
        },
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as conn:
        await conn.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())

if context.is_offline_mode():
    # offline mode can stay as-is
    context.configure(
        url=DATABASE_URL.replace("+asyncpg", "+psycopg2").replace("+aiosqlite", ""),
        target_metadata=target_metadata,
        literal_binds=True,
        include_object=include_object,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()
else:
    run_migrations_online()
