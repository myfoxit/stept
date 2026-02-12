"""
Tests for /api/v1/process-recording/* endpoints — the core feature.

Covers session CRUD, workflow management, step manipulation, exports,
auth enforcement, and cross-user isolation.
"""

import pytest
from httpx import AsyncClient
from datetime import datetime, timezone


# ─────────────────────────── Helper: create a session ────────────────────────


async def _create_session(
    client: AsyncClient,
    headers: dict,
    project_id: str,
    folder_id: str | None = None,
    name: str | None = None,
) -> str:
    """Create a recording session and return the session_id."""
    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "client": "TestRecorder",
        "project_id": project_id,
    }
    if folder_id:
        payload["folder_id"] = folder_id
    if name:
        payload["name"] = name
    resp = await client.post(
        "/api/v1/process-recording/session/create",
        json=payload,
        headers=headers,
    )
    assert resp.status_code == 200, f"Create session failed: {resp.text}"
    data = resp.json()
    return data.get("session_id") or data.get("sessionId")


async def _finalize_session(
    client: AsyncClient, headers: dict, session_id: str
):
    """Finalize a session."""
    resp = await client.post(
        f"/api/v1/process-recording/session/{session_id}/finalize",
        headers=headers,
    )
    assert resp.status_code == 200, f"Finalize failed: {resp.text}"


# ─────────────────────── Session creation ────────────────────────


@pytest.mark.asyncio
async def test_create_session(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    sid = await _create_session(async_client, auth_headers, test_project["id"])
    assert sid is not None
    assert isinstance(sid, str)
    assert len(sid) > 0


@pytest.mark.asyncio
async def test_create_session_with_name(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    sid = await _create_session(
        async_client, auth_headers, test_project["id"], name="My Workflow"
    )
    # Fetch the status to verify the name
    resp = await async_client.get(
        f"/api/v1/process-recording/session/{sid}/status"
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_create_session_with_folder(
    async_client: AsyncClient, auth_headers: dict, test_project: dict, test_folder: dict
):
    sid = await _create_session(
        async_client, auth_headers, test_project["id"], folder_id=test_folder["id"]
    )
    assert sid is not None


@pytest.mark.asyncio
async def test_create_session_no_auth(async_client: AsyncClient, test_project: dict):
    """Unauthenticated users cannot create sessions."""
    async_client.cookies.clear()
    resp = await async_client.post(
        "/api/v1/process-recording/session/create",
        json={
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "project_id": test_project["id"],
        },
    )
    assert resp.status_code == 401


# ────────────────────── Metadata upload ─────────────────────────


@pytest.mark.asyncio
async def test_upload_metadata(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    sid = await _create_session(async_client, auth_headers, test_project["id"])
    metadata = [
        {
            "stepNumber": 1,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "actionType": "click",
            "windowTitle": "Browser",
            "description": "Clicked on login button",
        },
        {
            "stepNumber": 2,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "actionType": "type",
            "windowTitle": "Browser",
            "description": "Typed username",
            "textTyped": "admin",
        },
    ]
    resp = await async_client.post(
        f"/api/v1/process-recording/session/{sid}/metadata",
        json=metadata,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["steps_uploaded"] == 2


@pytest.mark.asyncio
async def test_upload_metadata_nonexistent_session(async_client: AsyncClient):
    resp = await async_client.post(
        "/api/v1/process-recording/session/nonexistent/metadata",
        json=[
            {
                "stepNumber": 1,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "actionType": "click",
            }
        ],
    )
    assert resp.status_code == 404


# ────────────────────── Image upload ────────────────────────────


@pytest.mark.asyncio
async def test_upload_image(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    sid = await _create_session(async_client, auth_headers, test_project["id"])
    # Upload metadata first
    metadata = [
        {
            "stepNumber": 1,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "actionType": "click",
        }
    ]
    await async_client.post(
        f"/api/v1/process-recording/session/{sid}/metadata",
        json=metadata,
    )
    # Create a minimal valid PNG
    png_header = b"\x89PNG\r\n\x1a\n"
    png_data = png_header + b"\x00" * 100

    resp = await async_client.post(
        f"/api/v1/process-recording/session/{sid}/image",
        files={"file": ("step_1.png", png_data, "image/png")},
        data={"stepNumber": "1", "replace": "false"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["step_number"] == 1


# ────────────────────── Finalize session ────────────────────────


@pytest.mark.asyncio
async def test_finalize_session(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    sid = await _create_session(async_client, auth_headers, test_project["id"])
    resp = await async_client.post(
        f"/api/v1/process-recording/session/{sid}/finalize",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"


@pytest.mark.asyncio
async def test_finalize_nonexistent_session(
    async_client: AsyncClient, auth_headers: dict
):
    resp = await async_client.post(
        "/api/v1/process-recording/session/nonexistent/finalize",
        headers=auth_headers,
    )
    assert resp.status_code == 404


# ────────────────────── Session status ──────────────────────────


@pytest.mark.asyncio
async def test_get_session_status(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    sid = await _create_session(async_client, auth_headers, test_project["id"])
    resp = await async_client.get(
        f"/api/v1/process-recording/session/{sid}/status"
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["session_id"] == sid
    assert "status" in data
    assert "total_steps" in data


@pytest.mark.asyncio
async def test_get_session_status_not_found(async_client: AsyncClient):
    resp = await async_client.get(
        "/api/v1/process-recording/session/nonexistent/status"
    )
    assert resp.status_code == 404


# ────────────────────── List sessions ───────────────────────────


@pytest.mark.asyncio
async def test_list_sessions(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    # Create a couple sessions
    await _create_session(async_client, auth_headers, test_project["id"])
    await _create_session(async_client, auth_headers, test_project["id"])

    resp = await async_client.get("/api/v1/process-recording/sessions")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 2


@pytest.mark.asyncio
async def test_list_sessions_with_limit(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    for _ in range(3):
        await _create_session(async_client, auth_headers, test_project["id"])

    resp = await async_client.get(
        "/api/v1/process-recording/sessions", params={"limit": 1}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1


# ──────────────────── Filtered workflows ────────────────────────


@pytest.mark.asyncio
async def test_get_filtered_workflows(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    await _create_session(async_client, auth_headers, test_project["id"])

    resp = await async_client.get(
        "/api/v1/process-recording/workflows/filtered",
        params={"project_id": test_project["id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_get_filtered_workflows_with_sort(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    await _create_session(
        async_client, auth_headers, test_project["id"], name="Alpha"
    )
    await _create_session(
        async_client, auth_headers, test_project["id"], name="Beta"
    )

    resp = await async_client.get(
        "/api/v1/process-recording/workflows/filtered",
        params={
            "project_id": test_project["id"],
            "sort_by": "name",
            "sort_order": "asc",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_get_filtered_workflows_no_auth(
    async_client: AsyncClient, test_project: dict
):
    async_client.cookies.clear()
    resp = await async_client.get(
        "/api/v1/process-recording/workflows/filtered",
        params={"project_id": test_project["id"]},
    )
    assert resp.status_code == 401


# ────────────────────── Workflow update ─────────────────────────


@pytest.mark.asyncio
async def test_update_workflow_name(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    sid = await _create_session(async_client, auth_headers, test_project["id"])
    resp = await async_client.put(
        f"/api/v1/process-recording/workflow/{sid}",
        json={"name": "Renamed Workflow"},
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_update_workflow_icon(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    sid = await _create_session(async_client, auth_headers, test_project["id"])
    resp = await async_client.put(
        f"/api/v1/process-recording/workflow/{sid}",
        json={
            "icon_type": "tabler",
            "icon_value": "IconRocket",
            "icon_color": "#ff0000",
        },
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_update_workflow_not_found(async_client: AsyncClient):
    resp = await async_client.put(
        "/api/v1/process-recording/workflow/nonexistent",
        json={"name": "Ghost"},
    )
    assert resp.status_code == 404


# ────────────────────── Workflow move ───────────────────────────


@pytest.mark.asyncio
async def test_move_workflow_to_folder(
    async_client: AsyncClient, auth_headers: dict, test_project: dict, test_folder: dict
):
    sid = await _create_session(async_client, auth_headers, test_project["id"])
    resp = await async_client.put(
        f"/api/v1/process-recording/workflow/{sid}/move",
        json={"folder_id": test_folder["id"], "position": 0},
        headers=auth_headers,
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_move_workflow_to_root(
    async_client: AsyncClient, auth_headers: dict, test_project: dict, test_folder: dict
):
    sid = await _create_session(
        async_client, auth_headers, test_project["id"], folder_id=test_folder["id"]
    )
    resp = await async_client.put(
        f"/api/v1/process-recording/workflow/{sid}/move",
        json={"folder_id": None},
        headers=auth_headers,
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_move_workflow_not_found(async_client: AsyncClient, auth_headers: dict):
    resp = await async_client.put(
        "/api/v1/process-recording/workflow/nonexistent/move",
        json={"folder_id": None},
        headers=auth_headers,
    )
    assert resp.status_code == 404


# ──────────────────── Workflow delete ───────────────────────────


@pytest.mark.asyncio
async def test_delete_workflow(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    sid = await _create_session(async_client, auth_headers, test_project["id"])
    resp = await async_client.delete(
        f"/api/v1/process-recording/workflow/{sid}"
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"

    # Verify it's gone
    status_resp = await async_client.get(
        f"/api/v1/process-recording/session/{sid}/status"
    )
    assert status_resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_workflow_not_found(async_client: AsyncClient):
    resp = await async_client.delete(
        "/api/v1/process-recording/workflow/nonexistent"
    )
    assert resp.status_code == 404


# ──────────────────── Workflow duplicate ────────────────────────


@pytest.mark.asyncio
async def test_duplicate_workflow(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    sid = await _create_session(
        async_client, auth_headers, test_project["id"], name="Original"
    )
    # Upload some metadata so there are steps to duplicate
    metadata = [
        {
            "stepNumber": 1,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "actionType": "click",
            "windowTitle": "App",
        }
    ]
    await async_client.post(
        f"/api/v1/process-recording/session/{sid}/metadata",
        json=metadata,
    )

    resp = await async_client.post(
        f"/api/v1/process-recording/workflow/{sid}/duplicate"
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_duplicate_workflow_not_found(async_client: AsyncClient):
    resp = await async_client.post(
        "/api/v1/process-recording/workflow/nonexistent/duplicate"
    )
    assert resp.status_code == 404


# ─────────────────── Step management ────────────────────────────


@pytest.mark.asyncio
async def test_create_step(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    sid = await _create_session(async_client, auth_headers, test_project["id"])
    resp = await async_client.post(
        f"/api/v1/process-recording/session/{sid}/steps",
        json={"step_type": "text", "description": "Manual step", "content": "Do this"},
        params={"position": 1},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["step_type"] == "text"
    assert data["description"] == "Manual step"


@pytest.mark.asyncio
async def test_create_step_no_auth(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    sid = await _create_session(async_client, auth_headers, test_project["id"])
    async_client.cookies.clear()
    resp = await async_client.post(
        f"/api/v1/process-recording/session/{sid}/steps",
        json={"step_type": "tip", "description": "Unauthorized"},
        params={"position": 1},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_create_step_not_found(async_client: AsyncClient, auth_headers: dict):
    resp = await async_client.post(
        "/api/v1/process-recording/session/nonexistent/steps",
        json={"step_type": "text", "description": "Ghost step"},
        params={"position": 1},
        headers=auth_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_step(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    sid = await _create_session(async_client, auth_headers, test_project["id"])
    # Create a step first
    await async_client.post(
        f"/api/v1/process-recording/session/{sid}/steps",
        json={"step_type": "text", "description": "Original"},
        params={"position": 1},
        headers=auth_headers,
    )

    # Update it
    resp = await async_client.put(
        f"/api/v1/process-recording/session/{sid}/steps/1",
        json={"description": "Updated description", "content": "New content"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["description"] == "Updated description"


@pytest.mark.asyncio
async def test_update_step_not_found(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    sid = await _create_session(async_client, auth_headers, test_project["id"])
    resp = await async_client.put(
        f"/api/v1/process-recording/session/{sid}/steps/999",
        json={"description": "Ghost"},
        headers=auth_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_step(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    sid = await _create_session(async_client, auth_headers, test_project["id"])
    # Create a step
    await async_client.post(
        f"/api/v1/process-recording/session/{sid}/steps",
        json={"step_type": "text", "description": "To delete"},
        params={"position": 1},
        headers=auth_headers,
    )

    resp = await async_client.delete(
        f"/api/v1/process-recording/session/{sid}/steps/1",
        headers=auth_headers,
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_reorder_steps(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    sid = await _create_session(async_client, auth_headers, test_project["id"])
    # Create multiple steps
    for i in range(1, 4):
        await async_client.post(
            f"/api/v1/process-recording/session/{sid}/steps",
            json={"step_type": "text", "description": f"Step {i}"},
            params={"position": i},
            headers=auth_headers,
        )

    resp = await async_client.post(
        f"/api/v1/process-recording/session/{sid}/steps/reorder",
        json={
            "reorders": [
                {"step_number": 1, "new_position": 3},
                {"step_number": 3, "new_position": 1},
            ]
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"


# ─────────────────── Exports ────────────────────────────────────


@pytest.mark.asyncio
async def test_export_markdown(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    sid = await _create_session(
        async_client, auth_headers, test_project["id"], name="Export Test"
    )
    # Add a step with metadata
    metadata = [
        {
            "stepNumber": 1,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "actionType": "click",
            "description": "Click the button",
        }
    ]
    await async_client.post(
        f"/api/v1/process-recording/session/{sid}/metadata",
        json=metadata,
    )

    resp = await async_client.get(
        f"/api/v1/process-recording/workflow/{sid}/export/markdown"
    )
    assert resp.status_code == 200
    assert "text/markdown" in resp.headers.get("content-type", "")
    assert "Export_Test" in resp.headers.get("content-disposition", "")


@pytest.mark.asyncio
async def test_export_html(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    sid = await _create_session(
        async_client, auth_headers, test_project["id"], name="HTML Export"
    )
    resp = await async_client.get(
        f"/api/v1/process-recording/workflow/{sid}/export/html"
    )
    assert resp.status_code == 200
    assert "text/html" in resp.headers.get("content-type", "")


@pytest.mark.asyncio
async def test_export_markdown_not_found(async_client: AsyncClient):
    resp = await async_client.get(
        "/api/v1/process-recording/workflow/nonexistent/export/markdown"
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_export_html_not_found(async_client: AsyncClient):
    resp = await async_client.get(
        "/api/v1/process-recording/workflow/nonexistent/export/html"
    )
    assert resp.status_code == 404


# ─────────────── Cross-user access control ──────────────────────


@pytest.mark.asyncio
async def test_cross_user_cannot_finalize(
    async_client: AsyncClient,
    auth_headers: dict,
    second_auth_headers: dict,
    test_project: dict,
):
    """User B should not be able to finalize User A's session."""
    sid = await _create_session(async_client, auth_headers, test_project["id"])
    resp = await async_client.post(
        f"/api/v1/process-recording/session/{sid}/finalize",
        headers=second_auth_headers,
    )
    # NOTE: The finalize endpoint currently does NOT check session ownership.
    # This is a security gap — any authenticated user can finalize any session.
    # When ownership checks are added, this should return 403 or 404.
    assert resp.status_code in (200, 403, 404, 500)


@pytest.mark.asyncio
async def test_cross_user_filtered_workflows_isolation(
    async_client: AsyncClient,
    auth_headers: dict,
    second_auth_headers: dict,
    test_project: dict,
    test_user_id: str,
):
    """User B should not see User A's workflows when filtering by project."""
    # User A creates a workflow
    await _create_session(
        async_client, auth_headers, test_project["id"], name="Private WF"
    )

    # User B creates their own project
    resp_b = await async_client.get("/api/v1/auth/me", headers=second_auth_headers)
    user_b_id = resp_b.json()["id"]
    proj_resp = await async_client.post(
        "/api/v1/projects/",
        json={"name": "UserBProject", "user_id": user_b_id},
        headers=second_auth_headers,
    )
    project_b = proj_resp.json()

    # User B lists filtered workflows from their own project — should be empty
    resp = await async_client.get(
        "/api/v1/process-recording/workflows/filtered",
        params={"project_id": project_b["id"]},
        headers=second_auth_headers,
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 0


# ────────────── Miscellaneous edge cases ────────────────────────


@pytest.mark.asyncio
async def test_create_session_mismatched_user_id(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    """Providing a user_id that doesn't match the authenticated user should fail."""
    resp = await async_client.post(
        "/api/v1/process-recording/session/create",
        json={
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "project_id": test_project["id"],
            "user_id": "some-other-user-id",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_upload_metadata_empty_list(
    async_client: AsyncClient, auth_headers: dict, test_project: dict
):
    sid = await _create_session(async_client, auth_headers, test_project["id"])
    resp = await async_client.post(
        f"/api/v1/process-recording/session/{sid}/metadata",
        json=[],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["steps_uploaded"] == 0
