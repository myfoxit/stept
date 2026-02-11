import json
from typing import List, Optional, Dict, Any
from sqlalchemy import select, and_, or_, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Filter, ColumnMeta, TableMeta, User
from app.schemas.filter import OPERATIONS_BY_UI_TYPE
from app.db.utils import sanitize_identifier, quote_ident

async def create_filter(
    db: AsyncSession,
    user_id: str,
    name: str,
    table_id: str,
    column_id: str,
    operation: str,
    value: Optional[Any] = None,
    is_reusable: bool = False,
) -> Filter:
    # Validate column exists and get ui_type
    column = await db.get(ColumnMeta, column_id)
    if not column:
        raise ValueError(f"Column {column_id} not found")
    
    # Validate operation is allowed for this ui_type
    allowed_ops = OPERATIONS_BY_UI_TYPE.get(column.ui_type, [])
    if operation not in allowed_ops:
        raise ValueError(f"Operation '{operation}' not allowed for ui_type '{column.ui_type}'")
    
    # Serialize value to JSON string if complex
    value_str = json.dumps(value) if value is not None else None
    
    filter_obj = Filter(
        name=name,
        table_id=table_id,
        user_id=user_id,
        column_id=column_id,
        operation=operation,
        value=value_str,
        is_reusable=is_reusable,
    )
    db.add(filter_obj)
    await db.flush()
    await db.refresh(filter_obj)
    return filter_obj

async def get_filters(
    db: AsyncSession,
    user_id: str,
    table_id: Optional[str] = None,
    include_reusable: bool = True,
) -> List[Filter]:
    stmt = select(Filter).where(
        and_(
            Filter.user_id == user_id,
            Filter.is_active == True
        )
    )
    
    if table_id:
        if include_reusable:
            stmt = stmt.where(
                or_(
                    Filter.table_id == table_id,
                    Filter.is_reusable == True
                )
            )
        else:
            stmt = stmt.where(Filter.table_id == table_id)
    
    result = await db.execute(stmt)
    return result.scalars().all()

async def update_filter(
    db: AsyncSession,
    filter_id: str,
    user_id: str,
    updates: Dict[str, Any],
) -> Optional[Filter]:
    filter_obj = await db.get(Filter, filter_id)
    if not filter_obj or filter_obj.user_id != user_id:
        return None
    
    # If updating operation, validate against column ui_type
    if "operation" in updates:
        column = await db.get(ColumnMeta, filter_obj.column_id)
        allowed_ops = OPERATIONS_BY_UI_TYPE.get(column.ui_type, [])
        if updates["operation"] not in allowed_ops:
            raise ValueError(f"Operation '{updates['operation']}' not allowed for ui_type '{column.ui_type}'")
    
    for key, value in updates.items():
        if key == "value":
            value = json.dumps(value) if value is not None else None
        if hasattr(filter_obj, key):
            setattr(filter_obj, key, value)
    
    await db.flush()
    await db.refresh(filter_obj)
    return filter_obj

async def delete_filter(
    db: AsyncSession,
    filter_id: str,
    user_id: str,
) -> bool:
    filter_obj = await db.get(Filter, filter_id)
    if not filter_obj or filter_obj.user_id != user_id:
        return False
    
    await db.delete(filter_obj)
    await db.flush()
    return True

def build_filter_clause(
    column: ColumnMeta,
    operation: str,
    value: Optional[str],
    table_alias: str = "t",
) -> str:
    """Build SQL WHERE clause fragment for a filter"""
    col_ref = f"{table_alias}.{quote_ident(sanitize_identifier(column.name))}"
    
    # Parse JSON value if needed
    if value:
        try:
            value = json.loads(value)
        except (json.JSONDecodeError, TypeError):
            pass
    
    # Build SQL based on operation
    if operation == "equals":
        if value is None:
            return f"{col_ref} IS NULL"
        return f"{col_ref} = '{value}'"
    
    elif operation == "not_equals":
        if value is None:
            return f"{col_ref} IS NOT NULL"
        return f"{col_ref} != '{value}'"
    
    elif operation == "contains":
        return f"{col_ref}::text ILIKE '%{value}%'"
    
    elif operation == "not_contains":
        return f"{col_ref}::text NOT ILIKE '%{value}%'"
    
    elif operation == "starts_with":
        return f"{col_ref}::text ILIKE '{value}%'"
    
    elif operation == "ends_with":
        return f"{col_ref}::text ILIKE '%{value}'"
    
    elif operation == "gt":
        return f"{col_ref} > {value}"
    
    elif operation == "lt":
        return f"{col_ref} < {value}"
    
    elif operation == "gte":
        return f"{col_ref} >= {value}"
    
    elif operation == "lte":
        return f"{col_ref} <= {value}"
    
    elif operation == "is_empty":
        return f"({col_ref} IS NULL OR {col_ref}::text = '')"
    
    elif operation == "is_not_empty":
        return f"({col_ref} IS NOT NULL AND {col_ref}::text != '')"
    
    elif operation == "between":
        if isinstance(value, list) and len(value) == 2:
            return f"{col_ref} BETWEEN {value[0]} AND {value[1]}"
        return "1=1"  # Invalid value, don't filter
    
    elif operation == "in":
        if isinstance(value, list):
            values = "', '".join(str(v) for v in value)
            return f"{col_ref} IN ('{values}')"
        return "1=1"
    
    elif operation == "not_in":
        if isinstance(value, list):
            values = "', '".join(str(v) for v in value)
            return f"{col_ref} NOT IN ('{values}')"
        return "1=1"
    
    return "1=1"  # Default to no filtering
