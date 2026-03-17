# video-worker/Dockerfile
# Build context: monorepo root (.)

FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python dependencies (cached layer)
COPY api/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Application code (only what the worker needs)
COPY api/app/ ./app/
COPY api/main.py ./main.py

# Non-root user
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
USER appuser

CMD ["celery", "-A", "app.tasks", "worker", "--loglevel=info", "--queues=media", "--concurrency=1"]
