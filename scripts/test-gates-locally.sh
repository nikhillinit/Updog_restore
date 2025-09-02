#!/bin/bash

# Test all gates locally before pushing
# This script simulates what CI will do

set -e  # Exit on first error

echo "🔍 Testing all gates locally..."
echo "================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

GATES_PASSED=0
TOTAL_GATES=5

# Gate 1: TypeScript Check
echo "Gate 1: TypeScript Check"
echo "------------------------"
if npm run check 2>&1 | tee ts-output.log; then
    TS_ERRORS=$(grep -c "error TS" ts-output.log || echo "0")
    if [ "$TS_ERRORS" -eq 0 ]; then
        echo -e "${GREEN}✅ TypeScript: Clean (0 errors)${NC}"
        GATES_PASSED=$((GATES_PASSED + 1))
    else
        echo -e "${RED}❌ TypeScript: $TS_ERRORS errors found${NC}"
    fi
else
    echo -e "${RED}❌ TypeScript check failed${NC}"
fi
echo ""

# Gate 2: Tests
echo "Gate 2: Test Suite"
echo "------------------"
if npm run test:unit 2>&1 | tee unit-test.log; then
    PASSING=$(grep -oP '\d+(?= passing)' unit-test.log | head -1 || echo "0")
    FAILING=$(grep -oP '\d+(?= failing)' unit-test.log | head -1 || echo "0")
    
    if [ "$FAILING" -eq 0 ] && [ "$PASSING" -gt 0 ]; then
        echo -e "${GREEN}✅ Tests: $PASSING tests passed${NC}"
        GATES_PASSED=$((GATES_PASSED + 1))
    else
        echo -e "${RED}❌ Tests: $FAILING failures${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Tests not configured or failed to run${NC}"
fi
echo ""

# Gate 3: Build & Bundle
echo "Gate 3: Build & Bundle Check"
echo "----------------------------"
if npm run build 2>&1 | tee build.log; then
    echo -e "${GREEN}✅ Build succeeded${NC}"
    
    # Extract bundle size
    node scripts/extract-bundle-size.mjs
    
    if [ -f "dist/.app-size-kb" ]; then
        SIZE_KB=$(cat dist/.app-size-kb)
        BUDGET_KB=400
        
        if [ "$SIZE_KB" -le "$BUDGET_KB" ]; then
            echo -e "${GREEN}✅ Bundle size: ${SIZE_KB}KB / ${BUDGET_KB}KB${NC}"
            GATES_PASSED=$((GATES_PASSED + 1))
        else
            echo -e "${RED}❌ Bundle exceeds budget: ${SIZE_KB}KB > ${BUDGET_KB}KB${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  Could not determine bundle size${NC}"
    fi
else
    echo -e "${RED}❌ Build failed${NC}"
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