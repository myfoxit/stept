"""Tests for Git Sync integration endpoints."""
import pytest
from httpx import AsyncClient


pytestmark = pytest.mark.asyncio


async def test_get_git_sync_no_config(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    """Get git sync config when none exists returns empty/default."""
    pid = test_project["id"]
    resp = await async_client.get(f"/api/v1/git-sync/{pid}", headers=auth_headers)
    assert resp.status_code in [200, 404]


async def test_create_git_sync_config(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    """Create a git sync config."""
    pid = test_project["id"]
    resp = await async_client.put(
        f"/api/v1/git-sync/{pid}",
        json={
            "provider": "github",
            "repo_url": "https://github.com/test/repo",
            "branch": "main",
            "directory": "/docs",
            "access_token": "ghp_testtoken123",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["provider"] == "github"
    assert data["branch"] == "main"
    assert data["directory"] == "/docs"


async def test_update_git_sync_config(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    """Update an existing git sync config."""
    pid = test_project["id"]
    # Create first
    await async_client.put(
        f"/api/v1/git-sync/{pid}",
        json={"provider": "github", "repo_url": "https://github.com/test/repo", "branch": "main", "directory": "/", "access_token": "ghp_test"},
        headers=auth_headers,
    )
    # Update
    resp = await async_client.put(
        f"/api/v1/git-sync/{pid}",
        json={"provider": "gitlab", "repo_url": "https://gitlab.com/test/repo", "branch": "develop", "directory": "/guides", "access_token": "glpat_test"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["provider"] == "gitlab"
    assert resp.json()["branch"] == "develop"


async def test_delete_git_sync_config(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    """Delete git sync config."""
    pid = test_project["id"]
    # Create first
    await async_client.put(
        f"/api/v1/git-sync/{pid}",
        json={"provider": "github", "repo_url": "https://github.com/test/repo", "branch": "main", "directory": "/", "access_token": "ghp_test"},
        headers=auth_headers,
    )
    # Delete
    resp = await async_client.delete(f"/api/v1/git-sync/{pid}", headers=auth_headers)
    assert resp.status_code == 204


async def test_git_sync_invalid_provider(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    """Invalid provider returns 422."""
    pid = test_project["id"]
    resp = await async_client.put(
        f"/api/v1/git-sync/{pid}",
        json={"provider": "svn", "repo_url": "https://svn.test.com/repo", "branch": "main", "directory": "/", "access_token": "test"},
        headers=auth_headers,
    )
    assert resp.status_code == 422


async def test_git_sync_requires_auth(async_client: AsyncClient, test_project: dict):
    """Git sync endpoints require authentication."""
    pid = test_project["id"]
    resp = await async_client.get(f"/api/v1/git-sync/{pid}")
    assert resp.status_code == 401
