from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.schemas.formula import FormulaCreate, FormulaRead
from app.crud.formula import add_formula, get_formulas, delete_formula
from app.database import get_session as get_db

router = APIRouter()

@router.post("/", response_model=FormulaRead)
async def api_add_formula(
    data: FormulaCreate,
    db: AsyncSession = Depends(get_db),
):
    try:
        return await add_formula(
            db,
            data.display_name,
            data.table_id,
            data.formula,
            data.formula_raw,
            data.position,  # NEW: pass position
            data.reference_column_id,  # NEW: pass reference column
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))

@router.get("/{column_id}", response_model=List[FormulaRead])
async def api_list_formulas(
    column_id: str,
    db: AsyncSession = Depends(get_db),
):
    return await get_formulas(db, column_id)

@router.delete("/{column_id}", status_code=status.HTTP_204_NO_CONTENT)
async def api_delete_formula(
    column_id: str,
    db: AsyncSession = Depends(get_db),
):
    try:
        await delete_formula(db, column_id)
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))
