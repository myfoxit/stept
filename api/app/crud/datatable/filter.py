"""Filter CRUD — ported from SnapRow crud/filter.py.

The actual filter clause BUILDING is in field.py (build_filter_clause)
with PARAMETERIZED queries — the SQL injection vulnerability is fixed.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Filter, ColumnMeta
from app.schemas.datatable import OPERATIONS_BY_UI_TYPE


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
    column = await db.get(ColumnMeta, column_id)
    if not column:
        raise ValueError(f"Column {column_id} not found")

    allowed_ops = OPERATIONS_BY_UI_TYPE.get(column.ui_type, [])
    if operation not in allowed_ops:
        raise ValueError(f"Operation '{operation}' not allowed for ui_type '{column.ui_type}'")

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
        and_(Filter.user_id == user_id, Filter.is_active == True)
    )
    if table_id:
        if include_reusable:
            stmt = stmt.where(or_(Filter.table_id == table_id, Filter.is_reusable == True))
        else:
            stmt = stmt.where(Filter.table_id == table_id)

    result = await db.execute(stmt)
    return list(result.scalars().all())


async def update_filter(
    db: AsyncSession,
    filter_id: str,
    user_id: str,
    updates: Dict[str, Any],
) -> Optional[Filter]:
    filter_obj = await db.get(Filter, filter_id)
    if not filter_obj or filter_obj.user_id != user_id:
        return None

    if "operation" in updates:
        column = await db.get(ColumnMeta, filter_obj.column_id)
        allowed_ops = OPERATIONS_BY_UI_TYPE.get(column.ui_type, [])
        if updates["operation"] not in allowed_ops:
            raise ValueError(f"Operation '{updates['operation']}' not allowed")

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
