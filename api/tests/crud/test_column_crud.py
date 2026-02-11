import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.column import add_column, get_columns, delete_column
from app.models import ColumnMeta
from tests.crud.helpers import _bootstrap_table




# ------------------------------------------------------------------------ #
# add_column
# ------------------------------------------------------------------------ #

@pytest.mark.asyncio
async def test_add_column_adds_physical_and_meta(db: AsyncSession):
    tbl = await _bootstrap_table(db)
    col = await add_column(db, tbl, name="age", ui_type="single_line_text")

    # -- meta row ---------------------------------------------------------- #
    assert isinstance(col, ColumnMeta)
    assert col.table_id == tbl.id
    assert col.ui_type == "single_line_text"
    # the helper stores the *validated* names
    assert col.display_name == "age"

    # -- physical column --------------------------------------------------- #
    res = await db.execute(
        text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = :tbl AND column_name = :col"
        ),
        {"tbl": tbl.physical_name, "col": col.display_name},
    )
    assert res.first() is not None


@pytest.mark.asyncio
async def test_add_column_rejects_unknown_type(db: AsyncSession):
    tbl = await _bootstrap_table(db)
    with pytest.raises(ValueError, match="Unsupported column type"):
        await add_column(db, tbl, name="whatever", ui_type="does_not_exist")


# ------------------------------------------------------------------------ #
# get_columns
# ------------------------------------------------------------------------ #

@pytest.mark.asyncio
async def test_get_columns_returns_all_columns(db: AsyncSession):
    tbl = await _bootstrap_table(db)
    await add_column(db, tbl, name="c1", ui_type="single_line_text")
    await add_column(db, tbl, name="c2", ui_type="number")

    cols = await get_columns(db, table_id=tbl.id)

    display_names = {c.display_name for c in cols}
    assert display_names == {"c1", "c2"}


# ------------------------------------------------------------------------ #
# delete_column
# ------------------------------------------------------------------------ #

@pytest.mark.asyncio
async def test_delete_column_removes_meta_and_physical(db: AsyncSession):
    tbl = await _bootstrap_table(db)
    col = await add_column(db, tbl, name="flag", ui_type="BOOLEAN")
    await delete_column(db, col.id)

    # meta row is gone
    still_there = await db.get(ColumnMeta, col.id)
    assert still_there is None

    # physical column is gone
    res = await db.execute(
        text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = :tbl AND column_name = :col"
        ),
        {"tbl": tbl.physical_name, "col": col.display_name},
    )
    assert res.first() is None


@pytest.mark.asyncio
async def test_delete_column_nonexistent_raises(db: AsyncSession):
    with pytest.raises(ValueError, match="column .* not found"):
        await delete_column(db, column_id="__nope__")
