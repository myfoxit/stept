"""Formula endpoints — all require auth."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.security import get_current_user, check_project_permission
from app.models import User, ProjectRole, ColumnMeta
from app.schemas.datatable import FormulaCreate
from app.crud.datatable.table import get_table
from app.crud.datatable.formula import add_formula, get_formulas, delete_formula

router = APIRouter()


@router.post("/")
async def api_add_formula(
    body: FormulaCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tbl = await get_table(db, body.table_id)
    if not tbl:
        raise HTTPException(status_code=404, detail="Table not found")
    await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.EDITOR)
    try:
        f = await add_formula(
            db, body.display_name, body.table_id,
            body.formula, body.formula_raw,
            body.position, body.reference_column_id,
        )
        return {"id": f.id, "column_id": f.column_id, "formula": f.formula}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{column_id}")
async def api_get_formulas(
    column_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    col = await db.get(ColumnMeta, column_id)
    if not col:
        raise HTTPException(status_code=404, detail="Column not found")
    tbl = await get_table(db, col.table_id)
    if tbl:
        await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.VIEWER)
    formulas = await get_formulas(db, column_id)
    return [{"id": f.id, "formula": f.formula, "formula_raw": f.formula_raw} for f in formulas]


@router.delete("/{column_id}")
async def api_delete_formula(
    column_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    col = await db.get(ColumnMeta, column_id)
    if not col:
        raise HTTPException(status_code=404, detail="Column not found")
    tbl = await get_table(db, col.table_id)
    if tbl:
        await check_project_permission(db, current_user.id, tbl.project_id, ProjectRole.EDITOR)
    try:
        await delete_formula(db, column_id)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
