from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.utils import gen_suffix
from app.models import Formulas, ColumnMeta, TableMeta
from app.crud.column import _calculate_column_order  # NEW import

__all__ = ["add_formula", "get_formulas", "delete_formula"]

async def add_formula(
    db: AsyncSession,
    display_name: str,
    table_id: str,
    formula: str,
    formula_raw: str,
    position: str | None = None,  # NEW parameter
    reference_column_id: str | None = None,  # NEW parameter
) -> Formulas:
    # ensure the table exists
    tbl = await db.get(TableMeta, table_id)
    if not tbl:
        raise ValueError(f"table {table_id!r} not found")

    # NEW: Calculate the correct order value
    order_value = await _calculate_column_order(
        db, table_id, position, reference_column_id
    )

    # create a virtual column record for this formula
    col_id = gen_suffix(16)
    col_meta = ColumnMeta(
        id=col_id,
        table_id=table_id,
        display_name=display_name,
        name=f"formula_{col_id}",
        ui_type="formula",
        column_type="virtual",
        fk_type="TEXT",
        sr__order=order_value,  # NEW: Use calculated order instead of default
    )
    db.add(col_meta)
    await db.flush()
    await db.refresh(col_meta)

    # now record the formula itself
    formula_id = gen_suffix(16)
    formula_meta = Formulas(
        id=formula_id,
        column_id=col_id,
        formula=formula,
        formula_raw=formula_raw,
    )
    db.add(formula_meta)
    await db.flush()
    await db.refresh(formula_meta)
    return formula_meta

async def get_formulas(
    db: AsyncSession,
    column_id: str,
) -> list[Formulas]:
    stmt = (
        select(Formulas)
        .where(Formulas.column_id == column_id)
        .order_by(Formulas.created_at.desc())
    )
    result = await db.execute(stmt)
    return [row[0] for row in result.all()]

async def delete_formula(
    db: AsyncSession,
    column_id: str,
) -> None:
    # ensure the virtual column exists
    col_meta = await db.get(ColumnMeta, column_id)
    if not col_meta:
        raise ValueError(f"column {column_id!r} not found")

    # delete all formula records for this column
    await db.execute(delete(Formulas).where(Formulas.column_id == column_id))

    # delete the virtual column itself
    await db.delete(col_meta)
    await db.flush()
