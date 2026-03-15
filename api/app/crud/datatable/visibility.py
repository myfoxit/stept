"""Column visibility CRUD — ported from SnapRow routers/column_visibility.py."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy import select, and_, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ColumnVisibility
from app.utils import gen_suffix


async def create_visibility(
    db: AsyncSession,
    user_id: str,
    table_id: str,
    column_id: str,
    is_visible: bool = True,
) -> ColumnVisibility:
    # Upsert
    stmt = select(ColumnVisibility).where(
        and_(
            ColumnVisibility.table_id == table_id,
            ColumnVisibility.user_id == user_id,
            ColumnVisibility.column_id == column_id,
        )
    )
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        existing.is_visible = is_visible
        await db.flush()
        await db.refresh(existing)
        return existing

    vis = ColumnVisibility(
        table_id=table_id,
        user_id=user_id,
        column_id=column_id,
        is_visible=is_visible,
    )
    db.add(vis)
    await db.flush()
    await db.refresh(vis)
    return vis


async def get_visibility(
    db: AsyncSession,
    user_id: str,
    table_id: str,
) -> List[ColumnVisibility]:
    stmt = select(ColumnVisibility).where(
        and_(ColumnVisibility.user_id == user_id, ColumnVisibility.table_id == table_id)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def bulk_update_visibility(
    db: AsyncSession,
    user_id: str,
    table_id: str,
    columns: List[Dict[str, Any]],
) -> List[ColumnVisibility]:
    for col_data in columns:
        await create_visibility(
            db, user_id, table_id,
            col_data["column_id"],
            col_data.get("is_visible", True),
        )
    return await get_visibility(db, user_id, table_id)


async def delete_visibility(db: AsyncSession, visibility_id: str, user_id: str) -> bool:
    vis = await db.get(ColumnVisibility, visibility_id)
    if not vis or vis.user_id != user_id:
        return False
    await db.delete(vis)
    await db.flush()
    return True


async def clear_visibility(db: AsyncSession, user_id: str, table_id: str) -> int:
    stmt = delete(ColumnVisibility).where(
        and_(ColumnVisibility.user_id == user_id, ColumnVisibility.table_id == table_id)
    )
    result = await db.execute(stmt)
    await db.flush()
    return result.rowcount
