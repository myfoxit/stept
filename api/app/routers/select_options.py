from __future__ import annotations

import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status, Request  # ← add Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.models import TableMeta
from app.schemas.column import ColumnRead  # reuse existing schema
from app.schemas.select_options import (
    AssignSelectOption,
    SelectColumnCreate,
    SelectOptionRead,
    SelectOptionBulkUpdate,
)
from app.crud.select_options import (
    add_select_column_with_options,
    assign_select_option,
    assign_multi_select_options,  # NEW
    get_select_options,
    update_select_options,
    delete_select_column,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Create column + options
# ---------------------------------------------------------------------------

@router.post(
    "/",
    response_model=ColumnRead,
    status_code=status.HTTP_201_CREATED,
)
async def api_add_select_column(
    payload: SelectColumnCreate,  
    request: Request,           
    db: AsyncSession = Depends(get_db),
):
    """Add a *select* column to *table_id* and populate with *options*."""
    tbl = await db.get(TableMeta, payload.table_id)
    if not tbl:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "table not found")

    # Read ui_type from raw JSON body to support multi_select without changing schemas
    body = await request.json()
    raw_ui = (body or {}).get("ui_type")
    ui_type = raw_ui if raw_ui in {"single_select", "multi_select"} else "single_select"

    column = await add_select_column_with_options(
        db=db,
        table_obj=tbl,
        name=payload.name,
        options=payload.options,
        ui_type=ui_type,
    )
    return column

# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

@router.get(
    "/{column_id}",
    response_model=List[SelectOptionRead],
)
async def api_list_select_options(
    column_id: str,
    db: AsyncSession = Depends(get_db),
):
    
    """Return every option belonging to *column_id*."""
    return await get_select_options(db, column_id)

# ---------------------------------------------------------------------------
# Update (full replace)
# ---------------------------------------------------------------------------

@router.put(
    "/{column_id}",
    response_model=List[SelectOptionRead],
)
async def api_update_select_options(
    column_id: str,
    payload: SelectOptionBulkUpdate,  # {"options": [...]}
    db: AsyncSession = Depends(get_db),
):
    """Synchronise *column_id*'s option list with *payload.options*."""
    try:
        return await update_select_options(db, column_id, payload.options)
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc

# ---------------------------------------------------------------------------
# Delete column + options
# ---------------------------------------------------------------------------

@router.delete(
    "/{column_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def api_delete_select_column(
    column_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Drop the physical column and (via FK‑cascade) every option row."""
    try:
        await delete_select_column(db, column_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc

    logger.info("Removed select column %s", column_id)


@router.post("/{column_id}/assign")
async def assign_option(
    column_id: str,
    payload: AssignSelectOption,
    db: AsyncSession = Depends(get_db),
):
    return await assign_select_option(
        db,
        column_id=column_id,
        row_id=payload.row_id,
        option_id=payload.option_id,
    )


@router.post("/{column_id}/assign-multi")
async def assign_multi_options(
    column_id: str,
    payload: dict,  # {"row_id": int, "option_ids": List[str]}
    db: AsyncSession = Depends(get_db),
):
    return await assign_multi_select_options(
        db,
        column_id=column_id,
        row_id=payload["row_id"],
        option_ids=payload.get("option_ids"),
    )