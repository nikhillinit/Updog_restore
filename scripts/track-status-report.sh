#!/bin/bash

# Track Status Report - Daily Standup Automation
# Provides cross-track coordination and progress visibility

set -e

echo "📊 Daily Track Status Report"
echo "============================"
echo "Date: $(date '+%Y-%m-%d %H:%M')"
echo ""

# Track A: TypeScript Status
echo "🔧 Track A - TypeScript to Zero"
echo "--------------------------------"
TS_ERRORS=$(npm run check 2>&1 | grep -c "error TS" || echo "0")
TS_BASELINE=25  # From audit

if [ -f ".track-progress.json" ]; then
    PREV_TS=$(jq -r '.typescript_errors // 25' .track-progress.json)
    TS_FIXED=$((TS_BASELINE - TS_ERRORS))
    TS_PROGRESS=$((100 * TS_FIXED / TS_BASELINE))
    
    echo "  Errors: $TS_ERRORS/$TS_BASELINE remaining"
    echo "  Fixed Today: $((PREV_TS - TS_ERRORS))"
    echo "  Progress: ${TS_PROGRESS}% complete"
    
    # Categorize remaining errors
    echo "  Categories:"
    echo "    - Import/Export: $(npm run check 2>&1 | grep -c "import\|export\|module" || echo "0")"
    echo "    - Schema/Drizzle: $(npm run check 2>&1 | grep -c "schema\|inferInsert\|inferSelect" || echo "0")"
    echo "    - Middleware: $(npm run check 2>&1 | grep -c "middleware\|Request\|Response" || echo "0")"
else
    echo "  Baseline: $TS_ERRORS errors"
fi

# Track B: Test System Status
echo ""
echo "🧪 Track B - Test System Repair"
echo "--------------------------------"

# Check test file locations
MISPLACED_TESTS=$(find tests -maxdepth 1 -name "*.test.ts" -o -name "*.test.tsx" 2>/dev/null | wc -l || echo "0")
echo "  Misplaced test files: $MISPLACED_TESTS"

# Check test pass rate
TEST_OUTPUT=$(npm test 2>&1 || true)
PASSING=$(echo "$TEST_OUTPUT" | grep -oP '\d+(?= passing)' | head -1 || echo "0")
FAILING=$(echo "$TEST_OUTPUT" | grep -oP '\d+(?= failing)' | head -1 || echo "0")
TOTAL=$((PASSING + FAILING))

if [ "$TOTAL" -gt 0 ]; then
    PASS_RATE=$((100 * PASSING / TOTAL))
    echo "  Test Pass Rate: ${PASS_RATE}% ($PASSING/$TOTAL)"
else
    echo "  Test Pass Rate: Unable to determine"
fi

# Check for data-testid in wizard
TESTID_COUNT=$(grep -r "data-testid" client/src --include="*.tsx" | grep -c "step-[34]" || echo "0")
echo "  Wizard data-testids (Step 3/4): $TESTID_COUNT found"

# Track C: CI/Guardian Status
echo ""
echo "🚨 Track C - CI/Guardian Hardening"
echo "-----------------------------------"

# Check Guardian status (would query actual monitoring in production)
echo "  Guardian Status: Checking..."
GUARDIAN_STATUS="NEEDS_CHECK"  # Would query actual status

# Check CI failures
if [ -f "ci-failure-analysis.json" ]; then
    BLOCKING=$(jq -r '.summary.blocking // 0' ci-failure-analysis.json)
    CRITICAL=$(jq -r '.summary.critical // 0' ci-failure-analysis.json)
    echo "  CI Blocking Failures: $BLOCKING"
    echo "  CI Critical Failures: $CRITICAL"
else
    echo "  CI Status: Run 'node scripts/ci-failure-analysis.mjs' for details"
fi

# Check feature flags
if [ -f "client/src/config/features.json" ]; then
    FLAG_COUNT=$(jq -r 'keys | length' client/src/config/features.json 2>/dev/null || echo "0")
    echo "  Feature Flags Configured: $FLAG_COUNT"
else
    echo "  Feature Flags: Not configured"
fi

# Track D: Modeling Engine Status
echo ""
echo "📈 Track D - Modeling Engine (Behind Flags)"
echo "-------------------------------------------"

# Check for feature flag usage in code
RESERVES_FLAG=$(grep -r "featureFlag.*reserves-v1.1" client/src server --include="*.ts" --include="*.tsx" | wc -l || echo "0")
HORIZON_FLAG=$(grep -r "featureFlag.*horizon-quarters" client/src server --include="*.ts" --include="*.tsx" | wc -l || echo "0")

echo "  Reserves v1.1 Flag Usage: $RESERVES_FLAG locations"
echo "  Horizon Quarters Flag Usage: $HORIZON_FLAG locations"

# Check property tests
PROPERTY_TESTS=$(find tests -name "*.property.test.ts" 2>/dev/null | wc -l || echo "0")
echo "  Property-Based Tests: $PROPERTY_TESTS files"

# Overall Progress Summary
echo ""
echo "📈 Overall Progress Summary"
echo "==========================="

# Calculate aggregate progress
GATES_GREEN=0
GATES_TOTAL=5

[ "$TS_ERRORS" -eq 0 ] && GATES_GREEN=$((GATES_GREEN + 1))
[ "$FAILING" -eq 0 ] && GATES_GREEN=$((GATES_GREEN + 1))
[ "$BLOCKING" -eq 0 ] && [ "$CRITICAL" -eq 0 ] && GATES_GREEN=$((GATES_GREEN + 1))
[ "$GUARDIAN_STATUS" = "GREEN" ] && GATES_GREEN=$((GATES_GREEN + 1))

# Bundle check
BUNDLE_SIZE=$(npm run build 2>&1 | grep -oP '\d+(?=\.\d+\s*kB)' | head -1 || echo "400")
[ "$BUNDLE_SIZE" -lt 400 ] && GATES_GREEN=$((GATES_GREEN + 1))

echo "  Green Gates: $GATES_GREEN/$GATES_TOTAL"
echo "  Status: $([ $GATES_GREEN -eq $GATES_TOTAL ] && echo "🟢 READY FOR PROMOTION" || echo "🔴 BLOCKED - Fix gates")"

# Walking Skeleton Status
echo ""
echo "🦴 Walking Skeleton Status"
echo "-------------------------"
if [ -f "client/src/components/walking-skeleton/WalkingSkeleton.tsx" ]; then
    # Try to run walking skeleton test
    SKELETON_TEST=$(npm test -- walking-skeleton 2>&1 | grep -c "passing" || echo "0")
    if [ "$SKELETON_TEST" -gt 0 ]; then
        echo "  ✅ Walking Skeleton: GREEN (deployable)"
    else
        echo "  ❌ Walking Skeleton: RED (needs fixing)"
    fi
else
    echo "  ⚠️  Walking Skeleton: Not found"
fi

# Save progress for next run
cat > .track-progress.json <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "typescript_errors": $TS_ERRORS,
  "test_failures": $FAILING,
  "gates_green": $GATES_GREEN,
  "bundle_size": $BUNDLE_SIZE
}
EOF

# Recommendations
echo ""
echo "🎯 Recommended Actions"
echo "====================="

if [ "$TS_ERRORS" -gt 0 ]; then
    echo "1. Fix remaining $TS_ERRORS TypeScript errors (Track A priority)"
fi

if [ "$MISPLACED_TESTS" -gt 0 ]; then
    echo "2. Move $MISPLACED_TESTS test files to correct locations (Track B)"
fi

if [ "$BLOCKING" -gt 0 ]; then
    echo "3. Fix $BLOCKING blocking CI failures first (Track C)"
fi

if [ "$BUNDLE_SIZE" -gt 390 ]; then
    echo "4. ⚠️  Bundle size critical: ${BUNDLE_SIZE}KB (limit 400KB)"
fi

echo ""
echo "Next sync: Tomorrow at standup"
echo "Full report saved to: .track-progress.json"