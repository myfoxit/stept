"""Select option CRUD — ported from SnapRow crud/select_options.py.

FIX: assign_select_option now stores option ID, not name.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Sequence, Union

from sqlalchemy import select as sa_select, delete as sa_delete, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import TableMeta, ColumnMeta, SelectOption
from app.utils import gen_suffix
from app.crud.datatable.column import add_column, delete_column
from app.db.utils import quote_ident, sanitize_identifier

logger = logging.getLogger(__name__)


async def add_select_column_with_options(
    db: AsyncSession,
    table_obj: TableMeta,
    name: str,
    options: Sequence[Union[str, Dict[str, Any]]],
    ui_type: str = "single_select",
) -> ColumnMeta:
    col_meta = await add_column(db=db, table_obj=table_obj, name=name, ui_type=ui_type)

    normalised: List[Dict[str, Any]] = []
    for idx, raw in enumerate(options):
        if isinstance(raw, str):
            normalised.append({"name": raw, "color": None, "order": idx})
        else:
            normalised.append({"name": raw["name"], "color": raw.get("color"), "order": idx})

    for opt in normalised:
        db.add(SelectOption(
            id=gen_suffix(16),
            column_id=col_meta.id,
            name=opt["name"],
            color=opt["color"],
            order=opt["order"],
        ))

    await db.flush()
    await db.refresh(col_meta)
    logger.info("Created %s column %s with %d options", ui_type, name, len(normalised))
    return col_meta


async def get_select_options(db: AsyncSession, column_id: str) -> List[SelectOption]:
    stmt = (
        sa_select(SelectOption)
        .where(SelectOption.column_id == column_id)
        .order_by(SelectOption.order.asc(), SelectOption.id.asc())
    )
    res = await db.execute(stmt)
    return list(res.scalars().all())


async def update_select_options(
    db: AsyncSession,
    column_id: str,
    options: Sequence[Union[str, Dict[str, Any]]],
) -> List[SelectOption]:
    curr_res = await db.execute(
        sa_select(SelectOption).where(SelectOption.column_id == column_id)
    )
    current = {opt.id: opt for opt in curr_res.scalars().all()}

    seen: set[str] = set()
    for idx, raw in enumerate(options):
        if isinstance(raw, str):
            raw = {"name": raw, "color": None}
        opt_id = raw.get("id")
        if opt_id and opt_id in current:
            opt = current[opt_id]
            opt.name = raw["name"]
            opt.color = raw.get("color")
            opt.order = idx
            seen.add(opt_id)
        else:
            db.add(SelectOption(
                id=gen_suffix(16),
                column_id=column_id,
                name=raw["name"],
                color=raw.get("color"),
                order=idx,
            ))

    for oid, obj in current.items():
        if oid not in seen:
            await db.delete(obj)

    await db.flush()
    return await get_select_options(db, column_id)


async def delete_select_column(db: AsyncSession, column_id: str) -> None:
    col: ColumnMeta | None = await db.get(ColumnMeta, column_id)
    if col is None:
        raise ValueError(f"column {column_id!r} not found")
    if col.ui_type not in ("single_select", "multi_select"):
        raise ValueError(f"Expected select column, got ui_type={col.ui_type!r}")

    tbl: TableMeta | None = await db.get(TableMeta, col.table_id)
    if tbl is None:
        raise ValueError(f"table {col.table_id!r} not found")

    quoted_table = quote_ident(sanitize_identifier(tbl.physical_name))
    quoted_column = quote_ident(sanitize_identifier(col.name))

    await db.execute(text(f"ALTER TABLE {quoted_table} DROP COLUMN {quoted_column}"))
    await db.execute(sa_delete(SelectOption).where(SelectOption.column_id == column_id))
    await db.delete(col)
    await db.flush()


async def assign_select_option(
    db: AsyncSession,
    column_id: str,
    row_id: int,
    option_id: str | None,
) -> dict[str, Any]:
    """FIX: Stores option ID (not name) in the physical column."""
    col: ColumnMeta | None = await db.get(ColumnMeta, column_id)
    if not col or col.ui_type != "single_select":
        raise ValueError(f"{column_id!r} is not a single-select column")

    tbl: TableMeta | None = await db.get(TableMeta, col.table_id)
    if tbl is None:
        raise ValueError(f"parent table {col.table_id!r} not found")

    store_value = None
    option_name = None
    if option_id:
        option = await db.get(SelectOption, option_id)
        if not option:
            raise ValueError(f"option {option_id!r} not found")
        store_value = option.id  # FIX: store ID, not name
        option_name = option.name

    quoted_table = quote_ident(sanitize_identifier(tbl.physical_name))
    quoted_column = quote_ident(sanitize_identifier(col.name))

    await db.execute(
        text(f"UPDATE {quoted_table} SET {quoted_column} = :option WHERE id = :row_id"),
        {"option": store_value, "row_id": row_id},
    )
    return {"row_id": row_id, "option_id": store_value, "option_name": option_name}


async def assign_multi_select_options(
    db: AsyncSession,
    column_id: str,
    row_id: int,
    option_ids: List[str] | None,
) -> dict[str, Any]:
    """FIX: Uses PostgreSQL ARRAY instead of comma-separated text."""
    col: ColumnMeta | None = await db.get(ColumnMeta, column_id)
    if not col or col.ui_type != "multi_select":
        raise ValueError(f"{column_id!r} is not a multi-select column")

    tbl: TableMeta | None = await db.get(TableMeta, col.table_id)
    if tbl is None:
        raise ValueError(f"parent table {col.table_id!r} not found")

    # FIX: Store IDs as array, not comma-separated names
    store_ids: list[str] = []
    option_names: list[str] = []
    if option_ids:
        for opt_id in option_ids:
            option = await db.get(SelectOption, opt_id)
            if option and option.column_id == column_id:
                store_ids.append(option.id)
                option_names.append(option.name)

    quoted_table = quote_ident(sanitize_identifier(tbl.physical_name))
    quoted_column = quote_ident(sanitize_identifier(col.name))

    await db.execute(
        text(f"UPDATE {quoted_table} SET {quoted_column} = :value WHERE id = :row_id"),
        {"value": store_ids if store_ids else None, "row_id": row_id},
    )
    return {"row_id": row_id, "option_ids": store_ids, "option_names": option_names}
