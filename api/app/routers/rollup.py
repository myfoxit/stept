from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.schemas.rollup import RollupCreate, RollupRead, RollupUpdate
from app.crud.rollup import add_rollup, get_rollup, update_rollup, delete_rollup

router = APIRouter()

@router.post("/", response_model=RollupRead)
async def api_add_rollup(data: RollupCreate, db: AsyncSession = Depends(get_db)):
    try:
        rl = await add_rollup(
            db=db,
            display_name=data.display_name,
            table_id=data.table_id,
            relation_column_id=data.relation_column_id,
            aggregate_func=data.aggregate_func,
            rollup_column_id=data.rollup_column_id,
            precision=data.precision,
            show_thousands_sep=data.show_thousands_sep or False,
        )
        return rl
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))

@router.get("/{column_id}", response_model=RollupRead)
async def api_get_rollup(column_id: str, db: AsyncSession = Depends(get_db)):
    rl = await get_rollup(db, column_id)
    if not rl:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "rollup not found")
    return rl

@router.patch("/{column_id}", response_model=RollupRead)
async def api_update_rollup(
    column_id: str,
    data: RollupUpdate,
    db: AsyncSession = Depends(get_db),
):
    try:
        rl = await update_rollup(
            db,
            column_id,
            relation_column_id=data.relation_column_id,
            rollup_column_id=data.rollup_column_id,
            aggregate_func=data.aggregate_func,
            precision=data.precision,
            show_thousands_sep=data.show_thousands_sep,
        )
        return rl
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))

@router.delete("/{column_id}", status_code=status.HTTP_204_NO_CONTENT)
async def api_delete_rollup(column_id: str, db: AsyncSession = Depends(get_db)):
    try:
        await delete_rollup(db, column_id)
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))
