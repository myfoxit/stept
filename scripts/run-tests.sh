#!/bin/bash
set -e

cd "$(dirname "$0")/.."

echo "═══════════════════════════════════════"
echo "  ondoki-web — Full Test Suite"
echo "═══════════════════════════════════════"
echo ""
echo "Prerequisites: make dev (Docker services running)"
echo ""

# Backend unit tests (runs inside Docker against ondoki_test)
echo "── Backend Tests ──────────────────────"
make test-backend
echo ""

# Frontend unit tests (local, no Docker needed)
echo "── Frontend Tests ─────────────────────"
make test-frontend
echo ""

# E2E tests (separate test backend + Playwright frontend)
echo "── E2E Tests ──────────────────────────"
make test-e2e
echo ""

echo "✅ All tests passed!"
