"""Sort CRUD — ported from SnapRow routers/sort.py."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy import select, and_, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Sort, ColumnMeta
from app.utils import gen_suffix


async def create_sort(
    db: AsyncSession,
    user_id: str,
    table_id: str,
    column_id: str,
    direction: str = "asc",
    priority: int = 0,
) -> Sort:
    # Upsert: if sort exists for same table/column/user, update it
    stmt = select(Sort).where(
        and_(
            Sort.table_id == table_id,
            Sort.user_id == user_id,
            Sort.column_id == column_id,
        )
    )
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        existing.direction = direction
        existing.priority = priority
        existing.is_active = True
        await db.flush()
        await db.refresh(existing)
        return existing

    sort_obj = Sort(
        table_id=table_id,
        user_id=user_id,
        column_id=column_id,
        direction=direction,
        priority=priority,
    )
    db.add(sort_obj)
    await db.flush()
    await db.refresh(sort_obj)
    return sort_obj


async def get_sorts(
    db: AsyncSession,
    user_id: str,
    table_id: str,
) -> List[Sort]:
    stmt = select(Sort).where(
        and_(Sort.user_id == user_id, Sort.table_id == table_id, Sort.is_active == True)
    ).order_by(Sort.priority)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def update_sort(
    db: AsyncSession,
    sort_id: str,
    user_id: str,
    updates: Dict[str, Any],
) -> Optional[Sort]:
    sort_obj = await db.get(Sort, sort_id)
    if not sort_obj or sort_obj.user_id != user_id:
        return None

    for key, value in updates.items():
        if hasattr(sort_obj, key):
            setattr(sort_obj, key, value)

    await db.flush()
    await db.refresh(sort_obj)
    return sort_obj


async def delete_sort(
    db: AsyncSession,
    sort_id: str,
    user_id: str,
) -> bool:
    sort_obj = await db.get(Sort, sort_id)
    if not sort_obj or sort_obj.user_id != user_id:
        return False
    await db.delete(sort_obj)
    await db.flush()
    return True


async def clear_sorts(
    db: AsyncSession,
    user_id: str,
    table_id: str,
) -> int:
    stmt = delete(Sort).where(
        and_(Sort.user_id == user_id, Sort.table_id == table_id)
    )
    result = await db.execute(stmt)
    await db.flush()
    return result.rowcount
