from app.tasks import celery_app
import asyncio, logging
logger = logging.getLogger(__name__)

if celery_app:
    @celery_app.task(bind=True, name="ondoki.process_recording")
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

    @celery_app.task(bind=True, name="ondoki.generate_guide")
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

    @celery_app.task(bind=True, name="ondoki.index_workflow")
    def index_workflow_task(self, session_id: str):
        return asyncio.run(
            __import__('app.services.indexer', fromlist=['index_workflow_background']).index_workflow_background(session_id)
        )

    @celery_app.task(bind=True, name="ondoki.process_video_import", queue="video")
    def process_video_import_task(self, session_id: str):
        """Process an uploaded video into a step-by-step guide."""

        def progress_cb(stage, progress):
            self.update_state(state="PROGRESS", meta={"stage": stage, "progress": progress})

        async def _run():
            from app.database import AsyncSessionLocal
            from app.services.video_processor import VideoProcessor
            from app.services.llm import chat_completion
            from app.models import ProcessRecordingSession
            from sqlalchemy import select
            import os

            async with AsyncSessionLocal() as db:
                result_q = await db.execute(
                    select(ProcessRecordingSession).where(ProcessRecordingSession.id == session_id)
                )
                session = result_q.scalar_one_or_none()
                if not session:
                    raise ValueError(f"Session {session_id} not found")

                video_path = session.storage_path
                if not video_path or not os.path.exists(video_path):
                    session.processing_stage = "failed"
                    session.processing_error = "Video file not found"
                    await db.commit()
                    return {"error": "Video file not found"}

                output_dir = os.path.join(os.path.dirname(video_path), f"guide_{session_id}")

                async def llm_chat_fn(system_prompt, user_prompt):
                    """Simple LLM wrapper using chat_completion in non-streaming mode."""
                    messages = [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ]
                    response = await chat_completion(messages=messages, stream=False)
                    data = response.json()
                    return data["choices"][0]["message"]["content"]

                processor = VideoProcessor(llm_chat_fn=llm_chat_fn)

                try:
                    proc_result = processor.process(video_path, output_dir, progress_cb=progress_cb)

                    session.guide_markdown = proc_result["markdown"]
                    session.is_processed = True
                    session.processing_stage = "done"
                    session.processing_progress = 100
                    session.status = "completed"
                    if proc_result.get("frames"):
                        session.total_files = len(proc_result["frames"])

                    await db.commit()

                except Exception as e:
                    session.processing_stage = "failed"
                    session.processing_error = str(e)[:500]
                    session.status = "failed"
                    await db.commit()
                    raise

            from app.services.indexer import index_workflow_background
            await index_workflow_background(session_id)

            return {"status": "done", "session_id": session_id}

        return asyncio.run(_run())
