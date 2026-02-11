import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import User, Project, TableMeta, ColumnMeta
from app.utils import gen_suffix


async def _bootstrap_table(db: AsyncSession) -> TableMeta:
    """
    Creates a user / project / physical table and corresponding TableMeta row.
    Returns the TableMeta instance (flushed and refreshed).
    """
    user = User(name=f"user_{gen_suffix(4)}")
    project = Project(name=f"proj_{gen_suffix(4)}", user_id=user.id)
    db.add_all([user, project])
    await db.flush()            # ← ensures ids are populated

    physical_name = f"tbl_{gen_suffix(6)}"
    await db.execute(text(f"CREATE TABLE {physical_name} (id INTEGER PRIMARY KEY)"))

    tbl = TableMeta(
        name="Test table",
        physical_name=physical_name,
        project_id=project.id,
        table_type="user",
    )
    db.add(tbl)
    await db.flush()
    await db.refresh(tbl)
    return tbl