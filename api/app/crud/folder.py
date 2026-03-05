from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func, update
from sqlalchemy.orm import selectinload
from app.models import Folder, Document, ProcessRecordingSession
from app.utils import gen_suffix
import logging

logger = logging.getLogger(__name__)

async def get_folder(db: AsyncSession, folder_id: str) -> Optional[Folder]:
    stmt = select(Folder).where(Folder.id == folder_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()

async def _update_children_privacy(
    db: AsyncSession,
    folder_id: str,
    is_private: bool,
    owner_id: Optional[str]
) -> None:
    """Recursively update privacy for all children of a folder"""
    # Update documents directly in this folder
    await db.execute(
        update(Document)
        .where(Document.folder_id == folder_id)
        .values(is_private=is_private, owner_id=owner_id if is_private else None)
    )
    
    # Update workflows directly in this folder
    await db.execute(
        update(ProcessRecordingSession)
        .where(ProcessRecordingSession.folder_id == folder_id)
        .values(is_private=is_private, owner_id=owner_id if is_private else None)
    )
    
    # Get child folders
    child_stmt = select(Folder).where(Folder.parent_id == folder_id)
    result = await db.execute(child_stmt)
    child_folders = result.scalars().all()
    
    # Update each child folder and recursively update its children
    for child in child_folders:
        child.is_private = is_private
        child.owner_id = owner_id if is_private else None
        # Recursively update this child folder's children
        await _update_children_privacy(db, child.id, is_private, owner_id)

async def create_folder(
    db: AsyncSession,
    *,
    name: str,
    project_id: str,
    parent_id: Optional[str] = None,
    position: Optional[int] = None,
    icon: Optional[str] = None,
    is_private: bool = False,
    owner_id: Optional[str] = None,
) -> Folder:
    """Create a new folder"""
    folder_id = gen_suffix(16)
    
    # Calculate path and depth
    if parent_id:
        parent = await get_folder(db, parent_id)
        if parent:
            path = f"{parent.path}{folder_id}/"
            depth = parent.depth + 1
            # Inherit privacy from parent if creating inside a private folder
            if parent.is_private and not is_private:
                is_private = True
                owner_id = parent.owner_id
        else:
            path = f"{folder_id}/"
            depth = 0
    else:
        path = f"{folder_id}/"
        depth = 0
    
    # Determine position - use is_(None) for proper NULL comparison
    if position is None:
        if parent_id:
            pos_stmt = select(func.coalesce(func.max(Folder.position), -1) + 1).where(
                and_(
                    Folder.project_id == project_id,
                    Folder.parent_id == parent_id,
                )
            )
        else:
            pos_stmt = select(func.coalesce(func.max(Folder.position), -1) + 1).where(
                and_(
                    Folder.project_id == project_id,
                    Folder.parent_id.is_(None),
                    Folder.is_private == is_private,
                )
            )
        pos_result = await db.execute(pos_stmt)
        position = pos_result.scalar() or 0
    
    folder = Folder(
        id=folder_id,
        name=name,
        project_id=project_id,
        parent_id=parent_id,
        path=path,
        depth=depth,
        position=position,
        icon=icon,
        is_private=is_private,
        owner_id=owner_id if is_private else None,
    )
    
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    return folder

async def update_folder(
    db: AsyncSession,
    folder_id: str,
    *,
    name: Optional[str] = None,
    icon: Optional[str] = None,
    is_private: Optional[bool] = None,
    owner_id: Optional[str] = None,
) -> Folder:
    """Update a folder"""
    folder = await get_folder(db, folder_id)
    if not folder:
        raise ValueError("Folder not found")
    
    if name is not None:
        folder.name = name
    if icon is not None:
        folder.icon = icon
    if is_private is not None and is_private != folder.is_private:
        folder.is_private = is_private
        folder.owner_id = owner_id if is_private else None
        # Update all children's privacy as well
        await _update_children_privacy(db, folder_id, is_private, owner_id if is_private else None)
    
    await db.commit()
    await db.refresh(folder)
    return folder

async def get_folder_tree(
    db: AsyncSession,
    project_id: str,
    parent_id: Optional[str] = None,
    depth_limit: Optional[int] = None,
    user_id: Optional[str] = None,
    is_private: Optional[bool] = None,
) -> List[dict]:
    """Get hierarchical folder tree with documents and workflows"""
    
    # Build base conditions for folders
    folder_conditions = [Folder.project_id == project_id]
    
    # Handle parent_id - need explicit None check
    if parent_id is None:
        folder_conditions.append(Folder.parent_id.is_(None))
    else:
        folder_conditions.append(Folder.parent_id == parent_id)
    
    # Apply privacy filter
    if is_private is not None:
        folder_conditions.append(Folder.is_private == is_private)
        if is_private and user_id:
            folder_conditions.append(Folder.owner_id == user_id)
    elif user_id:
        # Show shared items OR private items owned by user
        folder_conditions.append(
            or_(
                Folder.is_private == False,
                and_(Folder.is_private == True, Folder.owner_id == user_id)
            )
        )
    
    # Get folders
    folder_stmt = select(Folder).where(and_(*folder_conditions)).order_by(Folder.position)
    folder_result = await db.execute(folder_stmt)
    folders = folder_result.scalars().all()
    
    # Build document conditions
    doc_conditions = [Document.project_id == project_id]
    
    if parent_id is None:
        doc_conditions.append(Document.folder_id.is_(None))
    else:
        doc_conditions.append(Document.folder_id == parent_id)
    
    # Apply privacy filter for documents
    if is_private is not None:
        doc_conditions.append(Document.is_private == is_private)
        if is_private and user_id:
            doc_conditions.append(Document.owner_id == user_id)
    elif user_id:
        doc_conditions.append(
            or_(
                Document.is_private == False,
                and_(Document.is_private == True, Document.owner_id == user_id)
            )
        )
    
    # Exclude soft-deleted documents
    doc_conditions.append(Document.deleted_at.is_(None))

    # Get documents at this level
    doc_stmt = select(Document).where(and_(*doc_conditions)).order_by(Document.position)
    doc_result = await db.execute(doc_stmt)
    documents = doc_result.scalars().all()
    
    # Build workflow conditions
    workflow_conditions = [ProcessRecordingSession.project_id == project_id]
    
    if parent_id is None:
        workflow_conditions.append(ProcessRecordingSession.folder_id.is_(None))
    else:
        workflow_conditions.append(ProcessRecordingSession.folder_id == parent_id)
    
    # Apply privacy filter for workflows
    if is_private is not None:
        workflow_conditions.append(ProcessRecordingSession.is_private == is_private)
        if is_private and user_id:
            workflow_conditions.append(ProcessRecordingSession.owner_id == user_id)
    elif user_id:
        workflow_conditions.append(
            or_(
                ProcessRecordingSession.is_private == False,
                and_(ProcessRecordingSession.is_private == True, ProcessRecordingSession.owner_id == user_id)
            )
        )
    
    # Exclude soft-deleted workflows
    workflow_conditions.append(ProcessRecordingSession.deleted_at.is_(None))

    # Get workflows at this level
    workflow_stmt = select(ProcessRecordingSession).where(
        and_(*workflow_conditions)
    ).order_by(ProcessRecordingSession.position)
    workflow_result = await db.execute(workflow_stmt)
    workflows = workflow_result.scalars().all()
    
    tree = []
    
    # Add folders with their children
    for folder in folders:
        children = []
        if depth_limit is None or folder.depth < depth_limit:
            children = await get_folder_tree(
                db, project_id, folder.id, depth_limit, user_id, is_private
            )
        
        tree.append({
            "id": folder.id,
            "name": folder.name,
            "icon": folder.icon,
            "parent_id": folder.parent_id,
            "path": folder.path,
            "depth": folder.depth,
            "position": folder.position,
            "is_expanded": folder.is_expanded,
            "is_folder": True,
            "is_workflow": False,
            "is_private": folder.is_private,
            "owner_id": folder.owner_id,
            "children": children,
        })
    
    # Add documents (no children)
    for doc in documents:
        tree.append({
            "id": doc.id,
            "name": doc.name,
            "icon": None,
            "parent_id": doc.folder_id,
            "path": "",
            "depth": 0,
            "position": doc.position,
            "is_expanded": False,
            "is_folder": False,
            "is_workflow": False,
            "is_private": doc.is_private,
            "owner_id": doc.owner_id,
            "source_file_mime": doc.source_file_mime,
            "children": [],
        })
    
    # Add workflows (no children)
    for workflow in workflows:
        tree.append({
            "id": workflow.id,
            "name": workflow.name,
            "icon": None,
            "parent_id": workflow.folder_id,
            "path": "",
            "depth": 0,
            "position": workflow.position,
            "is_expanded": workflow.is_expanded,
            "is_folder": False,
            "is_workflow": True,
            "is_private": workflow.is_private,
            "owner_id": workflow.owner_id,
            "children": [],
        })
    
    # Sort by position
    tree.sort(key=lambda x: x["position"])
    
    return tree

async def move_folder(
    db: AsyncSession,
    folder_id: str,
    new_parent_id: Optional[str],
    new_position: Optional[int] = None,
    is_private: Optional[bool] = None,
    owner_id: Optional[str] = None,
) -> Folder:
    """Move a folder to a new parent and/or position"""
    folder = await get_folder(db, folder_id)
    if not folder:
        raise ValueError("Folder not found")
    
    old_parent_id = folder.parent_id
    old_position = folder.position
    old_is_private = folder.is_private
    
    # Handle privacy change - update this folder and all its children
    if is_private is not None and is_private != old_is_private:
        folder.is_private = is_private
        folder.owner_id = owner_id if is_private else None
        # Recursively update all children's privacy
        await _update_children_privacy(db, folder_id, is_private, owner_id if is_private else None)
    
    # Determine new_position if not provided
    if new_position is None:
        target_is_private = is_private if is_private is not None else folder.is_private
        if new_parent_id:
            pos_stmt = select(func.coalesce(func.max(Folder.position), -1) + 1).where(
                and_(
                    Folder.project_id == folder.project_id,
                    Folder.parent_id == new_parent_id,
                )
            )
        else:
            pos_stmt = select(func.coalesce(func.max(Folder.position), -1) + 1).where(
                and_(
                    Folder.project_id == folder.project_id,
                    Folder.parent_id.is_(None),
                    Folder.is_private == target_is_private,
                )
            )
        pos_result = await db.execute(pos_stmt)
        new_position = pos_result.scalar() or 0
    
    # Update path if parent changed
    if new_parent_id != old_parent_id:
        if new_parent_id:
            new_parent = await get_folder(db, new_parent_id)
            if new_parent:
                new_path = f"{new_parent.path}{folder_id}/"
                new_depth = new_parent.depth + 1
            else:
                new_path = f"{folder_id}/"
                new_depth = 0
        else:
            new_path = f"{folder_id}/"
            new_depth = 0
        
        folder.path = new_path
        folder.depth = new_depth
    
    folder.parent_id = new_parent_id
    folder.position = new_position
    
    await db.commit()
    await db.refresh(folder)
    return folder

async def toggle_folder_expansion(
    db: AsyncSession,
    folder_id: str,
    is_expanded: bool,
) -> Folder:
    """Toggle folder expansion state"""
    folder = await get_folder(db, folder_id)
    if not folder:
        raise ValueError("Folder not found")
    
    folder.is_expanded = is_expanded
    await db.commit()
    await db.refresh(folder)
    return folder

async def duplicate_folder(
    db: AsyncSession,
    folder_id: str,
    include_children: bool = False,
) -> Folder:
    """Duplicate a folder"""
    original = await get_folder(db, folder_id)
    if not original:
        raise ValueError("Folder not found")
    
    new_folder = await create_folder(
        db,
        name=f"{original.name} (Copy)",
        project_id=original.project_id,
        parent_id=original.parent_id,
        icon=original.icon,
        is_private=original.is_private,
        owner_id=original.owner_id,
    )
    
    return new_folder

async def delete_folder(db: AsyncSession, folder_id: str) -> None:
    """Delete a folder and all its contents"""
    folder = await get_folder(db, folder_id)
    if not folder:
        raise ValueError("Folder not found")
    
    await db.delete(folder)
    await db.commit()
