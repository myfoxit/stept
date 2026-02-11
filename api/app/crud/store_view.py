from typing import List, Optional
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import StoreView, ColumnMeta
from app.utils import gen_suffix
from app.schemas.store_view import StoreViewCreate

__all__ = ["create_store_view", "get_store_view", "list_store_views", "delete_store_view"]

# ------------------------------------------------------------------
async def create_store_view(db: AsyncSession, data: StoreViewCreate) -> StoreView:
    store_view = StoreView(
        id=gen_suffix(16),
        name=data.name,
        buyer_table_id=data.buyer_table_id,
        cart_table_id=data.cart_table_id,
        article_table_id=data.article_table_id,
    )
    if data.calc_field_ids:
        result = await db.execute(
            select(ColumnMeta).where(ColumnMeta.id.in_(data.calc_field_ids))
        )
        store_view.calc_fields = result.scalars().all()
    db.add(store_view)
    await db.flush()
    await db.refresh(store_view)
    return store_view

# ------------------------------------------------------------------
async def get_store_view(db: AsyncSession, sv_id: str) -> Optional[StoreView]:
    return await db.get(StoreView, sv_id)

# ------------------------------------------------------------------
async def list_store_views(db: AsyncSession) -> List[StoreView]:
    result = await db.execute(select(StoreView))
    return result.scalars().all()

# ------------------------------------------------------------------
async def delete_store_view(db: AsyncSession, sv_id: str) -> None:
    sv = await db.get(StoreView, sv_id)
    if not sv:
        raise ValueError("store view not found")
    await db.delete(sv)
    await db.flush()
