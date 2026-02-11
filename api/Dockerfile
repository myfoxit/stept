# api/Dockerfile
FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

WORKDIR /app

# Install system dependencies (needed for Postgres/some python libs)
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first (caching layer)
COPY requirements.txt .
# If you use standard pip
RUN pip install --no-cache-dir -r requirements.txt

# Copy project files
COPY . .

# Run the application
# We use shell form to allow variable expansion if needed, but array form is safer for signals
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]