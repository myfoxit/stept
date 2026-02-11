from __future__ import annotations

import logging
from typing import List, Optional, Any
import json

from sqlalchemy import select, text, delete, or_, func, literal  # ← add literal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects import postgresql as pg  # ← NEW

from app.utils import gen_suffix
from app.models import ColumnMeta, TableMeta, RelationMeta, LookUpColumn, Filter  # ← Added Filter
from app.schemas.filter import OPERATIONS_BY_UI_TYPE  # ← NEW import
from app.db.utils import sanitize_identifier, quote_ident
from app.schemas.column import ColumnUpdate

logger = logging.getLogger(__name__)

TYPE_MAP = {
    "single_line_text": "TEXT",
    "number": "INTEGER",
    "REAL": "REAL",
    "BOOLEAN": "BOOLEAN",
    "oo_relation": "INTEGER",
    "om_relation": "INTEGER",
    "mo_relation": "INTEGER",
    "single_select": "TEXT",
    "multi_select": "TEXT",  # NEW: stores comma-separated values
    "mm_relation": "-",
    "decimal": "DECIMAL",
    "long_text": "TEXT",
      
}

__all__ = [
    "add_column",
    "add_column_at_position",  # NEW
    "get_columns",
    "delete_column",
    "ensure_order_column",
    "update_column",
    "reorder_column",  # NEW
]

# ---------------------------------------------------------------------------
# Add column
# ---------------------------------------------------------------------------

async def _calculate_column_order(
    db: AsyncSession,
    table_id: str,
    position: Optional[str] = None,  # "left" or "right"
    reference_column_id: Optional[str] = None,
) -> int:
    """Calculate the order value for a new column and rebalance if needed."""
    
    # Get all existing columns ordered by sr__order
    stmt = select(ColumnMeta).where(ColumnMeta.table_id == table_id).order_by(ColumnMeta.sr__order)
    result = await db.execute(stmt)
    columns = list(result.scalars().all())
    
    if not columns:
        # First column in table
        return 1000
    
    if not reference_column_id or not position:
        # No reference column, add at the end
        return columns[-1].sr__order + 1000
    
    # Find reference column index
    ref_idx = None
    for idx, col in enumerate(columns):
        if col.id == reference_column_id:
            ref_idx = idx
            break
    
    if ref_idx is None:
        # Reference column not found, add at the end
        return columns[-1].sr__order + 1000
    
    # Determine insert position
    if position == "left":
        insert_idx = ref_idx
    else:  # position == "right"
        insert_idx = ref_idx + 1
    
    # Rebalance all columns with the new column inserted
    for idx, col in enumerate(columns):
        if idx >= insert_idx:
            # Shift columns after insertion point
            col.sr__order = (idx + 2) * 1000
        else:
            # Keep columns before insertion point, but rebalance
            col.sr__order = (idx + 1) * 1000
    
    # Return order for new column at insert position
    return (insert_idx + 1) * 1000

def _prepare_stored_default(ui_type: str, default_value: Any) -> Any:
    """
    Normalize a default value according to ui_type for storage in the physical column.
    Returns a plain Python value (str/number/bool) ready to be compiled as a SQL literal.
    """
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
            return ",".join(map(str, default_value))
        if isinstance(default_value, dict):
            return ",".join(map(str, default_value.get("values", [])))
        return str(default_value)
    # fallback
    return default_value

def _compile_sql_literal(db: AsyncSession, value: Any) -> str:
    """
    Compile a Python value into a SQL literal string using the current DB dialect.
    Safe to embed into DDL like ALTER TABLE ... SET DEFAULT <literal>.
    """
    # Fallback to Postgres dialect if no bind is present
    dialect = getattr(db.bind, "dialect", None) or pg.dialect()
    return str(literal(value).compile(dialect=dialect, compile_kwargs={"literal_binds": True}))

async def add_column(
    db: AsyncSession,
    table_obj: TableMeta,
    name: str,
    ui_type: str,
    scale: int | None = None,
    position: Optional[str] = None,  # NEW: "left" or "right"
    reference_column_id: Optional[str] = None,  # NEW
    default_value: Optional[Any] = None,  # CHANGED: use Any
    settings: Optional[dict] = None,  # NEW: Column settings
) -> ColumnMeta:

    validated_name = sanitize_identifier(name)

    sql_type = TYPE_MAP.get(ui_type)
    if sql_type is None:
        raise ValueError(f"Unsupported column type: {ui_type!r}")

    quoted_table = quote_ident(sanitize_identifier(table_obj.physical_name))
    quoted_column = quote_ident(validated_name)
    validated_physical = sanitize_identifier(validated_name).lower()
    meta_id = gen_suffix(16)

    # For long_text columns, use TEXT type in database
    if ui_type == "long_text":
        sql_type = "TEXT"
    elif ui_type == "decimal":
        if scale is None:
            raise ValueError("Scale must be provided for decimal type")
        max_precision = 38 
        sql_type = f"DECIMAL({max_precision},{scale})"
        
        # Store decimal settings
        if settings is None:
            settings = {}
        settings['scale'] = scale
        settings['show_thousands_separator'] = settings.get('show_thousands_separator', False)

    # Calculate order value
    order_value = await _calculate_column_order(db, table_obj.id, position, reference_column_id)

    # Always add the physical column first without DEFAULT; we set DEFAULT in a separate, parameterized step
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
        sr__order=order_value,  # Use calculated order
        default_value=default_value,  # NEW: Store default value
        settings=settings,  # NEW: Store settings
    )
    db.add(col_meta)
    await db.flush()          
    await db.refresh(col_meta)

    # If default value is set, set DB column DEFAULT safely and backfill existing NULLs
    if default_value is not None and ui_type != "mm_relation":
        stored_default = _prepare_stored_default(ui_type, default_value)
        if stored_default is not None:
            # DDL cannot be parameterized -> inline a compiled literal safely
            default_sql = _compile_sql_literal(db, stored_default)
            await db.execute(
                text(f"ALTER TABLE {quoted_table} ALTER COLUMN {quoted_column} SET DEFAULT {default_sql}")
            )
            # Backfill existing NULLs with the default (DML supports parameters)
            await db.execute(
                text(f"UPDATE {quoted_table} SET {quoted_column} = :dv WHERE {quoted_column} IS NULL"),
                {"dv": stored_default},
            )

    logger.info(
        "Added column %s (%s) to table %s at position %s with order %f and default value %s",
        validated_name,
        sql_type,
        table_obj.physical_name,
        position,
        order_value,
        default_value
    )
    return col_meta

# NEW: Helper to ensure order column exists
async def ensure_order_column(db: AsyncSession, table_obj: TableMeta) -> None:
    """Ensure the sr__order column exists on the table."""
    if table_obj.has_order_column:
        return
        
    quoted_table = quote_ident(sanitize_identifier(table_obj.physical_name))
    
    # Add the physical column with INTEGER type for simple ordering
    await db.execute(
        text(f"ALTER TABLE {quoted_table} ADD COLUMN IF NOT EXISTS sr__order INTEGER DEFAULT 1000")
    )
    
    # Initialize existing rows with sequential order values
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
    
    # Mark table as having order column
    table_obj.has_order_column = True
    await db.flush()

# ---------------------------------------------------------------------------
# List columns
# ---------------------------------------------------------------------------

async def get_columns(
    db: AsyncSession,
    table_id: str,
    user_id: Optional[str] = None,
) -> List[ColumnMeta]:

    col_to_rel = (
        select(RelationMeta.id.label("relation_id"),
               RelationMeta.left_column_id.label("column_id"))
        .union_all(
            select(RelationMeta.id,
                   RelationMeta.right_column_id)
        )
    ).subquery()

    stmt = (
        select(ColumnMeta, col_to_rel.c.relation_id)
        .outerjoin(col_to_rel, ColumnMeta.id == col_to_rel.c.column_id)
        .where(ColumnMeta.table_id == table_id)
        # Order by sr__order instead of id
        .order_by(ColumnMeta.sr__order, ColumnMeta.id)  # CHANGED
    )

    result = await db.execute(stmt)
    columns: List[ColumnMeta] = []
    
    # ← NEW: Get filters for this table if user_id provided
    filters_by_column = {}
    if user_id:
        filters_stmt = select(Filter).where(
            Filter.table_id == table_id,
            Filter.user_id == user_id,
            Filter.is_active == True
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
    
    for col, relation_id in result.all():  # Removed index_col from unpacking
        setattr(col, "relation_id", relation_id)
        # ← NEW: Add allowed operations and active filters
        setattr(col, "allowed_operations", OPERATIONS_BY_UI_TYPE.get(col.ui_type, []))
        setattr(col, "active_filters", filters_by_column.get(col.id, []))
        columns.append(col)

    return columns


async def delete_column(
    db: AsyncSession,
    column_id: str,
) -> None:
    col: ColumnMeta | None = await db.get(ColumnMeta, column_id)
    if not col:
        raise ValueError(f"column {column_id!r} not found")
    tbl: TableMeta | None = await db.get(TableMeta, col.table_id)
    if not tbl:
        raise ValueError(f"table {col.table_id!r} not found")

    # Remove relation / lookup metadata referencing this column (prevents FK issues on DBs without cascades)
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
    await db.execute(
        text(f"ALTER TABLE {quoted_table} DROP COLUMN {quoted_column}")
    )
    await db.delete(col)
    await db.flush()
    logging.getLogger(__name__).info(
        "Dropped column %s from table %s", col.name, tbl.physical_name
    )

# ---------------------------------------------------------------------------
# Update column
# ---------------------------------------------------------------------------

async def update_column(
    db: AsyncSession,
    column_id: str,
    updates: ColumnUpdate,
) -> ColumnMeta:
    """Update column properties."""
    col = await db.get(ColumnMeta, column_id)
    if not col:
        raise ValueError(f"Column {column_id} not found")
    tbl = await db.get(TableMeta, col.table_id)
    if not tbl:
        raise ValueError(f"Table {col.table_id} not found")

    # Update display_name if name is provided
    if updates.name is not None:
        col.display_name = updates.name

    # Update default value if provided (apply to DB default and backfill)
    if hasattr(updates, 'default_value') and updates.default_value is not None:
        col.default_value = updates.default_value

        quoted_table = quote_ident(sanitize_identifier(tbl.physical_name))
        quoted_column = quote_ident(sanitize_identifier(col.name))

        stored_default = _prepare_stored_default(col.ui_type, updates.default_value)
        if stored_default is not None:
            default_sql = _compile_sql_literal(db, stored_default)
            # Set DB-level DEFAULT (DDL must inline the literal)
            await db.execute(
                text(f"ALTER TABLE {quoted_table} ALTER COLUMN {quoted_column} SET DEFAULT {default_sql}")
            )
            # Backfill existing NULLs so current data reflects the new default
            await db.execute(
                text(f"UPDATE {quoted_table} SET {quoted_column} = :dv WHERE {quoted_column} IS NULL"),
                {"dv": stored_default},
            )

    # Update settings if provided
    if hasattr(updates, 'settings') and updates.settings is not None:
        if col.settings is None:
            col.settings = {}
        col.settings.update(updates.settings)

    await db.commit()
    await db.refresh(col)
    return col


async def reorder_column(
    db: AsyncSession,
    column_id: str,
    new_position: int,
) -> ColumnMeta:
    """Move a column to a new position (0-based index)."""
    
    col = await db.get(ColumnMeta, column_id)
    if not col:
        raise ValueError(f"Column {column_id} not found")
    
    # Get all columns for the table
    stmt = select(ColumnMeta).where(
        ColumnMeta.table_id == col.table_id
    ).order_by(ColumnMeta.sr__order)
    result = await db.execute(stmt)
    columns = list(result.scalars().all())
    
    # Find current position
    current_idx = None
    for idx, c in enumerate(columns):
        if c.id == column_id:
            current_idx = idx
            break
    
    if current_idx is None:
        raise ValueError(f"Column {column_id} not found in table")
    
    # Remove from current position
    moving_column = columns.pop(current_idx)
    
    # Insert at new position
    new_position = max(0, min(new_position, len(columns)))
    columns.insert(new_position, moving_column)
    
    # Rebalance all columns with clean integer values
    for idx, c in enumerate(columns):
        c.sr__order = (idx + 1) * 1000
    
    await db.flush()
    await db.refresh(col)
    return col

