# app/crud/document.py
from typing import Optional, Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func, delete, update
from sqlalchemy.orm import selectinload
from app.models import Document, project_members, Project, ProjectRole
from app.utils import gen_suffix
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

async def get_document(db: AsyncSession, doc_id: str) -> Optional[Document]:
    stmt = select(Document).where(
        and_(Document.id == doc_id, Document.deleted_at.is_(None))
    ).options(
        selectinload(Document.folder)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()

async def create_document(
    db: AsyncSession,
    *,
    name: Optional[str],
    content: Dict[str, Any],
    page_layout: str = "document",
    project_id: str,
    folder_id: Optional[str] = None,
    is_private: bool = False,
    owner_id: Optional[str] = None,
) -> Document:
    """Create a new document - must be in a folder"""
    
    # If folder_id is provided, check if the folder is private and inherit settings
    if folder_id:
        from app.models import Folder
        folder_stmt = select(Folder).where(Folder.id == folder_id)
        folder_result = await db.execute(folder_stmt)
        parent_folder = folder_result.scalar_one_or_none()
        
        if parent_folder:
            # Inherit privacy from parent folder
            if parent_folder.is_private:
                is_private = True
                owner_id = parent_folder.owner_id
    
    # Validate folder exists if not provided, get or create a default folder
    if not folder_id:
        # Get or create a default "Documents" folder for the project
        from app.models import Folder
        stmt = select(Folder).where(
            and_(
                Folder.project_id == project_id,
                Folder.name == "Documents",
                Folder.parent_id.is_(None),
                Folder.is_private == is_private,  # NEW: Match privacy
            )
        )
        result = await db.execute(stmt)
        default_folder = result.scalar_one_or_none()
        
        if not default_folder:
            # Create default folder
            default_folder = Folder(
                id=gen_suffix(16),
                name="Documents",
                project_id=project_id,
                parent_id=None,
                path=f"{gen_suffix(16)}/",
                depth=0,
                position=0,
                is_expanded=True,
                is_private=is_private,  # NEW
                owner_id=owner_id if is_private else None,  # NEW
            )
            db.add(default_folder)
            await db.flush()
        
        folder_id = default_folder.id
    
    page_layout = page_layout or "document"
    doc_id = gen_suffix(16)

    # NEW: determine position at end of siblings (same project + folder + privacy)
    pos_stmt = select(func.coalesce(func.max(Document.position), -1) + 1).where(
        and_(
            Document.project_id == project_id,
            Document.folder_id == folder_id,
            Document.is_private == is_private,  # NEW
        )
    )
    pos_result = await db.execute(pos_stmt)
    position = pos_result.scalar() or 0
    
    doc = Document(
        id=doc_id,
        name=name,
        content=content,
        page_layout=page_layout,
        project_id=project_id,
        folder_id=folder_id,
        position=position,
        is_private=is_private,  # NEW
        owner_id=owner_id if is_private else None,  # NEW
    )
    
    db.add(doc)
    await db.commit()
    
    # Refresh and eagerly load relationships
    stmt = select(Document).where(Document.id == doc.id).options(
        selectinload(Document.project),
        selectinload(Document.folder)
    )
    result = await db.execute(stmt)
    return result.scalar_one()

async def update_document(
    db: AsyncSession,
    doc_id: str,
    *,
    name: Optional[str] = None,
    content: Optional[Dict[str, Any]] = None,
    page_layout: Optional[str] = None,
    folder_id: Optional[str] = None,
    is_private: Optional[bool] = None,  # NEW
    owner_id: Optional[str] = None,  # NEW
) -> Document:
    # First get the document with eager loading
    stmt = select(Document).where(Document.id == doc_id).options(
        selectinload(Document.folder)
    )
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()
    
    if not doc:
        raise ValueError("document not found")
    
    if name is not None:
        doc.name = name
    if content is not None:
        doc.content = content
    if page_layout is not None:
        doc.page_layout = page_layout
    if folder_id is not None:
        doc.folder_id = folder_id
    if is_private is not None:  # NEW
        doc.is_private = is_private
        doc.owner_id = owner_id if is_private else None
    
    await db.commit()
    
    # Refresh with eager loading
    await db.refresh(doc)
    stmt = select(Document).where(Document.id == doc_id).options(
        selectinload(Document.folder)
    )
    result = await db.execute(stmt)
    return result.scalar_one()

async def get_documents(
    db: AsyncSession,
    *,
    skip: int = 0,
    limit: int = 100,
) -> List[Document]:
    stmt = select(Document).where(
        Document.deleted_at.is_(None)
    ).options(
        selectinload(Document.folder)
    ).offset(skip).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()

async def move_document(
    db: AsyncSession,
    doc_id: str,
    new_folder_id: Optional[str],
    new_position: Optional[int] = None,
    is_private: Optional[bool] = None,  # NEW
    owner_id: Optional[str] = None,  # NEW
) -> Document:
    """Move a document to a new folder and/or position"""
    # Get the document to move
    stmt = select(Document).where(Document.id == doc_id).options(
        selectinload(Document.folder),
        
    )
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()
    
    if not doc:
        raise ValueError("Document not found")
    
    # Validate new folder exists if specified
    if new_folder_id:
        from app.models import Folder
        folder_stmt = select(Folder).where(Folder.id == new_folder_id)
        folder_result = await db.execute(folder_stmt)
        new_folder = folder_result.scalar_one_or_none()
        
        if not new_folder:
            raise ValueError("Target folder not found")
        
        # Ensure folder is in the same project
        if new_folder.project_id != doc.project_id:
            raise ValueError("Cannot move document to a folder in a different project")
    
    old_folder_id = doc.folder_id
    old_position = doc.position
    old_is_private = doc.is_private
    
    # NEW: Handle privacy change
    if is_private is not None and is_private != old_is_private:
        doc.is_private = is_private
        doc.owner_id = owner_id if is_private else None

    # Determine new_position if not provided
    target_is_private = is_private if is_private is not None else doc.is_private
    if new_position is None:
        pos_stmt = select(func.coalesce(func.max(Document.position), -1) + 1).where(
            and_(
                Document.project_id == doc.project_id,
                Document.folder_id == new_folder_id,
                Document.is_private == target_is_private,  # NEW
            )
        )
        pos_result = await db.execute(pos_stmt)
        new_position = pos_result.scalar() or 0

    # Shift positions in destination and source similar to move_folder
    if old_folder_id == new_folder_id:
        # Moving within same folder
        if old_position < new_position:
            # Moving down: decrement positions between old_position+1 and new_position
            await db.execute(
                update(Document)
                .where(
                    and_(
                        Document.project_id == doc.project_id,
                        Document.folder_id == old_folder_id,
                        Document.position > old_position,
                        Document.position <= new_position,
                        Document.id != doc_id,
                    )
                )
                .values(position=Document.position - 1)
            )
        elif old_position > new_position:
            # Moving up: increment positions between new_position and old_position-1
            await db.execute(
                update(Document)
                .where(
                    and_(
                        Document.project_id == doc.project_id,
                        Document.folder_id == old_folder_id,
                        Document.position >= new_position,
                        Document.position < old_position,
                        Document.id != doc_id,
                    )
                )
                .values(position=Document.position + 1)
            )
    else:
        # Moving to different folder (including root)
        # Shift positions at destination: bump >= new_position
        await db.execute(
            update(Document)
            .where(
                and_(
                    Document.project_id == doc.project_id,
                    Document.folder_id == new_folder_id,
                    Document.position >= new_position,
                )
            )
            .values(position=Document.position + 1)
        )
        # Close gap at source: compact positions > old_position
        await db.execute(
            update(Document)
            .where(
                and_(
                    Document.project_id == doc.project_id,
                    Document.folder_id == old_folder_id,
                    Document.position > old_position,
                )
            )
            .values(position=Document.position - 1)
        )

    doc.folder_id = new_folder_id
    doc.position = new_position
    
    await db.commit()
    
    # Refresh with eager loading
    await db.refresh(doc)
    stmt = select(Document).where(Document.id == doc_id).options(
        selectinload(Document.folder)
    )
    result = await db.execute(stmt)
    return result.scalar_one()

async def duplicate_document(
    db: AsyncSession,
    doc_id: str,
    include_children: bool = False,  # This parameter is now ignored since documents don't have children
) -> Document:
    """Duplicate a document"""
    # Get original document
    stmt = select(Document).where(Document.id == doc_id).options(
        selectinload(Document.folder)
    )
    result = await db.execute(stmt)
    original = result.scalar_one_or_none()
    
    if not original:
        raise ValueError("Document not found")

    # NEW: shift positions after original in same folder
    await db.execute(
        update(Document)
        .where(
            and_(
                Document.project_id == original.project_id,
                Document.folder_id == original.folder_id,
                Document.position > original.position,
            )
        )
        .values(position=Document.position + 1)
    )
    
    # Create copy right after original
    new_doc = await create_document(
        db,
        name=f"{original.name} (Copy)" if original.name else "Untitled (Copy)",
        content=original.content.copy() if original.content else {},
        page_layout=original.page_layout,
        project_id=original.project_id,
        folder_id=original.folder_id,
    )
    # Force its position to original.position + 1
    new_doc_stmt = (
        update(Document)
        .where(Document.id == new_doc.id)
        .values(position=original.position + 1)
        .returning(Document.id)
    )
    await db.execute(new_doc_stmt)
    await db.commit()

    # Reload with relations
    stmt = select(Document).where(Document.id == new_doc.id).options(
        selectinload(Document.folder)
    )
    result = await db.execute(stmt)
    return result.scalar_one()

async def delete_document(db: AsyncSession, doc_id: str) -> None:
    """Soft-delete a document (set deleted_at timestamp)"""
    stmt = select(Document).where(Document.id == doc_id)
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()
    
    if not doc:
        raise ValueError("document not found")
    
    doc.deleted_at = datetime.utcnow()
    await db.commit()
    logger.info(f"Soft-deleted document {doc_id}")


async def restore_document(db: AsyncSession, doc_id: str) -> Document:
    """Restore a soft-deleted document"""
    stmt = select(Document).where(
        and_(Document.id == doc_id, Document.deleted_at.isnot(None))
    ).options(selectinload(Document.folder))
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()
    
    if not doc:
        raise ValueError("document not found or not deleted")
    
    doc.deleted_at = None
    await db.commit()
    await db.refresh(doc)
    logger.info(f"Restored document {doc_id}")
    return doc


async def permanent_delete_document(db: AsyncSession, doc_id: str) -> None:
    """Permanently delete a document from the database"""
    stmt = select(Document).where(Document.id == doc_id)
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()
    
    if not doc:
        raise ValueError("document not found")
    
    await db.delete(doc)
    await db.commit()
    logger.info(f"Permanently deleted document {doc_id}")


async def get_deleted_documents(
    db: AsyncSession,
    project_id: str,
    user_id: Optional[str] = None,
) -> List[Document]:
    """Get all soft-deleted documents for a project (trash view)"""
    conditions = [
        Document.project_id == project_id,
        Document.deleted_at.isnot(None),
    ]
    if user_id:
        conditions.append(
            or_(
                Document.is_private == False,
                and_(Document.is_private == True, Document.owner_id == user_id)
            )
        )
    
    stmt = select(Document).where(and_(*conditions)).order_by(
        Document.deleted_at.desc()
    ).options(selectinload(Document.folder))
    result = await db.execute(stmt)
    return list(result.scalars().all())

async def get_documents_for_user(
    db: AsyncSession,
    user_id: str,
    *,
    skip: int = 0,
    limit: int = 100,
) -> List[Document]:
    stmt = (
        select(Document)
        .join(Project, Project.id == Document.project_id)
        .outerjoin(project_members, project_members.c.project_id == Document.project_id)
        .where(
            or_(
                project_members.c.user_id == user_id,
                Project.owner_id == user_id,
            )
        )
        
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return result.scalars().all().limit(limit)
    
    result = await db.execute(stmt)
    
    return result.scalars().all()


async def get_filtered_documents(
    db: AsyncSession,
    project_id: str,
    folder_id: Optional[str] = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
    skip: int = 0,
    limit: int = 100,
    user_id: Optional[str] = None,  # NEW: Required for privacy filtering
) -> List[Document]:
    """Get filtered documents with sorting options"""
    
    # Base query - exclude soft-deleted
    conditions = [Document.project_id == project_id, Document.deleted_at.is_(None)]
    
    # NEW: Apply privacy filter - only show shared OR user's own private docs
    if user_id:
        conditions.append(
            or_(
                Document.is_private == False,
                and_(Document.is_private == True, Document.owner_id == user_id)
            )
        )
    else:
        # If no user_id, only show shared documents
        conditions.append(Document.is_private == False)
    
    stmt = select(Document).where(and_(*conditions))
    
    # Apply sorting
    if sort_by == "name":
        order_col = Document.name
    elif sort_by == "updated_at":
        order_col = Document.updated_at
    else:  # Default to created_at
        order_col = Document.created_at
    
    if sort_order == "asc":
        stmt = stmt.order_by(order_col.asc(), Document.position.asc())
    else:
        stmt = stmt.order_by(order_col.desc(), Document.position.asc())
    
    # Apply pagination
    stmt = stmt.options(
        selectinload(Document.project),
        selectinload(Document.folder)
    ).offset(skip).limit(limit)
    
    result = await db.execute(stmt)
    return result.scalars().all()
           

async def toggle_document_expansion(
    db: AsyncSession,
    doc_id: str,
    is_expanded: bool,
) -> Document:
    """Toggle document expansion state in UI"""
    stmt = select(Document).where(Document.id == doc_id)
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()
    
    if not doc:
        raise ValueError("Document not found")
    
    doc.is_expanded = is_expanded
    await db.commit()
    await db.refresh(doc)
    
    return doc
