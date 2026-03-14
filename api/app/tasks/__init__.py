import os
import logging

logger = logging.getLogger(__name__)

celery_app = None
CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL")

if CELERY_BROKER_URL:
    try:
        from celery import Celery
        celery_app = Celery(
            "stept",
            broker=CELERY_BROKER_URL,
            backend=os.environ.get("CELERY_RESULT_BACKEND", CELERY_BROKER_URL),
        )
        celery_app.conf.update(
            task_serializer="json",
            result_serializer="json",
            accept_content=["json"],
            task_track_started=True,
            result_expires=3600,
            imports=("app.tasks.ai_tasks",),
        )
        logger.info("Celery configured with broker: %s", CELERY_BROKER_URL)
    except ImportError:
        logger.warning("CELERY_BROKER_URL is set but celery is not installed — running synchronously")


def is_celery_available() -> bool:
    return celery_app is not None
