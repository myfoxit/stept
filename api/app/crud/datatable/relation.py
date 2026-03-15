"""Relation CRUD — create/delete/assign/unassign relations.

Ported from SnapRow crud/relation.py.
"""
from __future__ import annotations

import logging
from typing import Final, Optional, Tuple

from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.datatable.column import add_column
from app.db.utils import quote_ident, sanitize_identifier
from app.models import ColumnMeta, RelationMeta, TableMeta, ColumnType, TableType
from app.utils import gen_suffix

logger: Final = logging.getLogger(__name__)

VALID_REL_TYPES: Final = {"one_to_one", "many_to_one", "one_to_many", "many_to_many"}


async def _create_column_meta(
    db: AsyncSession,
    table: TableMeta,
    name: str,
    display_name: str,
    ui_type: str,
    column_type: str,
    relation_table_id: str | None = None,
) -> ColumnMeta:
    if column_type is ColumnType.PHYSICAL:
        col = await add_column(db, table, name, ui_type)
        col.column_type = column_type
        col.display_name = display_name
    else:
        col = ColumnMeta(
            id=gen_suffix(16),
            table_id=table.id,
            display_name=display_name,
            name=name.lower(),
            ui_type=ui_type,
            column_type=column_type,
            fk_type=f"{ui_type}_back",
        )
        db.add(col)

    col.relations_table_id = relation_table_id
    await db.flush()
    await db.refresh(col)
    return col


async def add_relation(
    db: AsyncSession,
    left: TableMeta,
    right: TableMeta,
    relation_type: str,
    display_name: str | None = None,
) -> RelationMeta:
    if relation_type not in VALID_REL_TYPES:
        raise ValueError(f"Unsupported relation type: {relation_type}")

    left_phys = sanitize_identifier(left.physical_name)
    right_phys = sanitize_identifier(right.physical_name)
    display_name = display_name or right.name

    forward_rel_id = gen_suffix(16)
    join_tbl_meta: Optional[TableMeta] = None
    fk_name: Optional[str] = None

    async def _exec_ddl(sql: str):
        try:
            await db.execute(text(sql))
        except OperationalError as exc:
            logger.error("Failed DDL '%s': %s", sql, exc)
            raise

    if relation_type in {"one_to_one", "many_to_one"}:
        fk_name = sanitize_identifier(display_name).lower()
        left_cm = await _create_column_meta(
            db, left, fk_name, display_name, "oo_relation",
            ColumnType.PHYSICAL, relation_table_id=right.id,
        )
        right_cm = await _create_column_meta(
            db, right,
            f"{left_phys}_ref_{gen_suffix(5)}",
            f"{left.name}_ref_{gen_suffix(5)}".lower(),
            "oo_relation", ColumnType.VIRTUAL,
            relation_table_id=left.id,
        )
        fk_sql = (
            f"ALTER TABLE {quote_ident(left_phys)} ADD CONSTRAINT {quote_ident(f'fk_{left_phys}_{fk_name}')} "
            f"FOREIGN KEY ({quote_ident(fk_name)}) REFERENCES {quote_ident(right_phys)}(id)"
        )
        await _exec_ddl(fk_sql)
        if relation_type == "one_to_one":
            uniq_sql = (
                f"ALTER TABLE {quote_ident(left_phys)} ADD CONSTRAINT {quote_ident(f'uq_{left_phys}_{fk_name}')} "
                f"UNIQUE ({quote_ident(fk_name)})"
            )
            await _exec_ddl(uniq_sql)

    elif relation_type == "one_to_many":
        fk_name = sanitize_identifier(f"{left.name}_ref_{gen_suffix(5)}").lower()
        left_cm = await _create_column_meta(
            db, left,
            f"{right_phys}_ref_{gen_suffix(5)}",
            sanitize_identifier(display_name).lower(),
            "om_relation", ColumnType.VIRTUAL,
            relation_table_id=right.id,
        )
        right_cm = await _create_column_meta(
            db, right, fk_name, fk_name,
            "oo_relation", ColumnType.PHYSICAL,
            relation_table_id=left.id,
        )
        fk_sql = (
            f"ALTER TABLE {quote_ident(right_phys)} ADD CONSTRAINT "
            f"{quote_ident(f'fk_{right_phys}_{fk_name}')} "
            f"FOREIGN KEY ({quote_ident(fk_name)}) "
            f"REFERENCES {quote_ident(left_phys)}(id)"
        )
        await _exec_ddl(fk_sql)

    elif relation_type == "many_to_many":
        jname_valid = sanitize_identifier(f"{left_phys}_{right_phys}_link_{gen_suffix(4)}")
        qj = quote_ident(jname_valid)
        await _exec_ddl(
            f"CREATE TABLE {qj} ("
            f"id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY, "
            f"{left_phys}_id INTEGER NOT NULL REFERENCES {quote_ident(left_phys)}(id), "
            f"{right_phys}_id INTEGER NOT NULL REFERENCES {quote_ident(right_phys)}(id))"
        )
        join_tbl_meta = TableMeta(
            id=gen_suffix(16), physical_name=jname_valid,
            name=jname_valid.replace("_", " ").title(), table_type=TableType.JOIN,
        )
        db.add(join_tbl_meta)
        await db.flush()

        left_cm = await _create_column_meta(
            db, left,
            f"{right_phys}_ref_{gen_suffix(5)}",
            display_name, "mm_relation_left", ColumnType.VIRTUAL,
            relation_table_id=right.id,
        )
        right_cm = await _create_column_meta(
            db, right,
            f"{left_phys}_ref_{gen_suffix(5)}",
            f"{left.name}_ref_{gen_suffix(5)}".lower(),
            "mm_relation_right", ColumnType.VIRTUAL,
            relation_table_id=left.id,
        )

    left_cm.relations_table_id = right.id
    right_cm.relations_table_id = left.id
    await db.flush()

    forward_rel = RelationMeta(
        id=forward_rel_id,
        left_table_id=left.id,
        right_table_id=right.id,
        left_column_id=left_cm.id,
        right_column_id=right_cm.id,
        relation_type=relation_type,
        display_name=display_name,
        fk_name=fk_name,
        join_table_id=join_tbl_meta.id if join_tbl_meta else None,
    )
    db.add(forward_rel)
    await db.flush()
    await db.refresh(forward_rel)

    logger.info("Created %s relation %s <-> %s", relation_type, left_phys, right_phys)
    return forward_rel


async def delete_relation(db: AsyncSession, relation_id: str) -> None:
    rel: RelationMeta | None = await db.get(RelationMeta, relation_id)
    if rel is None:
        raise ValueError(f"Relation {relation_id!r} not found")

    target_table_phys: Optional[str] = None

    if rel.relation_type in {"one_to_one", "many_to_one"} and rel.fk_name:
        left_tbl = await db.get(TableMeta, rel.left_table_id)
        if left_tbl:
            target_table_phys = sanitize_identifier(left_tbl.physical_name)
    elif rel.relation_type == "one_to_many" and rel.fk_name:
        right_tbl = await db.get(TableMeta, rel.right_table_id)
        if right_tbl:
            target_table_phys = sanitize_identifier(right_tbl.physical_name)

    if target_table_phys:
        fk_col_q = quote_ident(sanitize_identifier(rel.fk_name))
        await db.execute(
            text(f"ALTER TABLE {quote_ident(target_table_phys)} DROP COLUMN {fk_col_q}")
        )

    if rel.relation_type == "many_to_many" and rel.join_table_id:
        jt = await db.get(TableMeta, rel.join_table_id)
        if jt:
            jt_phys = sanitize_identifier(jt.physical_name)
            await db.execute(text(f"DROP TABLE {quote_ident(jt_phys)}"))
            await db.delete(jt)

    for col_id in (rel.left_column_id, rel.right_column_id):
        if col_id:
            cm = await db.get(ColumnMeta, col_id)
            if cm:
                await db.delete(cm)

    await db.delete(rel)
    await db.flush()
    logger.info("Deleted relation %s", relation_id)


def _align_items_to_relation(
    relation: RelationMeta,
    caller_table_id: str,
    left_item_id: int,
    right_item_id: int,
) -> tuple[int, int]:
    if caller_table_id == relation.left_table_id:
        return left_item_id, right_item_id
    if caller_table_id == relation.right_table_id:
        return right_item_id, left_item_id
    raise ValueError("caller_table_id does not match either side of the relation")


async def assign_relation(
    db: AsyncSession,
    relation: RelationMeta,
    left_item_id: int,
    right_item_id: int,
    left_table_id: str,
) -> None:
    left_item_id, right_item_id = _align_items_to_relation(
        relation, left_table_id, left_item_id, right_item_id,
    )

    left_tbl = await db.get(TableMeta, relation.left_table_id)
    right_tbl = await db.get(TableMeta, relation.right_table_id)
    if not left_tbl or not right_tbl:
        raise ValueError("Relation points to missing tables")

    left_phys = sanitize_identifier(left_tbl.physical_name)
    right_phys = sanitize_identifier(right_tbl.physical_name)

    if relation.relation_type == "one_to_one":
        target_tbl_q = quote_ident(left_phys)
        fk_col_q = quote_ident(relation.fk_name)
        await db.execute(
            text(f"UPDATE {target_tbl_q} SET {fk_col_q} = NULL WHERE {fk_col_q} = :rid AND id <> :lid"),
            {"rid": right_item_id, "lid": left_item_id},
        )
        await db.execute(
            text(f"UPDATE {target_tbl_q} SET {fk_col_q} = :rid WHERE id = :lid"),
            {"rid": right_item_id, "lid": left_item_id},
        )

    elif relation.relation_type == "many_to_one":
        await db.execute(
            text(f"UPDATE {quote_ident(left_phys)} SET {quote_ident(relation.fk_name)} = :rid WHERE id = :lid"),
            {"rid": right_item_id, "lid": left_item_id},
        )

    elif relation.relation_type == "one_to_many":
        await db.execute(
            text(f"UPDATE {quote_ident(right_phys)} SET {quote_ident(relation.fk_name)} = :lid WHERE id = :rid"),
            {"lid": left_item_id, "rid": right_item_id},
        )

    elif relation.relation_type == "many_to_many":
        jt = await db.get(TableMeta, relation.join_table_id)
        if not jt:
            raise ValueError("Join table metadata missing")
        jt_phys_q = quote_ident(sanitize_identifier(jt.physical_name))
        await db.execute(
            text(
                f"INSERT INTO {jt_phys_q} "
                f"({quote_ident(f'{left_phys}_id')}, {quote_ident(f'{right_phys}_id')}) "
                "VALUES (:lid, :rid)"
            ),
            {"lid": left_item_id, "rid": right_item_id},
        )

    await db.flush()


async def unassign_relation(
    db: AsyncSession,
    relation: RelationMeta,
    left_item_id: int,
    right_item_id: int,
    caller_table_id: str,
) -> None:
    left_item_id, right_item_id = _align_items_to_relation(
        relation, caller_table_id, left_item_id, right_item_id,
    )

    left_tbl = await db.get(TableMeta, relation.left_table_id)
    right_tbl = await db.get(TableMeta, relation.right_table_id)
    if not left_tbl or not right_tbl:
        raise ValueError("Relation points to missing tables")

    left_phys = sanitize_identifier(left_tbl.physical_name)
    right_phys = sanitize_identifier(right_tbl.physical_name)

    if relation.relation_type in {"one_to_one", "many_to_one"}:
        await db.execute(
            text(
                f"UPDATE {quote_ident(left_phys)} SET {quote_ident(relation.fk_name)} = NULL "
                f"WHERE id = :lid AND {quote_ident(relation.fk_name)} = :rid"
            ),
            {"lid": left_item_id, "rid": right_item_id},
        )

    elif relation.relation_type == "one_to_many":
        await db.execute(
            text(
                f"UPDATE {quote_ident(right_phys)} SET {quote_ident(relation.fk_name)} = NULL "
                f"WHERE id = :rid AND {quote_ident(relation.fk_name)} = :lid"
            ),
            {"lid": left_item_id, "rid": right_item_id},
        )

    elif relation.relation_type == "many_to_many":
        jt = await db.get(TableMeta, relation.join_table_id)
        if not jt:
            raise ValueError("Join table metadata missing")
        jt_phys_q = quote_ident(sanitize_identifier(jt.physical_name))
        await db.execute(
            text(
                f"DELETE FROM {jt_phys_q} "
                f"WHERE {quote_ident(f'{left_phys}_id')} = :lid "
                f"AND {quote_ident(f'{right_phys}_id')} = :rid"
            ),
            {"lid": left_item_id, "rid": right_item_id},
        )

    await db.flush()
