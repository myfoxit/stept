"""Tests for file/image upload endpoint."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_upload_image(
    async_client: AsyncClient,
    auth_headers: dict,
):
    """Test uploading an image file."""
    # Create a small PNG file (1x1 pixel)
    png_data = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
        b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00"
        b"\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00"
        b"\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    
    resp = await async_client.post(
        "/api/v1/uploads/image",
        files={"file": ("test.png", png_data, "image/png")},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "url" in data
    assert data["url"].startswith("/api/v1/uploads/image/")
    assert "filename" in data
    assert data["size"] > 0


@pytest.mark.asyncio
async def test_upload_image_wrong_type(
    async_client: AsyncClient,
    auth_headers: dict,
):
    """Test that non-image files are rejected."""
    resp = await async_client.post(
        "/api/v1/uploads/image",
        files={"file": ("test.txt", b"hello world", "text/plain")},
        headers=auth_headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_get_uploaded_image(
    async_client: AsyncClient,
    auth_headers: dict,
):
    """Test that uploaded images can be retrieved."""
    # Upload first
    png_data = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
        b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00"
        b"\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00"
        b"\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    
    upload_resp = await async_client.post(
        "/api/v1/uploads/image",
        files={"file": ("test.png", png_data, "image/png")},
        headers=auth_headers,
    )
    assert upload_resp.status_code == 200
    url = upload_resp.json()["url"]
    
    # Retrieve it (auth required after #96; endpoint returns 307 redirect to presigned URL)
    get_resp = await async_client.get(url, headers=auth_headers)
    assert get_resp.status_code in (200, 307)
    if get_resp.status_code == 200:
        assert get_resp.headers["content-type"] == "image/png"
