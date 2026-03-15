"""Column CRUD — add/drop/rename/reorder columns on dynamic tables.

Ported from SnapRow crud/column.py with Stept patterns.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from sqlalchemy import select, text, delete, or_, func, literal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects import postgresql as pg

from app.utils import gen_suffix
from app.models import ColumnMeta, TableMeta, RelationMeta, LookUpColumn, Filter
from app.schemas.datatable import OPERATIONS_BY_UI_TYPE, ColumnUpdate
from app.db.utils import sanitize_identifier, quote_ident

logger = logging.getLogger(__name__)

TYPE_MAP = {
    "single_line_text": "TEXT",
    "number": "INTEGER",
    "checkbox": "BOOLEAN",
    "date": "TIMESTAMP",
    "oo_relation": "INTEGER",
    "om_relation": "INTEGER",
    "mo_relation": "INTEGER",
    "single_select": "TEXT",
    "multi_select": "TEXT[]",  # FIX: use ARRAY instead of comma-separated TEXT
    "mm_relation": "-",
    "decimal": "DECIMAL",
    "long_text": "TEXT",
}


async def _calculate_column_order(
    db: AsyncSession,
    table_id: str,
    position: Optional[str] = None,
    reference_column_id: Optional[str] = None,
) -> int:
    stmt = select(ColumnMeta).where(ColumnMeta.table_id == table_id).order_by(ColumnMeta.sr__order)
    result = await db.execute(stmt)
    columns = list(result.scalars().all())

    if not columns:
        return 1000

    if not reference_column_id or not position:
        return columns[-1].sr__order + 1000

    ref_idx = None
    for idx, col in enumerate(columns):
        if col.id == reference_column_id:
            ref_idx = idx
            break

    if ref_idx is None:
        return columns[-1].sr__order + 1000

    if position == "left":
        insert_idx = ref_idx
    else:
        insert_idx = ref_idx + 1

    for idx, col in enumerate(columns):
        if idx >= insert_idx:
            col.sr__order = (idx + 2) * 1000
        else:
            col.sr__order = (idx + 1) * 1000

    return (insert_idx + 1) * 1000


def _prepare_stored_default(ui_type: str, default_value: Any) -> Any:
    if default_value is None:
        return None
    ui = (ui_type or "").lower()
    if ui in ("single_line_text", "text"):
        return str(default_value)
    if ui == "long_text":
        if isinstance(default_value, (dict, list)):
            return json.dumps(default_value)
        return str(default_value)
    if ui in ("decimal", "number"):
        return default_value
    if ui in ("boolean", "bool"):
        return bool(default_value)
    if ui == "single_select":
        if isinstance(default_value, dict):
            return default_value.get("id") or default_value.get("name") or ""
        return str(default_value)
    if ui == "multi_select":
        if isinstance(default_value, (list, tuple)):
            return list(default_value)
        return default_value
    return default_value


def _compile_sql_literal(db: AsyncSession, value: Any) -> str:
    dialect = getattr(db.bind, "dialect", None) or pg.dialect()
    return str(literal(value).compile(dialect=dialect, compile_kwargs={"literal_binds": True}))


async def add_column(
    db: AsyncSession,
    table_obj: TableMeta,
    name: str,
    ui_type: str,
    scale: int | None = None,
    position: Optional[str] = None,
    reference_column_id: Optional[str] = None,
    default_value: Optional[Any] = None,
    settings: Optional[dict] = None,
) -> ColumnMeta:
    validated_name = sanitize_identifier(name)
    sql_type = TYPE_MAP.get(ui_type)
    if sql_type is None:
        raise ValueError(f"Unsupported column type: {ui_type!r}")

    quoted_table = quote_ident(sanitize_identifier(table_obj.physical_name))
    quoted_column = quote_ident(validated_name)
    validated_physical = sanitize_identifier(validated_name).lower()
    meta_id = gen_suffix(16)

    if ui_type == "long_text":
        sql_type = "TEXT"
    elif ui_type == "decimal":
        if scale is None:
            raise ValueError("Scale must be provided for decimal type")
        max_precision = 38
        sql_type = f"DECIMAL({max_precision},{scale})"
        if settings is None:
            settings = {}
        settings["scale"] = scale
        settings["show_thousands_separator"] = settings.get("show_thousands_separator", False)

    order_value = await _calculate_column_order(db, table_obj.id, position, reference_column_id)

    if ui_type != "mm_relation":
        await db.execute(
            text(f"ALTER TABLE {quoted_table} ADD COLUMN {quoted_column} {sql_type}")
        )

    col_meta = ColumnMeta(
        id=meta_id,
        table_id=table_obj.id,
        display_name=validated_name,
        name=validated_physical,
        ui_type=ui_type,
        fk_type=sql_type,
        sr__order=order_value,
        default_value=default_value,
        settings=settings,
    )
    db.add(col_meta)
    await db.flush()
    await db.refresh(col_meta)

    if default_value is not None and ui_type != "mm_relation":
        stored_default = _prepare_stored_default(ui_type, default_value)
        if stored_default is not None:
            default_sql = _compile_sql_literal(db, stored_default)
            await db.execute(
                text(f"ALTER TABLE {quoted_table} ALTER COLUMN {quoted_column} SET DEFAULT {default_sql}")
            )
            await db.execute(
                text(f"UPDATE {quoted_table} SET {quoted_column} = :dv WHERE {quoted_column} IS NULL"),
                {"dv": stored_default},
            )

    logger.info("Added column %s (%s) to table %s", validated_name, sql_type, table_obj.physical_name)
    return col_meta


async def ensure_order_column(db: AsyncSession, table_obj: TableMeta) -> None:
    if table_obj.has_order_column:
        return

    quoted_table = quote_ident(sanitize_identifier(table_obj.physical_name))

    await db.execute(
        text(f"ALTER TABLE {quoted_table} ADD COLUMN IF NOT EXISTS sr__order INTEGER DEFAULT 1000")
    )
    await db.execute(
        text(f"""
            WITH numbered AS (
                SELECT id, ROW_NUMBER() OVER (ORDER BY id) * 1000 as rn
                FROM {quoted_table}
            )
            UPDATE {quoted_table}
            SET sr__order = numbered.rn
            FROM numbered
            WHERE {quoted_table}.id = numbered.id
        """)
    )

    table_obj.has_order_column = True
    await db.flush()


async def get_columns(
    db: AsyncSession,
    table_id: str,
    user_id: Optional[str] = None,
) -> List[ColumnMeta]:
    col_to_rel = (
        select(RelationMeta.id.label("relation_id"),
               RelationMeta.left_column_id.label("column_id"))
        .union_all(
            select(RelationMeta.id, RelationMeta.right_column_id)
        )
    ).subquery()

    stmt = (
        select(ColumnMeta, col_to_rel.c.relation_id)
        .outerjoin(col_to_rel, ColumnMeta.id == col_to_rel.c.column_id)
        .where(ColumnMeta.table_id == table_id)
        .order_by(ColumnMeta.sr__order, ColumnMeta.id)
    )

    result = await db.execute(stmt)
    columns: List[ColumnMeta] = []

    filters_by_column: Dict[str, list] = {}
    if user_id:
        filters_stmt = select(Filter).where(
            Filter.table_id == table_id,
            Filter.user_id == user_id,
            Filter.is_active == True,
        )
        filters = (await db.execute(filters_stmt)).scalars().all()
        for f in filters:
            if f.column_id not in filters_by_column:
                filters_by_column[f.column_id] = []
            filters_by_column[f.column_id].append({
                "id": f.id,
                "name": f.name,
                "operation": f.operation,
                "value": f.value,
            })

    for col, relation_id in result.all():
        setattr(col, "relation_id", relation_id)
        setattr(col, "allowed_operations", OPERATIONS_BY_UI_TYPE.get(col.ui_type, []))
        setattr(col, "active_filters", filters_by_column.get(col.id, []))
        columns.append(col)

    return columns


async def delete_column(db: AsyncSession, column_id: str) -> None:
    col: ColumnMeta | None = await db.get(ColumnMeta, column_id)
    if not col:
        raise ValueError(f"column {column_id!r} not found")
    tbl: TableMeta | None = await db.get(TableMeta, col.table_id)
    if not tbl:
        raise ValueError(f"table {col.table_id!r} not found")

    await db.execute(
        delete(RelationMeta).where(
            or_(RelationMeta.left_column_id == column_id,
                RelationMeta.right_column_id == column_id)
        )
    )
    await db.execute(
        delete(LookUpColumn).where(
            or_(LookUpColumn.column_id == column_id,
                LookUpColumn.relation_column_id == column_id,
                LookUpColumn.lookup_column_id == column_id)
        )
    )

    quoted_table = quote_ident(sanitize_identifier(tbl.physical_name))
    quoted_column = quote_ident(sanitize_identifier(col.name))
    await db.execute(text(f"ALTER TABLE {quoted_table} DROP COLUMN {quoted_column}"))
    await db.delete(col)
    await db.flush()
    logger.info("Dropped column %s from table %s", col.name, tbl.physical_name)


async def update_column(
    db: AsyncSession,
    column_id: str,
    updates: ColumnUpdate,
) -> ColumnMeta:
    col = await db.get(ColumnMeta, column_id)
    if not col:
        raise ValueError(f"Column {column_id} not found")
    tbl = await db.get(TableMeta, col.table_id)
    if not tbl:
        raise ValueError(f"Table {col.table_id} not found")

    if updates.name is not None:
        col.display_name = updates.name

    if updates.default_value is not None:
        col.default_value = updates.default_value
        quoted_table = quote_ident(sanitize_identifier(tbl.physical_name))
        quoted_col = quote_ident(sanitize_identifier(col.name))
        stored_default = _prepare_stored_default(col.ui_type, updates.default_value)
        if stored_default is not None:
            default_sql = _compile_sql_literal(db, stored_default)
            await db.execute(
                text(f"ALTER TABLE {quoted_table} ALTER COLUMN {quoted_col} SET DEFAULT {default_sql}")
            )
            await db.execute(
                text(f"UPDATE {quoted_table} SET {quoted_col} = :dv WHERE {quoted_col} IS NULL"),
                {"dv": stored_default},
            )

    if updates.settings is not None:
        if col.settings is None:
            col.settings = {}
        col.settings.update(updates.settings)

    await db.flush()
    await db.refresh(col)
    return col


async def reorder_column(db: AsyncSession, column_id: str, new_position: int) -> ColumnMeta:
    col = await db.get(ColumnMeta, column_id)
    if not col:
        raise ValueError(f"Column {column_id} not found")

    stmt = select(ColumnMeta).where(
        ColumnMeta.table_id == col.table_id
    ).order_by(ColumnMeta.sr__order)
    result = await db.execute(stmt)
    columns = list(result.scalars().all())

    current_idx = None
    for idx, c in enumerate(columns):
        if c.id == column_id:
            current_idx = idx
            break

    if current_idx is None:
        raise ValueError(f"Column {column_id} not found in table")

    moving_column = columns.pop(current_idx)
    new_position = max(0, min(new_position, len(columns)))
    columns.insert(new_position, moving_column)

    for idx, c in enumerate(columns):
        c.sr__order = (idx + 1) * 1000

    await db.flush()
    await db.refresh(col)
    return col
