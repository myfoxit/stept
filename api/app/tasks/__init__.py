import os
from celery import Celery

celery_app = None
CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL")

if CELERY_BROKER_URL:
    celery_app = Celery("ondoki", broker=CELERY_BROKER_URL, backend=os.environ.get("CELERY_RESULT_BACKEND", CELERY_BROKER_URL))
    celery_app.conf.update(
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        task_track_started=True,
        result_expires=3600,
    )

def is_celery_available() -> bool:
    return celery_app is not None
