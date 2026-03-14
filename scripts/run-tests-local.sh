#!/bin/bash

# Script to run Playwright tests using local environment

set -e

echo "🚀 Starting test run..."

# Setup test database
echo "📦 Setting up test database..."
./scripts/setup-test-db.sh

# Start API in local mode with test database
echo "🔧 Starting API server with test database..."
cd api

# Activate virtual environment if it exists
if [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
elif [ -f ".venv/bin/activate" ]; then
    source .venv/bin/activate
fi

# Start API with local environment but test database
export ENVIRONMENT=local  # Use local instead of test
export DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/stept_test
export TEST_MODE=true  # Flag to enable test endpoints

uvicorn main:app --reload --port 8000 &
API_PID=$!

# Wait for API to be ready
echo "⏳ Waiting for API to be ready..."
for i in {1..30}; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo "✅ API is ready!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ API failed to start"
        kill $API_PID 2>/dev/null || true
        exit 1
    fi
    sleep 1
done

# Run Playwright tests
echo "🎭 Running Playwright tests..."
cd ../app

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Install Playwright browsers if needed
if [ ! -d "$HOME/.cache/ms-playwright" ]; then
    echo "Installing Playwright browsers..."
    npx playwright install --with-deps chromium
fi

# Export test environment variables
export API_URL=http://localhost:8000
export PLAYWRIGHT_BASE_URL=http://localhost:5173

# Run the tests
npx playwright test

# Capture test exit code
TEST_EXIT_CODE=$?

# Cleanup
echo "🧹 Cleaning up..."
kill $API_PID 2>/dev/null || true

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo "✅ All tests passed!"
else
    echo "❌ Some tests failed"
fi

exit $TEST_EXIT_CODE
