# app/api/document.py
from fastapi import APIRouter, Depends, HTTPException, Response, Query
from sqlalchemy.ext.asyncio import AsyncSession
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
        is_private=payload.is_private if payload.is_private is not None else False,
        owner_id=current_user.id,  # Always pass current user, CRUD will use it only if is_private
    )

# Get single document
@router.get("/{doc_id}", response_model=DocumentRead)
async def api_get_document(doc_id: str, db: AsyncSession = Depends(get_db)):
    doc = await get_document(db, doc_id)
    if not doc:
        raise HTTPException(404, "document not found")
    return doc

# Update document
@router.put("/{doc_id}", response_model=DocumentRead)
async def api_update_document(doc_id: str, payload: DocumentUpdate, db: AsyncSession = Depends(get_db)):
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

