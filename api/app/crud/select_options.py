from __future__ import annotations

from app.db.utils import quote_ident, sanitize_identifier

"""CRUD helpers for :pyclass:`~app.models.SelectOption`.

This module adds a *select* UI‑type that is stored as a plain ``TEXT`` column
and provides convenience routines that keep the model layer and the physical
schema in sync.

Functions
~~~~~~~~~
* :func:`add_select_column_with_options` – create a new *select* column *and* its option rows in one go.
* :func:`get_select_options` – fetch every option belonging to a column.
* :func:`update_select_options` – up‑sert an option list, deleting anything that no longer exists.
* :func:`delete_select_column` – remove the column and (via FK cascade) all its options.

All routines are ``async`` and designed for use with an :class:`sqlalchemy.ext.asyncio.AsyncSession`.
"""

import logging
from typing import List, Sequence, Union, Dict, Any

from sqlalchemy import select as sa_select, delete as sa_delete, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import TableMeta, ColumnMeta, SelectOption
from app.utils import gen_suffix
from app.crud.column import add_column, delete_column  # re‑use existing helpers


logger = logging.getLogger(__name__)



__all__ = [
    "add_select_column_with_options",
    "get_select_options",
    "update_select_options",
    "delete_select_column",
]

# ---------------------------------------------------------------------------
# Add column + options
# ---------------------------------------------------------------------------

async def add_select_column_with_options(
    db: AsyncSession,
    table_obj: TableMeta,
    name: str,
    options: Sequence[Union[str, Dict[str, Any]]],
    ui_type: str = "single_select",  # NEW: support both single and multi
) -> ColumnMeta:
    """Create a *select* column and populate it with *options*.

    Parameters
    ----------
    db
        Database session.
    table_obj
        Parent table.
    name
        Display/physical column name (will be normalised by *add_column*).
    options
        Either an iterable of plain strings or an iterable of
        ``{"name": str, "color": str | None}`` dicts.  Order of the iterable
        is preserved and stored in the ``order`` column.
    ui_type
        Either "single_select" or "multi_select"

    Returns
    -------
    ColumnMeta
        The freshly‑created column meta object (already flushed + refreshed).
    """

    # Create the physical column first
    col_meta = await add_column(
        db=db,
        table_obj=table_obj,
        name=name,
        ui_type=ui_type,  # Pass through the ui_type
    )

    # Normalise *options* into a common structure
    normalised: List[Dict[str, Any]] = []
    for idx, raw in enumerate(options):
        if isinstance(raw, str):
            normalised.append({"name": raw, "color": None, "order": idx})
        else:
            normalised.append({
                "name": raw["name"],
                "color": raw.get("color"),
                "order": idx,
            })

    # Insert option rows
    for opt in normalised:
        db.add(
            SelectOption(
                id=gen_suffix(16),
                column_id=col_meta.id,
                name=opt["name"],
                color=opt["color"],
                order=opt["order"],
            )
        )

    await db.flush()
    await db.refresh(col_meta)

    logger.info(
        "Created %s column %s with %d options on table %s",
        ui_type,
        name,
        len(normalised),
        table_obj.physical_name,
    )
    return col_meta

# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

async def get_select_options(db: AsyncSession, column_id: str) -> List[SelectOption]:
    """Return all options for *column_id* ordered by ``order`` then ``id``."""
    stmt = (
        sa_select(SelectOption)
        .where(SelectOption.column_id == column_id)
        .order_by(SelectOption.order.asc(), SelectOption.id.asc())
    )
    res = await db.execute(stmt)
    return list(res.scalars().all())

# ---------------------------------------------------------------------------
# Update (up‑sert style)
# ---------------------------------------------------------------------------

async def update_select_options(
    db: AsyncSession,
    column_id: str,
    options: Sequence[Union[str, Dict[str, Any]]],
) -> List[SelectOption]:
    """Synchronise the option list for *column_id* with *options*.

    The supplied list is treated as the single source of truth: – existing
    options that *aren't* present will be deleted, while new/updated ones are
    inserted or patched in‑place.  Matching happens by ``id`` if provided, else
    by positional order.
    """

    # Current state
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
            # Update in‑place
            opt = current[opt_id]
            opt.name = raw["name"]
            opt.color = raw.get("color")
            opt.order = idx
            seen.add(opt_id)
        else:
            # New row
            db.add(
                SelectOption(
                    id=gen_suffix(16),
                    column_id=column_id,
                    name=raw["name"],
                    color=raw.get("color"),
                    order=idx,
                )
            )

    # Purge removed
    for oid, obj in current.items():
        if oid not in seen:
            await db.delete(obj)

    await db.flush()
    return await get_select_options(db, column_id)

# ---------------------------------------------------------------------------
# Delete (column + options)
# ---------------------------------------------------------------------------

async def delete_select_column(db: AsyncSession, column_id: str) -> None:
  
    col: ColumnMeta | None = await db.get(ColumnMeta, column_id)
    if col is None:
        raise ValueError(f"column {column_id!r} not found")

    if col.ui_type not in ("single_select", "multi_select"):  # UPDATED
        raise ValueError(
            f"delete_select_column() expects a 'single_select' or 'multi_select' column, "
            f"got ui_type={col.ui_type!r}"
        )
    
    tbl: TableMeta | None = await db.get(TableMeta, col.table_id)
    if tbl is None:
        raise ValueError(f"table {col.table_id!r} not found")

    quoted_table = quote_ident(sanitize_identifier(tbl.physical_name))
    quoted_column = quote_ident(sanitize_identifier(col.name))

    await db.execute(
        text(f"ALTER TABLE {quoted_table} DROP COLUMN {quoted_column}")
    )

    await db.execute(
        sa_delete(SelectOption).where(SelectOption.column_id == column_id)
    )

    await db.delete(col)
    await db.flush()

    logger.info(
        "Deleted select column %s and all associated options from table %s",
        col.name,
        tbl.physical_name,
    )

async def assign_select_option(
    db: AsyncSession,
    column_id: str,
    row_id: int,
    option_id: str | None,
) -> dict[str, Any]:
    """
    Assign *option_id* (or NULL) to the single-select *column_id* on *row_id*.
    """
    col: ColumnMeta | None = await db.get(ColumnMeta, column_id)
    if not col or col.ui_type != "single_select":
        raise ValueError(f"{column_id!r} is not a single-select column")

    tbl: TableMeta | None = await db.get(TableMeta, col.table_id)
    if tbl is None:
        raise ValueError(f"parent table {col.table_id!r} not found")
    option = await db.get(SelectOption, option_id)
    if option_id and not option:
        raise ValueError(f"option {option_id!r} not found in column {column_id!r}")
    quoted_table  = quote_ident(sanitize_identifier(tbl.physical_name))
    quoted_column = quote_ident(sanitize_identifier(col.name))

    await db.execute(
        text(f"UPDATE {quoted_table} "
             f"SET {quoted_column} = :option "
             f"WHERE id = :row_id"),
        {"option": option.name, "row_id": row_id},
    )
    return {"row_id": row_id, "option": option.name}

async def assign_multi_select_options(
    db: AsyncSession,
    column_id: str,
    row_id: int,
    option_ids: List[str] | None,
) -> dict[str, Any]:
    """
    Assign multiple option_ids to the multi-select *column_id* on *row_id*.
    Stores as comma-separated option names.
    """
    col: ColumnMeta | None = await db.get(ColumnMeta, column_id)
    if not col or col.ui_type != "multi_select":
        raise ValueError(f"{column_id!r} is not a multi-select column")

    tbl: TableMeta | None = await db.get(TableMeta, col.table_id)
    if tbl is None:
        raise ValueError(f"parent table {col.table_id!r} not found")
    
    # Get option names
    option_names = []
    if option_ids:
        for opt_id in option_ids:
            option = await db.get(SelectOption, opt_id)
            if option and option.column_id == column_id:
                option_names.append(option.name)
    
    quoted_table  = quote_ident(sanitize_identifier(tbl.physical_name))
    quoted_column = quote_ident(sanitize_identifier(col.name))
    
    # Store as comma-separated values
    value = ",".join(option_names) if option_names else None
    
    await db.execute(
        text(f"UPDATE {quoted_table} "
             f"SET {quoted_column} = :value "
             f"WHERE id = :row_id"),
        {"value": value, "row_id": row_id},
    )
    return {"row_id": row_id, "options": option_names}
