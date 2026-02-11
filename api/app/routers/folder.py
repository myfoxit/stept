from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from app.database import get_session as get_db
from app.schemas.folder import (
    FolderRead, 
    FolderCreate, 
    FolderUpdate,
    FolderMove,
    FolderTreeRead,
)
from app.crud.folder import (
    get_folder,
    create_folder,
    update_folder,
    get_folder_tree,
    move_folder,
    toggle_folder_expansion,
    duplicate_folder,
    delete_folder,
)
from app.security import get_current_user
from app.models import User

router = APIRouter()

# Get folder tree
@router.get("/tree", response_model=List[FolderTreeRead])
async def api_get_folder_tree(
    project_id: str = Query(...),
    parent_id: Optional[str] = Query(None),
    depth_limit: Optional[int] = Query(None),
    is_private: Optional[bool] = Query(None),  # NEW: Filter by privacy
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get hierarchical folder tree for a project"""
    return await get_folder_tree(
        db, 
        project_id=project_id,
        parent_id=parent_id,
        depth_limit=depth_limit,
        user_id=current_user.id,  # NEW: Pass user_id for privacy filtering
        is_private=is_private,  # NEW
    )

# Create new folder
@router.post("/", response_model=FolderRead, status_code=201)
async def api_create_folder(
    payload: FolderCreate, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return await create_folder(
        db, 
        name=payload.name,
        project_id=payload.project_id,
        parent_id=payload.parent_id,
        position=payload.position,
        icon=payload.icon,
        is_private=payload.is_private if payload.is_private is not None else False,
        owner_id=current_user.id,  # Always pass current user, CRUD will use it only if is_private
    )

# Get single folder
@router.get("/{folder_id}", response_model=FolderRead)
async def api_get_folder(folder_id: str, db: AsyncSession = Depends(get_db)):
    folder = await get_folder(db, folder_id)
    if not folder:
        raise HTTPException(404, "Folder not found")
    return folder

# Update folder
@router.put("/{folder_id}", response_model=FolderRead)
async def api_update_folder(
    folder_id: str, 
    payload: FolderUpdate, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)  # NEW
):
    return await update_folder(
        db,
        folder_id,
        name=payload.name,
        icon=payload.icon,
        is_private=payload.is_private,  # NEW
    )

# Move folder
@router.put("/{folder_id}/move", response_model=FolderRead)
async def api_move_folder(
    folder_id: str,
    payload: FolderMove,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Move folder to new parent and/or position"""
    try:
        return await move_folder(
            db,
            folder_id=folder_id,
            new_parent_id=payload.parent_id,
            new_position=payload.position,
            is_private=payload.is_private,  # NEW
            owner_id=current_user.id if payload.is_private else None,  # NEW
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

# Toggle expansion
@router.patch("/{folder_id}/expand")
async def api_toggle_folder_expansion(
    folder_id: str,
    is_expanded: bool = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Toggle folder expansion state"""
    try:
        folder = await toggle_folder_expansion(db, folder_id, is_expanded)
        return {"id": folder.id, "is_expanded": folder.is_expanded}
    except ValueError as e:
        raise HTTPException(404, str(e))

# Duplicate folder
@router.post("/{folder_id}/duplicate", response_model=FolderRead)
async def api_duplicate_folder(
    folder_id: str,
    include_children: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Duplicate a folder and optionally its children"""
    try:
        return await duplicate_folder(
            db,
            folder_id=folder_id,
            include_children=include_children
        )
    except ValueError as e:
        raise HTTPException(404, str(e))

# Delete folder
@router.delete("/{folder_id}", status_code=204)
async def api_delete_folder(
    folder_id: str, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        await delete_folder(db, folder_id)
    except ValueError as e:
        raise HTTPException(404, str(e))
