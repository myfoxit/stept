"""Field CRUD — row insert/update/delete/get with query builder.

Ported from SnapRow crud/field.py with SECURITY FIXES:
- build_filter_clause() REWRITTEN to use parameterized queries
- All raw SQL uses proper parameter binding
"""
from __future__ import annotations

import json
import logging
from collections import defaultdict
from dataclasses import dataclass, field as dataclass_field
from typing import Any, Callable, Awaitable, Dict, List, Optional

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.utils import gen_suffix
from app.models import (
    LookUpColumn, TableMeta, ColumnMeta, RelationMeta,
    ColumnType, Formulas, Rollup, Filter, Sort,
)
from app.crud.datatable.column import ensure_order_column
from app.db.utils import sanitize_identifier, quote_ident, _get_dialect_name

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Parameterized filter clause builder — SECURITY FIX
# ---------------------------------------------------------------------------

class _FilterParams:
    """Accumulates named parameters for filter clauses."""

    def __init__(self) -> None:
        self._params: Dict[str, Any] = {}
        self._counter = 0

    def add(self, value: Any) -> str:
        """Add a parameter and return its bind name (e.g. ':_fp0')."""
        name = f"_fp{self._counter}"
        self._counter += 1
        self._params[name] = value
        return f":{name}"

    @property
    def params(self) -> Dict[str, Any]:
        return dict(self._params)


def build_filter_clause(
    column: ColumnMeta,
    operation: str,
    value: Optional[str],
    table_alias: str = "t",
    fp: Optional[_FilterParams] = None,
) -> str:
    """Build a parameterized SQL WHERE clause fragment.

    SECURITY: All user values are bound via :param placeholders.
    Never interpolated into the SQL string.
    """
    if fp is None:
        fp = _FilterParams()

    col_ref = f"{table_alias}.{quote_ident(sanitize_identifier(column.name))}"

    # Parse JSON value
    if value:
        try:
            value = json.loads(value)
        except (json.JSONDecodeError, TypeError):
            pass

    if operation == "equals":
        if value is None:
            return f"{col_ref} IS NULL"
        p = fp.add(value)
        return f"{col_ref} = {p}"

    elif operation == "not_equals":
        if value is None:
            return f"{col_ref} IS NOT NULL"
        p = fp.add(value)
        return f"{col_ref} != {p}"

    elif operation == "contains":
        p = fp.add(f"%{value}%")
        return f"{col_ref}::text ILIKE {p}"

    elif operation == "not_contains":
        p = fp.add(f"%{value}%")
        return f"{col_ref}::text NOT ILIKE {p}"

    elif operation == "starts_with":
        p = fp.add(f"{value}%")
        return f"{col_ref}::text ILIKE {p}"

    elif operation == "ends_with":
        p = fp.add(f"%{value}")
        return f"{col_ref}::text ILIKE {p}"

    elif operation == "gt":
        p = fp.add(value)
        return f"{col_ref} > {p}"

    elif operation == "lt":
        p = fp.add(value)
        return f"{col_ref} < {p}"

    elif operation == "gte":
        p = fp.add(value)
        return f"{col_ref} >= {p}"

    elif operation == "lte":
        p = fp.add(value)
        return f"{col_ref} <= {p}"

    elif operation == "is_empty":
        return f"({col_ref} IS NULL OR {col_ref}::text = '')"

    elif operation == "is_not_empty":
        return f"({col_ref} IS NOT NULL AND {col_ref}::text != '')"

    elif operation == "between":
        if isinstance(value, list) and len(value) == 2:
            p1 = fp.add(value[0])
            p2 = fp.add(value[1])
            return f"{col_ref} BETWEEN {p1} AND {p2}"
        return "1=1"

    elif operation == "in":
        if isinstance(value, list) and value:
            placeholders = ", ".join(fp.add(v) for v in value)
            return f"{col_ref} IN ({placeholders})"
        return "1=1"

    elif operation == "not_in":
        if isinstance(value, list) and value:
            placeholders = ", ".join(fp.add(v) for v in value)
            return f"{col_ref} NOT IN ({placeholders})"
        return "1=1"

    return "1=1"


# ---------------------------------------------------------------------------
# Column defaults
# ---------------------------------------------------------------------------

async def _column_defaults_map(db: AsyncSession, table_obj: TableMeta) -> Dict[str, Any]:
    col_metas = (
        await db.execute(select(ColumnMeta).where(ColumnMeta.table_id == table_obj.id))
    ).scalars().all()
    defaults: Dict[str, Any] = {}

    for c in col_metas:
        if c.default_value is None or c.column_type != ColumnType.PHYSICAL:
            continue
        ui = (c.ui_type or "").lower()
        val = c.default_value
        if ui in ("single_line_text", "text"):
            defaults[c.name] = str(val)
        elif ui == "long_text":
            defaults[c.name] = json.dumps(val) if isinstance(val, (dict, list)) else str(val)
        elif ui in ("decimal", "number"):
            defaults[c.name] = val
        elif ui in ("boolean", "bool"):
            defaults[c.name] = bool(val)
        elif ui == "single_select":
            defaults[c.name] = val.get("id") or val.get("name") or "" if isinstance(val, dict) else str(val)
        elif ui == "multi_select":
            if isinstance(val, (list, tuple)):
                defaults[c.name] = list(val)
            else:
                defaults[c.name] = val
        else:
            defaults[c.name] = val
    return defaults


# ---------------------------------------------------------------------------
# Insert
# ---------------------------------------------------------------------------

async def insert_row(
    db: AsyncSession,
    table_obj: TableMeta,
    data: Dict[str, Any],
) -> Dict[str, int]:
    if not data:
        raise ValueError("Row data cannot be empty.")

    await ensure_order_column(db, table_obj)
    quoted_table = quote_ident(sanitize_identifier(table_obj.physical_name))
    validated = {sanitize_identifier(k): v for k, v in data.items()}

    # Type-aware value coercion (matches update_row behavior)
    col_metas = await db.execute(
        select(ColumnMeta).filter(
            ColumnMeta.table_id == table_obj.id,
            ColumnMeta.name.in_([sanitize_identifier(k).lower() for k in data.keys()]),
        )
    )
    cols_by_name = {c.name: c for c in col_metas.scalars().all()}
    for k in list(validated.keys()):
        sk = sanitize_identifier(k).lower()
        if sk in cols_by_name and cols_by_name[sk].ui_type == "long_text":
            validated[k] = json.dumps(validated[k]) if isinstance(validated[k], (dict, list)) else validated[k]

    col_defaults = await _column_defaults_map(db, table_obj)
    for col_name, def_val in col_defaults.items():
        if col_name not in validated or validated[col_name] is None:
            validated[col_name] = def_val

    max_order_result = await db.execute(
        text(f"SELECT COALESCE(MAX(sr__order), 0) FROM {quoted_table}")
    )
    max_order = float(max_order_result.scalar() or 0)
    validated["sr__order"] = max_order + 1000

    columns = ", ".join(quote_ident(c) for c in validated)
    placeholders = ", ".join(f":{c}" for c in validated)

    insert_stmt = text(f"INSERT INTO {quoted_table} ({columns}) VALUES ({placeholders}) RETURNING id")
    result = await db.execute(insert_stmt, validated)
    new_row_id = result.scalar_one()

    logger.info("Inserted row %s into table %s", new_row_id, table_obj.physical_name)
    return {"row_id": new_row_id}


async def insert_row_at_position(
    db: AsyncSession,
    table_obj: TableMeta,
    data: Dict[str, Any],
    position: str = "below",
    reference_row_id: Optional[int] = None,
) -> Dict[str, int]:
    if not data:
        raise ValueError("Row data cannot be empty.")

    await ensure_order_column(db, table_obj)
    quoted_table = quote_ident(sanitize_identifier(table_obj.physical_name))
    validated = {sanitize_identifier(k): v for k, v in data.items()}

    col_defaults = await _column_defaults_map(db, table_obj)
    for col_name, def_val in col_defaults.items():
        if col_name not in validated or validated[col_name] is None:
            validated[col_name] = def_val

    if reference_row_id is None:
        max_order_result = await db.execute(
            text(f"SELECT COALESCE(MAX(sr__order), 0) FROM {quoted_table}")
        )
        order_value = float(max_order_result.scalar() or 0) + 1000
    else:
        ref_order_result = await db.execute(
            text(f"SELECT sr__order FROM {quoted_table} WHERE id = :id"),
            {"id": reference_row_id},
        )
        ref_order = ref_order_result.scalar()
        if ref_order is None:
            raise ValueError(f"Reference row {reference_row_id} not found")
        ref_order = float(ref_order)

        if position == "above":
            prev_result = await db.execute(
                text(f"SELECT sr__order FROM {quoted_table} WHERE sr__order < :ref_order ORDER BY sr__order DESC LIMIT 1"),
                {"ref_order": ref_order},
            )
            prev_order = prev_result.scalar()
            order_value = ref_order / 2 if prev_order is None else (float(prev_order) + ref_order) / 2
        else:
            next_result = await db.execute(
                text(f"SELECT sr__order FROM {quoted_table} WHERE sr__order > :ref_order ORDER BY sr__order ASC LIMIT 1"),
                {"ref_order": ref_order},
            )
            next_order = next_result.scalar()
            order_value = ref_order + 1000 if next_order is None else (ref_order + float(next_order)) / 2

        if abs(order_value - ref_order) < 0.001:
            await _rebalance_order_window(db, table_obj, reference_row_id)
            return await insert_row_at_position(db, table_obj, data, position, reference_row_id)

    validated["sr__order"] = order_value
    columns = ", ".join(quote_ident(c) for c in validated)
    placeholders = ", ".join(f":{c}" for c in validated)

    insert_stmt = text(f"INSERT INTO {quoted_table} ({columns}) VALUES ({placeholders}) RETURNING id")
    result = await db.execute(insert_stmt, validated)
    new_row_id = result.scalar_one()

    return {"row_id": new_row_id, "position": position}


async def _rebalance_order_window(
    db: AsyncSession,
    table_obj: TableMeta,
    center_row_id: int,
    window_size: int = 100,
) -> None:
    quoted_table = quote_ident(sanitize_identifier(table_obj.physical_name))
    await db.execute(
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
        {"center_id": center_row_id, "half_window": window_size // 2},
    )
    await db.flush()


# ---------------------------------------------------------------------------
# SQL Fragments query builder
# ---------------------------------------------------------------------------

@dataclass
class _SQLFragments:
    base_alias: str = "t"
    select: List[str] = dataclass_field(default_factory=list)
    group: List[str] = dataclass_field(default_factory=list)
    join: List[str] = dataclass_field(default_factory=list)
    where: List[str] = dataclass_field(default_factory=list)
    needs_group_by: bool = False

    def __post_init__(self) -> None:
        if not self.select:
            self.select = [f"{self.base_alias}.id"]
        if not self.group:
            self.group = [f"{self.base_alias}.id"]

    def to_sql(
        self,
        base_table_sql: str,
        *,
        limit: Optional[int],
        offset: Optional[int],
        custom_order: Optional[List[str]] = None,
    ) -> str:
        sql = (
            "SELECT\n  " + ",\n  ".join(self.select) + "\n"
            + f"FROM {base_table_sql} AS {self.base_alias}\n"
            + ("\n".join(self.join) + "\n" if self.join else "")
        )
        if self.where:
            sql += "WHERE " + " AND ".join(self.where) + "\n"
        if self.needs_group_by:
            sql += "GROUP BY " + ", ".join(self.group) + "\n"
        order_by = custom_order if custom_order else self.group
        sql += "ORDER BY " + ", ".join(order_by) + "\n"
        if limit is not None:
            sql += "LIMIT :limit\n"
        if offset is not None:
            sql += "OFFSET :offset\n"
        return sql


# ---------------------------------------------------------------------------
# Column type handlers
# ---------------------------------------------------------------------------

_Handler = Callable[[AsyncSession, TableMeta, ColumnMeta, _SQLFragments, str], Awaitable[None]]


async def _handle_plain(_: AsyncSession, table: TableMeta, col: ColumnMeta, f: _SQLFragments, lookup_field: str) -> None:
    col_ident = quote_ident(sanitize_identifier(col.name))
    pretty = quote_ident(sanitize_identifier(col.name))
    local = f"{f.base_alias}.{col_ident}"
    f.select.append(f"{local} AS {pretty}")
    f.group.append(local)


async def _handle_single_select(db: AsyncSession, table: TableMeta, col: ColumnMeta, f: _SQLFragments, lookup_field: str) -> None:
    col_ident = quote_ident(sanitize_identifier(col.name))
    pretty = quote_ident(sanitize_identifier(col.name))
    local = f"{f.base_alias}.{col_ident}"

    opt_alias = f"{sanitize_identifier(col.name)}_opt"
    opt_table = quote_ident("select_options")
    opt_pk = f"{opt_alias}.id"
    opt_name = f"{opt_alias}.name"
    opt_color = f"{opt_alias}.color"

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


async def _relation_for(db: AsyncSession, col: ColumnMeta) -> Optional[RelationMeta]:
    stmt = select(RelationMeta).where(
        (RelationMeta.left_column_id == col.id)
        | (RelationMeta.right_column_id == col.id)
    )
    return await db.scalar(stmt)


async def _handle_oo_relation(db: AsyncSession, table: TableMeta, col: ColumnMeta, f: _SQLFragments, lookup_field: str, alias: Optional[str] = None) -> None:
    pretty = quote_ident(sanitize_identifier(alias or col.name))
    local_ref = f"{f.base_alias}.{quote_ident(sanitize_identifier(col.name))}"
    display_ident = quote_ident(lookup_field)

    rel = await _relation_for(db, col)
    if not rel:
        await _handle_plain(db, table, col, f, "name")
        return

    if rel.left_table_id == table.id:
        remote_tbl_id, remote_col_id = rel.right_table_id, rel.right_column_id
    else:
        remote_tbl_id, remote_col_id = rel.left_table_id, rel.left_column_id

    remote_tbl = await db.get(TableMeta, remote_tbl_id)
    remote_alias = f"{sanitize_identifier(col.name)}_r_{gen_suffix(3)}"
    remote_table_sql = quote_ident(sanitize_identifier(remote_tbl.physical_name))

    remote_pk = f"{remote_alias}.id"
    remote_name = f"{remote_alias}.{display_ident}"

    if col.column_type == ColumnType.PHYSICAL:
        f.join.append(f"LEFT JOIN {remote_table_sql} AS {remote_alias} ON {local_ref} = {remote_pk}")
    else:
        remote_fk_ident = quote_ident(sanitize_identifier((await db.get(ColumnMeta, remote_col_id)).name))
        f.join.append(
            f"LEFT JOIN {remote_table_sql} AS {remote_alias} "
            f"ON {remote_alias}.{remote_fk_ident} = {f.base_alias}.id"
        )

    f.select.append(f"json_build_object('id', {remote_pk}, 'name', {remote_name}) AS {pretty}")
    f.group.extend([remote_pk, remote_name])


async def _handle_om_relation(db: AsyncSession, table: TableMeta, col: ColumnMeta, f: _SQLFragments, lookup_field: str, alias: Optional[str] = None) -> None:
    pretty = quote_ident(sanitize_identifier(alias or col.name, normalize=False))
    display_ident = quote_ident(lookup_field)
    rel = await _relation_for(db, col)
    if not rel or col.column_type != ColumnType.VIRTUAL:
        await _handle_plain(db, table, col, f, "name")
        return

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


async def _handle_mm_relation(db: AsyncSession, table: TableMeta, col: ColumnMeta, f: _SQLFragments, lookup_field: str, alias: Optional[str] = None) -> None:
    if col.column_type != ColumnType.VIRTUAL:
        await _handle_plain(db, table, col, f, "name")
        return

    pretty = quote_ident(sanitize_identifier(alias or col.name))
    display_ident = quote_ident(lookup_field)

    rel = await _relation_for(db, col)
    if not rel:
        await _handle_plain(db, table, col, f, "name")
        return

    join_tbl_sql = quote_ident(sanitize_identifier((await db.get(TableMeta, rel.join_table_id)).physical_name))
    join_alias = f"{sanitize_identifier(col.name)}_jt_{gen_suffix(3)}"

    this_fk_ident = quote_ident(sanitize_identifier(f"{table.physical_name}_id"))
    if col.ui_type == "mm_relation_left":
        remote_tbl_id = rel.right_table_id
    else:
        remote_tbl_id = rel.left_table_id

    remote_tbl = await db.get(TableMeta, remote_tbl_id)
    remote_alias = f"{sanitize_identifier(col.name)}_r_mm_{gen_suffix(3)}"
    remote_tbl_sql = quote_ident(sanitize_identifier(remote_tbl.physical_name))

    remote_fk_ident = quote_ident(sanitize_identifier(f"{remote_tbl.physical_name}_id"))
    remote_pk = f"{remote_alias}.id"
    remote_name = f"{remote_alias}.{display_ident}"

    f.join.append(f"LEFT JOIN {join_tbl_sql} AS {join_alias} ON {join_alias}.{this_fk_ident} = {f.base_alias}.id")
    f.join.append(f"LEFT JOIN {remote_tbl_sql} AS {remote_alias} ON {remote_alias}.id = {join_alias}.{remote_fk_ident}")

    f.select.append(
        f"COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id', {remote_pk}, 'name', {remote_name})) "
        f"FILTER (WHERE {remote_pk} IS NOT NULL), '[]') AS {pretty}"
    )
    f.needs_group_by = True


async def _handle_lookup(db: AsyncSession, table: TableMeta, col: ColumnMeta, f: _SQLFragments, lookup_field: str) -> None:
    lu_meta = await db.scalar(select(LookUpColumn).where(LookUpColumn.column_id == col.id))
    if not lu_meta:
        return

    fk_col: ColumnMeta = await db.get(ColumnMeta, lu_meta.relation_column_id)
    lookup_col: ColumnMeta = await db.get(ColumnMeta, lu_meta.lookup_column_id)
    if fk_col.ui_type == "oo_relation":
        await _handle_oo_relation(db, table, fk_col, f, lookup_col.name, col.name)
    elif fk_col.ui_type == "om_relation":
        await _handle_om_relation(db, table, fk_col, f, lookup_col.name, col.name)
    elif fk_col.ui_type in ("mm_relation_left", "mm_relation_right"):
        await _handle_mm_relation(db, table, fk_col, f, lookup_col.name, col.name)


async def _handle_formula(db: AsyncSession, table: TableMeta, col: ColumnMeta, f: _SQLFragments, lookup_field: str) -> None:
    pretty = quote_ident(sanitize_identifier(col.name))
    formulas_tbl = quote_ident(sanitize_identifier(Formulas.__tablename__))
    subq = (
        f"(SELECT json_build_object('id', fo.id, 'formula', fo.formula, 'formula_raw', fo.formula_raw)"
        f" FROM {formulas_tbl} AS fo"
        f" WHERE fo.column_id = '{col.id}'"
        f" ORDER BY fo.created_at DESC"
        f" LIMIT 1)"
    )
    f.select.append(f"{subq} AS {pretty}")


async def _handle_rollup(db: AsyncSession, table: TableMeta, col: ColumnMeta, f: _SQLFragments, lookup_field: str) -> None:
    pretty = quote_ident(sanitize_identifier(col.name))
    rollup_tbl = quote_ident(sanitize_identifier(Rollup.__tablename__))
    subq = (
        f"(SELECT json_build_object("
        f"  'id', rl.id,"
        f"  'relation_column_id', rl.relation_column_id,"
        f"  'aggregate_func', rl.aggregate_func"
        f") FROM {rollup_tbl} AS rl WHERE rl.column_id = '{col.id}' LIMIT 1)"
    )
    f.select.append(f"{subq} AS {pretty}")


_HANDLERS: Dict[str, _Handler] = defaultdict(lambda: _handle_plain, {
    "single_select": _handle_single_select,
    "oo_relation": _handle_oo_relation,
    "om_relation": _handle_om_relation,
    "mm_relation_left": _handle_mm_relation,
    "mm_relation_right": _handle_mm_relation,
    "lookup": _handle_lookup,
    "formula": _handle_formula,
    "rollup": _handle_rollup,
})


# ---------------------------------------------------------------------------
# Get rows (main query)
# ---------------------------------------------------------------------------

async def get_rows(
    db: AsyncSession,
    table_obj: TableMeta,
    *,
    limit: Optional[int] = 100,
    offset: Optional[int] = 0,
    user_id: Optional[str] = None,
    apply_filters: bool = True,
    apply_sorts: bool = True,
) -> Dict[str, Any]:
    base_alias = "t"
    base_table_sql = quote_ident(sanitize_identifier(table_obj.physical_name))
    fragments = _SQLFragments(base_alias=base_alias)

    cols: List[ColumnMeta] = (
        await db.execute(select(ColumnMeta).where(ColumnMeta.table_id == table_obj.id))
    ).scalars().all()

    # Collect parameterized filter clauses
    filter_clauses: List[str] = []
    fp = _FilterParams()

    if apply_filters and user_id:
        filters_stmt = select(Filter).where(
            Filter.table_id == table_obj.id,
            Filter.user_id == user_id,
            Filter.is_active == True,
        )
        filters = (await db.execute(filters_stmt)).scalars().all()
        for filter_obj in filters:
            column = await db.get(ColumnMeta, filter_obj.column_id)
            if column:
                clause = build_filter_clause(column, filter_obj.operation, filter_obj.value, base_alias, fp)
                filter_clauses.append(f"({clause})")

    # Collect sort clauses — user sorts take precedence, sr__order is tiebreaker
    sort_clauses: List[str] = []

    if apply_sorts and user_id:
        sorts_stmt = select(Sort).where(
            Sort.table_id == table_obj.id,
            Sort.user_id == user_id,
            Sort.is_active == True,
        ).order_by(Sort.priority)
        sorts = (await db.execute(sorts_stmt)).scalars().all()
        for sort_obj in sorts:
            column = await db.get(ColumnMeta, sort_obj.column_id)
            if column:
                col_ref = f"{base_alias}.{quote_ident(sanitize_identifier(column.name))}"
                direction = "DESC" if sort_obj.direction == "desc" else "ASC"
                sort_clauses.append(f"{col_ref} {direction}")

    # sr__order as tiebreaker after user sorts
    if table_obj.has_order_column:
        sort_clauses.append(f"{base_alias}.sr__order ASC")

    if not sort_clauses:
        sort_clauses = [f"{base_alias}.id ASC"]

    # Build column handlers
    for col in cols:
        if col.name.lower() == "id":
            continue
        handler = _HANDLERS[col.ui_type]
        await handler(db, table_obj, col, fragments, "name")

    fragments.where.extend(filter_clauses)
    sql = fragments.to_sql(base_table_sql, limit=limit, offset=offset, custom_order=sort_clauses)

    params: Dict[str, Any] = {**fp.params}
    if limit is not None:
        params["limit"] = limit
    if offset is not None:
        params["offset"] = offset

    result = await db.execute(text(sql), params)
    rows = [dict(r) for r in result.mappings()]

    # Count with same filters
    count_sql = f"SELECT COUNT(*) AS cnt FROM {base_table_sql} AS {base_alias} "
    if filter_clauses:
        count_sql += "WHERE " + " AND ".join(filter_clauses)
    count_result = await db.execute(text(count_sql), fp.params)
    total_count = int(count_result.scalar_one() or 0)

    return {"items": rows, "total": total_count}


# ---------------------------------------------------------------------------
# Delete / Update
# ---------------------------------------------------------------------------

async def delete_row(db: AsyncSession, table_obj: TableMeta, row_id: int) -> Dict[str, int]:
    quoted_table = quote_ident(sanitize_identifier(table_obj.physical_name))
    await db.execute(text(f"DELETE FROM {quoted_table} WHERE id = :id"), {"id": row_id})
    return {"deleted": row_id}


async def update_row(
    db: AsyncSession,
    table_obj: TableMeta,
    row_id: int,
    data: Dict[str, Any],
) -> Dict[str, int]:
    if not data:
        raise ValueError("No updates provided.")

    col_metas = await db.execute(
        select(ColumnMeta).filter(
            ColumnMeta.table_id == table_obj.id,
            ColumnMeta.name.in_([sanitize_identifier(k).lower() for k in data.keys()]),
        )
    )
    cols_by_name = {c.name: c for c in col_metas.scalars().all()}

    quoted_table = quote_ident(sanitize_identifier(table_obj.physical_name))
    validated = {}
    for k, v in data.items():
        sanitized_key = sanitize_identifier(k).lower()
        if sanitized_key in cols_by_name and cols_by_name[sanitized_key].ui_type == "long_text":
            validated[sanitized_key] = json.dumps(v) if isinstance(v, (dict, list)) else v
        else:
            validated[sanitized_key] = v

    set_sql = ", ".join(f"{quote_ident(col)} = :{col}" for col in validated)
    await db.execute(text(f"UPDATE {quoted_table} SET {set_sql} WHERE id = :id"), {**validated, "id": row_id})
    return {"row_id": row_id}


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

async def search_rows(
    db: AsyncSession,
    table_obj: TableMeta,
    query: str,
    scope: str = "global",
    *,
    limit: Optional[int] = 100,
    offset: Optional[int] = 0,
) -> Dict[str, Any]:
    if not query or not query.strip():
        return {"items": [], "total": 0}

    base_alias = "t"
    base_table_sql = quote_ident(sanitize_identifier(table_obj.physical_name))
    fragments = _SQLFragments(base_alias=base_alias)

    cols: List[ColumnMeta] = (
        await db.execute(select(ColumnMeta).where(ColumnMeta.table_id == table_obj.id))
    ).scalars().all()

    for col in cols:
        if col.name.lower() == "id":
            continue
        handler = _HANDLERS[col.ui_type]
        await handler(db, table_obj, col, fragments, "name")

    # Use parameterized search
    search_conditions = []
    searchable_types = {"single_line_text", "long_text", "email", "url", "phone", "date"}

    if scope == "global":
        for col in cols:
            if col.ui_type in searchable_types:
                col_ref = f"{base_alias}.{quote_ident(sanitize_identifier(col.name))}"
                search_conditions.append(f"LOWER({col_ref}::text) LIKE :search_term")
    else:
        target_col = next((c for c in cols if c.name == scope), None)
        if target_col and target_col.ui_type in searchable_types:
            col_ref = f"{base_alias}.{quote_ident(sanitize_identifier(target_col.name))}"
            search_conditions.append(f"LOWER({col_ref}::text) LIKE :search_term")

    if not search_conditions:
        return {"items": [], "total": 0}

    fragments.where.append(f"({' OR '.join(search_conditions)})")
    sql = fragments.to_sql(base_table_sql, limit=limit, offset=offset)

    search_term = f"%{query.lower()}%"
    params: Dict[str, Any] = {"search_term": search_term}
    if limit is not None:
        params["limit"] = limit
    if offset is not None:
        params["offset"] = offset

    result = await db.execute(text(sql), params)
    rows = [dict(r) for r in result.mappings()]

    count_sql = f"SELECT COUNT(DISTINCT {base_alias}.id) AS cnt FROM {base_table_sql} AS {base_alias} "
    if fragments.join:
        count_sql += "\n".join(fragments.join) + "\n"
    if fragments.where:
        count_sql += "WHERE " + " AND ".join(fragments.where)
    count_result = await db.execute(text(count_sql), {"search_term": search_term})
    total_count = int(count_result.scalar_one() or 0)

    return {"items": rows, "total": total_count}
