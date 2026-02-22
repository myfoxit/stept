# app/routers/upload.py
"""Generic file/image upload endpoint for document images etc."""
import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_session as get_db
from app.security import get_current_user
from app.models import User

router = APIRouter()

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")
IMAGE_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "images")
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"}


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

    # Ensure upload directory exists
    os.makedirs(IMAGE_UPLOAD_DIR, exist_ok=True)

    # Save file
    file_path = os.path.join(IMAGE_UPLOAD_DIR, unique_name)
    with open(file_path, "wb") as f:
        f.write(content)

    # Return the URL that can be used to retrieve the image
    url = f"/api/v1/uploads/image/{unique_name}"
    return {"url": url, "filename": unique_name, "size": len(content)}


@router.get("/image/{filename}")
async def get_image(filename: str):
    """Serve an uploaded image."""
    # Reject path traversal attempts
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(400, "Invalid filename")
    # Sanitize filename to prevent path traversal
    safe_name = os.path.basename(filename)
    file_path = os.path.join(IMAGE_UPLOAD_DIR, safe_name)

    if not os.path.exists(file_path):
        raise HTTPException(404, "Image not found")

    # Determine media type from extension
    ext = os.path.splitext(safe_name)[1].lower()
    media_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
    }
    media_type = media_types.get(ext, "application/octet-stream")

    return FileResponse(
        file_path,
        media_type=media_type,
        headers={
            "Cache-Control": "public, max-age=31536000",
        },
    )
