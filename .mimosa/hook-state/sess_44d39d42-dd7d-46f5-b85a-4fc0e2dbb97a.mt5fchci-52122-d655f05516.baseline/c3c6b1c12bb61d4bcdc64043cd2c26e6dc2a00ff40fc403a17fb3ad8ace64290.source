#!/usr/bin/env bash
# Production smoke tests for Vercel deployment
# Usage: ./scripts/smoke.sh [BASE_URL]
# Example: ./scripts/smoke.sh https://myapp.vercel.app

set -euo pipefail

# Get base URL from argument or environment
BASE_URL="${1:-${BASE_URL:-http://localhost:3000}}"
METRICS_KEY="${METRICS_KEY:-}"
HEALTH_KEY="${HEALTH_KEY:-}"
FUND_SIZE="${FUND_SIZE:-100000000}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 Running smoke tests against: $BASE_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Track failures
FAILED=0

echo ""
echo "🏥 Health checks"
echo "────────────────"

# Basic health check
echo -n "Testing /healthz... "
if curl -fsSL "$BASE_URL/healthz" | grep -q '"status":"ok"' 2>/dev/null; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
    FAILED=$((FAILED + 1))
fi

# API health check  
echo -n "Testing /api/health... "
if curl -fsSL "$BASE_URL/api/health" | grep -q '"ok":true' 2>/dev/null; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
    FAILED=$((FAILED + 1))
fi

# Version endpoint
echo -n "Testing /api/version... "
if curl -fsSL "$BASE_URL/api/version" | grep -q '"version"' 2>/dev/null; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
    FAILED=$((FAILED + 1))
fi

echo ""
echo "📦 Static Assets"
echo "────────────────"

# Test SPA loads
echo -n "Testing SPA index page... "
if curl -fsSL "$BASE_URL/" | grep -q '<div id="root">' 2>/dev/null; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
    FAILED=$((FAILED + 1))
fi

# Test assets are NOT served as HTML (filesystem handler working)
echo -n "Testing asset serving (not HTML)... "
# Extract an asset path from index.html
ASSET_PATH=$(curl -sS "$BASE_URL/" 2>/dev/null | grep -o '/assets/[^"]*\.js' | head -1 || echo "")
if [ -n "$ASSET_PATH" ]; then
    CONTENT_TYPE=$(curl -sI "$BASE_URL$ASSET_PATH" 2>/dev/null | grep -i "content-type" | cut -d':' -f2 | tr -d '\r\n ')
    if [[ "$CONTENT_TYPE" != *"text/html"* ]]; then
        echo -e "${GREEN}✓${NC} (JS served correctly)"
    else
        echo -e "${RED}✗${NC} (filesystem handler issue!)"
        FAILED=$((FAILED + 1))
    fi
else
    echo -e "${YELLOW}⚠${NC} (no assets found)"
fi

echo ""
echo "🔒 Security Headers"
echo "────────────────"

# Check API cache headers
echo -n "Testing API no-store header... "
CACHE=$(curl -sI "$BASE_URL/api/health" 2>/dev/null | grep -i "cache-control" | cut -d':' -f2)
if [[ "$CACHE" == *"no-store"* ]]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${YELLOW}⚠${NC} (Cache-Control: $CACHE)"
fi

# Check asset cache headers if we found one
if [ -n "$ASSET_PATH" ]; then
    echo -n "Testing asset immutable cache... "
    CACHE=$(curl -sI "$BASE_URL$ASSET_PATH" 2>/dev/null | grep -i "cache-control" | cut -d':' -f2)
    if [[ "$CACHE" == *"immutable"* ]] || [[ "$CACHE" == *"max-age=31536000"* ]]; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${YELLOW}⚠${NC} (Cache-Control: $CACHE)"
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All smoke tests passed!${NC}"
    echo ""
    echo "Dispatch governed production release:"
    echo "  pwsh ./scripts/deploy-production.ps1"
    exit 0
else
    echo -e "${RED}❌ $FAILED smoke test(s) failed${NC}"
    echo ""
    echo "Please fix the issues before deploying."
    exit 1
fi
