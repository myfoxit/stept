#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "🚀 Running Full Test Suite"
echo ""
echo "This script runs all tests against the Docker dev environment."
echo "Make sure 'make dev' is running first!"
echo ""

# --- 1. Backend unit tests ---
if [ -z "$SKIP_UNIT" ]; then
    echo "═══════════════════════════════════════"
    echo "  Running Backend Tests (Docker)"
    echo "═══════════════════════════════════════"
    cd "$ROOT_DIR"
    make test-backend
fi

# --- 2. Frontend unit tests ---
if [ -z "$SKIP_UNIT" ]; then
    echo ""
    echo "═══════════════════════════════════════"
    echo "  Running Frontend Tests"
    echo "═══════════════════════════════════════"
    cd "$ROOT_DIR"
    make test-frontend
fi

# --- 3. E2E Tests ---
if [ -z "$SKIP_E2E" ]; then
    echo ""
    echo "═══════════════════════════════════════"
    echo "  Running E2E Tests (Playwright)"
    echo "═══════════════════════════════════════"
    cd "$ROOT_DIR"
    make test-e2e ARGS="$*"
fi

echo ""
echo "✅ All tests complete!"
