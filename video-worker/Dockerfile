# video-worker/Dockerfile
# Extends the backend image with ffmpeg + Whisper for video-to-guide processing.
# Only started with: docker compose --profile video up -d

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

WORKDIR /app

# System deps: ffmpeg for audio/video processing, plus backend build deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps (same as backend + whisper optional)
COPY api/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Optional: uncomment for local Whisper (adds ~1GB+ with model)
# Users can set OPENAI_API_KEY instead for cloud transcription
# RUN pip install --no-cache-dir openai-whisper

# Copy only the backend app code (worker needs models, tasks, services)
COPY api/app/ ./app/
COPY api/main.py ./

# Run as non-root
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
RUN mkdir -p /data/uploads/videos && chown -R appuser:appgroup /data/uploads/videos
USER appuser

CMD ["celery", "-A", "app.tasks", "worker", "--loglevel=info", "--queues=media", "--concurrency=1"]
