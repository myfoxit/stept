"""
Unified storage abstraction layer.

Supports local filesystem, S3-compatible (AWS S3, Cloudflare R2, MinIO),
Google Cloud Storage, and Azure Blob Storage.

Usage:
    from app.services.storage import get_storage_backend
    backend = get_storage_backend()
    path = await backend.ensure_session_path("my-prefix")
    stored = await backend.save_file(path, "file.pdf", data, "application/pdf")
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Any, Optional

import aiofiles

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Configuration — read once at import time
# ──────────────────────────────────────────────────────────────────────────────

STORAGE_BACKEND_TYPE = os.getenv("STORAGE_BACKEND", os.getenv("STORAGE_TYPE", "local")).lower()
LOCAL_STORAGE_PATH = os.path.abspath(os.getenv("LOCAL_STORAGE_PATH", "./storage/recordings"))
UPLOAD_DIR = os.path.abspath(os.getenv("UPLOAD_DIR", "./uploads"))

# S3-compatible (AWS S3, Cloudflare R2, MinIO, DigitalOcean Spaces, Backblaze B2, Wasabi, Hetzner...)
S3_BUCKET = os.getenv("S3_BUCKET", "")
S3_PREFIX = os.getenv("S3_PREFIX", "uploads")
S3_REGION = os.getenv("S3_REGION", None)
S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL", None)

# Explicit S3 credentials (for MinIO / R2 / non-AWS)
S3_ACCESS_KEY_ID = os.getenv("S3_ACCESS_KEY_ID", None)
S3_SECRET_ACCESS_KEY = os.getenv("S3_SECRET_ACCESS_KEY", None)

# Force path-style addressing (required for MinIO, some R2 setups, LocalStack)
# Virtual-hosted style: bucket.s3.amazonaws.com/key  (default for AWS)
# Path style:           s3.amazonaws.com/bucket/key  (required for most self-hosted S3)
S3_FORCE_PATH_STYLE = os.getenv("S3_FORCE_PATH_STYLE", "false").lower() in ("true", "1", "yes")

# GCS
GCS_BUCKET = os.getenv("STORAGE_GCS_BUCKET", "")
GCS_CREDENTIALS_FILE = os.getenv("STORAGE_GCS_CREDENTIALS_FILE", "")

# Azure
AZURE_CONTAINER = os.getenv("STORAGE_AZURE_CONTAINER", "")
AZURE_CONNECTION_STRING = os.getenv("STORAGE_AZURE_CONNECTION_STRING", "")


# ──────────────────────────────────────────────────────────────────────────────
# Storage Backend Interface
# ──────────────────────────────────────────────────────────────────────────────

class StorageBackend:
    """Abstract base — every backend must implement save_file at minimum."""

    async def ensure_session_path(self, session_id: str) -> str:
        raise NotImplementedError

    async def save_metadata(self, session_path: str, metadata_obj: Any) -> None:
        raise NotImplementedError

    async def save_file(self, session_path: str, filename: str, data: bytes, mime_type: str) -> str:
        """Save *data* under *session_path/filename*. Return the stored key/path."""
        raise NotImplementedError

    async def read_file(self, session_path: str, stored_relative_path: str) -> Optional[bytes]:
        """Read file contents as bytes. Returns None if the file does not exist."""
        return None

    async def delete_file(self, stored_path: str) -> None:
        """Delete a single stored file by its stored key/path."""
        pass

    async def delete_prefix(self, prefix: str) -> None:
        """Delete all objects under *prefix* (directory on local, key prefix on cloud)."""
        pass

    async def resolve_local_path(self, session_path: str, stored_relative_path: str) -> Optional[str]:
        """Return an absolute local path if the backend is local; else None."""
        return None

    async def get_download_url(self, session_path: str, stored_relative_path: str, expires_in: int = 3600) -> Optional[str]:
        """Return a presigned/signed URL if applicable; else None."""
        return None


# ──────────────────────────────────────────────────────────────────────────────
# Local filesystem
# ──────────────────────────────────────────────────────────────────────────────

class LocalStorageBackend(StorageBackend):
    def __init__(self, base_dir: str):
        self.base_dir = os.path.abspath(base_dir)

    async def ensure_session_path(self, session_id: str) -> str:
        session_dir = os.path.join(self.base_dir, session_id)
        Path(session_dir).mkdir(parents=True, exist_ok=True)
        return session_dir

    async def save_metadata(self, session_path: str, metadata_obj: Any) -> None:
        metadata_file = os.path.join(session_path, "metadata.json")
        async with aiofiles.open(metadata_file, "w") as f:
            await f.write(json.dumps(metadata_obj, indent=2))

    async def save_file(self, session_path: str, filename: str, data: bytes, mime_type: str) -> str:
        safe_name = os.path.basename(filename)
        file_path = os.path.join(session_path, safe_name)
        Path(session_path).mkdir(parents=True, exist_ok=True)
        async with aiofiles.open(file_path, "wb") as f:
            await f.write(data)
        return safe_name

    async def read_file(self, session_path: str, stored_relative_path: str) -> Optional[bytes]:
        local_path = await self.resolve_local_path(session_path, stored_relative_path)
        if local_path and os.path.exists(local_path):
            async with aiofiles.open(local_path, "rb") as f:
                return await f.read()
        return None

    async def delete_file(self, stored_path: str) -> None:
        if os.path.isfile(stored_path):
            os.remove(stored_path)

    async def delete_prefix(self, prefix: str) -> None:
        import shutil
        if os.path.isdir(prefix):
            shutil.rmtree(prefix, ignore_errors=True)

    async def resolve_local_path(self, session_path: Optional[str], stored_relative_path: str) -> Optional[str]:
        if not session_path:
            return None
        session_id = os.path.basename(session_path)
        actual_session_dir = os.path.join(self.base_dir, session_id)
        return os.path.join(actual_session_dir, stored_relative_path)


# ──────────────────────────────────────────────────────────────────────────────
# S3-compatible (AWS S3, Cloudflare R2, MinIO)
# ──────────────────────────────────────────────────────────────────────────────

class S3StorageBackend(StorageBackend):
    def __init__(
        self,
        bucket: str,
        prefix: str,
        region: Optional[str] = None,
        endpoint_url: Optional[str] = None,
        access_key_id: Optional[str] = None,
        secret_access_key: Optional[str] = None,
        force_path_style: bool = False,
    ):
        self.bucket = bucket
        self.prefix = prefix.strip("/")
        self.region = region
        self.endpoint_url = endpoint_url
        try:
            import boto3  # type: ignore
            from botocore.config import Config as BotoConfig

            kwargs: dict[str, Any] = {}
            if region:
                kwargs["region_name"] = region
            if endpoint_url:
                kwargs["endpoint_url"] = endpoint_url
            if access_key_id and secret_access_key:
                kwargs["aws_access_key_id"] = access_key_id
                kwargs["aws_secret_access_key"] = secret_access_key
            # Use s3v4 signatures. Path-style addressing is required for
            # MinIO, LocalStack, and some R2 setups. AWS and most managed
            # services use virtual-hosted style.
            addressing_style = "path" if force_path_style else "virtual"
            kwargs["config"] = BotoConfig(
                signature_version="s3v4",
                s3={"addressing_style": addressing_style},
            )
            self._client = boto3.client("s3", **kwargs)
        except Exception:
            self._client = None

    async def ensure_session_path(self, session_id: str) -> str:
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
        return key

    async def read_file(self, session_path: str, stored_relative_path: str) -> Optional[bytes]:
        if not self._client:
            raise RuntimeError("boto3 is required for S3 operations")
        key = stored_relative_path if stored_relative_path.startswith(self.prefix) else f"{session_path}/{stored_relative_path}"
        try:
            response = await asyncio.to_thread(
                self._client.get_object,
                Bucket=self.bucket,
                Key=key,
            )
            return await asyncio.to_thread(response["Body"].read)
        except Exception:
            return None

    async def delete_file(self, stored_path: str) -> None:
        if not self._client:
            return
        await asyncio.to_thread(
            self._client.delete_object,
            Bucket=self.bucket,
            Key=stored_path,
        )

    async def delete_prefix(self, prefix: str) -> None:
        if not self._client:
            return
        paginator = self._client.get_paginator("list_objects_v2")
        async def _delete():
            for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
                objects = page.get("Contents", [])
                if objects:
                    self._client.delete_objects(
                        Bucket=self.bucket,
                        Delete={"Objects": [{"Key": o["Key"]} for o in objects]},
                    )
        await asyncio.to_thread(_delete)

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


# ──────────────────────────────────────────────────────────────────────────────
# Google Cloud Storage
# ──────────────────────────────────────────────────────────────────────────────

class GCSStorageBackend(StorageBackend):
    def __init__(self, bucket: str, prefix: str = "recordings", credentials_file: Optional[str] = None):
        self.bucket_name = bucket
        self.prefix = prefix.strip("/")
        try:
            from google.cloud import storage as gcs_storage

            if credentials_file:
                self._client = gcs_storage.Client.from_service_account_json(credentials_file)
            else:
                self._client = gcs_storage.Client()
            self._bucket = self._client.bucket(bucket)
        except ImportError:
            raise RuntimeError("google-cloud-storage is required for GCS backend. Install with: pip install google-cloud-storage")
        except Exception as e:
            raise RuntimeError(f"Failed to initialize GCS client: {e}")

    async def ensure_session_path(self, session_id: str) -> str:
        return f"{self.prefix}/{session_id}"

    async def save_metadata(self, session_path: str, metadata_obj: Any) -> None:
        key = f"{session_path}/metadata.json"
        blob = self._bucket.blob(key)
        body = json.dumps(metadata_obj, indent=2)
        await asyncio.to_thread(blob.upload_from_string, body, content_type="application/json")

    async def save_file(self, session_path: str, filename: str, data: bytes, mime_type: str) -> str:
        safe_name = os.path.basename(filename)
        key = f"{session_path}/{safe_name}"
        blob = self._bucket.blob(key)
        await asyncio.to_thread(blob.upload_from_string, data, content_type=mime_type or "application/octet-stream")
        return key

    async def read_file(self, session_path: str, stored_relative_path: str) -> Optional[bytes]:
        key = stored_relative_path if stored_relative_path.startswith(self.prefix) else f"{session_path}/{stored_relative_path}"
        blob = self._bucket.blob(key)
        try:
            return await asyncio.to_thread(blob.download_as_bytes)
        except Exception:
            return None

    async def delete_file(self, stored_path: str) -> None:
        blob = self._bucket.blob(stored_path)
        try:
            await asyncio.to_thread(blob.delete)
        except Exception:
            pass

    async def delete_prefix(self, prefix: str) -> None:
        blobs = list(self._client.list_blobs(self._bucket, prefix=prefix))
        if blobs:
            await asyncio.to_thread(self._bucket.delete_blobs, blobs)

    async def get_download_url(self, session_path: str, stored_relative_path: str, expires_in: int = 3600) -> Optional[str]:
        from datetime import timedelta

        key = stored_relative_path if stored_relative_path.startswith(self.prefix) else f"{session_path}/{stored_relative_path}"
        blob = self._bucket.blob(key)
        return await asyncio.to_thread(blob.generate_signed_url, expiration=timedelta(seconds=expires_in))


# ──────────────────────────────────────────────────────────────────────────────
# Azure Blob Storage
# ──────────────────────────────────────────────────────────────────────────────

class AzureBlobStorageBackend(StorageBackend):
    def __init__(self, container: str, connection_string: str, prefix: str = "recordings"):
        self.container_name = container
        self.prefix = prefix.strip("/")
        try:
            from azure.storage.blob import BlobServiceClient

            self._service = BlobServiceClient.from_connection_string(connection_string)
            self._container = self._service.get_container_client(container)
        except ImportError:
            raise RuntimeError("azure-storage-blob is required for Azure backend. Install with: pip install azure-storage-blob")
        except Exception as e:
            raise RuntimeError(f"Failed to initialize Azure Blob client: {e}")

    async def ensure_session_path(self, session_id: str) -> str:
        return f"{self.prefix}/{session_id}"

    async def save_metadata(self, session_path: str, metadata_obj: Any) -> None:
        key = f"{session_path}/metadata.json"
        body = json.dumps(metadata_obj, indent=2).encode("utf-8")
        blob = self._container.get_blob_client(key)
        await asyncio.to_thread(blob.upload_blob, body, overwrite=True, content_type="application/json")

    async def save_file(self, session_path: str, filename: str, data: bytes, mime_type: str) -> str:
        safe_name = os.path.basename(filename)
        key = f"{session_path}/{safe_name}"
        blob = self._container.get_blob_client(key)
        await asyncio.to_thread(blob.upload_blob, data, overwrite=True, content_type=mime_type or "application/octet-stream")
        return key

    async def read_file(self, session_path: str, stored_relative_path: str) -> Optional[bytes]:
        key = stored_relative_path if stored_relative_path.startswith(self.prefix) else f"{session_path}/{stored_relative_path}"
        blob = self._container.get_blob_client(key)
        try:
            downloader = await asyncio.to_thread(blob.download_blob)
            return await asyncio.to_thread(downloader.readall)
        except Exception:
            return None

    async def delete_file(self, stored_path: str) -> None:
        blob = self._container.get_blob_client(stored_path)
        try:
            await asyncio.to_thread(blob.delete_blob)
        except Exception:
            pass

    async def delete_prefix(self, prefix: str) -> None:
        blobs = list(self._container.list_blobs(name_starts_with=prefix))
        for blob_props in blobs:
            blob = self._container.get_blob_client(blob_props.name)
            try:
                await asyncio.to_thread(blob.delete_blob)
            except Exception:
                pass

    async def get_download_url(self, session_path: str, stored_relative_path: str, expires_in: int = 3600) -> Optional[str]:
        from datetime import datetime, timedelta, timezone

        from azure.storage.blob import BlobSasPermissions, generate_blob_sas

        key = stored_relative_path if stored_relative_path.startswith(self.prefix) else f"{session_path}/{stored_relative_path}"
        sas_token = generate_blob_sas(
            account_name=self._service.account_name,
            container_name=self.container_name,
            blob_name=key,
            account_key=self._service.credential.account_key,
            permission=BlobSasPermissions(read=True),
            expiry=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(seconds=expires_in),
        )
        return f"{self._container.url}/{key}?{sas_token}"


# ──────────────────────────────────────────────────────────────────────────────
# Singleton factory
# ──────────────────────────────────────────────────────────────────────────────

_backend_cache: dict[str, StorageBackend] = {}


def get_storage_backend(
    force_type: Optional[str] = None,
    prefix_override: Optional[str] = None,
) -> StorageBackend:
    """Return (and cache) a storage backend.

    *force_type*      — override the backend type (e.g. ``"s3"`` / ``"local"``).
                        Used by process_recording which stores the backend type
                        per session.
    *prefix_override* — use a different key prefix while keeping the same
                        backend type and credentials.

    Results are cached by ``(type, prefix)`` so each unique combination is
    created only once.
    """
    stype = (force_type or STORAGE_BACKEND_TYPE).lower()
    prefix = prefix_override  # may be None → use backend default

    cache_key = f"{stype}:{prefix or ''}"
    if cache_key in _backend_cache:
        return _backend_cache[cache_key]

    if stype == "s3":
        backend: StorageBackend = S3StorageBackend(
            bucket=S3_BUCKET,
            prefix=prefix or S3_PREFIX,
            region=S3_REGION,
            endpoint_url=S3_ENDPOINT_URL,
            access_key_id=S3_ACCESS_KEY_ID,
            secret_access_key=S3_SECRET_ACCESS_KEY,
            force_path_style=S3_FORCE_PATH_STYLE,
        )
    elif stype == "gcs":
        backend = GCSStorageBackend(
            bucket=GCS_BUCKET,
            prefix=prefix or S3_PREFIX,
            credentials_file=GCS_CREDENTIALS_FILE or None,
        )
    elif stype == "azure":
        backend = AzureBlobStorageBackend(
            container=AZURE_CONTAINER,
            connection_string=AZURE_CONNECTION_STRING,
            prefix=prefix or S3_PREFIX,
        )
    else:
        backend = LocalStorageBackend(LOCAL_STORAGE_PATH)

    _backend_cache[cache_key] = backend
    return backend
