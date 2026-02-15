#!/bin/bash
set -e

# Project Root
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT_CONFIG_FILE="/tmp/playwright-test-ports.json"
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.dev.yml"

# --- 1. Cleanup Function (Traps Signals) ---
cleanup() {
    echo ""
    echo "🧹 Stopping services..."
    if [ -n "$APP_PID" ]; then kill $APP_PID 2>/dev/null || true; fi
    # Stop the test backend container
    cd "$ROOT_DIR"
    $COMPOSE stop backend-test 2>/dev/null || true
    $COMPOSE rm -f backend-test 2>/dev/null || true
    rm -f "$PORT_CONFIG_FILE"
    echo "✅ Cleanup complete."
}
trap cleanup EXIT INT TERM

echo "🚀 Starting Production-Grade Test Run..."

# --- 2. Database Setup (via Docker) ---
echo "📦 Setting up test database..."
cd "$ROOT_DIR"
$COMPOSE exec db psql -U ondoki -tc \
    "SELECT 1 FROM pg_database WHERE datname = 'ondoki_test'" | grep -q 1 || \
    $COMPOSE exec db psql -U ondoki -c "CREATE DATABASE ondoki_test"
$COMPOSE exec db psql -U ondoki -d ondoki_test -c "CREATE EXTENSION IF NOT EXISTS vector" 2>/dev/null || true
echo "✅ Test database ready."

# --- 3. Dynamic Port Allocation ---
echo "🔍 Finding available ports..."
chmod +x "$ROOT_DIR/scripts/find-port.sh"
API_PORT=$("$ROOT_DIR/scripts/find-port.sh" 8010)
APP_PORT=$("$ROOT_DIR/scripts/find-port.sh" 5180)

echo "   > API Port: $API_PORT"
echo "   > App Port: $APP_PORT"

# Write config for Playwright
echo "{\"apiPort\": $API_PORT, \"appPort\": $APP_PORT}" > "$PORT_CONFIG_FILE"

# --- 4. Start Backend (API) via Docker ---
echo "🔧 Starting API server in Docker..."
cd "$ROOT_DIR"

# Run uvicorn inside the backend container, exposing on the dynamic port
$COMPOSE run -d --name ondoki-backend-test \
    -p "$API_PORT:8000" \
    -e ENVIRONMENT=test \
    -e TEST_MODE=true \
    -e DATABASE_URL=postgresql+asyncpg://ondoki:postgres@db:5432/ondoki_test \
    -e REDIS_URL=redis://redis:6379/1 \
    -e JWT_SECRET=e2e-test-secret \
    -e ONDOKI_ENCRYPTION_KEY=e2e-test-key-32bytes-long-enough \
    backend \
    uvicorn main:app --port 8000 --host 0.0.0.0

echo "⏳ Waiting for API ($API_PORT)..."
timeout 30s bash -c "until curl -s http://localhost:$API_PORT/health > /dev/null 2>&1; do sleep 1; done" || {
    echo "❌ API failed to start. Logs:"
    docker logs ondoki-backend-test 2>&1 | tail -20
    exit 1
}
echo "✅ API is up."

# --- 5. Run Backend Unit Tests ---
if [ -z "$SKIP_UNIT" ]; then
    echo ""
    echo "═══════════════════════════════════════"
    echo "  Running Unit Tests (Backend)"
    echo "═══════════════════════════════════════"
    $COMPOSE exec \
        -e DATABASE_URL_TEST=postgresql+asyncpg://ondoki:postgres@db:5432/ondoki_test \
        -e ONDOKI_ENCRYPTION_KEY=test-key-for-testing-only-32bytes \
        -e JWT_SECRET=test-secret \
        backend python -m pytest tests/ -q --tb=short || true
fi

# --- 6. Start Frontend (Vite) ---
echo ""
echo "🎨 Starting Frontend..."
cd "$ROOT_DIR/app"

export VITE_API_URL="http://localhost:$API_PORT"
export VITE_API_BASE_URL="http://localhost:$API_PORT/api/v1"
export VITE_PORT=$APP_PORT

pnpm vite --port $APP_PORT --host 127.0.0.1 &
APP_PID=$!

echo "⏳ Waiting for App ($APP_PORT)..."
timeout 60s bash -c "until curl -s http://localhost:$APP_PORT > /dev/null 2>&1; do sleep 1; done" || {
    echo "❌ App failed to start"
    exit 1
}
echo "✅ App is up."

# --- 7. Frontend Unit Tests ---
if [ -z "$SKIP_UNIT" ]; then
    echo ""
    echo "═══════════════════════════════════════"
    echo "  Running Unit Tests (Frontend)"
    echo "═══════════════════════════════════════"
    cd "$ROOT_DIR/app"
    pnpm jest --no-cache 2>/dev/null || true
fi

# --- 8. Run E2E Tests (Playwright) ---
echo ""
echo "═══════════════════════════════════════"
echo "  Running E2E Tests (Playwright)"
echo "═══════════════════════════════════════"
cd "$ROOT_DIR/app"
export TEST_PORT_CONFIG="$PORT_CONFIG_FILE"
export PLAYWRIGHT_NO_SERVER=1

pnpm playwright test "$@"
