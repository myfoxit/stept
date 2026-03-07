#!/usr/bin/env bash
#
# Build script for Ondoki Chrome Extension
#
# Usage:
#   ./build.sh store        — Chrome Web Store build (hardcoded cloud URL, no API URL config)
#   ./build.sh self-hosted  — Self-hosted build (configurable API URL)
#   ./build.sh              — defaults to self-hosted
#

set -euo pipefail

MODE="${1:-self-hosted}"
DIST_DIR="dist-${MODE}"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ "$MODE" != "store" && "$MODE" != "self-hosted" ]]; then
  echo "Usage: $0 [store|self-hosted]"
  exit 1
fi

echo "🔨 Building Ondoki extension (mode: ${MODE})..."

# Clean & copy
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"
cp -r icons "$DIST_DIR/" 2>/dev/null || true
cp manifest.json popup.html popup.js popup.css \
   sidepanel.html sidepanel.js sidepanel.css \
   background.js content.js context.js redaction.js \
   search.js storage.js \
   "$DIST_DIR/" 2>/dev/null || true

# Patch BUILD_CONFIG in background.js
if [[ "$MODE" == "store" ]]; then
  # Set mode to 'cloud' for Chrome Web Store
  sed -i '' "s/mode: 'self-hosted'/mode: 'cloud'/" "$DIST_DIR/background.js"
  echo "   ✅ Set BUILD_CONFIG.mode = 'cloud'"
else
  # Ensure mode is 'self-hosted'
  sed -i '' "s/mode: 'cloud'/mode: 'self-hosted'/" "$DIST_DIR/background.js"
  echo "   ✅ Set BUILD_CONFIG.mode = 'self-hosted'"
fi

# For store build, also lock down host_permissions to only the cloud URL
if [[ "$MODE" == "store" ]]; then
  # Replace localhost permission with only the production URL
  python3 -c "
import json, sys
with open('$DIST_DIR/manifest.json') as f:
    m = json.load(f)
m['host_permissions'] = ['https://app.ondoki.io/*', '<all_urls>']
with open('$DIST_DIR/manifest.json', 'w') as f:
    json.dump(m, f, indent=2)
" 2>/dev/null || echo "   ⚠️  Could not patch manifest host_permissions (python3 missing)"
fi

echo "📦 Output: ${DIST_DIR}/"
echo "   Done!"
