"""Tests for /api/v1/search/* endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_search_empty_query(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    """Searching with a valid but very short query should work (min_length=1)."""
    resp = await async_client.get(
        "/api/v1/search/search",
        params={"q": "x", "project_id": test_project["id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "results" in data
    assert data["total_results"] == 0  # Nothing indexed yet


@pytest.mark.asyncio
async def test_search_missing_query_param(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    """Omitting the 'q' parameter should return 422 (validation error)."""
    resp = await async_client.get(
        "/api/v1/search/search",
        params={"project_id": test_project["id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_search_keyword(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    """
    Semantic search falls back to keyword search when embeddings are unavailable.
    With no data, we should get an empty result set gracefully.
    """
    resp = await async_client.get(
        "/api/v1/search/semantic",
        params={"q": "deploy", "project_id": test_project["id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["search_type"] == "keyword"
    assert "results" in data
    assert isinstance(data["results"], list)
