from __future__ import annotations
from collections import defaultdict

import logging
from typing import Any, Dict, List, Optional, Callable, Awaitable
import json

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from dataclasses import dataclass


from app.utils import gen_suffix
from app.models import (
    LookUpColumn,
    TableMeta,
    ColumnMeta,
    FieldMeta,
    RelationMeta,
    ColumnType,
    Formulas,
    Rollup,
    Filter,
    Sort,  # ← NEW
)
from app.crud.filter import build_filter_clause  # ← NEW
from app.crud.column import ensure_order_column  # ← ADD THIS IMPORT
from app.db.utils import sanitize_identifier, quote_ident, _get_dialect_name

logger = logging.getLogger(__name__)

__all__ = [
    "insert_row",
    "insert_row_at_position",  # ← NEW
    "get_rows",
    "delete_row",
    "update_row",
    "search_rows",  # ← NEW
]

def get_display_attr(col: ColumnMeta, rel: RelationMeta | None) -> str:
    """
    Decide which remote column to expose.

    Precedence (first non‑empty wins):
      1. ColumnMeta.display_attr   – per column override
      2. RelationMeta.display_attr – per relation override
      3. literal 'name'            – safe default
    """
    # Column‑level override (handy for single‑select)
    if getattr(col, "display_attr", None):
        return sanitize_identifier(col.display_attr)

    # Relation‑level override
    if rel and getattr(rel, "display_attr", None):
        return sanitize_identifier(rel.display_attr)

    return "name"

def _extra_alias(col: ColumnMeta, lookup_field: str) -> str:
    """
    Returns a quoted identifier like  customer_name  (sanitised & quoted).
    """
    alias = f"{col.name}_{lookup_field}"
    return quote_ident(sanitize_identifier(alias))


# ---------------------------------------------------------------------------
# Insert
# ---------------------------------------------------------------------------

async def _column_defaults_map(db: AsyncSession, table_obj: TableMeta) -> Dict[str, Any]:
    """
    Build a map of column_name -> prepared default value for physical columns.
    Handles serialization per ui_type (extensible and safe).
    """
    col_metas = (
        await db.execute(select(ColumnMeta).where(ColumnMeta.table_id == table_obj.id))
    ).scalars().all()
    defaults: Dict[str, Any] = {}

    for c in col_metas:
        if c.default_value is None:
            continue
        # Only apply defaults to physical columns that exist on the table
        if c.column_type != ColumnType.PHYSICAL:
            continue

        ui = (c.ui_type or "").lower()
        val = c.default_value

        if ui in ("single_line_text", "text"):
            defaults[c.name] = str(val)
        elif ui == "long_text":
            if isinstance(val, (dict, list)):
                defaults[c.name] = json.dumps(val)
            else:
                defaults[c.name] = str(val)
        elif ui in ("decimal", "number"):
            defaults[c.name] = val
        elif ui in ("boolean", "bool", "BOOLEAN".lower()):
            defaults[c.name] = bool(val)
        elif ui == "single_select":
            if isinstance(val, dict):
                defaults[c.name] = val.get("id") or val.get("name") or ""
            else:
                defaults[c.name] = str(val)
        elif ui == "multi_select":
            if isinstance(val, (list, tuple)):
                defaults[c.name] = ",".join(map(str, val))
            elif isinstance(val, dict):
                defaults[c.name] = ",".join(map(str, val.get("values", [])))
            else:
                defaults[c.name] = str(val)
        else:
            # Fallback: store as-is (let DB casting handle or use DB default)
            defaults[c.name] = val

    return defaults

async def insert_row(
    db: AsyncSession,
    table_obj: TableMeta,
    data: Dict[str, Any],
) -> Dict[str, int]:
    """Insert a row at the end of the table."""
    if not data:
        raise ValueError("Row data cannot be empty.")

    # NEW: Ensure order column exists
    await ensure_order_column(db, table_obj)

    quoted_table = quote_ident(sanitize_identifier(table_obj.physical_name))
    
    # Prepare user data
    validated = {sanitize_identifier(k): v for k, v in data.items()}

    # NEW: Apply defaults for missing fields or explicit None (so DB DEFAULT isn’t bypassed)
    col_defaults = await _column_defaults_map(db, table_obj)
    for col_name, def_val in col_defaults.items():
        if col_name not in validated or validated[col_name] is None:
            validated[col_name] = def_val
    
    # NEW: Get the max order value
    max_order_result = await db.execute(
        text(f"SELECT COALESCE(MAX(sr__order), 0) FROM {quoted_table}")
    )
    max_order = float(max_order_result.scalar() or 0)
    
    # NEW: Add order value to data (increment by 1000 for future insertions)
    validated['sr__order'] = max_order + 1000
    
    columns = ", ".join(quote_ident(c) for c in validated)
    placeholders = ", ".join(f":{c}" for c in validated)

    insert_stmt = text(f"INSERT INTO {quoted_table} ({columns}) VALUES ({placeholders}) RETURNING id")
    result = await db.execute(insert_stmt, validated)
    new_row_id = result.scalar_one()

    # Exclude sr__order from metadata validation (it's a system column)
    user_columns = {k: v for k, v in validated.items() if not k.startswith('sr__')}
    
    if user_columns:  # Only validate if there are user columns
        col_meta = (
            await db.execute(
                select(ColumnMeta).filter(
                    ColumnMeta.table_id == table_obj.id,
                    ColumnMeta.name.in_(list(user_columns)),
                )
            )
        ).scalars().all()
        by_name = {c.name: c for c in col_meta}

        missing = [name for name in user_columns if name not in by_name]
        if missing:
            raise ValueError(f"Column metadata not found for: {', '.join(missing)}")

    logger.info("Inserted row %s into table %s", new_row_id, table_obj.physical_name)
    return {"row_id": new_row_id}

async def insert_row_at_position(
    db: AsyncSession,
    table_obj: TableMeta,
    data: Dict[str, Any],
    position: str = "below",  # "above" or "below"
    reference_row_id: Optional[int] = None,
) -> Dict[str, int]:
    """
    Insert a row at a specific position using fractional indexing.
    """
    if not data:
        raise ValueError("Row data cannot be empty.")

    # Ensure order column exists
    await ensure_order_column(db, table_obj)

    quoted_table = quote_ident(sanitize_identifier(table_obj.physical_name))
    validated = {sanitize_identifier(k): v for k, v in data.items()}

    # NEW: Apply defaults for missing fields or explicit None
    col_defaults = await _column_defaults_map(db, table_obj)
    for col_name, def_val in col_defaults.items():
        if col_name not in validated or validated[col_name] is None:
            validated[col_name] = def_val
    
    # Calculate the order value based on position
    if reference_row_id is None:
        # No reference, insert at end
        max_order_result = await db.execute(
            text(f"SELECT COALESCE(MAX(sr__order), 0) FROM {quoted_table}")
        )
        order_value = float(max_order_result.scalar() or 0) + 1000
    else:
        # Get reference row's order
        ref_order_result = await db.execute(
            text(f"SELECT sr__order FROM {quoted_table} WHERE id = :id"),
            {"id": reference_row_id}
        )
        ref_order = ref_order_result.scalar()
        
        if ref_order is None:
            raise ValueError(f"Reference row {reference_row_id} not found")
        
        ref_order = float(ref_order)
        
        if position == "above":
            # Get previous row's order
            prev_result = await db.execute(
                text(f"""
                    SELECT sr__order FROM {quoted_table} 
                    WHERE sr__order < :ref_order 
                    ORDER BY sr__order DESC LIMIT 1
                """),
                {"ref_order": ref_order}
            )
            prev_order = prev_result.scalar()
            
            if prev_order is None:
                # First row, use half of reference
                order_value = ref_order / 2
            else:
                # Midpoint between previous and reference
                order_value = (float(prev_order) + ref_order) / 2
        else:  # below
            # Get next row's order
            next_result = await db.execute(
                text(f"""
                    SELECT sr__order FROM {quoted_table} 
                    WHERE sr__order > :ref_order 
                    ORDER BY sr__order ASC LIMIT 1
                """),
                {"ref_order": ref_order}
            )
            next_order = next_result.scalar()
            
            if next_order is None:
                # Last row, add 1000
                order_value = ref_order + 1000
            else:
                # Midpoint between reference and next
                order_value = (ref_order + float(next_order)) / 2
    
    # Check if we need to rebalance (gap too small)
    if reference_row_id and abs(order_value - float(ref_order)) < 0.001:
        # Rebalance a window of rows around this position
        await _rebalance_order_window(db, table_obj, reference_row_id)
        # Recalculate after rebalancing
        return await insert_row_at_position(db, table_obj, data, position, reference_row_id)
    
    validated['sr__order'] = order_value
    
    # Insert the row
    columns = ", ".join(quote_ident(c) for c in validated)
    placeholders = ", ".join(f":{c}" for c in validated)
    
    insert_stmt = text(f"INSERT INTO {quoted_table} ({columns}) VALUES ({placeholders}) RETURNING id")
    result = await db.execute(insert_stmt, validated)
    new_row_id = result.scalar_one()
    
    logger.info(
        "Inserted row %s into table %s at position %s relative to row %s with order %s",
        new_row_id,
        table_obj.physical_name,
        position,
        reference_row_id,
        order_value
    )
    
    return {"row_id": new_row_id, "position": position}


async def _rebalance_order_window(
    db: AsyncSession,
    table_obj: TableMeta,
    center_row_id: int,
    window_size: int = 100
) -> None:
    """Rebalance order values in a window around the given row."""
    quoted_table = quote_ident(sanitize_identifier(table_obj.physical_name))
    
    # Get rows in window
    result = await db.execute(
        text(f"""
            WITH center AS (
                SELECT sr__order FROM {quoted_table} WHERE id = :center_id
            ),
            window_rows AS (
                SELECT id, ROW_NUMBER() OVER (ORDER BY sr__order) as rn
                FROM {quoted_table}, center
                WHERE sr__order BETWEEN center.sr__order - :half_window * 1000
                  AND center.sr__order + :half_window * 1000
            )
            UPDATE {quoted_table}
            SET sr__order = window_rows.rn * 1000
            FROM window_rows
            WHERE {quoted_table}.id = window_rows.id
        """),
        {"center_id": center_row_id, "half_window": window_size // 2}
    )
    
    await db.flush()
    logger.info("Rebalanced order window around row %s in table %s", center_row_id, table_obj.physical_name)

from functools import lru_cache

@lru_cache  # tiny in-process cache so we hit the DB only once per id per request
def _table_cache_key(table_id: str) -> str:
    return table_id

async def _get_table(db: AsyncSession, table_id: str) -> TableMeta:
    return await db.get(TableMeta, table_id)

async def _get_column(db: AsyncSession, column_id: str) -> TableMeta:
    return await db.get(ColumnMeta, column_id)

async def _relation_for(db: AsyncSession, col: ColumnMeta) -> Optional[RelationMeta]:
    stmt = select(RelationMeta).where(
        (RelationMeta.left_column_id == col.id)
        | (RelationMeta.right_column_id == col.id)
    )
    return await db.scalar(stmt)



@dataclass
class _SQLFragments:
    base_alias: str = "t"
    select: List[str] = None  # populated in __post_init__
    group: List[str] = None
    join: List[str] = None
    where: List[str] = None  # ← NEW: for filter clauses
    needs_group_by: bool = False

    def __post_init__(self) -> None:
        self.select = [f"{self.base_alias}.id"]
        self.group = [f"{self.base_alias}.id"]
        self.join = []
        self.where = []  # ← NEW

    # ---------------------------------------------------------------------
    #  Assemble the final SQL statement
    # ---------------------------------------------------------------------
    def to_sql(self, base_table_sql: str, *, limit: Optional[int], offset: Optional[int], custom_order: Optional[List[str]] = None) -> str:
        sql = (
            "SELECT\n  " + ",\n  ".join(self.select) + "\n"  # SELECT‑list
            + f"FROM {base_table_sql} AS {self.base_alias}\n"  # FROM + base‑alias
            + ("\n".join(self.join) + "\n" if self.join else "")  # all JOINs
        )

        # ← NEW: Add WHERE clause if filters exist
        if self.where:
            sql += "WHERE " + " AND ".join(self.where) + "\n"

        if self.needs_group_by:
            sql += "GROUP BY " + ", ".join(self.group) + "\n"
        
        # ← NEW: Use custom_order if provided, otherwise use default
        order_by = custom_order if custom_order else self.group
        sql += "ORDER BY " + ", ".join(order_by) + "\n"

        if limit is not None:
            sql += "LIMIT :limit\n"
        if offset is not None:
            sql += "OFFSET :offset\n"

        return sql

# ---------------------------------------------------------------------------
#  Dispatch helpers – one coroutine per *ui_type*
# ---------------------------------------------------------------------------

_Handler = Callable[[AsyncSession, TableMeta, ColumnMeta, _SQLFragments], Awaitable[None]]

async def _handle_plain(_: AsyncSession, table: TableMeta, col: ColumnMeta, f: _SQLFragments, lookup_field: str) -> None:
    """Literal value columns (no relations, enums, …)."""
    col_ident = quote_ident(sanitize_identifier(col.name))
    pretty = quote_ident(sanitize_identifier(col.name))  # changed: drop display_name
    local = f"{f.base_alias}.{col_ident}"
    f.select.append(f"{local} AS {pretty}")
    f.group.append(local)

async def _handle_lookup(
    db: AsyncSession,
    table: TableMeta,
    col: ColumnMeta,
    f: _SQLFragments,
    lookup_field: str,
) -> None:
    """
    Add an extra column <fk-column>_<lookup-field> that contains the raw
    lookup value (or an array for 1‑N / M‑N). Does **not** overwrite the
    original relation JSON column.
    """
    # ------------------------------------------------------------------
    # 1. Fetch lookup metadata
    # ------------------------------------------------------------------
    lu_meta = await db.scalar(
        select(LookUpColumn).where(LookUpColumn.column_id == col.id)
    )
    if not lu_meta:  # safeguard – should never happen
        logger.warning("Lookup metadata missing for %s.%s", table.physical_name, col.name)
        return

    fk_col: ColumnMeta = await db.get(ColumnMeta, lu_meta.relation_column_id)
    lookup_col: ColumnMeta = await db.get(ColumnMeta, lu_meta.lookup_column_id)
    if(fk_col.ui_type == "oo_relation" ):
        await _handle_oo_relation(db, table, fk_col, f, lookup_col.name, col.name)
    elif(fk_col.ui_type == "om_relation" ):
        await _handle_om_relation(db, table, fk_col, f, lookup_col.name, col.name)
    elif(fk_col.ui_type in ("mm_relation_left", "mm_relation_right")):
        await _handle_mm_relation(db, table, fk_col, f, lookup_col.name, col.name)


# ---------------------------------------------------------------------
#  single_select (enum‑like UI)
# ---------------------------------------------------------------------
async def _handle_single_select(db: AsyncSession, table: TableMeta, col: ColumnMeta, f: _SQLFragments, lookup_field: str) -> None:
    col_ident = quote_ident(sanitize_identifier(col.name))
    pretty = quote_ident(sanitize_identifier(col.name))  # changed
    local = f"{f.base_alias}.{col_ident}"

    opt_alias = f"{sanitize_identifier(col.name)}_opt"
    opt_table = quote_ident("select_options")
    opt_pk, opt_name, opt_color = (
        f"{opt_alias}.id",
        f"{opt_alias}.name",
        f"{opt_alias}.color",
    )

    f.join.append(
        f"LEFT JOIN {opt_table} AS {opt_alias} "
        f"ON {opt_alias}.column_id = '{col.id}' AND ("
        f"{opt_pk}::text = {local}::text OR {opt_name} = {local})"
    )
    f.select.append(
        f"CASE WHEN {opt_pk} IS NOT NULL "
        f"THEN json_build_object('id', {opt_pk}, 'name', {opt_name}, 'color', {opt_color}) "
        f"ELSE json_build_object('id', NULL, 'name', {local}, 'color', NULL) END AS {pretty}"
    )
    f.group.extend([opt_pk, opt_name, opt_color, local])


# ---------------------------------------------------------------------
#  one‑to‑one relations (physical or virtual FK)
# ---------------------------------------------------------------------
async def _handle_oo_relation(db: AsyncSession, table: TableMeta, col: ColumnMeta, f: _SQLFragments, lookup_field: str, alias: Optional[str] = None) -> None:
    """Handles *oo_relation* (1‑to‑1) in both physical & virtual flavours."""
    pretty = quote_ident(sanitize_identifier(alias or col.name))  # changed: removed display_name
    local_ref = f"{f.base_alias}.{quote_ident(sanitize_identifier(col.name))}"
    display_ident = quote_ident(lookup_field)
    

    rel = await _relation_for(db, col)
    if not rel:
        logger.warning("Relation missing for %s.%s", table.physical_name, col.name)
        await _handle_plain(db, table, col, f, "name")
        return

    # figure out the remote side (table + PK + name column)
    if rel.left_table_id == table.id:
        remote_tbl_id, remote_col_id = rel.right_table_id, rel.right_column_id
    else:
        remote_tbl_id, remote_col_id = rel.left_table_id, rel.left_column_id

    remote_tbl = await db.get(TableMeta, remote_tbl_id)
    remote_alias   = f"{sanitize_identifier(col.name)}_r_{gen_suffix(3)}"
    
    
    remote_table_sql = quote_ident(sanitize_identifier(remote_tbl.physical_name))

    remote_pk = f"{remote_alias}.id"
    remote_name = f"{remote_alias}.{display_ident}"  

    if col.column_type == ColumnType.PHYSICAL:
        # FK lives on *this* table → simple join on stored PK
        f.join.append(
            f"LEFT JOIN {remote_table_sql} AS {remote_alias} ON {local_ref} = {remote_pk}"
        )
    else:  # ColumnType.VIRTUAL – FK lives on *remote* table
        remote_fk_ident = quote_ident(sanitize_identifier((await db.get(ColumnMeta, remote_col_id)).name))
        f.join.append(
            f"LEFT JOIN {remote_table_sql} AS {remote_alias} "
            f"ON {remote_alias}.{remote_fk_ident} = {f.base_alias}.id"
        )

    f.select.append(
        f"json_build_object('id', {remote_pk}, 'name', {remote_name}) AS {pretty}"
    )
    f.select.append(f"{remote_name} AS {remote_alias}")  # e.g. animals_oo_color
    f.group.extend([remote_pk, remote_name])

# ---------------------------------------------------------------------
#  one‑to‑many relations (virtual FK on *remote* table)
# ---------------------------------------------------------------------
async def _handle_om_relation(db: AsyncSession, table: TableMeta, col: ColumnMeta, f: _SQLFragments, lookup_field: str, alias: Optional[str] = None) -> None:
    pretty = quote_ident(sanitize_identifier(alias or col.name, normalize=False))  # changed
    display_ident = quote_ident(lookup_field)
    rel = await _relation_for(db, col)
    if not rel or col.column_type != ColumnType.VIRTUAL:
        await _handle_plain(db, table, col, f, "name")
        return

    # resolve remote side
    if rel.left_table_id == table.id:
        remote_tbl_id, remote_col_id = rel.right_table_id, rel.right_column_id
    else:
        remote_tbl_id, remote_col_id = rel.left_table_id, rel.left_column_id

    remote_tbl = await db.get(TableMeta, remote_tbl_id)
    remote_alias = f"{sanitize_identifier(col.name)}_r_{gen_suffix(3)}"
    remote_table_sql = quote_ident(sanitize_identifier(remote_tbl.physical_name))

    remote_pk = f"{remote_alias}.id"
    remote_name = f"{remote_alias}.{display_ident}"  
    remote_fk_ident = quote_ident(sanitize_identifier((await db.get(ColumnMeta, remote_col_id)).name))

    f.join.append(
        f"LEFT JOIN {remote_table_sql} AS {remote_alias} "
        f"ON {remote_alias}.{remote_fk_ident} = {f.base_alias}.id"
    )

    f.select.append(
        f"COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id', {remote_pk}, 'name', {remote_name})) "
        f"FILTER (WHERE {remote_pk} IS NOT NULL), '[]') AS {pretty}"
    )
    f.needs_group_by = True

# ---------------------------------------------------------------------
#  many‑to‑many (join‑table) – supports left/right UI variants
# ---------------------------------------------------------------------
async def _handle_mm_relation(db: AsyncSession, table: TableMeta, col: ColumnMeta, f: _SQLFragments, lookup_field: str,alias: Optional[str] = None) -> None:
    if col.column_type != ColumnType.VIRTUAL:
        await _handle_plain(db, table, col, f, "name")
        return

    pretty = quote_ident(sanitize_identifier(alias or col.name))  # changed

    display_ident = quote_ident(lookup_field) 


    rel = await _relation_for(db, col)
    if not rel:
        await _handle_plain(db, table, col, f, "name")
        return

    # The join‑table & both FKs
    join_tbl_sql = quote_ident(sanitize_identifier((await db.get(TableMeta, rel.join_table_id)).physical_name))
    join_alias = f"{sanitize_identifier(col.name)}_jt_{gen_suffix(3)}"

    if col.ui_type == "mm_relation_left":
        this_fk_ident = quote_ident(sanitize_identifier(f"{table.physical_name}_id"))
        remote_tbl_id = rel.right_table_id
    else:  # mm_relation_right
        this_fk_ident = quote_ident(sanitize_identifier(f"{table.physical_name}_id"))  # same pattern
        remote_tbl_id = rel.left_table_id

    remote_tbl = await db.get(TableMeta, remote_tbl_id)
    remote_alias = f"{sanitize_identifier(col.name)}_r_mm_{gen_suffix(3)}"
    remote_tbl_sql = quote_ident(sanitize_identifier(remote_tbl.physical_name))

    remote_fk_ident = quote_ident(sanitize_identifier(f"{remote_tbl.physical_name}_id"))
    remote_pk = f"{remote_alias}.id"
    remote_name = f"{remote_alias}.{display_ident}"  

    # base → join‑table
    f.join.append(
        f"LEFT JOIN {join_tbl_sql} AS {join_alias} ON {join_alias}.{this_fk_ident} = {f.base_alias}.id"
    )
    # join‑table → remote table
    f.join.append(
        f"LEFT JOIN {remote_tbl_sql} AS {remote_alias} ON {remote_alias}.id = {join_alias}.{remote_fk_ident}"
    )

    f.select.append(
        f"COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id', {remote_pk}, 'name', {remote_name})) "
        f"FILTER (WHERE {remote_pk} IS NOT NULL), '[]') AS {pretty}"
    )
    f.needs_group_by = True

# ---------------------------------------------------------------------
#  formula (latest formula metadata as JSON)
# ---------------------------------------------------------------------
async def _handle_formula(
    db: AsyncSession,
    table: TableMeta,
    col: ColumnMeta,
    f: _SQLFragments,
    lookup_field: str,
) -> None:
    """
    Embed the latest formula metadata as JSON for ui_type 'formula'.
    """
    pretty = quote_ident(sanitize_identifier(col.name))  # changed
    formulas_tbl = quote_ident(sanitize_identifier(Formulas.__tablename__))
    subq = (
        f"(SELECT json_build_object('id' , fo.id, 'formula', fo.formula, 'formula_raw', fo.formula_raw)"
        f" FROM {formulas_tbl} AS fo"
        f" WHERE fo.column_id = '{col.id}'"
        f" ORDER BY fo.created_at DESC"
        f" LIMIT 1)"
    )
    f.select.append(f"{subq} AS {pretty}")


# ---------------------------------------------------------------------
#  rollup (embed static config as JSON)
# ---------------------------------------------------------------------
async def _handle_rollup(
    db: AsyncSession,
    table: TableMeta,
    col: ColumnMeta,
    f: _SQLFragments,
    lookup_field: str,           # kept for signature parity – unused
) -> None:
    """
    For *rollup* columns we expose the configuration (not the computed value)
    so the UI can display { id, relation_column_id, aggregate_func }.
    """
    pretty = quote_ident(sanitize_identifier(col.name))
    rollup_tbl = quote_ident(sanitize_identifier(Rollup.__tablename__))

    subq = (
        f"(SELECT json_build_object("
        f"  'id', rl.id,"
        f"  'relation_column_id', rl.relation_column_id,"
        f"  'aggregate_func', rl.aggregate_func"
        f") FROM {rollup_tbl} AS rl WHERE rl.column_id = '{col.id}')"
    )
    f.select.append(f"{subq} AS {pretty}")

# ---------------------------------------------------------------------------
#  Dispatcher – maps ui_type → handler coroutine
# ---------------------------------------------------------------------------
_HANDLERS: Dict[str, _Handler] = defaultdict(lambda: _handle_plain, {
    "single_select": _handle_single_select,
    "oo_relation": _handle_oo_relation,
    "om_relation": _handle_om_relation,
    "mm_relation_left": _handle_mm_relation,
    "mm_relation_right": _handle_mm_relation,
    "lookup": _handle_lookup,
    "formula": _handle_formula,
    "rollup": _handle_rollup,        # ← NEW
})

# ---------------------------------------------------------------------------
#  Public API – replacement for your old mega‑function
# ---------------------------------------------------------------------------

async def get_rows(
    db: AsyncSession,
    table_obj: TableMeta,
    *,
    limit: Optional[int] = 100,
    offset: Optional[int] = 0,
    user_id: Optional[str] = None,
    apply_filters: bool = True,
    apply_sorts: bool = True,  # ← NEW
) -> Dict[str, Any]:
    """Return paginated rows and total count for table_obj with relation columns hydrated."""
    # ────────────────────────────────────────────────────────────────────
    base_alias = "t"
    base_table_sql = quote_ident(sanitize_identifier(table_obj.physical_name))
    fragments = _SQLFragments(base_alias=base_alias)

    # pre‑fetch all ColumnMeta once
    cols: List[ColumnMeta] = (
        await db.execute(select(ColumnMeta).where(ColumnMeta.table_id == table_obj.id))
    ).scalars().all()

    # Collect filter clauses once so we can reuse them for both rows and count
    filter_clauses: List[str] = []
    if apply_filters and user_id:
        # Get active filters for this table and user
        filters_stmt = select(Filter).where(
            Filter.table_id == table_obj.id,
            Filter.user_id == user_id,
            Filter.is_active == True
        )
        filters = (await db.execute(filters_stmt)).scalars().all()

        # Build WHERE clauses for each filter
        for filter_obj in filters:
            column = await db.get(ColumnMeta, filter_obj.column_id)
            if column:
                filter_clause = build_filter_clause(
                    column,
                    filter_obj.operation,
                    filter_obj.value,
                    base_alias
                )
                filter_clauses.append(f"({filter_clause})")

    # ← NEW: Collect sort clauses
    sort_clauses: List[str] = []
    
    # ALWAYS sort by sr__order first if the column exists
    if table_obj.has_order_column:
        sort_clauses.append(f"{base_alias}.sr__order ASC")
    
    if apply_sorts and user_id:
        # Get active sorts for this table and user, ordered by priority
        sorts_stmt = select(Sort).where(
            Sort.table_id == table_obj.id,
            Sort.user_id == user_id,
            Sort.is_active == True
        ).order_by(Sort.priority)
        sorts = (await db.execute(sorts_stmt)).scalars().all()
        
        # Build ORDER BY clauses for each sort
        for sort_obj in sorts:
            column = await db.get(ColumnMeta, sort_obj.column_id)
            if column:
                col_ref = f"{base_alias}.{quote_ident(sanitize_identifier(column.name))}"
                direction = "DESC" if sort_obj.direction == "desc" else "ASC"
                sort_clauses.append(f"{col_ref} {direction}")
    
    # If no sr__order and no user sorts, fall back to id
    if not sort_clauses:
        sort_clauses = [f"{base_alias}.id ASC"]
    
    # ------------------------------------------------------------------
    #  Iterate over columns & dispatch per ui_type
    # ------------------------------------------------------------------
    for col in cols:
        if col.name.lower() == "id":
            continue  # PK already selected by default
        handler = _HANDLERS[col.ui_type]
        await handler(db, table_obj, col, fragments, "name")

    # Reuse the same filters for the SELECT query
    fragments.where.extend(filter_clauses)
    
    # Use our custom sort order
    sql = fragments.to_sql(base_table_sql, limit=limit, offset=offset, custom_order=sort_clauses)
    logger.debug("Generated SQL for %s:\n%s", table_obj.physical_name, sql)

    params: Dict[str, Any] = {}
    if limit is not None:
        params["limit"] = limit
    if offset is not None:
        params["offset"] = offset

    result = await db.execute(text(sql), params)
    rows = [dict(r) for r in result.mappings()]

    # Always compute total count with the same filters
    count_sql = f"SELECT COUNT(*) AS cnt FROM {base_table_sql} AS {base_alias} "
    if filter_clauses:
        count_sql += "WHERE " + " AND ".join(filter_clauses)
    count_result = await db.execute(text(count_sql))
    total_count = int(count_result.scalar_one() or 0)

    logger.info(
        "Fetched %s rows (of %s) from %s (dialect=%s, filters_applied=%s)",
        len(rows),
        total_count,
        table_obj.physical_name,
        _get_dialect_name(db),
        apply_filters and user_id is not None,
    )
    return {"items": rows, "total": total_count}




# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

async def delete_row(
    db: AsyncSession,
    table_obj: TableMeta,
    row_id: int,
) -> Dict[str, int]:
    quoted_table = quote_ident(sanitize_identifier(table_obj.physical_name))

    await db.execute(
        text(f"DELETE FROM {quoted_table} WHERE id = :id"),
        {"id": row_id},
    )
    logger.info("Deleted row %s from table %s", row_id, table_obj.physical_name)
    return {"deleted": row_id}


async def update_row(
    db: AsyncSession,
    table_obj: TableMeta,
    row_id: int,
    data: Dict[str, Any],
) -> Dict[str, int]:
    if not data:
        raise ValueError("No updates provided.")

    # Get column metadata to check ui_types
    col_metas = await db.execute(
        select(ColumnMeta).filter(
            ColumnMeta.table_id == table_obj.id,
            ColumnMeta.name.in_([sanitize_identifier(k).lower() for k in data.keys()])
        )
    )
    cols_by_name = {c.name: c for c in col_metas.scalars().all()}

    quoted_table = quote_ident(sanitize_identifier(table_obj.physical_name))
    validated = {}
    
    for k, v in data.items():
        sanitized_key = sanitize_identifier(k).lower()
        
        # Check if this is a long_text column that needs JSON serialization
        if sanitized_key in cols_by_name and cols_by_name[sanitized_key].ui_type == "long_text":
            # If value is a dict/list (ProseMirror JSON), stringify it
            if isinstance(v, (dict, list)):
                validated[sanitized_key] = json.dumps(v)
            else:
                validated[sanitized_key] = v
        else:
            validated[sanitized_key] = v
    
    set_sql = ", ".join(f"{quote_ident(col)} = :{col}" for col in validated)
    await db.execute(text(f"UPDATE {quoted_table} SET {set_sql} WHERE id = :id"), {**validated, "id": row_id})

    logger.info(
        "Updated row %s in table %s (dialect=%s)",
        row_id,
        table_obj.physical_name,
        _get_dialect_name(db),
    )
    return {"row_id": row_id}

# ---------------------------------------------------------------------------
#  Search functionality - NEW
# ---------------------------------------------------------------------------

async def search_rows(
    db: AsyncSession,
    table_obj: TableMeta,
    query: str,
    scope: str = "global",  # "global" or column name
    *,
    limit: Optional[int] = 100,
    offset: Optional[int] = 0,
) -> Dict[str, Any]:
    """
    Perform smart search across table columns.
    Ignores filters and searches through text-like fields.
    """
    if not query or not query.strip():
        # Return empty result for empty query
        return {"items": [], "total": 0}

    base_alias = "t"
    base_table_sql = quote_ident(sanitize_identifier(table_obj.physical_name))
    fragments = _SQLFragments(base_alias=base_alias)
    
    # Get all columns
    cols: List[ColumnMeta] = (
        await db.execute(select(ColumnMeta).where(ColumnMeta.table_id == table_obj.id))
    ).scalars().all()

    # Build column handlers (same as get_rows)
    for col in cols:
        if col.name.lower() == "id":
            continue
        handler = _HANDLERS[col.ui_type]
        await handler(db, table_obj, col, fragments, "name")

    # Build search conditions
    search_term = f"%{query.lower()}%"
    search_conditions = []
    
    if scope == "global":
        # Search across all text-searchable columns
        searchable_types = {
            "single_line_text", "long_text", "email", "url", 
            "phone", "formula", "autonumber"
        }
        for col in cols:
            if col.ui_type in searchable_types:
                col_ref = f"{base_alias}.{quote_ident(sanitize_identifier(col.name))}"
                search_conditions.append(f"LOWER({col_ref}::text) LIKE :search_term")
            elif col.ui_type == "single_select":
                # Search in select option names
                opt_alias = f"{sanitize_identifier(col.name)}_opt"
                if any(f"AS {opt_alias}" in join for join in fragments.join):
                    search_conditions.append(f"LOWER({opt_alias}.name) LIKE :search_term")
            elif col.ui_type in ("oo_relation", "om_relation"):
                # Search in related record names
                for join in fragments.join:
                    if col.name in join:
                        # Extract alias from join
                        import re
                        match = re.search(rf"AS ({sanitize_identifier(col.name)}_r_\w+)", join)
                        if match:
                            rel_alias = match.group(1)
                            search_conditions.append(f"LOWER({rel_alias}.name) LIKE :search_term")
                            break
    else:
        # Search in specific column
        target_col = next((c for c in cols if c.name == scope), None)
        if target_col:
            if target_col.ui_type in ("single_line_text", "long_text", "email", "url", "phone"):
                col_ref = f"{base_alias}.{quote_ident(sanitize_identifier(target_col.name))}"
                search_conditions.append(f"LOWER({col_ref}::text) LIKE :search_term")
            elif target_col.ui_type == "single_select":
                opt_alias = f"{sanitize_identifier(target_col.name)}_opt"
                if any(f"AS {opt_alias}" in join for join in fragments.join):
                    search_conditions.append(f"LOWER({opt_alias}.name) LIKE :search_term")
            elif target_col.ui_type in ("oo_relation", "om_relation"):
                for join in fragments.join:
                    if target_col.name in join:
                        import re
                        match = re.search(rf"AS ({sanitize_identifier(target_col.name)}_r_\w+)", join)
                        if match:
                            rel_alias = match.group(1)
                            search_conditions.append(f"LOWER({rel_alias}.name) LIKE :search_term")
                            break

    if search_conditions:
        fragments.where.append(f"({' OR '.join(search_conditions)})")
    else:
        # No searchable columns, return empty
        return {"items": [], "total": 0}

    # Build SQL
    sql = fragments.to_sql(base_table_sql, limit=limit, offset=offset)
    
    params: Dict[str, Any] = {"search_term": search_term}
    if limit is not None:
        params["limit"] = limit
    if offset is not None:
        params["offset"] = offset

    result = await db.execute(text(sql), params)
    rows = [dict(r) for r in result.mappings()]

    # Count total matches
    count_fragments = _SQLFragments(base_alias=base_alias)
    count_fragments.join = fragments.join  # reuse joins
    count_fragments.where = fragments.where  # reuse search conditions
    
    count_sql = f"SELECT COUNT(DISTINCT {base_alias}.id) AS cnt FROM {base_table_sql} AS {base_alias} "
    if count_fragments.join:
        count_sql += "\n".join(count_fragments.join) + "\n"
    if count_fragments.where:
        count_sql += "WHERE " + " AND ".join(count_fragments.where)
    
    count_result = await db.execute(text(count_sql), {"search_term": search_term})
    total_count = int(count_result.scalar_one() or 0)

    logger.info(
        "Search for '%s' in %s (scope=%s) returned %s rows (of %s)",
        query,
        table_obj.physical_name,
        scope,
        len(rows),
        total_count,
    )
    
    return {"items": rows, "total": total_count}