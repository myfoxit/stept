from datetime import datetime, timezone

import pytest
from httpx import AsyncClient


async def _create_session(async_client: AsyncClient, auth_headers: dict, project_id: str) -> str:
    resp = await async_client.post(
        "/api/v1/process-recording/session/create",
        json={
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "client": "TestRecorder",
            "project_id": project_id,
            "name": "Ctx Session",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    return data.get("session_id") or data.get("sessionId")


@pytest.mark.asyncio
async def test_comments_crud_and_resolve(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    sid = await _create_session(async_client, auth_headers, test_project["id"])

    create = await async_client.post(
        f"/api/v1/comments?project_id={test_project['id']}",
        json={"resource_type": "workflow", "resource_id": sid, "content": "First"},
        headers=auth_headers,
    )
    assert create.status_code == 201
    cid = create.json()["id"]

    listed = await async_client.get(
        f"/api/v1/comments?project_id={test_project['id']}&resource_type=workflow&resource_id={sid}",
        headers=auth_headers,
    )
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    updated = await async_client.put(
        f"/api/v1/comments/{cid}", json={"content": "Updated"}, headers=auth_headers
    )
    assert updated.status_code == 200
    assert updated.json()["content"] == "Updated"

    resolved = await async_client.patch(f"/api/v1/comments/{cid}/resolve", headers=auth_headers)
    assert resolved.status_code == 200
    assert resolved.json()["resolved"] is True

    deleted = await async_client.delete(f"/api/v1/comments/{cid}", headers=auth_headers)
    assert deleted.status_code == 204


@pytest.mark.asyncio
async def test_comment_reply_depth_limit(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    sid = await _create_session(async_client, auth_headers, test_project["id"])
    c1 = await async_client.post(
        f"/api/v1/comments?project_id={test_project['id']}",
        json={"resource_type": "workflow", "resource_id": sid, "content": "Parent"},
        headers=auth_headers,
    )
    parent_id = c1.json()["id"]

    c2 = await async_client.post(
        f"/api/v1/comments?project_id={test_project['id']}",
        json={"resource_type": "workflow", "resource_id": sid, "content": "Reply", "parent_id": parent_id},
        headers=auth_headers,
    )
    assert c2.status_code == 201

    c3 = await async_client.post(
        f"/api/v1/comments?project_id={test_project['id']}",
        json={"resource_type": "workflow", "resource_id": sid, "content": "Too deep", "parent_id": c2.json()['id']},
        headers=auth_headers,
    )
    assert c3.status_code == 400


@pytest.mark.asyncio
async def test_comment_forbidden_edit_other_user(
    async_client: AsyncClient, auth_headers: dict, second_auth_headers: dict, test_project: dict
):
    sid = await _create_session(async_client, auth_headers, test_project["id"])
    created = await async_client.post(
        f"/api/v1/comments?project_id={test_project['id']}",
        json={"resource_type": "workflow", "resource_id": sid, "content": "Mine"},
        headers=auth_headers,
    )
    cid = created.json()["id"]

    forbidden = await async_client.put(
        f"/api/v1/comments/{cid}", json={"content": "hack"}, headers=second_auth_headers
    )
    assert forbidden.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "/api/v1/comments?project_id=x&resource_type=workflow&resource_id=y"),
        ("post", "/api/v1/comments?project_id=x"),
        ("put", "/api/v1/comments/nonexistent"),
        ("delete", "/api/v1/comments/nonexistent"),
        ("patch", "/api/v1/comments/nonexistent/resolve"),
        ("get", "/api/v1/context-links"),
        ("post", "/api/v1/context-links"),
        ("put", "/api/v1/context-links/nonexistent"),
        ("delete", "/api/v1/context-links/nonexistent"),
        ("get", "/api/v1/context-links/match?url=https://x"),
    ],
)
async def test_comments_context_links_require_auth(async_client: AsyncClient, method: str, path: str):
    body = {
        "project_id": "x",
        "match_type": "url_exact",
        "match_value": "https://example.com",
        "resource_type": "workflow",
        "resource_id": "wf",
    }
    fn = getattr(async_client, method)
    if method in {"post", "put"}:
        resp = await fn(path, json=body)
    else:
        resp = await fn(path)
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_context_links_crud_and_match(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    sid = await _create_session(async_client, auth_headers, test_project["id"])

    created = await async_client.post(
        "/api/v1/context-links",
        json={
            "project_id": test_project["id"],
            "match_type": "url_pattern",
            "match_value": "https://docs.example.com/*",
            "resource_type": "workflow",
            "resource_id": sid,
            "note": "docs",
            "priority": 20,
        },
        headers=auth_headers,
    )
    assert created.status_code == 200
    lid = created.json()["id"]

    listed = await async_client.get(
        f"/api/v1/context-links?project_id={test_project['id']}", headers=auth_headers
    )
    assert listed.status_code == 200
    assert any(i["id"] == lid for i in listed.json())

    matched = await async_client.get(
        "/api/v1/context-links/match",
        params={"project_id": test_project["id"], "url": "https://docs.example.com/page"},
        headers=auth_headers,
    )
    assert matched.status_code == 200
    assert len(matched.json()["matches"]) >= 1

    updated = await async_client.put(
        f"/api/v1/context-links/{lid}", json={"priority": 1}, headers=auth_headers
    )
    assert updated.status_code == 200
    assert updated.json()["priority"] == 1

    deleted = await async_client.delete(f"/api/v1/context-links/{lid}", headers=auth_headers)
    assert deleted.status_code == 200
    assert deleted.json()["ok"] is True


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "match_type,match_value,url,app_name,window_title,expected",
    [
        ("url_exact", "https://a.com", "https://a.com", None, None, 1),
        ("url_pattern", "https://*.a.com/*", "https://docs.a.com/x", None, None, 1),
        ("app_name", "Cursor", None, "Cursor", None, 1),
        ("window_title", "Pull Request", None, None, "GitHub Pull Request #1", 1),
        ("url_exact", "https://a.com", "https://b.com", None, None, 0),
    ],
)
async def test_context_link_match_modes(
    async_client: AsyncClient,
    auth_headers: dict,
    test_project: dict,
    match_type: str,
    match_value: str,
    url: str | None,
    app_name: str | None,
    window_title: str | None,
    expected: int,
):
    sid = await _create_session(async_client, auth_headers, test_project["id"])
    await async_client.post(
        "/api/v1/context-links",
        json={
            "project_id": test_project["id"],
            "match_type": match_type,
            "match_value": match_value,
            "resource_type": "workflow",
            "resource_id": sid,
        },
        headers=auth_headers,
    )

    params = {"project_id": test_project["id"]}
    if url:
        params["url"] = url
    if app_name:
        params["app_name"] = app_name
    if window_title:
        params["window_title"] = window_title

    resp = await async_client.get("/api/v1/context-links/match", params=params, headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()["matches"]) == expected
