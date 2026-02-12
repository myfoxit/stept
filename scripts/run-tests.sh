#!/bin/bash
set -e

# Project Root
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT_CONFIG_FILE="/tmp/playwright-test-ports.json"

# --- 1. Cleanup Function (Traps Signals) ---
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

# --- 2. Database Setup ---
echo "📦 Setting up test database..."
"$ROOT_DIR/scripts/setup-test-db.sh"

# --- 3. Dynamic Port Allocation ---
echo "🔍 Finding available ports..."
chmod +x "$ROOT_DIR/scripts/find-port.sh"
API_PORT=$("$ROOT_DIR/scripts/find-port.sh" 8010)
APP_PORT=$("$ROOT_DIR/scripts/find-port.sh" 5180)

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

export ENVIRONMENT=test
export TEST_MODE=true
export DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/ondoki_test
export REDIS_URL=redis://localhost:6379/1
export JWT_SECRET=e2e-test-secret
export ONDOKI_ENCRYPTION_KEY=e2e-test-key

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

export VITE_API_URL="http://localhost:$API_PORT"
export VITE_API_BASE_URL="http://localhost:$API_PORT/api/v1"
export VITE_PORT=$APP_PORT

pnpm vite --port $APP_PORT --host 127.0.0.1 &
APP_PID=$!

echo "⏳ Waiting for App ($APP_PORT)..."
timeout 60s bash -c "until curl -s http://localhost:$APP_PORT > /dev/null; do sleep 1; done" || (echo "❌ App failed to start"; exit 1)
echo "✅ App is up."

# --- 6. Run All Tests ---
echo ""
echo "═══════════════════════════════════════"
echo "  Running Unit Tests (Backend)"
echo "═══════════════════════════════════════"
cd "$ROOT_DIR/api"
python3 -m pytest tests/ -q --tb=short || true

echo ""
echo "═══════════════════════════════════════"
echo "  Running Unit Tests (Frontend)"
echo "═══════════════════════════════════════"
cd "$ROOT_DIR/app"
pnpm jest --no-cache || true

echo ""
echo "═══════════════════════════════════════"
echo "  Running E2E Tests (Playwright)"
echo "═══════════════════════════════════════"
cd "$ROOT_DIR/app"
export TEST_PORT_CONFIG="$PORT_CONFIG_FILE"
export PLAYWRIGHT_NO_SERVER=1

pnpm playwright test "$@"
