# app/api/document.py
from fastapi import APIRouter, Depends, HTTPException, Response, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
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
from app.security import get_current_user
from app.models import User

router = APIRouter()

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
    return await create_document(
        db, 
        name=payload.name, 
        content=payload.content,
        page_layout=payload.page_layout or "document",
        project_id=payload.project_id,
        folder_id=payload.folder_id,
        is_private=payload.is_private if payload.is_private is not None else True,
        owner_id=current_user.id,  # Always pass current user, CRUD will use it only if is_private
    )

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
    doc = await get_document(db, doc_id)
    if not doc:
        raise HTTPException(404, "document not found")
    
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
    
    return await update_document(
        db,
        doc_id,
        name=payload.name,
        content=payload.content,
        page_layout=payload.page_layout,
        folder_id=payload.folder_id,
    )

# Move document
@router.put("/{doc_id}/move", response_model=DocumentRead)
async def api_move_document(
    doc_id: str,
    payload: DocumentMove,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Move document to new folder"""
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
    try:
      # reuse imported duplicate_document
        return await duplicate_document(
            db,
            doc_id=doc_id,
            include_children=include_children  # Ignored since documents don't have children
        )
    except ValueError as e:
        raise HTTPException(404, str(e))




# Delete document
@router.delete("/{doc_id}", status_code=204)
async def api_delete_document(doc_id: str, db: AsyncSession = Depends(get_db)):
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
):
    """Export document as Markdown"""
    from app.document_export import generate_document_markdown
    
    doc = await get_document(db, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    
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
):
    """Export document as HTML"""
    from app.document_export import generate_document_html
    
    doc = await get_document(db, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    
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
):
    """Export document as PDF using Gotenberg"""
    from app.document_export import generate_document_pdf
    
    doc = await get_document(db, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    
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
):
    """Export document as Confluence Storage Format"""
    from app.document_export import generate_document_confluence
    
    doc = await get_document(db, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    
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
):
    """Export document as Notion-compatible Markdown"""
    from app.document_export import generate_document_notion_markdown
    
    doc = await get_document(db, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    
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
):
    """Export document as Microsoft Word document"""
    from app.document_export import generate_document_docx
    
    doc = await get_document(db, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    
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

