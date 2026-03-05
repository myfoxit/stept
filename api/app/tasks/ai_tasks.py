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


