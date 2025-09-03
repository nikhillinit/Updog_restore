#!/bin/bash

# Test all gates locally before pushing with objective metrics
# This script simulates what CI will do

set -euo pipefail

echo "🔍 Testing all gates locally..."
echo "================================"
echo "$(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

GATES_PASSED=0
TOTAL_GATES=5

# Gate 1: TypeScript Check
echo "== Gate 1: TypeScript (tsc --noEmit)"
echo "------------------------"
npm run check 2>&1 | tee /tmp/ts.log || true
TS_ERRORS=$(grep -c "error TS" /tmp/ts.log || echo "0")
echo "TypeScript errors: $TS_ERRORS"

if [ "$TS_ERRORS" -eq 0 ]; then
    echo -e "${GREEN}✅ TypeScript: Clean (0 errors)${NC}"
    GATES_PASSED=$((GATES_PASSED + 1))
else
    echo -e "${RED}❌ TypeScript: $TS_ERRORS errors found${NC}"
    # Show error categories for tracking
    echo "  Import/export errors: $(grep -c "has no exported member\|Cannot find module" /tmp/ts.log || echo "0")"
    echo "  Property errors: $(grep -c "does not exist in type\|Property.*is missing" /tmp/ts.log || echo "0")"
    echo "  Other errors: $(grep -c "error TS" /tmp/ts.log | awk -v imp=$(grep -c "has no exported member\|Cannot find module" /tmp/ts.log) -v prop=$(grep -c "does not exist in type\|Property.*is missing" /tmp/ts.log) '{print $1-imp-prop}')"
fi
echo ""

# Gate 2: Tests
echo "== Gate 2: Tests (npm test)"
echo "------------------"
npm test --silent 2>&1 | tee /tmp/test.log || true
TEST_STATUS=$?
echo "Test status code: $TEST_STATUS (0=pass)"

# Try to extract test counts
PASSING=$(grep -oE '[0-9]+ passing' /tmp/test.log | grep -oE '[0-9]+' | head -1 || echo "0")
FAILING=$(grep -oE '[0-9]+ failing' /tmp/test.log | grep -oE '[0-9]+' | head -1 || echo "0")

if [ "$TEST_STATUS" -eq 0 ] && [ "$PASSING" -gt 0 ]; then
    echo -e "${GREEN}✅ Tests: $PASSING tests passed${NC}"
    GATES_PASSED=$((GATES_PASSED + 1))
elif [ "$FAILING" -gt 0 ]; then
    echo -e "${RED}❌ Tests: $FAILING failures${NC}"
else
    echo -e "${YELLOW}⚠️  Tests: Status unknown${NC}"
fi
echo ""

# Gate 3: Build & Bundle
echo "== Gate 3: Bundle (vite)"
echo "----------------------------"
npm run build --silent >/tmp/build.log 2>&1 || true
BUILD_STATUS=$?

# Calculate bundle size
if [ -d "dist" ]; then
    BUNDLE_KB=$(find dist -name "*.js" -exec du -k {} \; | awk '{sum+=$1} END {print int(sum)}' 2>/dev/null || echo "0")
else
    BUNDLE_KB=0
fi

echo "Bundle total (KB): $BUNDLE_KB"
BUDGET_KB=400
WARNING_KB=380

if [ "$BUILD_STATUS" -eq 0 ] && [ "$BUNDLE_KB" -gt 0 ]; then
    if [ "$BUNDLE_KB" -le "$WARNING_KB" ]; then
        echo -e "${GREEN}✅ Bundle size: ${BUNDLE_KB}KB (safe)${NC}"
        GATES_PASSED=$((GATES_PASSED + 1))
    elif [ "$BUNDLE_KB" -le "$BUDGET_KB" ]; then
        echo -e "${YELLOW}⚠️  Bundle size: ${BUNDLE_KB}KB (warning zone)${NC}"
        GATES_PASSED=$((GATES_PASSED + 1))
    else
        echo -e "${RED}❌ Bundle exceeds budget: ${BUNDLE_KB}KB > ${BUDGET_KB}KB${NC}"
    fi
else
    echo -e "${RED}❌ Build failed or no output${NC}"
fi
echo ""

# Gate 4: Guardian Health Check (simulated)
echo "Gate 4: Guardian Health (simulated)"
echo "-----------------------------------"
# Start server temporarily for health check
npm start > /dev/null 2>&1 &
SERVER_PID=$!
sleep 5  # Give server time to start

if curl -f --max-time 3 http://localhost:5000/healthz 2>/dev/null; then
    echo -e "${GREEN}✅ Health endpoint responding${NC}"
    GATES_PASSED=$((GATES_PASSED + 1))
else
    echo -e "${RED}❌ Health endpoint not responding${NC}"
fi

# Clean up server
kill $SERVER_PID 2>/dev/null || true
echo ""

# Gate 5: CI Health (informational only)
echo "Gate 5: CI Health"
echo "-----------------"
if command -v gh &> /dev/null; then
    echo "Checking recent CI runs..."
    RECENT_RUNS=$(gh run list --workflow "Green Scoreboard" --limit 5 --json conclusion --jq '[.[] | select(.conclusion == "success")] | length' 2>/dev/null || echo "0")
    
    if [ "$RECENT_RUNS" -ge 3 ]; then
        echo -e "${GREEN}✅ CI Health: Good ($RECENT_RUNS/5 recent runs successful)${NC}"
        GATES_PASSED=$((GATES_PASSED + 1))
    else
        echo -e "${YELLOW}⚠️  CI Health: Degraded ($RECENT_RUNS/5 recent runs successful)${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  GitHub CLI not available, skipping CI health check${NC}"
    echo "  Install with: brew install gh (macOS) or see https://cli.github.com"
fi
echo ""

# Summary
echo "======================================="
echo "📊 LOCAL GATE SUMMARY"
echo "======================================="
echo ""

if [ $GATES_PASSED -eq $TOTAL_GATES ]; then
    echo -e "${GREEN}🟢 ALL GATES PASSED ($GATES_PASSED/$TOTAL_GATES)${NC}"
    echo ""
    echo "Ready to push! Your code meets all quality gates."
    exit 0
elif [ $GATES_PASSED -ge 3 ]; then
    echo -e "${YELLOW}🟡 PARTIAL PASS ($GATES_PASSED/$TOTAL_GATES gates)${NC}"
    echo ""
    echo "Some gates are failing. Review the issues above."
    exit 1
else
    echo -e "${RED}🔴 GATES FAILING ($GATES_PASSED/$TOTAL_GATES gates)${NC}"
    echo ""
    echo "Multiple gates failing. Fix the issues before pushing."
    exit 1
fi