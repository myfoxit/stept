from __future__ import annotations

from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient


pytestmark = pytest.mark.asyncio


async def test_tts_config_reports_public_availability(async_client: AsyncClient):
    with patch("app.routers.tts.settings.TTS_PROVIDER", "openai"), patch(
        "app.routers.tts.settings.OPENAI_API_KEY", "sk-test"
    ):
        resp = await async_client.get("/api/v1/tts/config")

    assert resp.status_code == 200
    assert resp.json() == {"provider": "openai", "available": True}


async def test_tts_speak_returns_cached_audio(async_client: AsyncClient):
    with patch("app.routers.tts.settings.OPENAI_API_KEY", "sk-test"), patch(
        "app.routers.tts._read_cached", new=AsyncMock(return_value=b"cached-audio")
    ) as read_cached, patch("app.routers.tts._generate_tts", new=AsyncMock()) as generate_tts:
        resp = await async_client.post("/api/v1/tts/speak", json={"text": "Hello world"})

    assert resp.status_code == 200
    assert resp.content == b"cached-audio"
    assert resp.headers["content-type"].startswith("audio/mpeg")
    read_cached.assert_awaited_once()
    generate_tts.assert_not_awaited()


async def test_tts_speak_generates_and_caches_audio(async_client: AsyncClient):
    with patch("app.routers.tts.settings.OPENAI_API_KEY", "sk-test"), patch(
        "app.routers.tts.settings.TTS_VOICE", "nova"
    ), patch("app.routers.tts._read_cached", new=AsyncMock(return_value=None)), patch(
        "app.routers.tts._generate_tts", new=AsyncMock(return_value=b"fresh-audio")
    ) as generate_tts, patch("app.routers.tts._write_cached", new=AsyncMock()) as write_cached:
        resp = await async_client.post("/api/v1/tts/speak", json={"text": "Hello world"})

    assert resp.status_code == 200
    assert resp.content == b"fresh-audio"
    generate_tts.assert_awaited_once_with("Hello world", "nova")
    write_cached.assert_awaited_once()


async def test_translation_languages_and_translate(async_client: AsyncClient):
    languages = await async_client.get("/api/v1/translation/languages")
    assert languages.status_code == 200
    assert any(item["code"] == "de" for item in languages.json())

    with patch(
        "app.routers.translation.translate_text",
        new=AsyncMock(return_value=("Hallo Welt", True)),
    ):
        resp = await async_client.post(
            "/api/v1/translation/translate",
            json={"text": "Hello world", "target_language": "de"},
        )

    assert resp.status_code == 200
    assert resp.json() == {
        "translated": "Hallo Welt",
        "language": "de",
        "cached": True,
    }


async def test_translation_batch(async_client: AsyncClient):
    with patch(
        "app.routers.translation.translate_batch",
        new=AsyncMock(
            return_value=[
                {"key": "title", "translated": "Titel"},
                {"key": "body", "translated": "Inhalt"},
            ]
        ),
    ):
        resp = await async_client.post(
            "/api/v1/translation/translate-batch",
            json={
                "target_language": "de",
                "items": [
                    {"key": "title", "text": "Title"},
                    {"key": "body", "text": "Body"},
                ],
            },
        )

    assert resp.status_code == 200
    assert resp.json() == {
        "results": {"title": "Titel", "body": "Inhalt"},
        "language": "de",
    }


async def test_transcription_success(async_client: AsyncClient, auth_headers: dict):
    whisper_response = {
        "text": "hello there",
        "language": "en",
        "duration": 1.23,
        "segments": [{"start": 0.0, "end": 1.23, "text": " hello there "}],
    }

    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = None
    mock_client.post.return_value = SimpleNamespace(
        status_code=200,
        json=lambda: whisper_response,
        text="ok",
    )

    with patch("app.routers.transcription._get_openai_key", return_value="sk-test"), patch(
        "app.routers.transcription.httpx.AsyncClient", return_value=mock_client
    ):
        resp = await async_client.post(
            "/api/v1/transcription/transcribe",
            headers=auth_headers,
            files={"file": ("clip.webm", b"fake-audio", "audio/webm")},
        )

    assert resp.status_code == 200
    assert resp.json() == {
        "segments": [{"start": 0.0, "end": 1.23, "text": "hello there"}],
        "fullText": "hello there",
        "language": "en",
        "duration": 1.23,
    }


async def test_video_import_upload_status_and_list(
    async_client: AsyncClient,
    auth_headers: dict,
    test_project: dict,
    tmp_path: Path,
):
    fake_job = SimpleNamespace(id="job-1", status="queued", progress=0, stage="queued", task_id=None)
    fake_task = SimpleNamespace(id="celery-1")

    # Ensure the task attribute exists even when Celery is not available
    import app.tasks.ai_tasks as _ai_tasks
    if not hasattr(_ai_tasks, "process_video_import_task"):
        _ai_tasks.process_video_import_task = SimpleNamespace(delay=lambda *a, **k: fake_task)

    with patch("app.routers.video_import.UPLOAD_DIR", str(tmp_path)), patch(
        "app.crud.media_jobs.enqueue_or_get_job", new=AsyncMock(return_value=fake_job)
    ), patch("app.crud.media_jobs.get_job_for_session", new=AsyncMock(return_value=fake_job)), patch(
        "app.tasks.ai_tasks.process_video_import_task.delay", return_value=fake_task
    ):
        upload_resp = await async_client.post(
            "/api/v1/video-import/upload",
            headers=auth_headers,
            data={"project_id": test_project["id"]},
            files={"file": ("demo.mp4", b"video-bytes", "video/mp4")},
        )

        assert upload_resp.status_code == 200
        payload = upload_resp.json()
        assert payload["job_id"] == "job-1"
        assert payload["status"] == "queued"

        saved_path = tmp_path / payload["session_id"] / "demo.mp4"
        assert saved_path.exists()

        status_resp = await async_client.get(
            f"/api/v1/video-import/status/{payload['session_id']}", headers=auth_headers
        )
        assert status_resp.status_code == 200
        assert status_resp.json()["job_status"] == "queued"

        list_resp = await async_client.get("/api/v1/video-import/list", headers=auth_headers)
        assert list_resp.status_code == 200
        sessions = list_resp.json()
        assert len(sessions) == 1
        assert sessions[0]["video_filename"] == "demo.mp4"


async def test_widget_config_returns_guides_and_tooltips(
    async_client: AsyncClient,
    auth_headers: dict,
    test_project: dict,
    db,
):
    from app.models import ProcessRecordingSession, ProcessRecordingStep

    key_resp = await async_client.post(
        f"/api/v1/projects/{test_project['id']}/mcp-keys",
        headers=auth_headers,
        json={"name": "Widget key"},
    )
    assert key_resp.status_code == 201
    raw_key = key_resp.json()["raw_key"]

    session_resp = await async_client.post(
        "/api/v1/process-recording/session/create",
        headers=auth_headers,
        json={"name": "Guide One", "project_id": test_project["id"], "client": "TestRecorder", "timestamp": "2026-03-28T07:00:00"},
    )
    assert session_resp.status_code == 200
    session_id = session_resp.json().get("session_id") or session_resp.json().get("sessionId")

    workflow = await db.get(ProcessRecordingSession, session_id)
    workflow.status = "completed"
    workflow.is_processed = True
    workflow.is_private = False
    workflow.summary = "Guide summary"
    workflow.tags = ["onboarding"]

    db.add(
        ProcessRecordingStep(
            session_id=session_id,
            step_number=1,
            step_type="action",
            timestamp=datetime(2026, 3, 28, 7, 0, 0),
            action_type="click",
            description="Click the primary button",
            generated_description="Click the primary button",
            url="https://example.com",
            element_info={"id": "primary-cta"},
        )
    )
    await db.commit()

    context_resp = await async_client.post(
        "/api/v1/context-links",
        headers=auth_headers,
        json={
            "project_id": test_project["id"],
            "match_type": "url_exact",
            "match_value": "https://example.com",
            "resource_type": "document",
            "resource_id": "doc-123",
            "note": "Helpful docs",
        },
    )
    assert context_resp.status_code == 200

    resp = await async_client.get(
        f"/api/v1/widget/config?project_id={test_project['id']}",
        headers={"X-Api-Key": raw_key},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["projectId"] == test_project["id"]
    assert len(data["guides"]) == 1
    assert data["guides"][0]["steps"][0]["selector"] == "#primary-cta"
    assert data["tooltips"][0]["content"]["resourceId"] == "doc-123"


async def test_guide_analytics_event_flow(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    session_resp = await async_client.post(
        "/api/v1/process-recording/session/create",
        headers=auth_headers,
        json={"name": "Analytics Guide", "project_id": test_project["id"], "client": "TestRecorder", "timestamp": "2026-03-28T07:00:00"},
    )
    assert session_resp.status_code == 200
    workflow = session_resp.json()
    workflow_id = workflow.get("session_id") or workflow.get("sessionId")

    events = [
        {
            "type": "guide_started",
            "timestamp": "2026-03-28T07:00:00",
            "pageUrl": "https://example.com/start",
            "guideId": workflow_id,
            "userExternalId": "user-1",
            "sessionId": "sess-1",
        },
        {
            "type": "guide_completed",
            "timestamp": "2026-03-28T07:01:00",
            "pageUrl": "https://example.com/start",
            "guideId": workflow_id,
            "userExternalId": "user-1",
            "sessionId": "sess-1",
            "data": {"duration": 1234},
        },
        {
            "type": "step_viewed",
            "timestamp": "2026-03-28T07:00:30",
            "pageUrl": "https://example.com/start",
            "guideId": workflow_id,
            "stepIndex": 1,
            "sessionId": "sess-1",
        },
        {
            "type": "step_completed",
            "timestamp": "2026-03-28T07:00:40",
            "pageUrl": "https://example.com/start",
            "guideId": workflow_id,
            "stepIndex": 1,
            "sessionId": "sess-1",
        },
        {
            "type": "self_healing_triggered",
            "timestamp": "2026-03-28T07:00:20",
            "pageUrl": "https://example.com/start",
            "guideId": workflow_id,
            "sessionId": "sess-1",
        },
        {
            "type": "self_healing_success",
            "timestamp": "2026-03-28T07:00:21",
            "pageUrl": "https://example.com/start",
            "guideId": workflow_id,
            "sessionId": "sess-1",
        },
    ]

    ingest_resp = await async_client.post("/api/v1/widget/events", json=events)
    assert ingest_resp.status_code == 204

    overview = await async_client.get(
        f"/api/v1/analytics/overview?project_id={test_project['id']}&period=30d",
        headers=auth_headers,
    )
    assert overview.status_code == 200
    assert overview.json()["active_guides"] == 1
    assert overview.json()["completion_rate"] == 100.0
    assert overview.json()["self_healing_success_rate"] == 100.0

    guides = await async_client.get(
        f"/api/v1/analytics/guides?project_id={test_project['id']}&period=30d",
        headers=auth_headers,
    )
    assert guides.status_code == 200
    assert guides.json()["guides"][0]["views"] == 1

    funnel = await async_client.get(
        f"/api/v1/analytics/guide/{workflow_id}/funnel?project_id={test_project['id']}&period=30d",
        headers=auth_headers,
    )
    assert funnel.status_code == 200
    assert funnel.json()["steps"][0]["rate"] == 100.0

    export_resp = await async_client.post(
        f"/api/v1/analytics/export?project_id={test_project['id']}&period=30d",
        headers=auth_headers,
    )
    assert export_resp.status_code == 200
    assert "text/csv" in export_resp.headers["content-type"]
    assert "guide_completed" in export_resp.text


async def test_guide_analytics_normalizes_widget_event_shape(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    session_resp = await async_client.post(
        "/api/v1/process-recording/session/create",
        headers=auth_headers,
        json={"name": "Normalized Analytics Guide", "project_id": test_project["id"], "client": "TestRecorder", "timestamp": "2026-03-28T07:00:00"},
    )
    assert session_resp.status_code == 200
    workflow = session_resp.json()
    workflow_id = workflow.get("session_id") or workflow.get("sessionId")

    events = [
        {
            "type": "guide.started",
            "timestamp": "2026-03-28T07:00:00",
            "pageUrl": "https://example.com/start",
            "guideId": workflow_id,
            "userId": "widget-user-1",
            "sessionId": "sess-normalized-1",
        },
        {
            "type": "guide.step.viewed",
            "timestamp": "2026-03-28T07:00:10",
            "pageUrl": "https://example.com/start",
            "guideId": workflow_id,
            "stepIndex": 0,
            "sessionId": "sess-normalized-1",
        },
        {
            "type": "guide.step.completed",
            "timestamp": "2026-03-28T07:00:20",
            "pageUrl": "https://example.com/start",
            "guideId": workflow_id,
            "stepIndex": 0,
            "sessionId": "sess-normalized-1",
        },
        {
            "type": "guide.completed",
            "timestamp": "2026-03-28T07:00:30",
            "pageUrl": "https://example.com/start",
            "guideId": workflow_id,
            "sessionId": "sess-normalized-1",
        },
    ]

    ingest_resp = await async_client.post("/api/v1/widget/events", json=events)
    assert ingest_resp.status_code == 204

    overview = await async_client.get(
        f"/api/v1/analytics/overview?project_id={test_project['id']}&period=30d",
        headers=auth_headers,
    )
    assert overview.status_code == 200
    assert overview.json()["guide_starts"] == 1
    assert overview.json()["guide_completions"] == 1
    assert overview.json()["users_guided"] == 1
    assert overview.json()["completion_rate"] == 100.0

    guides = await async_client.get(
        f"/api/v1/analytics/guides?project_id={test_project['id']}&period=30d",
        headers=auth_headers,
    )
    assert guides.status_code == 200
    row = guides.json()["guides"][0]
    assert row["views"] == 1
    assert row["completions"] == 1
    assert row["step_views"] == 1
    assert row["step_completions"] == 1
    assert row["avg_time_ms"] == 30000


async def test_guide_analytics_sorts_rows_and_uses_started_sessions_for_duration(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    session_alpha = await async_client.post(
        "/api/v1/process-recording/session/create",
        headers=auth_headers,
        json={"name": "Alpha Guide", "project_id": test_project["id"], "client": "TestRecorder", "timestamp": "2026-03-28T07:00:00"},
    )
    session_beta = await async_client.post(
        "/api/v1/process-recording/session/create",
        headers=auth_headers,
        json={"name": "Beta Guide", "project_id": test_project["id"], "client": "TestRecorder", "timestamp": "2026-03-28T07:00:00"},
    )
    assert session_alpha.status_code == 200
    assert session_beta.status_code == 200

    alpha_id = session_alpha.json().get("session_id") or session_alpha.json().get("sessionId")
    beta_id = session_beta.json().get("session_id") or session_beta.json().get("sessionId")

    ingest_resp = await async_client.post(
        "/api/v1/widget/events",
        json=[
            {
                "type": "guide_started",
                "timestamp": "2026-03-28T07:00:00",
                "pageUrl": "https://example.com/alpha",
                "guideId": alpha_id,
                "sessionId": "alpha-sess-1",
            },
            {
                "type": "guide_completed",
                "timestamp": "2026-03-28T07:00:30",
                "pageUrl": "https://example.com/alpha",
                "guideId": alpha_id,
                "sessionId": "alpha-sess-1",
            },
            {
                "type": "guide_completed",
                "timestamp": "2026-03-28T07:01:00",
                "pageUrl": "https://example.com/alpha",
                "guideId": alpha_id,
                "sessionId": "alpha-orphan-completion",
            },
            {
                "type": "guide_started",
                "timestamp": "2026-03-28T07:00:00",
                "pageUrl": "https://example.com/beta",
                "guideId": beta_id,
                "sessionId": "beta-sess-1",
            },
            {
                "type": "guide_started",
                "timestamp": "2026-03-28T07:02:00",
                "pageUrl": "https://example.com/beta",
                "guideId": beta_id,
                "sessionId": "beta-sess-2",
            },
        ],
    )
    assert ingest_resp.status_code == 204

    guides = await async_client.get(
        f"/api/v1/analytics/guides?project_id={test_project['id']}&period=30d",
        headers=auth_headers,
    )
    assert guides.status_code == 200

    rows = guides.json()["guides"]
    assert [row["name"] for row in rows] == ["Beta Guide", "Alpha Guide"]

    alpha_row = next(row for row in rows if row["guide_id"] == alpha_id)
    assert alpha_row["views"] == 1
    assert alpha_row["completions"] == 2
    assert alpha_row["avg_time_ms"] == 30000


async def test_guide_analytics_funnel_counts_distinct_sessions(async_client: AsyncClient, auth_headers: dict, test_project: dict):
    session_resp = await async_client.post(
        "/api/v1/process-recording/session/create",
        headers=auth_headers,
        json={"name": "Distinct Funnel Guide", "project_id": test_project["id"], "client": "TestRecorder", "timestamp": "2026-03-28T07:00:00"},
    )
    assert session_resp.status_code == 200
    workflow_id = session_resp.json().get("session_id") or session_resp.json().get("sessionId")

    ingest_resp = await async_client.post(
        "/api/v1/widget/events",
        json=[
            {
                "type": "step_viewed",
                "timestamp": "2026-03-28T07:00:00",
                "pageUrl": "https://example.com/funnel",
                "guideId": workflow_id,
                "stepIndex": 0,
                "sessionId": "sess-1",
            },
            {
                "type": "step_viewed",
                "timestamp": "2026-03-28T07:00:05",
                "pageUrl": "https://example.com/funnel",
                "guideId": workflow_id,
                "stepIndex": 0,
                "sessionId": "sess-1",
            },
            {
                "type": "step_completed",
                "timestamp": "2026-03-28T07:00:10",
                "pageUrl": "https://example.com/funnel",
                "guideId": workflow_id,
                "stepIndex": 0,
                "sessionId": "sess-1",
            },
            {
                "type": "step_completed",
                "timestamp": "2026-03-28T07:00:12",
                "pageUrl": "https://example.com/funnel",
                "guideId": workflow_id,
                "stepIndex": 0,
                "sessionId": "sess-1",
            },
            {
                "type": "step_viewed",
                "timestamp": "2026-03-28T07:01:00",
                "pageUrl": "https://example.com/funnel",
                "guideId": workflow_id,
                "stepIndex": 0,
                "sessionId": "sess-2",
            },
        ],
    )
    assert ingest_resp.status_code == 204

    funnel = await async_client.get(
        f"/api/v1/analytics/guide/{workflow_id}/funnel?project_id={test_project['id']}&period=30d",
        headers=auth_headers,
    )
    assert funnel.status_code == 200
    assert funnel.json()["steps"] == [{"step_index": 0, "views": 2, "completions": 1, "rate": 50.0}]


async def test_guide_recovery_endpoints(async_client: AsyncClient, auth_headers: dict):
    with patch(
        "app.routers.guide_recovery.recover_element_with_llm",
        new=AsyncMock(
            return_value={
                "found": True,
                "element_index": 0,
                "confidence": 0.93,
                "reasoning": "Button text matches",
            }
        ),
    ), patch(
        "app.routers.guide_recovery.extract_new_selectors",
        new=AsyncMock(return_value=["#submit", "button[type='submit']"]),
    ):
        recover_resp = await async_client.post(
            "/api/v1/guide/recover-element",
            headers=auth_headers,
            json={
                "target": {"text": "Submit", "tagName": "button"},
                "page_elements": [{"tagName": "button", "text": "Submit", "id": "submit"}],
            },
        )

    assert recover_resp.status_code == 200
    assert recover_resp.json()["found"] is True
    assert recover_resp.json()["new_selectors"] == ["#submit", "button[type='submit']"]

    with patch("app.services.llm._circuit_is_open", return_value=False):
        status_resp = await async_client.get("/api/v1/guide/recovery-status", headers=auth_headers)

    assert status_resp.status_code == 200
    assert status_resp.json()["recovery_enabled"] is True
