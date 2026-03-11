import io

import pytest


@pytest.mark.asyncio
async def test_video_upload_enqueues_media_job(async_client, auth_headers, monkeypatch):
    class DummyTask:
        id = "task-123"

    class DummyCeleryTask:
        @staticmethod
        def delay(session_id, job_id):
            assert session_id
            assert job_id
            return DummyTask()

    monkeypatch.setenv("CELERY_BROKER_URL", "redis://localhost:6379/9")
    monkeypatch.setattr("app.tasks.is_celery_available", lambda: True)
    monkeypatch.setattr("app.tasks.ai_tasks.process_video_import_task", DummyCeleryTask, raising=False)

    files = {"file": ("demo.mp4", io.BytesIO(b"fake-video"), "video/mp4")}
    data = {"title": "Demo Import"}
    resp = await async_client.post("/api/v1/video-import/upload", files=files, data=data, headers=auth_headers)

    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["status"] == "queued"
    assert payload["task_id"] == "task-123"
    assert payload.get("job_id")

    status = await async_client.get(f"/api/v1/video-import/status/{payload['session_id']}", headers=auth_headers)
    assert status.status_code == 200
    status_payload = status.json()
    assert status_payload["stage"] == "queued"
    assert status_payload["job"]["id"] == payload["job_id"]
    assert status_payload["job"]["status"] == "queued"
    assert status_payload["job"]["task_id"] == "task-123"


@pytest.mark.asyncio
async def test_media_job_status_endpoint_not_found(async_client, auth_headers):
    resp = await async_client.get("/api/v1/video-import/jobs/does-not-exist", headers=auth_headers)
    assert resp.status_code == 404
