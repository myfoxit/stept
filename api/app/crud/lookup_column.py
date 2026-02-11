from typing import Optional
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
import logging

from app.models import TableMeta, ColumnMeta, LookUpColumn, ColumnType
from app.utils import gen_suffix
from app.db.utils import sanitize_identifier

logger = logging.getLogger(__name__)

__all__ = ["create_lookup_column", "delete_lookup_column"]

async def create_lookup_column(
    db: AsyncSession,
    relation_column_id: str,
    lookup_column_id: str,
    custom_name: Optional[str] = None
) -> ColumnMeta:
    rel_col = await db.get(ColumnMeta, relation_column_id)
    if not rel_col:
        raise ValueError("relation_column not found")

    lookup_col = await db.get(ColumnMeta, lookup_column_id)
    if not lookup_col:
        raise ValueError("lookup_column not found")

    if lookup_col.table_id != rel_col.relations_table_id:
        raise ValueError("lookup_column does not belong to the relation target table")

    if custom_name:
        display_name = custom_name
    else:
        tbl = await db.get(TableMeta, rel_col.relations_table_id)
        base_name = tbl.name or tbl.physical_name
        display_name = f"{lookup_col.name} from {base_name}"

    name = sanitize_identifier(display_name.replace(" ", "_"))

    col_meta = ColumnMeta(
        id= gen_suffix(16),
        table_id=rel_col.table_id,
        name=name,
        display_name=display_name,
        ui_type="lookup",
        fk_type=rel_col.fk_type,
        relations_table_id=rel_col.relations_table_id,
        column_type=ColumnType.VIRTUAL,
    )
    db.add(col_meta)
    await db.flush()

    lookup_meta = LookUpColumn(
        column_id=col_meta.id,
        relation_column_id=relation_column_id,
        lookup_column_id=lookup_column_id,
    )
    db.add(lookup_meta)
    await db.commit()

    logger.info("Created lookup column %s for relation %s", col_meta.id, relation_column_id)
    return col_meta

async def delete_lookup_column(
    db: AsyncSession,
    column_id: str,
) -> None:
    result = await db.execute(select(LookUpColumn).where(LookUpColumn.column_id == column_id))
    lookup_meta = result.scalar_one_or_none()
    if not lookup_meta:
        raise ValueError("lookup column not found")

    await db.execute(delete(LookUpColumn).where(LookUpColumn.column_id == column_id))
    await db.execute(delete(ColumnMeta).where(ColumnMeta.id == column_id))
    await db.commit()

    logger.info("Deleted lookup column %s", column_id)
