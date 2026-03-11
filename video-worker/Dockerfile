FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY api/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Optional: install local whisper (large download, ~1GB+ with model)
# Users can set OPENAI_API_KEY instead for cloud transcription
# RUN pip install --no-cache-dir openai-whisper

# Copy only app code and main.py (not entire api/ dir)
COPY api/app/ ./app/
COPY api/main.py ./main.py

# Run as non-root user
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
USER appuser

CMD ["celery", "-A", "app.tasks", "worker", "--loglevel=info", "--queues=media", "--concurrency=1"]
