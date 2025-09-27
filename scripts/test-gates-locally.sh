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
TOTAL_GATES=7

# Gate 1: TypeScript Check
echo "== Gate 1: TypeScript (tsc --noEmit)"
echo "------------------------"
npm run check 2>&1 | tee /tmp/ts.log || true
raw_ts_errors=$(grep -c "error TS" /tmp/ts.log 2>/dev/null || echo "0")
TS_ERRORS=$(printf '%s' "$raw_ts_errors" | tr -cd '0-9')
: "${TS_ERRORS:=0}"
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

# Gate 2: ESLint (no warnings)
echo "== Gate 2: ESLint (npx eslint . --max-warnings=0)"
echo "----------------------------------------"
npx eslint . --max-warnings=0 2>&1 | tee /tmp/eslint.log || true
ESLINT_STATUS=$?
raw_eslint_errors=$(grep -c "✖.*error" /tmp/eslint.log 2>/dev/null || echo "0")
ESLINT_ERRORS=$(printf '%s' "$raw_eslint_errors" | tr -cd '0-9')
: "${ESLINT_ERRORS:=0}"
raw_eslint_warnings=$(grep -c "⚠.*warning" /tmp/eslint.log 2>/dev/null || echo "0")
ESLINT_WARNINGS=$(printf '%s' "$raw_eslint_warnings" | tr -cd '0-9')
: "${ESLINT_WARNINGS:=0}"

echo "ESLint status: $ESLINT_STATUS"
echo "ESLint errors: $ESLINT_ERRORS"
echo "ESLint warnings: $ESLINT_WARNINGS"

if [ "$ESLINT_STATUS" -eq 0 ]; then
    echo -e "${GREEN}✅ ESLint: Clean (0 errors, 0 warnings)${NC}"
    GATES_PASSED=$((GATES_PASSED + 1))
else
    echo -e "${RED}❌ ESLint: $ESLINT_ERRORS errors, $ESLINT_WARNINGS warnings${NC}"
fi
echo ""

# Gate 3: Express Augmentation Drift Check
echo "== Gate 3: Express Request Augmentation Drift"
echo "---------------------------------------------"
raw_augmentations=$(git grep -n "interface Request" -- types server 2>/dev/null | wc -l || echo "0")
REQUEST_AUGMENTATIONS=$(printf '%s' "$raw_augmentations" | tr -cd '0-9')
: "${REQUEST_AUGMENTATIONS:=0}"
echo "Request augmentation files: $REQUEST_AUGMENTATIONS"

# Should be exactly 1 (in types/express.d.ts)
if [ "$REQUEST_AUGMENTATIONS" -eq 1 ]; then
    echo -e "${GREEN}✅ Express Augmentation: Single source of truth${NC}"
    GATES_PASSED=$((GATES_PASSED + 1))
elif [ "$REQUEST_AUGMENTATIONS" -eq 0 ]; then
    echo -e "${RED}❌ Express Augmentation: No augmentations found${NC}"
else
    echo -e "${RED}❌ Express Augmentation: Multiple augmentations ($REQUEST_AUGMENTATIONS)${NC}"
    echo "  Found in:"
    git grep -l "interface Request" -- types server | sed 's/^/    /'
fi
echo ""

# Gate 4: Tests
echo "== Gate 4: Tests (npm test)"
echo "------------------"
npm test --silent 2>&1 | tee /tmp/test.log || true
TEST_STATUS=$?
echo "Test status code: $TEST_STATUS (0=pass)"

# Try to extract test counts
raw_passing=$(grep -oE '[0-9]+ passing' /tmp/test.log 2>/dev/null | grep -oE '[0-9]+' | head -1 || echo "0")
PASSING=$(printf '%s' "$raw_passing" | tr -cd '0-9')
: "${PASSING:=0}"
raw_failing=$(grep -oE '[0-9]+ failing' /tmp/test.log 2>/dev/null | grep -oE '[0-9]+' | head -1 || echo "0")
FAILING=$(printf '%s' "$raw_failing" | tr -cd '0-9')
: "${FAILING:=0}"

if [ "$TEST_STATUS" -eq 0 ] && [ "$PASSING" -gt 0 ]; then
    echo -e "${GREEN}✅ Tests: $PASSING tests passed${NC}"
    GATES_PASSED=$((GATES_PASSED + 1))
elif [ "$FAILING" -gt 0 ]; then
    echo -e "${RED}❌ Tests: $FAILING failures${NC}"
else
    echo -e "${YELLOW}⚠️  Tests: Status unknown${NC}"
fi
echo ""

# Gate 5: Build & Bundle
echo "== Gate 5: Bundle (vite)"
echo "----------------------------"
npm run build --silent >/tmp/build.log 2>&1 || true
BUILD_STATUS=$?

# Calculate first-load JS size with our dedicated script
if [ -f "scripts/size-first-load.mjs" ]; then
    FIRST_LOAD_KB=$(node scripts/size-first-load.mjs 2>/dev/null || echo "0")
    echo "First-load JS (KB): $FIRST_LOAD_KB"
    
    # Check for chart chunks in first-load (regression warning)
    node scripts/size-first-load.mjs --verbose 2> /tmp/firstload.log || true
    if grep -q "vendor-\(charts\|nivo\)" /tmp/firstload.log; then
        echo -e "${YELLOW}  WARNING: Charts chunk detected in first-load bundle${NC}"
    fi
else
    FIRST_LOAD_KB=0
    echo "Warning: size-first-load.mjs not found"
fi

# Calculate total bundle size (Windows-safe)
if [ -d "dist/public/assets" ]; then
    BUNDLE_KB=$(node -e "const fs=require('fs'),p='dist/public/assets';let s=0;if(fs.existsSync(p)){for(const f of fs.readdirSync(p)){if(f.endsWith('.js')) s+=fs.statSync(p+'/'+f).size}};console.log(Math.round(s/1024))" 2>/dev/null || echo "0")
else
    BUNDLE_KB=0
fi

echo "Bundle total (KB): $BUNDLE_KB"

# First-load budgets
FIRST_LOAD_BUDGET_KB=360
FIRST_LOAD_WARNING_KB=300

# Total bundle budgets
BUDGET_KB=400
WARNING_KB=380

if [ "$BUILD_STATUS" -eq 0 ] && [ "$FIRST_LOAD_KB" -gt 0 ]; then
    # Check first-load size first (more critical)
    if [ "$FIRST_LOAD_KB" -le "$FIRST_LOAD_WARNING_KB" ]; then
        echo -e "${GREEN}✅ First-load: ${FIRST_LOAD_KB}KB (excellent)${NC}"
        GATES_PASSED=$((GATES_PASSED + 1))
    elif [ "$FIRST_LOAD_KB" -le "$FIRST_LOAD_BUDGET_KB" ]; then
        echo -e "${YELLOW}⚠️  First-load: ${FIRST_LOAD_KB}KB (warning zone)${NC}"
        GATES_PASSED=$((GATES_PASSED + 1))
    else
        echo -e "${RED}❌ First-load exceeds budget: ${FIRST_LOAD_KB}KB > ${FIRST_LOAD_BUDGET_KB}KB${NC}"
    fi
    
    # Also check total bundle (informational)
    if [ "$BUNDLE_KB" -le "$WARNING_KB" ]; then
        echo "  Total bundle: ${BUNDLE_KB}KB (safe)"
    elif [ "$BUNDLE_KB" -le "$BUDGET_KB" ]; then
        echo "  Total bundle: ${BUNDLE_KB}KB (warning)"
    else
        echo "  Total bundle: ${BUNDLE_KB}KB (over budget)"
    fi
else
    echo -e "${RED}❌ Build failed or no output${NC}"
fi
echo ""

# Gate 6: Guardian Health Check (simulated)
echo "== Gate 6: Guardian Health (simulated)"
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

# Gate 7: CI Health (informational only)
echo "== Gate 7: CI Health"
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