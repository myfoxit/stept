"""Tests for /api/v1/audit/* endpoints — Phase 2: Audit Trail."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_audit_logs_empty(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    resp = await async_client.get(
        "/api/v1/audit/logs",
        params={"project_id": test_project["id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_get_audit_logs_after_action(
    async_client: AsyncClient, auth_headers: dict, test_project: dict, test_folder: dict
):
    # Create a document (may or may not trigger audit log)
    await async_client.post(
        "/api/v1/documents/",
        json={
            "name": "AuditTestDoc",
            "content": {},
            "project_id": test_project["id"],
            "folder_id": test_folder["id"],
        },
        headers=auth_headers,
    )

    resp = await async_client.get(
        "/api/v1/audit/logs",
        params={"project_id": test_project["id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_audit_logs_require_admin(
    async_client: AsyncClient, second_auth_headers: dict, test_project: dict
):
    """Non-member should be denied access to audit logs."""
    resp = await async_client.get(
        "/api/v1/audit/logs",
        params={"project_id": test_project["id"]},
        headers=second_auth_headers,
    )
    assert resp.status_code in (403, 404)


@pytest.mark.asyncio
async def test_audit_log_stats(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    resp = await async_client.get(
        "/api/v1/audit/logs/stats",
        params={"project_id": test_project["id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), dict)


@pytest.mark.asyncio
async def test_audit_log_export_csv(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    resp = await async_client.get(
        "/api/v1/audit/logs/export",
        params={"project_id": test_project["id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert "text/csv" in resp.headers.get("content-type", "")


@pytest.mark.asyncio
async def test_audit_log_filter_by_action(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    resp = await async_client.get(
        "/api/v1/audit/logs",
        params={"project_id": test_project["id"], "action": "create"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
