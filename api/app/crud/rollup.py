from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.utils import gen_suffix
from app.models import Rollup, ColumnMeta, TableMeta, ColumnType

__all__ = ["add_rollup", "get_rollup", "update_rollup", "delete_rollup"]

ALLOWED_RELATION_TYPES = {
    "oo_relation",
    "om_relation",
    "mm_relation_left",
    "mm_relation_right",
    "mo_relation",
}

async def add_rollup(
    db: AsyncSession,
    display_name: str,
    table_id: string,
    relation_column_id: str,
    aggregate_func: str,
    rollup_column_id: str | None = None,
    precision: int | None = None,
    show_thousands_sep: bool | None = False,
) -> Rollup:
    # Ensure table exists
    tbl = await db.get(TableMeta, table_id)
    if not tbl:
        raise ValueError(f"table {table_id!r} not found")

    # Validate relation column
    rel_col = await db.get(ColumnMeta, relation_column_id)
    if not rel_col or rel_col.table_id != table_id:
        raise ValueError("relation_column_id must be a relation on the same table")
    if (rel_col.ui_type or "") not in ALLOWED_RELATION_TYPES:
        raise ValueError("relation_column_id must be a relation-type column")

    # Validate rollup column if provided (best-effort)
    if rollup_column_id:
        ru_col = await db.get(ColumnMeta, rollup_column_id)
        if not ru_col:
            raise ValueError("rollup_column_id not found")

    # Create virtual column
    col_id = gen_suffix(16)
    col_meta = ColumnMeta(
        id=col_id,
        table_id=table_id,
        display_name=display_name,
        name=f"rollup_{col_id}",
        ui_type="rollup",
        column_type=ColumnType.VIRTUAL,
        fk_type="TEXT",
    )
    db.add(col_meta)
    await db.flush()
    await db.refresh(col_meta)

    # Create rollup config
    rl_id = gen_suffix(16)
    rollup = Rollup(
        id=rl_id,
        column_id=col_id,
        relation_column_id=relation_column_id,
        rollup_column_id=rollup_column_id,
        aggregate_func=aggregate_func,
        precision=precision,
        show_thousands_sep=bool(show_thousands_sep),
    )
    db.add(rollup)
    await db.flush()
    await db.refresh(rollup)
    return rollup

async def get_rollup(db: AsyncSession, column_id: str) -> Rollup | None:
    return await db.get(Rollup, (await _rollup_id_by_column(db, column_id)))

async def _rollup_id_by_column(db: AsyncSession, column_id: str) -> str | None:
    stmt = select(Rollup.id).where(Rollup.column_id == column_id)
    res = await db.execute(stmt)
    row = res.first()
    return row[0] if row else None

async def update_rollup(
    db: AsyncSession,
    column_id: str,
    *,
    relation_column_id: str | None = None,
    rollup_column_id: str | None = None,
    aggregate_func: str | None = None,
    precision: int | None = None,
    show_thousands_sep: bool | None = None,
) -> Rollup:
    rl_id = await _rollup_id_by_column(db, column_id)
    if not rl_id:
        raise ValueError(f"rollup for column {column_id!r} not found")

    rollup = await db.get(Rollup, rl_id)
    if relation_column_id is not None:
        rel_col = await db.get(ColumnMeta, relation_column_id)
        if not rel_col:
            raise ValueError("relation_column_id not found")
        if (rel_col.ui_type or "") not in ALLOWED_RELATION_TYPES:
            raise ValueError("relation_column_id must be a relation-type column")
        rollup.relation_column_id = relation_column_id
    if rollup_column_id is not None:
        if rollup_column_id:
            ru_col = await db.get(ColumnMeta, rollup_column_id)
            if not ru_col:
                raise ValueError("rollup_column_id not found")
        rollup.rollup_column_id = rollup_column_id
    if aggregate_func is not None:
        rollup.aggregate_func = aggregate_func
    if precision is not None:
        rollup.precision = precision
    if show_thousands_sep is not None:
        rollup.show_thousands_sep = bool(show_thousands_sep)

    await db.flush()
    await db.refresh(rollup)
    return rollup

async def delete_rollup(db: AsyncSession, column_id: str) -> None:
    # Delete the virtual rollup column (CASCADE removes rollup config)
    col_meta = await db.get(ColumnMeta, column_id)
    if not col_meta:
        raise ValueError(f"column {column_id!r} not found")
    if (col_meta.ui_type or "") != "rollup":
        raise ValueError("column is not a rollup")
    await db.delete(col_meta)
    await db.flush()
