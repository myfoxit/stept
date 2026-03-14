from app.tasks import celery_app
import asyncio, logging
logger = logging.getLogger(__name__)

if celery_app:
    @celery_app.task(bind=True, name="stept.process_recording")
    def process_recording_task(self, session_id: str):
        async def _run():
            from app.database import AsyncSessionLocal
            from app.services.auto_processor import auto_processor
            from app.services.indexer import index_workflow_background
            async with AsyncSessionLocal() as db:
                result = await auto_processor.process_recording(session_id, db)
                await db.commit()
            await index_workflow_background(session_id)
            return result
        return asyncio.run(_run())

    @celery_app.task(bind=True, name="stept.generate_guide")
    def generate_guide_task(self, session_id: str):
        async def _run():
            from app.database import AsyncSessionLocal
            from app.services.auto_processor import auto_processor
            from app.services.indexer import index_workflow_background
            async with AsyncSessionLocal() as db:
                guide_md = await auto_processor.generate_guide(session_id, db)
                await db.commit()
            await index_workflow_background(session_id)
            return {"guide_markdown": guide_md}
        return asyncio.run(_run())

    @celery_app.task(bind=True, name="stept.process_video_import", queue="media")
    def process_video_import_task(self, session_id: str, video_path: str):
        async def _run():
            from app.database import AsyncSessionLocal
            from app.models import ProcessRecordingSession, ProcessRecordingStep
            from app.crud.media_jobs import get_job_for_session, transition_job
            from app.services.video_processor import VideoProcessor
            from app.services.llm import load_db_config
            from app.utils import gen_suffix
            from pathlib import Path
            from datetime import datetime

            # Load LLM config from DB (normally done at FastAPI startup, but worker needs it too)
            # Must dispose engine after to avoid asyncpg event loop mismatch between tasks
            from app.database import engine as _db_engine
            db_cfg = await load_db_config()
            logger.info("Video import: LLM config loaded — provider=%s, model=%s, has_key=%s",
                        db_cfg.get("provider"), db_cfg.get("model"), bool(db_cfg.get("api_key")))
            await _db_engine.dispose()

            async with AsyncSessionLocal() as db:
                # Get session and job
                from sqlalchemy import select
                result = await db.execute(
                    select(ProcessRecordingSession).where(ProcessRecordingSession.id == session_id)
                )
                session = result.scalar_one()
                job = await get_job_for_session(db, session_id, "video_import")

                # Transition job to running
                await transition_job(db, job.id, "running", progress=0, stage="starting", increment_attempt=True)
                await db.commit()

                try:
                    # Progress callback updates session + job
                    async def progress_cb(stage: str, pct: int):
                        session.processing_stage = stage
                        session.processing_progress = pct
                        job.stage = stage
                        job.progress = pct
                        await db.commit()

                    # Output frames to persistent storage alongside the video
                    frames_dir = str(Path(video_path).parent / "frames")
                    processor = VideoProcessor(
                        video_path=video_path,
                        output_dir=frames_dir,
                        progress_callback=progress_cb,
                    )
                    pipeline_result = await processor.process()

                    # Create ProcessRecordingStep + File entries from LLM output
                    from app.models import ProcessRecordingFile
                    frame_paths = pipeline_result.get("frame_paths", [])
                    frame_size = pipeline_result.get("frame_size", {})

                    for step_data in pipeline_result["steps"]:
                        step_num = step_data["step_number"]
                        screenshot_idx = step_data.get("screenshot_index", step_num - 1)
                        screenshot_idx = max(0, min(screenshot_idx, len(frame_paths) - 1)) if frame_paths else -1

                        # Click position from LLM (center of UI element being interacted with)
                        click = step_data.get("click_position")
                        screenshot_rel = None
                        if click and isinstance(click, dict):
                            x = click.get("x", 0)
                            y = click.get("y", 0)
                            # Validate bounds
                            fw = frame_size.get("width", 9999)
                            fh = frame_size.get("height", 9999)
                            if 0 <= x <= fw and 0 <= y <= fh:
                                screenshot_rel = {"x": x, "y": y}

                        step = ProcessRecordingStep(
                            id=gen_suffix(16),
                            session_id=session_id,
                            step_number=step_num,
                            step_type="screenshot",
                            timestamp=datetime.utcnow(),
                            action_type="video_frame",
                            generated_title=step_data.get("title"),
                            generated_description=step_data.get("description"),
                            is_annotated=True,
                            screenshot_relative_position=screenshot_rel,
                            screenshot_size=frame_size if frame_size.get("width") else None,
                        )
                        db.add(step)

                        # Create file record pointing to the persisted frame
                        if 0 <= screenshot_idx < len(frame_paths):
                            frame_path = Path(frame_paths[screenshot_idx])
                            file_record = ProcessRecordingFile(
                                id=gen_suffix(16),
                                session_id=session_id,
                                step_number=step_num,
                                filename=frame_path.name,
                                file_path=str(frame_path),
                                file_size=frame_path.stat().st_size if frame_path.exists() else 0,
                                mime_type="image/png",
                            )
                            db.add(file_record)

                    # Update session
                    session.status = "completed"
                    session.is_processed = True
                    session.processing_stage = "done"
                    session.processing_progress = 100
                    session.video_duration_seconds = pipeline_result.get("duration")
                    session.total_steps = len(pipeline_result["steps"])

                    # Transition job to succeeded
                    await transition_job(db, job.id, "succeeded", progress=100, stage="done")
                    await db.commit()

                    return {"session_id": session_id, "steps": len(pipeline_result["steps"])}

                except Exception as exc:
                    session.processing_stage = "failed"
                    session.processing_error = str(exc)[:500]
                    await transition_job(db, job.id, "failed", error=str(exc)[:500])
                    await db.commit()
                    raise

        return asyncio.run(_run())

    @celery_app.task(bind=True, name="stept.index_workflow")
    def index_workflow_task(self, session_id: str):
        return asyncio.run(
            __import__('app.services.indexer', fromlist=['index_workflow_background']).index_workflow_background(session_id)
        )


