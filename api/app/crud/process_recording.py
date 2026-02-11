from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import os
import json
import aiofiles
from pathlib import Path
from sqlalchemy import select, func, and_, update, delete, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
import asyncio

from app.models import ProcessRecordingSession, ProcessRecordingFile, ProcessRecordingStep
from app.schemas.process_recording import StepMetadata, SessionStatusResponse
from app.utils import gen_suffix
from app.core.config import settings

# Get storage configuration from settings
STORAGE_TYPE = os.getenv("STORAGE_TYPE", "local")
# Use absolute path for local storage
LOCAL_STORAGE_PATH = os.path.abspath(os.getenv("LOCAL_STORAGE_PATH", "./storage/recordings"))
S3_BUCKET = os.getenv("S3_BUCKET", "")
S3_PREFIX = os.getenv("S3_PREFIX", "recordings")
S3_REGION = os.getenv("S3_REGION", None)
S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL", None)

# Ensure the storage directory exists
if STORAGE_TYPE == "local":
    Path(LOCAL_STORAGE_PATH).mkdir(parents=True, exist_ok=True)

# ──────────────────────────────────────────────────────────────────────────────
# Storage Abstraction Layer (Strategy Pattern)
# ──────────────────────────────────────────────────────────────────────────────

class StorageBackend:
    async def ensure_session_path(self, session_id: str) -> str:
        raise NotImplementedError

    async def save_metadata(self, session_path: str, metadata_obj: Any) -> None:
        raise NotImplementedError

    async def save_file(self, session_path: str, filename: str, data: bytes, mime_type: str) -> str:
        """Return the stored 'relative path' to persist in DB (see notes in callers)."""
        raise NotImplementedError

    async def resolve_local_path(self, session_path: str, stored_relative_path: str) -> Optional[str]:
        """Return absolute local filesystem path if applicable; else None."""
        return None

    async def get_download_url(self, session_path: str, stored_relative_path: str, expires_in: int = 3600) -> Optional[str]:
        """Return a signed URL if applicable; else None."""
        return None


class LocalStorageBackend(StorageBackend):
    def __init__(self, base_dir: str):
        # Always store an absolute base path
        self.base_dir = os.path.abspath(base_dir)

    async def ensure_session_path(self, session_id: str) -> str:
        session_dir = os.path.join(self.base_dir, session_id)
        Path(session_dir).mkdir(parents=True, exist_ok=True)
        return session_dir  # absolute path on disk

    async def save_metadata(self, session_path: str, metadata_obj: Any) -> None:
        metadata_file = os.path.join(session_path, "metadata.json")
        async with aiofiles.open(metadata_file, 'w') as f:
            await f.write(json.dumps(metadata_obj, indent=2))

    async def save_file(self, session_path: str, filename: str, data: bytes, mime_type: str) -> str:
        # Security: only basename to prevent traversal
        safe_name = os.path.basename(filename)
        file_path = os.path.join(session_path, safe_name)
        async with aiofiles.open(file_path, 'wb') as f:
            await f.write(data)
        # For local, persist just the filename; router will join with session_path
        return safe_name

    async def resolve_local_path(self, session_path: str, stored_relative_path: str) -> Optional[str]:
       
        session_id = os.path.basename(session_path)
        actual_session_dir = os.path.join(self.base_dir, session_id)
        
        return os.path.join(actual_session_dir, stored_relative_path)


class S3StorageBackend(StorageBackend):
    def __init__(self, bucket: str, prefix: str, region: Optional[str] = None, endpoint_url: Optional[str] = None):
        self.bucket = bucket
        self.prefix = prefix.strip("/")
        self.region = region
        self.endpoint_url = endpoint_url
        try:
            import boto3  # type: ignore
            self._boto3 = boto3
            self._client = boto3.client("s3", region_name=self.region, endpoint_url=self.endpoint_url)
        except Exception:
            self._boto3 = None
            self._client = None

    async def ensure_session_path(self, session_id: str) -> str:
        # S3 uses a logical prefix; no need to pre-create. Return s3 key prefix.
        return f"{self.prefix}/{session_id}"

    async def save_metadata(self, session_path: str, metadata_obj: Any) -> None:
        if not self._client:
            raise RuntimeError("boto3 is required for S3 operations")
        key = f"{session_path}/metadata.json"
        body = json.dumps(metadata_obj, indent=2).encode("utf-8")
        await asyncio.to_thread(
            self._client.put_object,
            Bucket=self.bucket,
            Key=key,
            Body=body,
            ContentType="application/json",
        )

    async def save_file(self, session_path: str, filename: str, data: bytes, mime_type: str) -> str:
        if not self._client:
            raise RuntimeError("boto3 is required for S3 operations")
        safe_name = os.path.basename(filename)
        key = f"{session_path}/{safe_name}"
        await asyncio.to_thread(
            self._client.put_object,
            Bucket=self.bucket,
            Key=key,
            Body=data,
            ContentType=mime_type or "application/octet-stream",
        )
        # For S3, persist the full key within the bucket so we can address it directly.
        return key

    async def get_download_url(self, session_path: str, stored_relative_path: str, expires_in: int = 3600) -> Optional[str]:
        if not self._client:
            raise RuntimeError("boto3 is required for S3 operations")
        key = stored_relative_path if stored_relative_path.startswith(self.prefix) else f"{session_path}/{stored_relative_path}"
        return await asyncio.to_thread(
            self._client.generate_presigned_url,
            ClientMethod="get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=expires_in,
        )


def get_storage_backend(force_type: Optional[str] = None) -> StorageBackend:
    stype = (force_type or STORAGE_TYPE).lower()
    if stype == "s3":
        return S3StorageBackend(
            bucket=S3_BUCKET,
            prefix=S3_PREFIX,
            region=S3_REGION,
            endpoint_url=S3_ENDPOINT_URL,
        )
    # default: local
    return LocalStorageBackend(LOCAL_STORAGE_PATH)

# ──────────────────────────────────────────────────────────────────────────────
# CRUD functions refactored to use StorageBackend
# ──────────────────────────────────────────────────────────────────────────────

async def create_session(
    db: AsyncSession,
    user_id: Optional[str] = None,
    client_name: str = "ProcessRecorder",
    project_id: Optional[str] = None,
    folder_id: Optional[str] = None,
    name: Optional[str] = None,
    is_private: bool = True,  # CHANGED: Default to True (private)
) -> ProcessRecordingSession:
    """Create a new recording session"""
    session_id = gen_suffix(16)

    # Use storage backend to determine and prepare storage path
    backend = get_storage_backend()
    storage_path = await backend.ensure_session_path(session_id)
    
    # Determine position if project_id is provided
    position = 0
    if project_id:
        from sqlalchemy import select, func, and_
        stmt = select(func.coalesce(func.max(ProcessRecordingSession.position), -1) + 1).where(
            and_(
                ProcessRecordingSession.project_id == project_id,
                ProcessRecordingSession.folder_id == folder_id,
                ProcessRecordingSession.is_private == is_private,  # NEW
            )
        )
        result = await db.execute(stmt)
        position = result.scalar() or 0

    session = ProcessRecordingSession(
        id=session_id,
        user_id=user_id,
        client_name=client_name,
        status="uploading",
        storage_type=(STORAGE_TYPE or "local"),
        storage_path=storage_path,
        project_id=project_id,
        folder_id=folder_id,
        name=name or "Untitled Workflow",
        position=position,
        is_private=is_private,  # NEW
        owner_id=user_id if is_private else None,  # NEW
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session

async def upload_metadata(
    db: AsyncSession,
    session_id: str,
    metadata: List[StepMetadata]
) -> None:
    """Upload metadata for all steps - now creates individual step records"""
    # Get session
    session = await db.get(ProcessRecordingSession, session_id)
    if not session:
        raise ValueError(f"Session {session_id} not found")

    # Delete existing steps if any (for re-upload scenarios)
    from sqlalchemy import delete
    await db.execute(
        delete(ProcessRecordingStep).where(ProcessRecordingStep.session_id == session_id)
    )
    
    # Create step records
    for meta in metadata:
        timestamp = meta.timestamp
        if timestamp.tzinfo is not None:
            timestamp = timestamp.astimezone(timezone.utc).replace(tzinfo=None)
        
        step = ProcessRecordingStep(
            id=gen_suffix(16),
            session_id=session_id,
            step_number=meta.step_number,
            timestamp=timestamp,
            action_type=meta.action_type,
            window_title=meta.window_title,
            description=meta.description,
            global_position=meta.global_position,
            relative_position=meta.relative_position,
            window_size=meta.window_size,
            key_pressed=meta.key_pressed,
            text_typed=meta.text_typed,
            scroll_delta=meta.scroll_delta,
            screenshot_size=meta.screenshot_size,
            screenshot_relative_position=meta.screenshot_relative_position,
            step_type=meta.step_type or "screenshot",  # NEW: default screenshot
            content=meta.content,                      # NEW
        )
        db.add(step)
    
    # Update session totals
    session.total_steps = len(metadata)
    session.updated_at = datetime.utcnow()

    # Still persist metadata to storage for backup/export
    metadata_json = []
    for meta in metadata:
        timestamp = meta.timestamp
        if timestamp.tzinfo is not None:
            timestamp = timestamp.astimezone(timezone.utc).replace(tzinfo=None)
        metadata_json.append({
            "step_number": meta.step_number,
            "timestamp": timestamp.isoformat(),
            "action_type": meta.action_type,
            "window_title": meta.window_title,
            "description": meta.description,
            "global_position": meta.global_position,
            "relative_position": meta.relative_position,
            "window_size": meta.window_size,
            "key_pressed": meta.key_pressed,
            "text_typed": meta.text_typed,
            "scroll_delta": meta.scroll_delta,
            "screenshot_size": meta.screenshot_size,
            "screenshot_relative_position": meta.screenshot_relative_position,
        })

    backend = get_storage_backend(session.storage_type)
    await backend.save_metadata(session.storage_path, metadata_json)

    await db.commit()

async def save_uploaded_file(
    db: AsyncSession,
    session_id: str,
    step_number: int,
    file_content: bytes,
    filename: str,
    mime_type: str = "image/png",
    is_replacement: bool = False
) -> ProcessRecordingFile:
    """Save uploaded file to storage"""
    # Get session
    session = await db.get(ProcessRecordingSession, session_id)
    if not session:
        raise ValueError(f"Session {session_id} not found")

    backend = get_storage_backend(session.storage_type)
    
    # Generate unique filename to avoid collisions
    import time
    timestamp = int(time.time() * 1000)
    unique_suffix = gen_suffix(6)
    ext = os.path.splitext(filename)[1] or '.png'
    unique_filename = f"step_{step_number}_{timestamp}_{unique_suffix}{ext}"
    
    # Use backend to save; returns what we persist in DB
    stored_relative_path = await backend.save_file(session.storage_path, unique_filename, file_content, mime_type)

    # Check if file record already exists
    stmt = select(ProcessRecordingFile).where(
        and_(
            ProcessRecordingFile.session_id == session_id,
            ProcessRecordingFile.step_number == step_number
        )
    )
    result = await db.execute(stmt)
    existing_file = result.scalar_one_or_none()

    if existing_file:
        # If replacing, update the existing record
        if is_replacement:
            existing_file.filename = os.path.basename(unique_filename)
            existing_file.file_path = stored_relative_path
            existing_file.file_size = len(file_content)
            existing_file.mime_type = mime_type
            existing_file.uploaded_at = datetime.utcnow()
            file_record = existing_file
        else:
            # If not replacement but file exists, raise error with clear message
            raise ValueError(f"An image already exists for step {step_number}. Set replace=true to update the existing image.")
    else:
        # New file record
        file_record = ProcessRecordingFile(
            id=gen_suffix(16),
            session_id=session_id,
            step_number=step_number,
            filename=os.path.basename(unique_filename),
            file_path=stored_relative_path,
            file_size=len(file_content),
            mime_type=mime_type
        )
        db.add(file_record)

    await db.commit()
    await db.refresh(file_record)
    return file_record

async def finalize_session(
    db: AsyncSession,
    session_id: str,
    user_id: Optional[str] = None
) -> None:
    """Finalize an upload session"""
    stmt = select(ProcessRecordingSession).options(
        selectinload(ProcessRecordingSession.steps)
    ).where(ProcessRecordingSession.id == session_id)
    
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    
    if not session:
        raise ValueError(f"Session {session_id} not found")
    
    # Count uploaded files
    stmt = select(func.count(ProcessRecordingFile.id)).where(
        ProcessRecordingFile.session_id == session_id
    )
    result = await db.execute(stmt)
    total_files = result.scalar()
    
    # Update session name based on first step if not already set
    if session.name == "Untitled Workflow" and session.steps and len(session.steps) > 0:
        first_step = session.steps[0]
        session.name = f"Workflow: {first_step.window_title or 'Untitled'}"
    
    session.status = "completed"
    session.finalized_at = datetime.utcnow()
    session.total_files = total_files
    
    await db.commit()

# Add CRUD operations for workflows
async def update_workflow(
    db: AsyncSession,
    session_id: str,
    *,
    name: Optional[str] = None,
    folder_id: Optional[str] = None,
    icon_type: Optional[str] = None,
    icon_value: Optional[str] = None,
    icon_color: Optional[str] = None,
    is_private: Optional[bool] = None,  # NEW
    owner_id: Optional[str] = None,  # NEW
) -> ProcessRecordingSession:
    """Update a workflow recording session"""
    session = await db.get(ProcessRecordingSession, session_id)
    if not session:
        raise ValueError("Workflow not found")
    
    if name is not None:
        session.name = name
    if folder_id is not None:
        session.folder_id = folder_id
    if icon_type is not None:
        session.icon_type = icon_type
    if icon_value is not None:
        session.icon_value = icon_value
    if icon_color is not None:
        session.icon_color = icon_color
    if is_private is not None:  # NEW
        session.is_private = is_private
        session.owner_id = owner_id if is_private else None
    
    await db.commit()
    await db.refresh(session)
    return session

async def move_workflow(
    db: AsyncSession,
    session_id: str,
    new_folder_id: Optional[str],
    new_position: Optional[int] = None,
    is_private: Optional[bool] = None,  # NEW
    owner_id: Optional[str] = None,  # NEW
) -> ProcessRecordingSession:
    """Move a workflow to a new folder and/or position"""
    from sqlalchemy import update
    
    session = await db.get(ProcessRecordingSession, session_id)
    if not session:
        raise ValueError("Workflow not found")
    
    old_folder_id = session.folder_id
    old_position = session.position
    old_is_private = session.is_private
    
    # NEW: Handle privacy change
    if is_private is not None and is_private != old_is_private:
        session.is_private = is_private
        session.owner_id = owner_id if is_private else None

    # Determine new_position if not provided
    target_is_private = is_private if is_private is not None else session.is_private
    if new_position is None:
        stmt = select(func.coalesce(func.max(ProcessRecordingSession.position), -1) + 1).where(
            and_(
                ProcessRecordingSession.project_id == session.project_id,
                ProcessRecordingSession.folder_id == new_folder_id,
                ProcessRecordingSession.is_private == target_is_private,  # NEW
            )
        )
        result = await db.execute(stmt)
        new_position = result.scalar() or 0

    # Handle position updates when moving within the same folder
    if old_folder_id == new_folder_id and new_folder_id is not None:
        if old_position < new_position:
            await db.execute(
                update(ProcessRecordingSession)
                .where(
                    and_(
                        ProcessRecordingSession.project_id == session.project_id,
                        ProcessRecordingSession.folder_id == old_folder_id,
                        ProcessRecordingSession.position > old_position,
                        ProcessRecordingSession.position <= new_position,
                        ProcessRecordingSession.id != session_id,
                    )
                )
                .values(position=ProcessRecordingSession.position - 1)
            )
        elif old_position > new_position:
            await db.execute(
                update(ProcessRecordingSession)
                .where(
                    and_(
                        ProcessRecordingSession.project_id == session.project_id,
                        ProcessRecordingSession.folder_id == old_folder_id,
                        ProcessRecordingSession.position >= new_position,
                        ProcessRecordingSession.position < old_position,
                        ProcessRecordingSession.id != session_id,
                    )
                )
                .values(position=ProcessRecordingSession.position + 1)
            )
    else:
        # Moving to a different folder (or from/to root)
        # Shift positions at destination
        if new_folder_id is not None:
            await db.execute(
                update(ProcessRecordingSession)
                .where(
                    and_(
                        ProcessRecordingSession.project_id == session.project_id,
                        ProcessRecordingSession.folder_id == new_folder_id,
                        ProcessRecordingSession.position >= new_position,
                    )
                )
                .values(position=ProcessRecordingSession.position + 1)
            )
        else:
            # Moving to root level
            await db.execute(
                update(ProcessRecordingSession)
                .where(
                    and_(
                        ProcessRecordingSession.project_id == session.project_id,
                        ProcessRecordingSession.folder_id.is_(None),
                        ProcessRecordingSession.position >= new_position,
                    )
                )
                .values(position=ProcessRecordingSession.position + 1)
            )
        
        # Close gap at source
        if old_folder_id is not None:
            await db.execute(
                update(ProcessRecordingSession)
                .where(
                    and_(
                        ProcessRecordingSession.project_id == session.project_id,
                        ProcessRecordingSession.folder_id == old_folder_id,
                        ProcessRecordingSession.position > old_position,
                    )
                )
                .values(position=ProcessRecordingSession.position - 1)
            )
        else:
            # Moving from root level
            await db.execute(
                update(ProcessRecordingSession)
                .where(
                    and_(
                        ProcessRecordingSession.project_id == session.project_id,
                        ProcessRecordingSession.folder_id.is_(None),
                        ProcessRecordingSession.position > old_position,
                    )
                )
                .values(position=ProcessRecordingSession.position - 1)
            )

    session.folder_id = new_folder_id
    session.position = new_position
    
    await db.commit()
    await db.refresh(session)
    return session

async def delete_workflow(db: AsyncSession, session_id: str) -> None:
    """Delete a workflow and all its files"""
    session = await db.get(ProcessRecordingSession, session_id)
    if not session:
        raise ValueError("Workflow not found")
    
    await db.delete(session)
    await db.commit()

async def duplicate_workflow(
    db: AsyncSession,
    session_id: str,
) -> ProcessRecordingSession:
    """Duplicate a workflow (metadata and steps, not files)"""
    stmt = select(ProcessRecordingSession).options(
        selectinload(ProcessRecordingSession.steps)
    ).where(ProcessRecordingSession.id == session_id)
    
    result = await db.execute(stmt)
    original = result.scalar_one_or_none()
    
    if not original:
        raise ValueError("Workflow not found")
    
    new_session = await create_session(
        db,
        user_id=original.user_id,
        client_name=original.client_name,
        project_id=original.project_id,
        folder_id=original.folder_id,
        name=f"{original.name} (Copy)"
    )
    
    # Copy steps
    for step in original.steps:
        new_step = ProcessRecordingStep(
            id=gen_suffix(16),
            session_id=new_session.id,
            step_number=step.step_number,
            timestamp=step.timestamp,
            action_type=step.action_type,
            window_title=step.window_title,
            description=step.description,
            global_position=step.global_position,
            relative_position=step.relative_position,
            window_size=step.window_size,
            key_pressed=step.key_pressed,
            text_typed=step.text_typed,
            scroll_delta=step.scroll_delta,
            screenshot_size=step.screenshot_size,
            screenshot_relative_position=step.screenshot_relative_position,
        )
        db.add(new_step)
    
    new_session.total_steps = original.total_steps
    new_session.status = "completed"
    new_session.finalized_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(new_session)
    return new_session

async def get_session_status(
    db: AsyncSession,
    session_id: str
) -> SessionStatusResponse:
    """Get detailed session status - now includes steps from separate table"""
    # Get session with files and steps
    stmt = select(ProcessRecordingSession).options(
        selectinload(ProcessRecordingSession.files),
        selectinload(ProcessRecordingSession.steps)
    ).where(ProcessRecordingSession.id == session_id)
    
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    
    if not session:
        raise ValueError(f"Session {session_id} not found")
    
    file_steps = {f.step_number for f in session.files} # NEW
    metadata = []
    for step in sorted(session.steps, key=lambda s: s.step_number):
        metadata.append({
            "step_number": step.step_number,
            "timestamp": step.timestamp.isoformat() if step.timestamp else None,
            "action_type": step.action_type,
            "window_title": step.window_title,
            "description": step.description,
            "global_position": step.global_position,
            "relative_position": step.relative_position,
            "window_size": step.window_size,
            "key_pressed": step.key_pressed,
            "text_typed": step.text_typed,
            "scroll_delta": step.scroll_delta,
            "screenshot_size": step.screenshot_size,
            "screenshot_relative_position": step.screenshot_relative_position,
            "step_type": step.step_type or "screenshot",   # NEW
            "content": step.content,                      # NEW
            "file_uploaded": step.step_number in file_steps,  # NEW
        })
    
    return SessionStatusResponse(
        session_id=session.id,
        status=session.status,
        created_at=session.created_at,
        total_steps=session.total_steps,
        total_files=session.total_files,
        files_uploaded=len(session.files),
        metadata=metadata,  # Now from step records
        storage_type=session.storage_type,
        storage_path=session.storage_path
    )

async def get_file_access(
    db: AsyncSession,
    session_id: str,
    step_number: int,
    expires_in: int = 3600
) -> Optional[Dict[str, str]]:
    """
    Return a dict describing how to access the file:
      - {'type': 'local', 'path': '/abs/path/to/file.png'}
      - {'type': 'url', 'url': 'https://...presigned...'}
    """
    stmt = select(ProcessRecordingFile).where(
        and_(
            ProcessRecordingFile.session_id == session_id,
            ProcessRecordingFile.step_number == step_number
        )
    )
    result = await db.execute(stmt)
    file_record = result.scalar_one_or_none()
    if not file_record:
        return None

    session = await db.get(ProcessRecordingSession, session_id)
    if not session:
        return None

    backend = get_storage_backend(session.storage_type)

    # Local resolution
    local_path = await backend.resolve_local_path(session.storage_path, file_record.file_path)
    if local_path and os.path.exists(local_path):
        return {"type": "local", "path": local_path}

    # Signed URL if S3 (or remote)
    url = await backend.get_download_url(session.storage_path, file_record.file_path, expires_in=expires_in)
    if url:
        return {"type": "url", "url": url}

    # As a last resort, try to build a local path even if it doesn't exist (will 404 later)
    if local_path:
        return {"type": "local", "path": local_path}
    return None

# ──────────────────────────────────────────────────────────────────────────────
# CRUD functions for step management
# ──────────────────────────────────────────────────────────────────────────────

async def create_step(
    db: AsyncSession,
    session_id: str,
    position: int,
    step_type: str = "text",
    description: Optional[str] = None,
    content: Optional[str] = None,
) -> ProcessRecordingStep:
    # Normalize 'capture' to 'screenshot'
    normalized_type = "screenshot" if step_type == "capture" else step_type

    SHIFT = 100000  # large offset to avoid transient uniqueness collisions

    # Phase 1: Temporarily shift existing steps at/after position
    await db.execute(
        update(ProcessRecordingStep)
        .where(
            and_(
                ProcessRecordingStep.session_id == session_id,
                ProcessRecordingStep.step_number >= position
            )
        )
        .values(step_number=ProcessRecordingStep.step_number + SHIFT)
    )
    # Mirror shift for files
    await db.execute(
        update(ProcessRecordingFile)
        .where(
            and_(
                ProcessRecordingFile.session_id == session_id,
                ProcessRecordingFile.step_number >= position
            )
        )
        .values(step_number=ProcessRecordingFile.step_number + SHIFT)
    )

    # Phase 2: Normalize back (descending order not required with large offset)
    await db.execute(
        update(ProcessRecordingStep)
        .where(
            and_(
                ProcessRecordingStep.session_id == session_id,
                ProcessRecordingStep.step_number >= position + SHIFT
            )
        )
        .values(step_number=ProcessRecordingStep.step_number - (SHIFT - 1))
    )
    await db.execute(
        update(ProcessRecordingFile)
        .where(
            and_(
                ProcessRecordingFile.session_id == session_id,
                ProcessRecordingFile.step_number >= position + SHIFT
            )
        )
        .values(step_number=ProcessRecordingFile.step_number - (SHIFT - 1))
    )

    # Create new step at target position
    new_step = ProcessRecordingStep(
        id=gen_suffix(16),
        session_id=session_id,
        step_number=position,
        step_type=normalized_type,
        timestamp=datetime.utcnow(),
        description=description,
        content=content,
        action_type="manual" if normalized_type != "screenshot" else None,
    )
    db.add(new_step)

    # Update session total
    session = await db.get(ProcessRecordingSession, session_id)
    if session:
        session.total_steps = (session.total_steps or 0) + 1
        session.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(new_step)
    return new_step

async def update_step(
    db: AsyncSession,
    session_id: str,
    step_number: int,
    description: Optional[str] = None,
    content: Optional[str] = None,
    window_title: Optional[str] = None,
) -> ProcessRecordingStep:
    """Update an existing step"""
    stmt = select(ProcessRecordingStep).where(
        and_(
            ProcessRecordingStep.session_id == session_id,
            ProcessRecordingStep.step_number == step_number
        )
    )
    result = await db.execute(stmt)
    step = result.scalar_one_or_none()
    
    if not step:
        raise ValueError(f"Step {step_number} not found in session {session_id}")
    
    if description is not None:
        step.description = description
    if content is not None:
        step.content = content
    if window_title is not None:
        step.window_title = window_title
    
    step.updated_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(step)
    return step

async def delete_step(
    db: AsyncSession,
    session_id: str,
    step_number: int,
) -> None:
    """Delete a step and reorder remaining steps"""
    # Delete the step
    await db.execute(
        delete(ProcessRecordingStep).where(
            and_(
                ProcessRecordingStep.session_id == session_id,
                ProcessRecordingStep.step_number == step_number
            )
        )
    )
    
    # Also delete associated file if exists
    await db.execute(
        delete(ProcessRecordingFile).where(
            and_(
                ProcessRecordingFile.session_id == session_id,
                ProcessRecordingFile.step_number == step_number
            )
        )
    )

    # Reindex remaining steps/files in two phases to avoid unique collisions
    SHIFT = 100000

    # Phase 1: push impacted steps/files to a temp range
    await db.execute(
        update(ProcessRecordingStep)
        .where(
            and_(
                ProcessRecordingStep.session_id == session_id,
                ProcessRecordingStep.step_number > step_number
            )
        )
        .values(step_number=ProcessRecordingStep.step_number + SHIFT)
    )
    await db.execute(
        update(ProcessRecordingFile)
        .where(
            and_(
                ProcessRecordingFile.session_id == session_id,
                ProcessRecordingFile.step_number > step_number
            )
        )
        .values(step_number=ProcessRecordingFile.step_number + SHIFT)
    )

    # Phase 2: pull them back minus one relative to original
    await db.execute(
        update(ProcessRecordingStep)
        .where(
            and_(
                ProcessRecordingStep.session_id == session_id,
                ProcessRecordingStep.step_number >= step_number + 1 + SHIFT
            )
        )
        .values(step_number=ProcessRecordingStep.step_number - (SHIFT + 1))
    )
    await db.execute(
        update(ProcessRecordingFile)
        .where(
            and_(
                ProcessRecordingFile.session_id == session_id,
                ProcessRecordingFile.step_number >= step_number + 1 + SHIFT
            )
        )
        .values(step_number=ProcessRecordingFile.step_number - (SHIFT + 1))
    )
    
    # Update session total
    session = await db.get(ProcessRecordingSession, session_id)
    if session and session.total_steps:
        session.total_steps = session.total_steps - 1
        session.updated_at = datetime.utcnow()
    
    await db.commit()

async def reorder_steps(
    db: AsyncSession,
    session_id: str,
    reorders: List[Dict[str, int]],
) -> None:
    """Reorder multiple steps in a single transaction"""
    # First, move all affected steps to temporary positions (negative numbers)
    for reorder in reorders:
        await db.execute(
            update(ProcessRecordingStep)
            .where(
                and_(
                    ProcessRecordingStep.session_id == session_id,
                    ProcessRecordingStep.step_number == reorder["step_number"]
                )
            )
            .values(step_number=-reorder["new_position"])
        )
        
        # Also update file step numbers
        await db.execute(
            update(ProcessRecordingFile)
            .where(
                and_(
                    ProcessRecordingFile.session_id == session_id,
                    ProcessRecordingFile.step_number == reorder["step_number"]
                )
            )
            .values(step_number=-reorder["new_position"])
        )
    
    # Then move them to their final positions
    await db.execute(
        update(ProcessRecordingStep)
        .where(
            and_(
                ProcessRecordingStep.session_id == session_id,
                ProcessRecordingStep.step_number < 0
            )
        )
        .values(step_number=-ProcessRecordingStep.step_number)
    )
    
    await db.execute(
        update(ProcessRecordingFile)
        .where(
            and_(
                ProcessRecordingFile.session_id == session_id,
                ProcessRecordingFile.step_number < 0
            )
        )
        .values(step_number=-ProcessRecordingFile.step_number)
    )
    
    # Update session timestamp
    session = await db.get(ProcessRecordingSession, session_id)
    if session:
        session.updated_at = datetime.utcnow()
    
    await db.commit()

async def get_filtered_workflows(
    db: AsyncSession,
    project_id: str,
    folder_id: Optional[str] = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
    skip: int = 0,
    limit: int = 100,
    user_id: Optional[str] = None,  # NEW: Required for privacy filtering
) -> List[ProcessRecordingSession]:
    """Get filtered workflows with sorting options"""
    from sqlalchemy import select
    
    # Base conditions - filter by project
    conditions = [ProcessRecordingSession.project_id == project_id]
    
    # Apply folder filter if provided
    if folder_id is not None:
        conditions.append(ProcessRecordingSession.folder_id == folder_id)
    
    # NEW: Apply privacy filter - only show shared OR user's own private workflows
    if user_id:
        conditions.append(
            or_(
                ProcessRecordingSession.is_private == False,
                and_(ProcessRecordingSession.is_private == True, ProcessRecordingSession.owner_id == user_id)
            )
        )
    else:
        # If no user_id, only show shared workflows
        conditions.append(ProcessRecordingSession.is_private == False)
    
    stmt = select(ProcessRecordingSession).where(and_(*conditions))
    
    # Apply sorting
    if sort_by == "name":
        order_col = ProcessRecordingSession.name
    elif sort_by == "updated_at":
        order_col = ProcessRecordingSession.updated_at
    else:  # Default to created_at
        order_col = ProcessRecordingSession.created_at
    
    if sort_order == "asc":
        stmt = stmt.order_by(order_col.asc())
    else:
        stmt = stmt.order_by(order_col.desc())
    
    # Apply pagination
    stmt = stmt.offset(skip).limit(limit)
    
    result = await db.execute(stmt)
    return result.scalars().all()
