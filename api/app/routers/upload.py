# app/routers/upload.py
"""Generic file/image upload endpoint for document images etc."""
import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse, RedirectResponse
from app.security import get_current_user
from app.models import User
from app.services.storage import get_storage_backend, UPLOAD_DIR

router = APIRouter()

IMAGE_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "images")
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"}

# Use shared storage backend with an "uploads/images" prefix
_backend = get_storage_backend(prefix_override="uploads/images")


def _get_media_type(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    media_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
    }
    return media_types.get(ext, "application/octet-stream")


@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Upload an image file and return its URL."""
    # Validate content type
    content_type = file.content_type or ""
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(400, f"Unsupported file type: {content_type}. Allowed: {', '.join(ALLOWED_MIME_TYPES)}")

    # Read and validate size
    content = await file.read()
    if len(content) > MAX_IMAGE_SIZE:
        raise HTTPException(400, f"File too large. Maximum size: {MAX_IMAGE_SIZE // (1024*1024)}MB")

    # Generate unique filename
    ext = os.path.splitext(file.filename or "image.png")[1] or ".png"
    unique_name = f"{uuid.uuid4().hex}{ext}"

    # Save via storage backend — use empty session_path since prefix is already set
    session_path = await _backend.ensure_session_path("")
    await _backend.save_file(session_path, unique_name, content, content_type)

    # Always return the API URL — the GET endpoint handles retrieval from any backend
    url = f"/api/v1/uploads/image/{unique_name}"
    return {"url": url, "filename": unique_name, "size": len(content)}


@router.get("/image/{filename}")
async def get_image(
    filename: str,
):
    """Serve an uploaded image."""
    # Reject path traversal attempts
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(400, "Invalid filename")
    safe_name = os.path.basename(filename)

    session_path = await _backend.ensure_session_path("")

    # Try presigned URL first (S3/GCS/Azure)
    download_url = await _backend.get_download_url(session_path, safe_name)
    if download_url:
        return RedirectResponse(download_url, headers={"Cache-Control": "public, max-age=3600"})

    # Local storage fallback
    local_path = await _backend.resolve_local_path(session_path, safe_name)
    if local_path and os.path.exists(local_path):
        return FileResponse(
            local_path,
            media_type=_get_media_type(safe_name),
            headers={"Cache-Control": "public, max-age=31536000"},
        )

    raise HTTPException(404, "Image not found")
