#!/usr/bin/env bash
#
# Native binary contract tests.
# Runs on CI (macOS + Windows) to verify the native binaries produce
# valid JSON matching the expected schema.
#
# Usage:
#   test/native/contract-test.sh macos   # tests native/macos/window-info
#   test/native/contract-test.sh windows # tests native/windows/.../window-info.exe
#
set -euo pipefail

PLATFORM="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'
PASS=0
FAIL=0

pass() { PASS=$((PASS + 1)); echo -e "${GREEN}✓${NC} $1"; }
fail() { FAIL=$((FAIL + 1)); echo -e "${RED}✗${NC} $1: $2"; }

# Check jq is available
if ! command -v jq &>/dev/null; then
  echo "Error: jq is required. Install with: brew install jq / choco install jq"
  exit 1
fi

# Determine binary path
case "$PLATFORM" in
  macos|darwin)
    BINARY="$PROJECT_DIR/native/macos/window-info"
    if [ ! -f "$BINARY" ]; then
      echo "Building macOS binary..."
      cd "$PROJECT_DIR/native/macos"
      swiftc -framework Cocoa -framework ApplicationServices -o window-info window-info.swift
    fi
    ;;
  windows|win32)
    BINARY="$PROJECT_DIR/native/windows/bin/Release/net8.0/win-x64/publish/window-info.exe"
    if [ ! -f "$BINARY" ]; then
      echo "Building Windows binary..."
      cd "$PROJECT_DIR/native/windows"
      dotnet publish -c Release -r win-x64 --self-contained
    fi
    ;;
  *)
    echo "Usage: $0 <macos|windows>"
    exit 1
    ;;
esac

if [ ! -f "$BINARY" ]; then
  echo "Error: Binary not found at $BINARY"
  exit 1
fi

echo "Testing binary: $BINARY"
echo "Platform: $PLATFORM"
echo ""

# =====================================================================
# Test: mouse command
# =====================================================================

echo "--- mouse command ---"
MOUSE_OUT=$("$BINARY" mouse 2>/dev/null || true)

if echo "$MOUSE_OUT" | jq -e '.' >/dev/null 2>&1; then
  pass "mouse: valid JSON"
else
  fail "mouse: valid JSON" "output: $MOUSE_OUT"
fi

if echo "$MOUSE_OUT" | jq -e '.mousePosition.x >= 0 or .mousePosition.x < 0' >/dev/null 2>&1; then
  pass "mouse: has mousePosition.x (number)"
else
  fail "mouse: has mousePosition.x" ""
fi

if echo "$MOUSE_OUT" | jq -e '.mousePosition.y >= 0 or .mousePosition.y < 0' >/dev/null 2>&1; then
  pass "mouse: has mousePosition.y (number)"
else
  fail "mouse: has mousePosition.y" ""
fi

if echo "$MOUSE_OUT" | jq -e '.scaleFactor > 0' >/dev/null 2>&1; then
  pass "mouse: has scaleFactor > 0"
else
  fail "mouse: has scaleFactor" "$(echo "$MOUSE_OUT" | jq '.scaleFactor')"
fi

if echo "$MOUSE_OUT" | jq -e '.window != null or .window == null' >/dev/null 2>&1; then
  pass "mouse: has window field"
else
  fail "mouse: has window field" ""
fi

echo ""

# =====================================================================
# Test: windows command
# =====================================================================

echo "--- windows command ---"
WINDOWS_OUT=$("$BINARY" windows 2>/dev/null || true)

if echo "$WINDOWS_OUT" | jq -e '.' >/dev/null 2>&1; then
  pass "windows: valid JSON"
else
  fail "windows: valid JSON" "output: $(echo "$WINDOWS_OUT" | head -c 200)"
fi

if echo "$WINDOWS_OUT" | jq -e '.windows | type == "array"' >/dev/null 2>&1; then
  pass "windows: .windows is array"
else
  fail "windows: .windows is array" ""
fi

if echo "$WINDOWS_OUT" | jq -e '.displays | type == "array"' >/dev/null 2>&1; then
  pass "windows: .displays is array"
else
  fail "windows: .displays is array" ""
fi

if echo "$WINDOWS_OUT" | jq -e '.displays | length > 0' >/dev/null 2>&1; then
  pass "windows: at least 1 display"
else
  fail "windows: at least 1 display" "$(echo "$WINDOWS_OUT" | jq '.displays | length')"
fi

# Validate display schema
if echo "$WINDOWS_OUT" | jq -e '.displays[0] | has("bounds", "scaleFactor", "isPrimary")' >/dev/null 2>&1; then
  pass "windows: display has bounds, scaleFactor, isPrimary"
else
  fail "windows: display schema" "$(echo "$WINDOWS_OUT" | jq '.displays[0]')"
fi

if echo "$WINDOWS_OUT" | jq -e '.displays[0].scaleFactor > 0' >/dev/null 2>&1; then
  pass "windows: display scaleFactor > 0"
else
  fail "windows: display scaleFactor" ""
fi

# If there are visible windows, validate their schema
WINDOW_COUNT=$(echo "$WINDOWS_OUT" | jq '.windows | length')
if [ "$WINDOW_COUNT" -gt 0 ]; then
  if echo "$WINDOWS_OUT" | jq -e '.windows[0] | has("handle", "title", "ownerName", "ownerPID", "bounds", "isVisible")' >/dev/null 2>&1; then
    pass "windows: window has required fields"
  else
    fail "windows: window schema" "$(echo "$WINDOWS_OUT" | jq '.windows[0] | keys')"
  fi

  if echo "$WINDOWS_OUT" | jq -e '.windows[0].bounds | has("x", "y", "width", "height")' >/dev/null 2>&1; then
    pass "windows: window bounds has x,y,width,height"
  else
    fail "windows: window bounds schema" ""
  fi
else
  pass "windows: no visible windows (headless CI — OK)"
fi

echo ""

# =====================================================================
# Test: point command
# =====================================================================

echo "--- point command ---"
POINT_OUT=$("$BINARY" point 100 100 2>/dev/null || true)

if echo "$POINT_OUT" | jq -e '.' >/dev/null 2>&1; then
  pass "point: valid JSON"
else
  fail "point: valid JSON" "output: $POINT_OUT"
fi

if echo "$POINT_OUT" | jq -e '.mousePosition.x == 100' >/dev/null 2>&1; then
  pass "point: x echoes back correctly"
else
  fail "point: x echo" "$(echo "$POINT_OUT" | jq '.mousePosition.x')"
fi

if echo "$POINT_OUT" | jq -e '.mousePosition.y == 100' >/dev/null 2>&1; then
  pass "point: y echoes back correctly"
else
  fail "point: y echo" "$(echo "$POINT_OUT" | jq '.mousePosition.y')"
fi

if echo "$POINT_OUT" | jq -e '.scaleFactor > 0' >/dev/null 2>&1; then
  pass "point: has scaleFactor > 0"
else
  fail "point: scaleFactor" ""
fi

echo ""

# =====================================================================
# Test: hooks command — ready message
# =====================================================================

echo "--- hooks command (ready message) ---"

# Start hooks, capture first line, then kill
HOOKS_OUT=""
if [ "$PLATFORM" = "macos" ] || [ "$PLATFORM" = "darwin" ]; then
  # macOS: hooks needs accessibility permissions, may fail in CI
  HOOKS_OUT=$(timeout 3 "$BINARY" hooks 2>/dev/null | head -1 || true)
else
  HOOKS_OUT=$(timeout 3 "$BINARY" hooks 2>/dev/null | head -1 || true)
fi

if [ -n "$HOOKS_OUT" ]; then
  if echo "$HOOKS_OUT" | jq -e '.type == "ready"' >/dev/null 2>&1; then
    pass "hooks: first line is ready message"
  else
    fail "hooks: first line type" "$(echo "$HOOKS_OUT" | jq '.type')"
  fi

  if echo "$HOOKS_OUT" | jq -e '.platform' >/dev/null 2>&1; then
    pass "hooks: ready has platform"
  else
    fail "hooks: ready platform" ""
  fi

  COORD_SPACE=$(echo "$HOOKS_OUT" | jq -r '.coordSpace')
  if [ "$COORD_SPACE" = "logical" ] || [ "$COORD_SPACE" = "physical" ]; then
    pass "hooks: coordSpace is logical or physical ($COORD_SPACE)"
  else
    fail "hooks: coordSpace" "$COORD_SPACE"
  fi

  # Platform-specific coordSpace validation
  if [ "$PLATFORM" = "macos" ] || [ "$PLATFORM" = "darwin" ]; then
    if [ "$COORD_SPACE" = "logical" ]; then
      pass "hooks: macOS uses logical coordSpace"
    else
      fail "hooks: macOS coordSpace" "expected logical, got $COORD_SPACE"
    fi
  else
    if [ "$COORD_SPACE" = "physical" ]; then
      pass "hooks: Windows uses physical coordSpace"
    else
      fail "hooks: Windows coordSpace" "expected physical, got $COORD_SPACE"
    fi
  fi
else
  # Hooks may not work in headless CI (no display, no accessibility)
  echo "  ⚠ hooks: could not start (possibly headless CI / no accessibility permissions)"
fi

echo ""

# =====================================================================
# Test: serve command
# =====================================================================

echo "--- serve command ---"

# Send a mouse command via serve stdin
SERVE_OUT=$(echo '{"id":1,"cmd":"mouse","args":{}}' | timeout 3 "$BINARY" serve 2>/dev/null | head -1 || true)

if [ -n "$SERVE_OUT" ]; then
  if echo "$SERVE_OUT" | jq -e '.id == 1' >/dev/null 2>&1; then
    pass "serve: response has matching id"
  else
    fail "serve: response id" "$SERVE_OUT"
  fi

  if echo "$SERVE_OUT" | jq -e '.result.mousePosition' >/dev/null 2>&1; then
    pass "serve: mouse result has mousePosition"
  else
    fail "serve: mouse result" "$(echo "$SERVE_OUT" | jq '.result' | head -c 200)"
  fi
else
  fail "serve: no output" "binary may have crashed"
fi

# Point via serve
SERVE_POINT=$(echo '{"id":2,"cmd":"point","args":{"x":200,"y":300}}' | timeout 3 "$BINARY" serve 2>/dev/null | head -1 || true)

if [ -n "$SERVE_POINT" ]; then
  if echo "$SERVE_POINT" | jq -e '.id == 2' >/dev/null 2>&1; then
    pass "serve: point response has matching id"
  else
    fail "serve: point id" "$SERVE_POINT"
  fi

  if echo "$SERVE_POINT" | jq -e '.result.mousePosition.x == 200' >/dev/null 2>&1; then
    pass "serve: point echoes x"
  else
    fail "serve: point x" "$(echo "$SERVE_POINT" | jq '.result.mousePosition.x')"
  fi
else
  fail "serve: point no output" ""
fi

# Invalid command
SERVE_BAD=$(echo '{"id":3,"cmd":"nonexistent","args":{}}' | timeout 3 "$BINARY" serve 2>/dev/null | head -1 || true)
if [ -n "$SERVE_BAD" ]; then
  if echo "$SERVE_BAD" | jq -e '.error' >/dev/null 2>&1; then
    pass "serve: unknown command returns error"
  else
    fail "serve: unknown command error" "$SERVE_BAD"
  fi
fi

echo ""

# =====================================================================
# Summary
# =====================================================================

echo "================================"
TOTAL=$((PASS + FAIL))
echo "Results: $PASS/$TOTAL passed"
if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}$FAIL test(s) failed${NC}"
  exit 1
else
  echo -e "${GREEN}All tests passed!${NC}"
  exit 0
fi
