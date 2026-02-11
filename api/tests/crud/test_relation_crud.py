import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.relation import (
    add_relation,
    delete_relation,
    assign_relation,
    unassign_relation,
)
from app.models import ColumnMeta, RelationMeta, TableMeta, ColumnType
from tests.crud.helpers import _bootstrap_table


@pytest.mark.asyncio
async def test_add_relation_one_to_one_creates_columns_and_constraints(db: AsyncSession, ):
    left = await _bootstrap_table(db)
    right = await _bootstrap_table(db)

    # create a one-to-one with explicit display_name for predictable fk_name
    rel = await add_relation(db, left, right, "one_to_one", display_name="myrel")
    # forward meta
    fwd = await db.get(RelationMeta, rel.id)
    assert fwd and fwd.left_table_id == left.id and fwd.right_table_id == right.id

    # check ColumnMeta entries
    left_cm = await db.get(ColumnMeta, fwd.left_column_id)
    right_cm = await db.get(ColumnMeta, fwd.right_column_id)
    assert left_cm.column_type == ColumnType.PHYSICAL
    assert right_cm.column_type == ColumnType.VIRTUAL

    # physical FK column exists on left table
    res = await db.execute(
        text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = :tbl AND column_name = :col"
        ),
        {"tbl": left.physical_name, "col": left_cm.display_name},
    )
    assert res.first() is not None


@pytest.mark.asyncio
async def test_delete_relation_one_to_one_removes_meta_and_physical(db: AsyncSession):
    left = await _bootstrap_table(db)
    right = await _bootstrap_table(db)
    rel = await add_relation(db, left, right, "one_to_one", display_name="delrel")
    left_cm = await db.get(ColumnMeta, rel.left_column_id)

    # now delete
    await delete_relation(db, rel.id)

    # meta gone
    assert await db.get(RelationMeta, rel.id) is None
    assert await db.get(ColumnMeta, left_cm.id) is None

    # physical column dropped
    res = await db.execute(
        text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = :tbl AND column_name = :col"
        ),
        {"tbl": left.physical_name, "col": left_cm.display_name},
    )
    assert res.first() is None


@pytest.mark.asyncio
async def test_assign_and_unassign_one_to_one(db: AsyncSession):
    left = await _bootstrap_table(db)
    right = await _bootstrap_table(db)
    rel = await add_relation(db, left, right, "one_to_one", display_name="assrel")
    fk = rel.fk_name
    # insert two rows into each table
    await db.execute(text(f"INSERT INTO {left.physical_name} (id) VALUES (1),(2)"))
    await db.execute(text(f"INSERT INTO {right.physical_name} (id) VALUES (10),(20)"))

    # assign left 1 to right 10
    await assign_relation(db, rel, 1, 10, left.id)
    row = (await db.execute(
        text(f"SELECT {fk} FROM {left.physical_name} WHERE id=1")
    )).first()
    assert row and row[0] == 10

    # unassign
    await unassign_relation(db, rel, 1, 10, left.id)
    row2 = (await db.execute(
        text(f"SELECT {fk} FROM {left.physical_name} WHERE id=1")
    )).first()
    assert row2 and row2[0] is None


@pytest.mark.asyncio
async def test_add_relation_many_to_many_creates_join_table_and_virtual_columns(db: AsyncSession):
    left = await _bootstrap_table(db)
    right = await _bootstrap_table(db)
    rel = await add_relation(db, left, right, "many_to_many", display_name="m2mrel")

    # join table meta exists
    jt = await db.get(TableMeta, rel.join_table_id)
    assert jt and jt.table_type.name == "JOIN"

    # both columns virtual only
    lcm = await db.get(ColumnMeta, rel.left_column_id)
    rcm = await db.get(ColumnMeta, rel.right_column_id)
    assert lcm.column_type == ColumnType.VIRTUAL
    assert rcm.column_type == ColumnType.VIRTUAL

    # physical join table exists
    res = await db.execute(
        text(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_name = :tbl"
        ),
        {"tbl": jt.physical_name},
    )
    assert res.first() is not None


@pytest.mark.asyncio
async def test_assign_and_unassign_many_to_many(db: AsyncSession):
    left = await _bootstrap_table(db)
    right = await _bootstrap_table(db)
    rel = await add_relation(db, left, right, "many_to_many", display_name="linkrel")

    # insert sample rows
    await db.execute(text(f"INSERT INTO {left.physical_name} (id) VALUES (5)"))
    await db.execute(text(f"INSERT INTO {right.physical_name} (id) VALUES (7)"))

    # do assign
    await assign_relation(db, rel, 5, 7, left.id)
    jt = await db.get(TableMeta, rel.join_table_id)
    left_col = f"{left.physical_name}_id"
    right_col = f"{right.physical_name}_id"
    exists = (await db.execute(
        text(f"SELECT * FROM {jt.physical_name} WHERE {left_col}=:l AND {right_col}=:r"),
        {"l": 5, "r": 7},
    )).first()
    assert exists is not None

    # unassign
    await unassign_relation(db, rel, 5, 7, left.id)
    gone = (await db.execute(
        text(f"SELECT * FROM {jt.physical_name} WHERE {left_col}=:l AND {right_col}=:r"),
        {"l": 5, "r": 7},
    )).first()
    assert gone is None


@pytest.mark.asyncio
async def test_add_relation_one_to_many_creates_columns_and_constraints(db: AsyncSession):
    left = await _bootstrap_table(db)
    right = await _bootstrap_table(db)

    # create a one-to-many with explicit display_name for predictable fk_name
    rel = await add_relation(db, left, right, "one_to_many", display_name="mtorel")
    fwd = await db.get(RelationMeta, rel.id)
    assert fwd and fwd.left_table_id == left.id and fwd.right_table_id == right.id

    # column meta types
    left_cm = await db.get(ColumnMeta, fwd.left_column_id)
    right_cm = await db.get(ColumnMeta, fwd.right_column_id)
    assert left_cm.column_type == ColumnType.VIRTUAL
    assert right_cm.column_type == ColumnType.PHYSICAL

    # physical FK column exists on right table
    res = await db.execute(
        text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = :tbl AND column_name = :col"
        ),
        {"tbl": right.physical_name, "col": right_cm.display_name},
    )
    assert res.first() is not None


@pytest.mark.asyncio
async def test_delete_relation_one_to_many_removes_meta_and_physical(db: AsyncSession):
    left = await _bootstrap_table(db)
    right = await _bootstrap_table(db)
    rel = await add_relation(db, left, right, "one_to_many", display_name="delmtorel")
    right_cm = await db.get(ColumnMeta, rel.right_column_id)

    # now delete
    await delete_relation(db, rel.id)

    # meta gone
    assert await db.get(RelationMeta, rel.id) is None
    assert await db.get(ColumnMeta, right_cm.id) is None

    # physical column dropped from right table
    res = await db.execute(
        text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = :tbl AND column_name = :col"
        ),
        {"tbl": right.physical_name, "col": right_cm.display_name},
    )
    assert res.first() is None


@pytest.mark.asyncio
async def test_assign_and_unassign_one_to_many(db: AsyncSession):
    left = await _bootstrap_table(db)
    right = await _bootstrap_table(db)
    rel = await add_relation(db, left, right, "one_to_many", display_name="assmtorel")
    fk = rel.fk_name

    # insert one row each
    await db.execute(text(f"INSERT INTO {left.physical_name} (id) VALUES (1)"))
    await db.execute(text(f"INSERT INTO {right.physical_name} (id) VALUES (10)"))

    # assign left 1 to right 10
    await assign_relation(db, rel, 1, 10, left.id)
    row = (await db.execute(
        text(f"SELECT {fk} FROM {right.physical_name} WHERE id=10")
    )).first()
    assert row and row[0] == 1

    # unassign
    await unassign_relation(db, rel, 1, 10, left.id)
    row2 = (await db.execute(
        text(f"SELECT {fk} FROM {right.physical_name} WHERE id=10")
    )).first()
    assert row2 and row2[0] is None
