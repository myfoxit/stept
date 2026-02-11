from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.models import Sort, ColumnMeta, TableMeta, User
from app.schemas.sort import SortCreate, SortRead, SortUpdate
from app.security import get_current_user

router = APIRouter()

@router.post("/", response_model=SortRead)
async def create_sort(
    sort_in: SortCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new sort condition."""
    # Check if sort already exists for this column
    existing = await db.scalar(
        select(Sort).where(
            Sort.table_id == sort_in.table_id,
            Sort.user_id == current_user.id,
            Sort.column_id == sort_in.column_id,
        )
    )
    
    if existing:
        # Update existing sort instead of creating duplicate
        existing.direction = sort_in.direction
        existing.priority = sort_in.priority
        existing.is_active = sort_in.is_active
        await db.commit()
        await db.refresh(existing)
        return existing
    
    # Create new sort
    sort = Sort(
        **sort_in.model_dump(),
        user_id=current_user.id,
    )
    db.add(sort)
    await db.commit()
    await db.refresh(sort)
    return sort

@router.get("/", response_model=List[SortRead])
async def list_sorts(
    table_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all sorts for current user, optionally filtered by table."""
    query = select(Sort).where(Sort.user_id == current_user.id)
    
    if table_id:
        query = query.where(Sort.table_id == table_id)
    
    query = query.order_by(Sort.priority)
    result = await db.execute(query)
    return result.scalars().all()

@router.patch("/{sort_id}", response_model=SortRead)
async def update_sort(
    sort_id: str,
    sort_update: SortUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a sort condition."""
    sort = await db.get(Sort, sort_id)
    if not sort:
        raise HTTPException(404, "Sort not found")
    if sort.user_id != current_user.id:
        raise HTTPException(403, "Not authorized")
    
    for field, value in sort_update.model_dump(exclude_unset=True).items():
        setattr(sort, field, value)
    
    await db.commit()
    await db.refresh(sort)
    return sort

@router.delete("/{sort_id}")
async def delete_sort(
    sort_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a sort condition."""
    sort = await db.get(Sort, sort_id)
    if not sort:
        raise HTTPException(404, "Sort not found")
    if sort.user_id != current_user.id:
        raise HTTPException(403, "Not authorized")
    
    await db.delete(sort)
    await db.commit()
    return {"deleted": sort_id}

@router.delete("/table/{table_id}")
async def clear_table_sorts(
    table_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Clear all sorts for a table."""
    await db.execute(
        delete(Sort).where(
            Sort.table_id == table_id,
            Sort.user_id == current_user.id,
        )
    )
    await db.commit()
    return {"message": "All sorts cleared"}
