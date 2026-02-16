"""
Knowledge source management — file upload, extraction, indexing.
"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session as get_db
from app.models import User, KnowledgeSource, SourceType, ProjectRole
from app.security import get_current_user, check_project_permission
from app.services.ingest.extract import extract_text
from app.services.indexer import (
    index_knowledge_source_background,
    delete_knowledge_source_embeddings,
    index_knowledge_source,
)

logger = logging.getLogger(__name__)
router = APIRouter()

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "text/plain",
    "text/markdown",
    "text/x-markdown",
}

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


@router.post("/upload")
async def upload_knowledge_file(
    file: UploadFile = File(...),
    project_id: str = Form(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a file to the project knowledge base."""
    await check_project_permission(db, current_user.id, project_id, ProjectRole.EDITOR)

    # Validate mime type
    mime = file.content_type or "application/octet-stream"
    if mime not in ALLOWED_MIME_TYPES:
        raise HTTPException(400, f"Unsupported file type: {mime}")

    # Read file content
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, "File too large (max 50 MB)")

    # Create knowledge source record first to get ID
    from app.utils import gen_suffix
    source_id = gen_suffix()

    # Store file
    store_dir = os.path.join(UPLOAD_DIR, "knowledge", project_id, source_id)
    os.makedirs(store_dir, exist_ok=True)
    file_path = os.path.join(store_dir, file.filename or "upload")
    with open(file_path, "wb") as f:
        f.write(content)

    # Extract text
    try:
        raw_text = await extract_text(file_path, mime)
    except Exception as exc:
        logger.error("Text extraction failed for %s: %s", file.filename, exc)
        raw_text = ""

    # Create record
    source = KnowledgeSource(
        id=source_id,
        project_id=project_id,
        source_type=SourceType.UPLOAD,
        name=file.filename or "Untitled",
        raw_content=raw_text,
        processed_content=raw_text,
        file_path=file_path,
        file_size=len(content),
        mime_type=mime,
        created_by=current_user.id,
    )
    db.add(source)
    await db.commit()
    await db.refresh(source)

    # Trigger indexing in background
    asyncio.create_task(index_knowledge_source_background(source.id))

    return {
        "id": source.id,
        "name": source.name,
        "source_type": source.source_type.value,
        "file_size": source.file_size,
        "mime_type": source.mime_type,
        "created_at": source.created_at.isoformat() if source.created_at else None,
    }


@router.get("/sources")
async def list_knowledge_sources(
    project_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all knowledge sources for a project."""
    await check_project_permission(db, current_user.id, project_id, ProjectRole.VIEWER)

    stmt = (
        select(KnowledgeSource)
        .where(KnowledgeSource.project_id == project_id)
        .order_by(KnowledgeSource.created_at.desc())
    )
    result = await db.execute(stmt)
    sources = result.scalars().all()

    return [
        {
            "id": s.id,
            "name": s.name,
            "source_type": s.source_type.value,
            "file_size": s.file_size,
            "mime_type": s.mime_type,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "last_indexed_at": s.last_indexed_at.isoformat() if s.last_indexed_at else None,
        }
        for s in sources
    ]


@router.get("/sources/{source_id}")
async def get_knowledge_source(
    source_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single knowledge source."""
    source = await db.get(KnowledgeSource, source_id)
    if not source:
        raise HTTPException(404, "Knowledge source not found")

    await check_project_permission(db, current_user.id, source.project_id, ProjectRole.VIEWER)

    return {
        "id": source.id,
        "name": source.name,
        "source_type": source.source_type.value,
        "file_size": source.file_size,
        "mime_type": source.mime_type,
        "raw_content": source.raw_content,
        "processed_content": source.processed_content,
        "file_path": source.file_path,
        "created_at": source.created_at.isoformat() if source.created_at else None,
        "last_indexed_at": source.last_indexed_at.isoformat() if source.last_indexed_at else None,
        "created_by": source.created_by,
    }


@router.delete("/sources/{source_id}")
async def delete_knowledge_source(
    source_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a knowledge source, its embeddings, and stored file."""
    source = await db.get(KnowledgeSource, source_id)
    if not source:
        raise HTTPException(404, "Knowledge source not found")

    await check_project_permission(db, current_user.id, source.project_id, ProjectRole.EDITOR)

    # Delete embeddings
    await delete_knowledge_source_embeddings(source_id, db)

    # Delete stored file
    if source.file_path and os.path.exists(source.file_path):
        store_dir = os.path.dirname(source.file_path)
        shutil.rmtree(store_dir, ignore_errors=True)

    await db.delete(source)
    await db.commit()

    return {"deleted": True}


@router.post("/reindex/{source_id}")
async def reindex_knowledge_source(
    source_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Re-extract and re-index a knowledge source."""
    source = await db.get(KnowledgeSource, source_id)
    if not source:
        raise HTTPException(404, "Knowledge source not found")

    await check_project_permission(db, current_user.id, source.project_id, ProjectRole.EDITOR)

    # Re-extract if file exists
    if source.file_path and os.path.exists(source.file_path):
        try:
            raw_text = await extract_text(source.file_path, source.mime_type or "text/plain")
            source.raw_content = raw_text
            source.processed_content = raw_text
        except Exception as exc:
            logger.error("Re-extraction failed for %s: %s", source_id, exc)

    # Delete old embeddings and re-index
    await delete_knowledge_source_embeddings(source_id, db)
    count = await index_knowledge_source(source_id, db)
    await db.commit()

    return {"reindexed": True, "embeddings_created": count}
