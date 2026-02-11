from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.crud.lookup_column import create_lookup_column, delete_lookup_column
from app.schemas.column import ColumnRead
from app.schemas.lookup_column import LookUpColumnCreate

router = APIRouter()

@router.post(
    "/",
    response_model=ColumnRead,
    status_code=status.HTTP_201_CREATED,
)
async def api_create_lookup_column(
    payload: LookUpColumnCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a lookup‐type column based on an existing relation column."""
    try:
        col_meta = await create_lookup_column(
            db,
            payload.relation_column_id,
            payload.lookup_column_id,
            payload.custom_name,
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return col_meta

@router.delete(
    "/{column_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def api_delete_lookup_column(
    column_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a lookup column and its ColumnMeta."""
    try:
        await delete_lookup_column(db, column_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
