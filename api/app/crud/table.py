from __future__ import annotations

import logging
from typing import List, Optional, Sequence

from sqlalchemy import select, text, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.column import add_column
from app.crud.field import insert_row
from app.models import TableMeta, TableType, ColumnMeta, RelationMeta, LookUpColumn, SelectOption, Formulas
from app.utils import gen_suffix
from app.db.utils import sanitize_identifier, quote_ident, _get_dialect_name

logger = logging.getLogger(__name__)

__all__ = [
    "create_table",
    "get_tables",
    "drop_table",
]

_ID_COLUMN_DDL = {
    "sqlite": "id INTEGER PRIMARY KEY AUTOINCREMENT",
    "postgresql": "id SERIAL PRIMARY KEY",
    "mysql": "id BIGINT AUTO_INCREMENT PRIMARY KEY",
}

def _make_create_table_statement(quoted_physical: str, dialect_name: str) -> str:
    """Return a ``CREATE TABLE IF NOT EXISTS …`` statement with id, name, created_at, and updated_at."""
    try:
        id_col = _ID_COLUMN_DDL[dialect_name]
    except KeyError as exc:
        raise RuntimeError(
            f"Unsupported SQL dialect '{dialect_name}'."
            " Add a matching entry to _ID_COLUMN_DDL."
        ) from exc

    timestamp_column = (
        "created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,"
        " updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP"
    )
    return (
        f"CREATE TABLE IF NOT EXISTS {quoted_physical} ("
        f"{id_col},"
        f" {timestamp_column}"
        ")"
    )

# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

async def create_table(
    db: AsyncSession,
    name: str,
    project_id: str,
    table_type: TableType = TableType.USER,
) -> TableMeta:
    # logical name: only validate, allow spaces & capitals
    logical_name = sanitize_identifier(name, normalize=False)
    # physical segment: fully normalize
    physical_segment = sanitize_identifier(name)
    suffix = gen_suffix()
    meta_id = gen_suffix(16)
    physical_name = f"sr_{suffix}_{physical_segment}"
    quoted_physical = quote_ident(physical_name)

    meta = TableMeta(
        id=meta_id,
        name=logical_name,
        physical_name=physical_name,
        project_id=project_id,
        table_type=table_type,
    )
    db.add(meta)
    await db.flush()

    dialect = _get_dialect_name(db)
    ddl = _make_create_table_statement(quoted_physical, dialect)
    await db.execute(text(ddl))


    await add_column(db, meta, name="name", ui_type="single_line_text")

    await insert_row(db, meta, {"name": ""})


    await db.refresh(meta)
    logger.info(
        "Created table %s for project %s using dialect '%s'", physical_name, project_id, dialect
    )
    return meta


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

async def get_tables(
    db: AsyncSession,
    project_id: str,
) -> Sequence[TableMeta]:
    """
    Retrieve all tables for a project, excluding those of type JOIN.
    """
    stmt = (
        select(TableMeta)
        .where(
            TableMeta.project_id == project_id,
            TableMeta.table_type != TableType.JOIN,
        )
        .order_by(TableMeta.name)
    )
    result = await db.execute(stmt)
    tables = result.scalars().all()
    logger.info(
        "Fetched %d tables for project %s (excluding joins)",
        len(tables),
        project_id,
    )
    return tables

async def get_table(db: AsyncSession, table_id: str) -> Optional[TableMeta]:
   return await db.get(TableMeta, table_id)


# ---------------------------------------------------------------------------
# Drop
# ---------------------------------------------------------------------------

async def drop_table(db: AsyncSession, table_id: str) -> Optional[TableMeta]:
    meta: Optional[TableMeta] = await db.get(TableMeta, table_id, with_for_update=True)
    if meta is None:
        return None
    # Collect column ids upfront
    col_ids = [
        cid for (cid,) in (
            await db.execute(select(ColumnMeta.id).where(ColumnMeta.table_id == table_id))
        ).all()
    ]
    # Delete relations where this table participates (left/right/join)
    await db.execute(
        delete(RelationMeta).where(
            (RelationMeta.left_table_id == table_id)
            | (RelationMeta.right_table_id == table_id)
            | (RelationMeta.join_table_id == table_id)
        )
    )
    if col_ids:
        # Delete lookups referencing any of the columns
        await db.execute(
            delete(LookUpColumn).where(
                (LookUpColumn.column_id.in_(col_ids))
                | (LookUpColumn.relation_column_id.in_(col_ids))
                | (LookUpColumn.lookup_column_id.in_(col_ids))
            )
        )
        # Delete select options (some DBs may not enforce cascades)
        await db.execute(
            delete(SelectOption).where(SelectOption.column_id.in_(col_ids))
        )
        # Delete formulas (defensive)
        await db.execute(
            delete(Formulas).where(Formulas.column_id.in_(col_ids))
        )
        # Delete column metadata
        await db.execute(
            delete(ColumnMeta).where(ColumnMeta.id.in_(col_ids))
        )
    quoted_physical = quote_ident(sanitize_identifier(meta.physical_name))
    # Use CASCADE on PostgreSQL so dependent objects (views, FKs, etc.) are removed automatically
    dialect = _get_dialect_name(db)
    drop_sql = (
        f"DROP TABLE IF EXISTS {quoted_physical} CASCADE"
        if dialect == "postgresql"
        else f"DROP TABLE IF EXISTS {quoted_physical}"
    )
    await db.execute(text(drop_sql))
    await db.delete(meta)
    await db.flush()
    logger.info("Dropped table %s (id=%s)", meta.physical_name, table_id)
    return meta

async def update_table(
    db: AsyncSession,
    table_id: str,
    new_name: str,
) -> TableMeta:
    """Update the display (logical) name of an existing table."""
    meta = await db.get(TableMeta, table_id)
    if not meta:
        raise ValueError(f"table {table_id!r} not found")

    # logical name: only validate, allow spaces & capitals
    logical_name = sanitize_identifier(new_name, normalize=False)
    # physical segment: fully normalize
    physical_segment = sanitize_identifier(new_name)
    # build new physical name preserving existing suffix
    old_phys = meta.physical_name
    _, suffix, _ = old_phys.split("_", 2)
    new_phys = f"sr_{suffix}_{physical_segment}"
    quoted_old = quote_ident(old_phys)
    quoted_new = quote_ident(new_phys)
    dialect = _get_dialect_name(db)
    # issue proper rename command per dialect
    if dialect == "mysql":
        rename_sql = f"RENAME TABLE {quoted_old} TO {quoted_new}"
    else:
        rename_sql = f"ALTER TABLE {quoted_old} RENAME TO {quoted_new}"
    await db.execute(text(rename_sql))
    # update metadata
    meta.name = logical_name
    meta.physical_name = new_phys
    await db.flush()
    await db.refresh(meta)
    return meta
