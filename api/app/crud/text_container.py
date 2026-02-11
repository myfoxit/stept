# app/crud/text_container.py
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models import TextContainer
from app.utils import gen_suffix

async def get_text_container( container_id: str, db: AsyncSession) -> Optional[TextContainer]:
    stmt = select(TextContainer).where(
        TextContainer.id == container_id
    )
    res = await db.execute(stmt)
    return res.scalar_one_or_none()

async def create_text_container(
    db: AsyncSession, *, content: dict, name: Optional[str] = None
) -> TextContainer:
    meta_id = gen_suffix(16)
    tc = TextContainer(id= meta_id, name=name, content=content)
    db.add(tc)
    await db.commit()
    await db.refresh(tc)
    return tc

async def upsert_text_container( containerId: str,
    db: AsyncSession, *, content: dict, name: Optional[str] = None
) -> TextContainer:
    result = await db.scalar(select(TextContainer).where(
        TextContainer.id == containerId
    ))
    meta_id = gen_suffix(16)
    if result:  
        tc = result
        tc.content = content
        if name is not None:
            tc.name = name
    else:
        tc = TextContainer(id= meta_id, name=name, content=content)
        db.add(tc)
    await db.commit()
    await db.refresh(tc)
    return tc

async def get_all_text_containers(db: AsyncSession) -> List[TextContainer]:
    stmt = select(TextContainer)
    res = await db.execute(stmt)
    return res.scalars().all()
