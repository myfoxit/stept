# app/api/document.py
from fastapi import APIRouter, Depends, HTTPException, Response, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional, List
from app.database import get_session as get_db
from app.schemas.document import (
    DocumentRead, 
    DocumentCreate, 
    DocumentUpdate,
    DocumentMove
)
from app.crud.document import (
    get_document,
    create_document,
    update_document,
    get_documents,
    delete_document,
    get_filtered_documents,
    move_document,           
    duplicate_document,      
)
from app.security import get_current_user, check_project_permission
from app.models import User, ProjectRole
from app.services.search_indexer import update_document_search

router = APIRouter()


async def _check_doc_access(db, doc, current_user, required_role=ProjectRole.VIEWER):
    """Check user can access document. Raises 404 for private docs, 403 for no access."""
    if doc.is_private and doc.owner_id != current_user.id:
        raise HTTPException(404, "document not found")
    if doc.project_id:
        await check_project_permission(db, current_user.id, doc.project_id, required_role)

# List all documents (must come before /{doc_id})
@router.get("/", response_model=list[DocumentRead])
async def api_list_documents(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    return await get_documents(db, skip=skip, limit=limit)

# Add new endpoint for filtered documents
@router.get("/filtered", response_model=List[DocumentRead])
async def api_get_filtered_documents(
    project_id: str = Query(...),
    folder_id: Optional[str] = Query(None, description="Filter by folder"),
    sort_by: str = Query("created_at", description="Sort by: created_at, updated_at, name"),
    sort_order: str = Query("desc", description="Sort order: asc, desc"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get filtered documents with sorting"""
    return await get_filtered_documents(
        db,
        project_id=project_id,
        folder_id=folder_id,
        sort_by=sort_by,
        sort_order=sort_order,
        skip=skip,
        limit=limit,
        user_id=current_user.id,  # NEW: Pass user_id for privacy filtering
    )

# Create new document
@router.post("/", response_model=DocumentRead, status_code=201)
async def api_create_document(
    payload: DocumentCreate, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    doc = await create_document(
        db, 
        name=payload.name, 
        content=payload.content,
        page_layout=payload.page_layout or "document",
        project_id=payload.project_id,
        folder_id=payload.folder_id,
        is_private=payload.is_private if payload.is_private is not None else True,
        owner_id=current_user.id,  # Always pass current user, CRUD will use it only if is_private
    )
    await update_document_search(db, doc.id, doc.name, doc.content)
    await db.commit()
    return doc

# Get single document
@router.get("/{doc_id}")
async def api_get_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = await get_document(db, doc_id)
    if not doc:
        raise HTTPException(404, "document not found")
    
    await _check_doc_access(db, doc, current_user)
    
    # Determine effective permission
    permission = "edit"  # default for project members / owner
    if doc.owner_id and doc.owner_id != current_user.id:
        # Check if user has a specific share permission
        from app.models import ResourceShare
        share = await db.scalar(
            select(ResourceShare).where(
                ResourceShare.resource_type == "document",
                ResourceShare.resource_id == doc_id,
                ResourceShare.shared_with_user_id == current_user.id,
            )
        )
        if share:
            permission = share.permission
    
    # Return as dict to include permission
    result = {
        "id": doc.id,
        "name": doc.name,
        "content": doc.content,
        "page_layout": doc.page_layout,
        "project_id": doc.project_id,
        "folder_id": doc.folder_id,
        "position": doc.position,
        "is_private": doc.is_private,
        "owner_id": doc.owner_id,
        "version": doc.version if hasattr(doc, 'version') else 1,
        "created_at": doc.created_at,
        "updated_at": doc.updated_at,
        "permission": permission,
    }
    return result

# Update document
@router.put("/{doc_id}", response_model=DocumentRead)
async def api_update_document(
    doc_id: str,
    payload: DocumentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import json
    from datetime import datetime, timedelta
    from app.models import DocumentVersion
    from app.utils import gen_suffix

    doc = await get_document(db, doc_id)
    if not doc:
        raise HTTPException(404, "document not found")
    
    await _check_doc_access(db, doc, current_user, ProjectRole.EDITOR)
    
    # Check edit permission: owner, or has edit ResourceShare
    if doc.owner_id and doc.owner_id != current_user.id:
        from app.models import ResourceShare
        share = await db.scalar(
            select(ResourceShare).where(
                ResourceShare.resource_type == "document",
                ResourceShare.resource_id == doc_id,
                ResourceShare.shared_with_user_id == current_user.id,
            )
        )
        if share and share.permission != "edit":
            raise HTTPException(403, "View-only access — cannot edit")

    # --- Optimistic concurrency ---
    if payload.version is not None and payload.version != doc.version:
        raise HTTPException(409, detail="Document was modified. Please reload.")
    
    # --- Content validation ---
    if payload.content is not None:
        content_json = json.dumps(payload.content)
        if len(content_json) > 10 * 1024 * 1024:
            raise HTTPException(422, "Content exceeds 10MB limit")
        if not isinstance(payload.content, dict) or payload.content.get("type") != "doc" or not isinstance(payload.content.get("content"), list):
            raise HTTPException(422, "Invalid document content: must have type 'doc' with content array")

    # --- Auto-version on content save ---
    if payload.content is not None and doc.content:
        # Throttle: only create version if last version is >30s old
        last_ver = (await db.execute(
            select(DocumentVersion)
            .where(DocumentVersion.document_id == doc_id)
            .order_by(DocumentVersion.version_number.desc())
            .limit(1)
        )).scalar_one_or_none()
        
        should_version = True
        if last_ver and last_ver.created_at:
            from datetime import timezone
            last_time = last_ver.created_at.replace(tzinfo=None) if last_ver.created_at.tzinfo else last_ver.created_at
            if (datetime.utcnow() - last_time).total_seconds() < 30:
                should_version = False
        
        if should_version:
            old_content_json = json.dumps(doc.content)
            ver = DocumentVersion(
                id=gen_suffix(16),
                document_id=doc_id,
                version_number=doc.version,
                content=doc.content,
                name=doc.name,
                byte_size=len(old_content_json.encode("utf-8")),
                created_by=current_user.id,
            )
            db.add(ver)
            
            # Prune: keep max 100 versions
            count_result = await db.execute(
                select(func.count()).select_from(DocumentVersion).where(DocumentVersion.document_id == doc_id)
            )
            total = count_result.scalar() or 0
            if total > 100:
                old_versions = (await db.execute(
                    select(DocumentVersion.id)
                    .where(DocumentVersion.document_id == doc_id)
                    .order_by(DocumentVersion.version_number.asc())
                    .limit(total - 100)
                )).scalars().all()
                if old_versions:
                    from sqlalchemy import delete as sa_delete
                    await db.execute(
                        sa_delete(DocumentVersion).where(DocumentVersion.id.in_(old_versions))
                    )
        
        doc.version = (doc.version or 1) + 1
    
    updated = await update_document(
        db,
        doc_id,
        name=payload.name,
        content=payload.content,
        page_layout=payload.page_layout,
        folder_id=payload.folder_id,
    )
    await update_document_search(db, updated.id, updated.name, updated.content)
    await db.commit()
    return updated

# Move document
@router.put("/{doc_id}/move", response_model=DocumentRead)
async def api_move_document(
    doc_id: str,
    payload: DocumentMove,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Move document to new folder"""
    doc = await get_document(db, doc_id)
    if not doc:
        raise HTTPException(404, "document not found")
    await _check_doc_access(db, doc, current_user, ProjectRole.EDITOR)
    try:
        return await move_document(
            db,
            doc_id=doc_id,
            new_folder_id=payload.parent_id,
            new_position=payload.position,
            is_private=payload.is_private,  # NEW
            owner_id=current_user.id if payload.is_private else None,  # NEW
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

# Duplicate document
@router.post("/{doc_id}/duplicate", response_model=DocumentRead)
async def api_duplicate_document(
    doc_id: str,
    include_children: bool = Query(False),  # This parameter is now ignored
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Duplicate a document"""
    doc = await get_document(db, doc_id)
    if not doc:
        raise HTTPException(404, "document not found")
    await _check_doc_access(db, doc, current_user, ProjectRole.EDITOR)
    try:
      # reuse imported duplicate_document
        return await duplicate_document(
            db,
            doc_id=doc_id,
            include_children=include_children  # Ignored since documents don't have children
        )
    except ValueError as e:
        raise HTTPException(404, str(e))




# ──────────────────────────────────────────────────────────────────────────────
# VERSION HISTORY ENDPOINTS
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/{doc_id}/versions")
async def api_list_versions(
    doc_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List document versions (without content)."""
    from app.models import DocumentVersion
    doc = await get_document(db, doc_id)
    if not doc:
        raise HTTPException(404, "document not found")
    await _check_doc_access(db, doc, current_user)
    
    result = await db.execute(
        select(
            DocumentVersion.id,
            DocumentVersion.version_number,
            DocumentVersion.name,
            DocumentVersion.byte_size,
            DocumentVersion.created_by,
            DocumentVersion.created_at,
        )
        .where(DocumentVersion.document_id == doc_id)
        .order_by(DocumentVersion.version_number.desc())
        .offset(offset)
        .limit(limit)
    )
    rows = result.all()
    return [
        {
            "id": r.id,
            "version_number": r.version_number,
            "name": r.name,
            "byte_size": r.byte_size,
            "created_by": r.created_by,
            "created_at": r.created_at,
        }
        for r in rows
    ]


@router.get("/{doc_id}/versions/{version_id}")
async def api_get_version(
    doc_id: str,
    version_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a specific version including content."""
    from app.models import DocumentVersion
    doc = await get_document(db, doc_id)
    if not doc:
        raise HTTPException(404, "document not found")
    await _check_doc_access(db, doc, current_user)
    
    ver = await db.scalar(
        select(DocumentVersion).where(
            DocumentVersion.id == version_id,
            DocumentVersion.document_id == doc_id,
        )
    )
    if not ver:
        raise HTTPException(404, "version not found")
    return {
        "id": ver.id,
        "version_number": ver.version_number,
        "name": ver.name,
        "byte_size": ver.byte_size,
        "content": ver.content,
        "created_by": ver.created_by,
        "created_at": ver.created_at,
    }


@router.post("/{doc_id}/restore/{version_id}")
async def api_restore_version(
    doc_id: str,
    version_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Restore document content from a version. Creates a version of current content first."""
    import json
    from app.models import DocumentVersion
    from app.utils import gen_suffix

    doc = await get_document(db, doc_id)
    if not doc:
        raise HTTPException(404, "document not found")
    await _check_doc_access(db, doc, current_user, ProjectRole.EDITOR)
    
    ver = await db.scalar(
        select(DocumentVersion).where(
            DocumentVersion.id == version_id,
            DocumentVersion.document_id == doc_id,
        )
    )
    if not ver:
        raise HTTPException(404, "version not found")
    
    # Save current content as a version first
    old_content_json = json.dumps(doc.content)
    snapshot = DocumentVersion(
        id=gen_suffix(16),
        document_id=doc_id,
        version_number=doc.version,
        content=doc.content,
        name=doc.name,
        byte_size=len(old_content_json.encode("utf-8")),
        created_by=current_user.id,
    )
    db.add(snapshot)
    
    # Restore
    doc.content = ver.content
    doc.name = ver.name or doc.name
    doc.version = (doc.version or 1) + 1
    
    await update_document_search(db, doc.id, doc.name, doc.content)
    await db.commit()
    await db.refresh(doc)
    
    return {
        "id": doc.id,
        "version": doc.version,
        "name": doc.name,
        "message": f"Restored from version {ver.version_number}",
    }


# Delete document
@router.delete("/{doc_id}", status_code=204)
async def api_delete_document(doc_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc = await get_document(db, doc_id)
    if not doc:
        raise HTTPException(404, "document not found")
    await _check_doc_access(db, doc, current_user, ProjectRole.EDITOR)
    try:
        await delete_document(db, doc_id)
    except ValueError as e:
        raise HTTPException(404, str(e))
    return Response(status_code=204)


# ──────────────────────────────────────────────────────────────────────────────
# SHARING ENDPOINTS
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/{doc_id}/share")
async def get_document_share_settings(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get share settings for a document."""
    from app.models import Document as DocumentModel, ResourceShare
    from sqlalchemy import select as sel
    doc = await db.get(DocumentModel, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    await _check_doc_access(db, doc, current_user)

    stmt = sel(ResourceShare).where(
        ResourceShare.resource_type == "document",
        ResourceShare.resource_id == doc_id,
    )
    result = await db.execute(stmt)
    shares = result.scalars().all()

    shared_with = []
    for s in shares:
        user_name = None
        if s.shared_with_user_id:
            u = await db.get(User, s.shared_with_user_id)
            if u:
                user_name = u.name
        shared_with.append({
            "id": s.id,
            "email": s.shared_with_email,
            "permission": s.permission,
            "user_name": user_name,
        })

    return {
        "is_public": doc.is_public,
        "share_token": doc.share_token,
        "public_url": f"/public/document/{doc.share_token}" if doc.share_token else None,
        "shared_with": shared_with,
    }


@router.post("/{doc_id}/share")
async def share_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a public share link for a document (legacy compat)."""
    import uuid
    from app.models import Document as DocumentModel
    doc = await db.get(DocumentModel, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    await _check_doc_access(db, doc, current_user)
    if not doc.share_token:
        doc.share_token = uuid.uuid4().hex
    doc.is_public = True
    await db.commit()
    return {"share_token": doc.share_token, "is_public": True}


@router.delete("/{doc_id}/share")
async def unshare_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove public share link for a document (legacy compat)."""
    from app.models import Document as DocumentModel
    doc = await db.get(DocumentModel, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    await _check_doc_access(db, doc, current_user)
    doc.is_public = False
    doc.is_public = False
    await db.commit()
    return {"is_public": False}


@router.post("/{doc_id}/share/public")
async def enable_document_public_link(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Enable public link sharing for a document."""
    import uuid
    from app.models import Document as DocumentModel
    doc = await db.get(DocumentModel, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    await _check_doc_access(db, doc, current_user)
    if not doc.share_token:
        doc.share_token = uuid.uuid4().hex
    doc.is_public = True
    await db.commit()
    return {
        "is_public": True,
        "share_token": doc.share_token,
        "public_url": f"/public/document/{doc.share_token}",
    }


@router.delete("/{doc_id}/share/public")
async def disable_document_public_link(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Disable public link sharing for a document."""
    from app.models import Document as DocumentModel
    doc = await db.get(DocumentModel, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    await _check_doc_access(db, doc, current_user)
    # Keep the token so re-enabling gives the same URL
    doc.is_public = False
    await db.commit()
    return {"is_public": False, "share_token": doc.share_token, "public_url": f"/public/document/{doc.share_token}" if doc.share_token else None}


@router.post("/{doc_id}/share/invite")
async def invite_to_document(
    doc_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Invite a user by email to access this document."""
    from app.models import Document as DocumentModel, ResourceShare
    from sqlalchemy import select as sel
    doc = await db.get(DocumentModel, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    await _check_doc_access(db, doc, current_user)

    email = body.get("email", "").strip().lower()
    permission = body.get("permission", "view")
    if not email:
        raise HTTPException(400, "Email is required")
    if permission not in ("view", "edit"):
        raise HTTPException(400, "Permission must be 'view' or 'edit'")

    existing = await db.execute(
        sel(ResourceShare).where(
            ResourceShare.resource_type == "document",
            ResourceShare.resource_id == doc_id,
            ResourceShare.shared_with_email == email,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Already shared with this email")

    user_result = await db.execute(sel(User).where(User.email == email))
    existing_user = user_result.scalar_one_or_none()

    share = ResourceShare(
        resource_type="document",
        resource_id=doc_id,
        shared_with_email=email,
        shared_with_user_id=existing_user.id if existing_user else None,
        permission=permission,
        shared_by=current_user.id,
    )
    db.add(share)
    await db.commit()
    await db.refresh(share)

    return {
        "id": share.id,
        "email": share.shared_with_email,
        "permission": share.permission,
        "user_name": existing_user.name if existing_user else None,
    }


@router.delete("/{doc_id}/share/invite/{share_id}")
async def remove_document_invite(
    doc_id: str,
    share_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a user's access to this document."""
    from app.models import ResourceShare
    share = await db.get(ResourceShare, share_id)
    if not share or share.resource_id != doc_id or share.resource_type != "document":
        raise HTTPException(404, "Share not found")
    await db.delete(share)
    await db.commit()
    return {"status": "removed"}


@router.patch("/{doc_id}/share/invite/{share_id}")
async def update_document_invite(
    doc_id: str,
    share_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a user's permission on this document."""
    from app.models import ResourceShare
    share = await db.get(ResourceShare, share_id)
    if not share or share.resource_id != doc_id or share.resource_type != "document":
        raise HTTPException(404, "Share not found")
    permission = body.get("permission", "view")
    if permission not in ("view", "edit"):
        raise HTTPException(400, "Permission must be 'view' or 'edit'")
    share.permission = permission
    await db.commit()
    return {"id": share.id, "permission": share.permission}


# ──────────────────────────────────────────────────────────────────────────────
# EXPORT ENDPOINTS
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/{doc_id}/export/markdown")
async def export_document_markdown(
    doc_id: str,
    page_layout: str = Query(default="document", description="Page layout: full, document, a4, letter"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export document as Markdown"""
    from app.document_export import generate_document_markdown
    
    doc = await get_document(db, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    await _check_doc_access(db, doc, current_user)
    
    markdown = generate_document_markdown(doc, page_layout=page_layout)
    filename = f"{doc.name or 'document'}.md".replace(" ", "_")
    
    return Response(
        content=markdown,
        media_type="text/markdown",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        }
    )


@router.get("/{doc_id}/export/html")
async def export_document_html(
    doc_id: str,
    embed_styles: bool = Query(default=True, description="Include inline styles"),
    page_layout: str = Query(default="document", description="Page layout: full, document, a4, letter"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export document as HTML"""
    from app.document_export import generate_document_html
    
    doc = await get_document(db, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    await _check_doc_access(db, doc, current_user)
    
    html = generate_document_html(doc, embed_styles=embed_styles, page_layout=page_layout)
    filename = f"{doc.name or 'document'}.html".replace(" ", "_")
    
    return Response(
        content=html,
        media_type="text/html",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        }
    )


@router.get("/{doc_id}/export/pdf")
async def export_document_pdf(
    doc_id: str,
    page_layout: str = Query(default=None, description="Page layout: full, document, a4, letter. If not provided, uses document's stored layout."),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export document as PDF using Gotenberg"""
    from app.document_export import generate_document_pdf
    
    doc = await get_document(db, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    await _check_doc_access(db, doc, current_user)
    
    # Use provided layout or fall back to document's stored layout
    effective_layout = page_layout or doc.page_layout or "document"
    
    try:
        pdf_bytes = await generate_document_pdf(doc, page_layout=effective_layout)
    except Exception as e:
        raise HTTPException(500, f"PDF generation failed: {str(e)}")
    
    filename = f"{doc.name or 'document'}.pdf".replace(" ", "_")
    
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        }
    )


@router.get("/{doc_id}/export/confluence")
async def export_document_confluence(
    doc_id: str,
    page_layout: str = Query(default="document"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export document as Confluence Storage Format"""
    from app.document_export import generate_document_confluence
    
    doc = await get_document(db, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    await _check_doc_access(db, doc, current_user)
    
    confluence = generate_document_confluence(doc, page_layout=page_layout)
    filename = f"{doc.name or 'document'}_confluence.xml".replace(" ", "_")
    
    return Response(
        content=confluence,
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{doc_id}/export/notion")
async def export_document_notion(
    doc_id: str,
    page_layout: str = Query(default="document"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export document as Notion-compatible Markdown"""
    from app.document_export import generate_document_notion_markdown
    
    doc = await get_document(db, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    await _check_doc_access(db, doc, current_user)
    
    notion_md = generate_document_notion_markdown(doc, page_layout=page_layout)
    filename = f"{doc.name or 'document'}_notion.md".replace(" ", "_")
    
    return Response(
        content=notion_md,
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{doc_id}/export/docx")
async def export_document_docx(
    doc_id: str,
    page_layout: str = Query(default=None, description="Page layout: full, document, a4, letter. If not provided, uses document's stored layout."),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export document as Microsoft Word document"""
    from app.document_export import generate_document_docx
    
    doc = await get_document(db, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    await _check_doc_access(db, doc, current_user)
    
    # Use provided layout or fall back to document's stored layout
    effective_layout = page_layout or doc.page_layout or "document"
    
    try:
        docx_bytes = generate_document_docx(doc, page_layout=effective_layout)
    except RuntimeError as e:
        raise HTTPException(501, str(e))
    
    filename = f"{doc.name or 'document'}.docx".replace(" ", "_")
    
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        }
    )

