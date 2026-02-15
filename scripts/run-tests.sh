#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT_CONFIG_FILE="/tmp/playwright-test-ports.json"

cleanup() {
    echo ""
    echo "🧹 Stopping services..."
    [ -n "$API_PID" ] && kill $API_PID 2>/dev/null || true
    [ -n "$APP_PID" ] && kill $APP_PID 2>/dev/null || true
    rm -f "$PORT_CONFIG_FILE"
    echo "✅ Cleanup complete."
}
trap cleanup EXIT INT TERM

echo "🚀 Starting Test Run..."

# --- 1. Ensure Docker services (DB + Redis) are up ---
echo "📦 Starting DB & Redis..."
cd "$ROOT_DIR"
docker compose up -d db redis 2>&1 | grep -v "Running" || true
sleep 2

# Setup test database
docker compose exec -T db psql -U ondoki -tc \
    "SELECT 1 FROM pg_database WHERE datname = 'ondoki_test'" | grep -q 1 || \
    docker compose exec -T db psql -U ondoki -c "CREATE DATABASE ondoki_test"
docker compose exec -T db psql -U ondoki -d ondoki_test -c "CREATE EXTENSION IF NOT EXISTS vector" 2>/dev/null || true
echo "✅ Test database ready."

# --- 2. Setup Python venv if needed ---
cd "$ROOT_DIR/api"
if [ ! -d ".venv" ]; then
    echo "🐍 Creating Python venv..."
    python3 -m venv .venv
fi
source .venv/bin/activate

# Install deps if needed
if ! python -c "import fastapi" 2>/dev/null; then
    echo "📦 Installing Python dependencies..."
    pip install -q -r requirements.txt
fi

# --- 3. Find ports ---
echo "🔍 Finding available ports..."
chmod +x "$ROOT_DIR/scripts/find-port.sh"
API_PORT=$("$ROOT_DIR/scripts/find-port.sh" 8010)
APP_PORT=$("$ROOT_DIR/scripts/find-port.sh" 5180)
echo "   > API Port: $API_PORT"
echo "   > App Port: $APP_PORT"
echo "{\"apiPort\": $API_PORT, \"appPort\": $APP_PORT}" > "$PORT_CONFIG_FILE"

# --- 4. Start API server ---
echo "🔧 Starting API server..."
cd "$ROOT_DIR/api"
export ENVIRONMENT=test
export TEST_MODE=true
export DATABASE_URL="postgresql+asyncpg://ondoki:postgres@localhost:5432/ondoki_test"
export REDIS_URL="redis://localhost:6379/1"
export JWT_SECRET=e2e-test-secret
export ONDOKI_ENCRYPTION_KEY=e2e-test-key-32bytes-long-enough

uvicorn main:app --port $API_PORT --host 127.0.0.1 &
API_PID=$!

echo "⏳ Waiting for API ($API_PORT)..."
for i in $(seq 1 30); do
    if curl -s "http://localhost:$API_PORT/health" > /dev/null 2>&1; then break; fi
    if ! kill -0 $API_PID 2>/dev/null; then echo "❌ API process died"; exit 1; fi
    sleep 1
done
curl -s "http://localhost:$API_PORT/health" > /dev/null 2>&1 || { echo "❌ API failed to start"; exit 1; }
echo "✅ API is up."

# --- 5. Backend unit tests ---
if [ -z "$SKIP_UNIT" ]; then
    echo ""
    echo "═══════════════════════════════════════"
    echo "  Running Unit Tests (Backend)"
    echo "═══════════════════════════════════════"
    cd "$ROOT_DIR/api"
    export DATABASE_URL_TEST="postgresql+asyncpg://ondoki:postgres@localhost:5432/ondoki_test"
    python -m pytest tests/ -q --tb=short || true
fi

# --- 6. Start Frontend ---
echo ""
echo "🎨 Starting Frontend..."
cd "$ROOT_DIR/app"
export VITE_API_URL="http://localhost:$API_PORT"
export VITE_API_BASE_URL="http://localhost:$API_PORT/api/v1"

pnpm vite --port $APP_PORT --host 127.0.0.1 &
APP_PID=$!

echo "⏳ Waiting for App ($APP_PORT)..."
for i in $(seq 1 60); do
    if curl -s "http://localhost:$APP_PORT" > /dev/null 2>&1; then break; fi
    sleep 1
done
curl -s "http://localhost:$APP_PORT" > /dev/null 2>&1 || { echo "❌ App failed to start"; exit 1; }
echo "✅ App is up."

# --- 7. Frontend unit tests ---
if [ -z "$SKIP_UNIT" ]; then
    echo ""
    echo "═══════════════════════════════════════"
    echo "  Running Unit Tests (Frontend)"
    echo "═══════════════════════════════════════"
    cd "$ROOT_DIR/app"
    pnpm jest --no-cache 2>/dev/null || true
fi

# --- 8. E2E Tests ---
echo ""
echo "═══════════════════════════════════════"
echo "  Running E2E Tests (Playwright)"
echo "═══════════════════════════════════════"
cd "$ROOT_DIR/app"
export TEST_PORT_CONFIG="$PORT_CONFIG_FILE"
export PLAYWRIGHT_NO_SERVER=1

pnpm playwright test "$@"
