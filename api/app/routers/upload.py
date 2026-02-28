# app/routers/upload.py
"""Generic file/image upload endpoint for document images etc."""
import asyncio
import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse, RedirectResponse
from app.security import get_current_user
from app.models import User

router = APIRouter()

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")
IMAGE_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "images")
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"}

# Storage configuration (mirrors process_recording settings)
STORAGE_TYPE = os.getenv("STORAGE_BACKEND", os.getenv("STORAGE_TYPE", "local")).lower()
S3_BUCKET = os.getenv("S3_BUCKET", "")
S3_PREFIX = os.getenv("S3_PREFIX", "uploads/images")
S3_REGION = os.getenv("S3_REGION", None)
S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL", None)


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

    if STORAGE_TYPE == "s3" and S3_BUCKET:
        try:
            import boto3  # type: ignore
            client = boto3.client("s3", region_name=S3_REGION, endpoint_url=S3_ENDPOINT_URL)
            key = f"{S3_PREFIX.strip('/')}/{unique_name}"
            await asyncio.to_thread(
                client.put_object,
                Bucket=S3_BUCKET,
                Key=key,
                Body=content,
                ContentType=content_type,
            )
        except Exception as e:
            raise HTTPException(500, f"S3 upload failed: {e}")
    else:
        # Local storage (default)
        os.makedirs(IMAGE_UPLOAD_DIR, exist_ok=True)
        file_path = os.path.join(IMAGE_UPLOAD_DIR, unique_name)
        with open(file_path, "wb") as f:
            f.write(content)

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

    if STORAGE_TYPE == "s3" and S3_BUCKET:
        try:
            import boto3  # type: ignore
            client = boto3.client("s3", region_name=S3_REGION, endpoint_url=S3_ENDPOINT_URL)
            key = f"{S3_PREFIX.strip('/')}/{safe_name}"
            # Generate a presigned URL and redirect
            presigned = await asyncio.to_thread(
                client.generate_presigned_url,
                "get_object",
                Params={"Bucket": S3_BUCKET, "Key": key},
                ExpiresIn=3600,
            )
            return RedirectResponse(presigned, headers={"Cache-Control": "public, max-age=3600"})
        except Exception:
            raise HTTPException(404, "Image not found")
    else:
        # Local storage
        file_path = os.path.join(IMAGE_UPLOAD_DIR, safe_name)
        if not os.path.exists(file_path):
            raise HTTPException(404, "Image not found")

        return FileResponse(
            file_path,
            media_type=_get_media_type(safe_name),
            headers={"Cache-Control": "public, max-age=31536000"},
        )
