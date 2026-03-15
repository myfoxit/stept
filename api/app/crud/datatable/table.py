"""Table CRUD — create/drop/rename physical tables + metadata.

Ported from SnapRow crud/table.py with Stept patterns.
"""
from __future__ import annotations

import logging
from typing import Optional, Sequence

from sqlalchemy import select, text, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.datatable.column import add_column
from app.crud.datatable.field import insert_row
from app.models import (
    TableMeta, TableType, ColumnMeta, RelationMeta,
    LookUpColumn, SelectOption, Formulas, Rollup,
    Filter, Sort, ColumnVisibility,
)
from app.utils import gen_suffix
from app.db.utils import sanitize_identifier, quote_ident, _get_dialect_name

logger = logging.getLogger(__name__)

_ID_COLUMN_DDL = {
    "sqlite": "id INTEGER PRIMARY KEY AUTOINCREMENT",
    "postgresql": "id SERIAL PRIMARY KEY",
}


def _make_create_table_statement(quoted_physical: str, dialect_name: str) -> str:
    try:
        id_col = _ID_COLUMN_DDL[dialect_name]
    except KeyError as exc:
        raise RuntimeError(f"Unsupported SQL dialect '{dialect_name}'.") from exc

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


async def create_table(
    db: AsyncSession,
    name: str,
    project_id: str,
    table_type: TableType = TableType.USER,
) -> TableMeta:
    logical_name = sanitize_identifier(name, normalize=False)
    physical_segment = sanitize_identifier(name)
    suffix = gen_suffix()
    meta_id = gen_suffix(16)
    # Use st_ prefix for Stept (instead of sr_ for SnapRow)
    physical_name = f"st_{suffix}_{physical_segment}"
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
    logger.info("Created table %s for project %s", physical_name, project_id)
    return meta


async def get_tables(
    db: AsyncSession,
    project_id: str,
) -> Sequence[TableMeta]:
    stmt = (
        select(TableMeta)
        .where(
            TableMeta.project_id == project_id,
            TableMeta.table_type != TableType.JOIN,
        )
        .order_by(TableMeta.name)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


async def get_table(db: AsyncSession, table_id: str) -> Optional[TableMeta]:
    return await db.get(TableMeta, table_id)


async def drop_table(db: AsyncSession, table_id: str) -> Optional[TableMeta]:
    meta: Optional[TableMeta] = await db.get(TableMeta, table_id, with_for_update=True)
    if meta is None:
        return None

    col_ids = [
        cid for (cid,) in (
            await db.execute(select(ColumnMeta.id).where(ColumnMeta.table_id == table_id))
        ).all()
    ]

    # Clean up all metadata referencing this table
    await db.execute(
        delete(RelationMeta).where(
            (RelationMeta.left_table_id == table_id)
            | (RelationMeta.right_table_id == table_id)
            | (RelationMeta.join_table_id == table_id)
        )
    )
    if col_ids:
        await db.execute(
            delete(LookUpColumn).where(
                (LookUpColumn.column_id.in_(col_ids))
                | (LookUpColumn.relation_column_id.in_(col_ids))
                | (LookUpColumn.lookup_column_id.in_(col_ids))
            )
        )
        await db.execute(delete(SelectOption).where(SelectOption.column_id.in_(col_ids)))
        await db.execute(delete(Formulas).where(Formulas.column_id.in_(col_ids)))
        await db.execute(delete(Rollup).where(Rollup.column_id.in_(col_ids)))
        await db.execute(delete(Filter).where(Filter.column_id.in_(col_ids)))
        await db.execute(delete(Sort).where(Sort.column_id.in_(col_ids)))
        await db.execute(delete(ColumnVisibility).where(ColumnVisibility.column_id.in_(col_ids)))
        await db.execute(delete(ColumnMeta).where(ColumnMeta.id.in_(col_ids)))

    quoted_physical = quote_ident(sanitize_identifier(meta.physical_name))
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
    meta = await db.get(TableMeta, table_id)
    if not meta:
        raise ValueError(f"table {table_id!r} not found")

    logical_name = sanitize_identifier(new_name, normalize=False)
    physical_segment = sanitize_identifier(new_name)
    old_phys = meta.physical_name
    _, suffix, _ = old_phys.split("_", 2)
    new_phys = f"st_{suffix}_{physical_segment}"
    quoted_old = quote_ident(old_phys)
    quoted_new = quote_ident(new_phys)

    rename_sql = f"ALTER TABLE {quoted_old} RENAME TO {quoted_new}"
    await db.execute(text(rename_sql))

    meta.name = logical_name
    meta.physical_name = new_phys
    await db.flush()
    await db.refresh(meta)
    return meta
