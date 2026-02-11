#!/bin/bash
set -e

# Project Root
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT_CONFIG_FILE="/tmp/playwright-test-ports.json"

# --- 1. Cleanup Function (Traps Signals) ---
# This ensures that even if you Ctrl+C, the child processes (API/App) are killed.
cleanup() {
    echo ""
    echo "🧹 Stopping services..."
    if [ -n "$API_PID" ]; then kill $API_PID 2>/dev/null || true; fi
    if [ -n "$APP_PID" ]; then kill $APP_PID 2>/dev/null || true; fi
    rm -f "$PORT_CONFIG_FILE"
    echo "✅ Cleanup complete."
}
trap cleanup EXIT INT TERM

echo "🚀 Starting Production-Grade Test Run..."

# --- 2. Database & Redis Setup ---
# Ensure your Test DB is ready. 
# NOTE: We assume Redis is running (via your main docker-compose). 
# If tests need a separate Redis, use a different DB index (e.g., /1 instead of /0).
echo "📦 Setting up test database..."
./scripts/setup-test-db.sh

# --- 3. Dynamic Port Allocation ---
echo "🔍 Finding available ports..."
chmod +x ./scripts/find-port.sh
API_PORT=$(./scripts/find-port.sh 8010) # Start looking from 8010 to avoid 8000
APP_PORT=$(./scripts/find-port.sh 5180) # Start looking from 5180 to avoid 5173

echo "   > API Port: $API_PORT"
echo "   > App Port: $APP_PORT"

# Write config for Playwright
echo "{\"apiPort\": $API_PORT, \"appPort\": $APP_PORT}" > "$PORT_CONFIG_FILE"

# --- 4. Start Backend (API) ---
echo "🔧 Starting API server..."
cd "$ROOT_DIR/api"

# Activate Venv
if [ -f "venv/bin/activate" ]; then source venv/bin/activate; 
elif [ -f ".venv/bin/activate" ]; then source .venv/bin/activate; fi

# ENV VARS: 
# 1. ENVIRONMENT=test enables the /test endpoints
# 2. TEST_MODE=true is an extra safety
# 3. REDIS_URL ensures we don't crash if dev redis is busy (optional: use db 1)
export ENVIRONMENT=test 
export TEST_MODE=true
export DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/snaprow_test
export REDIS_URL=redis://localhost:6379/1 

# Start Uvicorn on the dynamic port
uvicorn main:app --port $API_PORT --host 127.0.0.1 &
API_PID=$!

# Wait for Healthcheck
echo "⏳ Waiting for API ($API_PORT)..."
timeout 30s bash -c "until curl -s http://localhost:$API_PORT/health > /dev/null; do sleep 1; done" || (echo "❌ API failed to start"; exit 1)
echo "✅ API is up."

# --- 5. Start Frontend (Vite) ---
echo "🎨 Starting Frontend..."
cd "$ROOT_DIR/app"

# CRITICAL FIX: 
# We must tell Vite where the API is via VITE_API_URL (or whatever your app uses).
# Without this, Vite uses the .env default (usually 8000), causing the conflict.
export VITE_API_URL="http://localhost:$API_PORT"
export VITE_API_BASE_URL="http://localhost:$API_PORT/api/v1"
export VITE_PORT=$APP_PORT

# Start Vite
# --host 127.0.0.1 ensures it doesn't try to broadcast on network
pnpm vite --port $APP_PORT --host 127.0.0.1 &
APP_PID=$!

# Wait for Frontend
echo "⏳ Waiting for App ($APP_PORT)..."
timeout 60s bash -c "until curl -s http://localhost:$APP_PORT > /dev/null; do sleep 1; done" || (echo "❌ App failed to start"; exit 1)
echo "✅ App is up."

# --- 6. Run Playwright ---
echo "🎭 Running Tests..."
cd "$ROOT_DIR/app"

export TEST_PORT_CONFIG="$PORT_CONFIG_FILE"

# Run tests
pnpm playwright test "$@"

# Exit code is handled by the trap/set -e