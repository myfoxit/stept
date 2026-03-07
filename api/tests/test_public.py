"""Tests for /api/v1/public/* endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_public_workflow_invalid_token(async_client: AsyncClient):
    """GET /public/workflow/<invalid> should return 404."""
    resp = await async_client.get("/api/v1/public/workflow/nonexistent-token")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_public_document_invalid_token(async_client: AsyncClient):
    """GET /public/document/<invalid> should return 404."""
    resp = await async_client.get("/api/v1/public/document/nonexistent-token")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_public_workflow_image_invalid(async_client: AsyncClient):
    """GET /public/workflow/<invalid>/image/1 should return 404."""
    resp = await async_client.get("/api/v1/public/workflow/bad-token/image/1")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_public_embedded_workflow_invalid(async_client: AsyncClient):
    """GET /public/document/<bad>/embedded-workflow/<bad> should return 404."""
    resp = await async_client.get("/api/v1/public/document/bad-token/embedded-workflow/bad-id")
    assert resp.status_code == 404
