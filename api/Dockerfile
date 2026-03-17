# api/Dockerfile
# Build context: monorepo root (.)

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

WORKDIR /app

# System dependencies (Postgres driver, healthcheck)
RUN apt-get update && apt-get install -y \
    gcc libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies (cached layer)
COPY api/requirements.txt api/requirements-mcp.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir -r requirements-mcp.txt

# Application code
COPY api/ .

# Non-root user
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser && \
    mkdir -p /app/storage/recordings /app/uploads /data/uploads/videos && \
    chown -R appuser:appgroup /app/storage /app/uploads /data/uploads/videos
USER appuser

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
