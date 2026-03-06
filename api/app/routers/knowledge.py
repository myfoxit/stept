"""
Knowledge source management — file upload, extraction, indexing.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import FileResponse, RedirectResponse
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
from app.services.storage import get_storage_backend

logger = logging.getLogger(__name__)
router = APIRouter()

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "text/plain",
    "text/markdown",
    "text/x-markdown",
}

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB

_backend = get_storage_backend(prefix_override="knowledge")


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

    # Store file via storage backend
    session_path = await _backend.ensure_session_path(f"{project_id}/{source_id}")
    stored_key = await _backend.save_file(session_path, file.filename or "upload", content, mime)

    # For text extraction we need a local path.
    # On local backend the file is already on disk; on cloud backends we use the
    # in-memory content directly via a temp file.
    local_path = await _backend.resolve_local_path(session_path, stored_key)
    if local_path and os.path.isfile(local_path):
        extract_path = local_path
    else:
        import tempfile
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename or "")[1])
        tmp.write(content)
        tmp.close()
        extract_path = tmp.name

    # Extract text
    try:
        raw_text = await extract_text(extract_path, mime)
    except Exception as exc:
        logger.error("Text extraction failed for %s: %s", file.filename, exc)
        raw_text = ""
    finally:
        # Clean up temp file if we created one
        if extract_path != local_path and os.path.exists(extract_path):
            os.unlink(extract_path)

    # Build the file_path to store in DB:
    # For local: the absolute local path; for cloud: the stored key
    if local_path and os.path.isfile(local_path):
        db_file_path = local_path
    else:
        db_file_path = stored_key

    # Create record
    source = KnowledgeSource(
        id=source_id,
        project_id=project_id,
        source_type=SourceType.UPLOAD,
        name=file.filename or "Untitled",
        raw_content=raw_text,
        processed_content=raw_text,
        file_path=db_file_path,
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

    # Delete stored file(s) via backend
    if source.file_path:
        # For local backend: the file_path is an absolute path — delete its parent dir
        if os.path.exists(source.file_path):
            store_dir = os.path.dirname(source.file_path)
            await _backend.delete_prefix(store_dir)
        else:
            # Cloud backend: file_path is a stored key
            await _backend.delete_file(source.file_path)

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
    if source.file_path:
        extract_path = None
        try:
            if os.path.exists(source.file_path):
                # Local file
                extract_path = source.file_path
            else:
                # Cloud backend — download via presigned URL to temp file
                import tempfile, urllib.request
                url = await _backend.get_download_url("", source.file_path)
                if url:
                    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(source.file_path)[1])
                    urllib.request.urlretrieve(url, tmp.name)
                    extract_path = tmp.name

            if extract_path:
                raw_text = await extract_text(extract_path, source.mime_type or "text/plain")
                source.raw_content = raw_text
                source.processed_content = raw_text
        except Exception as exc:
            logger.error("Re-extraction failed for %s: %s", source_id, exc)
        finally:
            if extract_path and extract_path != source.file_path and os.path.exists(extract_path):
                os.unlink(extract_path)

    # Delete old embeddings and re-index
    await delete_knowledge_source_embeddings(source_id, db)
    count = await index_knowledge_source(source_id, db)
    await db.commit()

    return {"reindexed": True, "embeddings_created": count}
