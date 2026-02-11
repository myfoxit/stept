import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.table import create_table, get_tables, drop_table
from app.models import User, Project, TableMeta

async def _bootstrap_project(db: AsyncSession) -> Project:
    """Create a user+project and return the flushed Project."""
    user = User(name="user1")
    project = Project(name="proj1", user_id=user.id)
    db.add_all([user, project])
    await db.flush()
    await db.refresh(project)
    return project

@pytest.mark.asyncio
async def test_create_table_creates_meta_and_physical(db: AsyncSession):
    project = await _bootstrap_project(db)
    tbl_meta = await create_table(db, name="My Table", project_id=project.id)

    # metadata
    assert isinstance(tbl_meta, TableMeta)
    assert tbl_meta.name == "My Table"
    

    # physical table exists
    res = await db.execute(
        text(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_name = :tbl"
        ),
        {"tbl": tbl_meta.physical_name},
    )
    assert res.first() is not None

@pytest.mark.asyncio
async def test_get_tables_returns_existing(db: AsyncSession):
    project = await _bootstrap_project(db)
    tbl_meta = await create_table(db, name="Another Table", project_id=project.id)

    tables = await get_tables(db, project_id=project.id)
    assert tbl_meta.id in {t.id for t in tables}

@pytest.mark.asyncio
async def test_drop_table_removes_meta_and_physical(db: AsyncSession):
    project = await _bootstrap_project(db)
    tbl_meta = await create_table(db, name="Temp Table", project_id=project.id)

    dropped = await drop_table(db, tbl_meta.id)
    # meta row removed
    assert dropped.id == tbl_meta.id
    assert await db.get(TableMeta, tbl_meta.id) is None

    # physical table removed
    res2 = await db.execute(
        text(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_name = :tbl"
        ),
        {"tbl": tbl_meta.physical_name},
    )
    assert res2.first() is None
