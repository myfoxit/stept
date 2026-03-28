from __future__ import annotations

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


