#!/bin/bash
#
# scripts/phase-0-calibration.sh (v7.1)
#
# Phase 0 calibration script for Foundation Hardening Sprint.
# Reads from file-based artifacts and determines path viability.
#
# Usage:
#   ./scripts/phase-0-calibration.sh
#
# Prerequisites:
#   1. npm run baseline:test:run    # Generate test-results.json
#   2. npm run baseline:test:analyze # Generate test-summary.json + cluster-analysis.json
#
# Exit codes:
#   0 - Path decision made (see output for VIABLE/DIFFICULT/CHALLENGING/IMPOSSIBLE)
#   1 - Missing prerequisites
#   2 - Configuration error

set -e

BASELINE_FILE=".test-baseline.json"
SUMMARY_FILE="artifacts/test-summary.json"
CLUSTER_FILE="artifacts/cluster-analysis.json"

# Target: 90% pass rate means NonPassingTests must be <= 10% of total
# For ~1762 tests: 10% = 176 NonPassingTests max

echo "============================================================"
echo "PHASE 0 CALIBRATION (v7.1)"
echo "============================================================"
echo ""

# Check prerequisites
if [[ ! -f "$SUMMARY_FILE" ]]; then
    echo "ERROR: Missing $SUMMARY_FILE"
    echo ""
    echo "Run these commands first:"
    echo "  npm run baseline:test:run"
    echo "  npm run baseline:test:analyze"
    exit 1
fi

# Read current metrics from normalized summary
TOTAL=$(jq -r '.counts.total' "$SUMMARY_FILE")
PASSED=$(jq -r '.counts.passed' "$SUMMARY_FILE")
FAILED=$(jq -r '.counts.failed' "$SUMMARY_FILE")
SKIPPED=$(jq -r '.counts.skipped' "$SUMMARY_FILE")
SUITE_FAILURES=$(jq -r '.gate.suiteFailures' "$SUMMARY_FILE")
PASS_RATE=$(jq -r '.burnDown.passRate' "$SUMMARY_FILE")

# Calculate NonPassingTests (primary burn-down metric)
NON_PASSING=$((FAILED + SKIPPED))

# Calculate targets
TARGET_90_PASS=$((TOTAL * 90 / 100))
TARGET_82_PASS=$((TOTAL * 82 / 100))
TARGET_90_MAX_NP=$((TOTAL - TARGET_90_PASS))
TARGET_82_MAX_NP=$((TOTAL - TARGET_82_PASS))

# Calculate gaps
GAP_TO_90=$((NON_PASSING - TARGET_90_MAX_NP))
GAP_TO_82=$((NON_PASSING - TARGET_82_MAX_NP))

echo "CURRENT STATE:"
echo "  Total Tests:        $TOTAL"
echo "  Passed:             $PASSED"
echo "  Failed:             $FAILED"
echo "  Skipped:            $SKIPPED"
echo "  Suite Failures:     $SUITE_FAILURES (gate metric)"
echo "  ─────────────────────────────"
echo "  NonPassingTests:    $NON_PASSING"
echo "  Pass Rate:          $PASS_RATE%"
echo ""

echo "TARGET ANALYSIS:"
echo "  90% target:         $TARGET_90_PASS passed (max $TARGET_90_MAX_NP non-passing)"
echo "  82% target:         $TARGET_82_PASS passed (max $TARGET_82_MAX_NP non-passing)"
echo ""
echo "  Gap to 90%:         $GAP_TO_90 defects to burn"
echo "  Gap to 82%:         $GAP_TO_82 defects to burn"
echo ""

# Read cascade candidates if cluster analysis exists
if [[ -f "$CLUSTER_FILE" ]]; then
    echo "CASCADE CANDIDATES (from cluster analysis):"
    ALIAS_CASCADE=$(jq -r '.cascades.alias.count // 0' "$CLUSTER_FILE")
    REDIS_CASCADE=$(jq -r '.cascades.redis.count // 0' "$CLUSTER_FILE")
    TIMEOUT_CASCADE=$(jq -r '.cascades.timeout.count // 0' "$CLUSTER_FILE")
    CONSTANTS_CASCADE=$(jq -r '.cascades.hardcodedConstants.count // 0' "$CLUSTER_FILE")
    SUITE_CASCADE=$(jq -r '.cascades.suiteFailures.count // 0' "$CLUSTER_FILE")

    echo "  Alias resolution:   $ALIAS_CASCADE tests"
    echo "  Redis/connection:   $REDIS_CASCADE tests"
    echo "  Timeout issues:     $TIMEOUT_CASCADE tests"
    echo "  Hardcoded constants: $CONSTANTS_CASCADE tests"
    echo "  Suite failures:     $SUITE_CASCADE files (may hide 5-20 tests each)"

    # Estimate cascade fix potential
    # Suite failures hide ~10 tests each on average
    ESTIMATED_CASCADE_POTENTIAL=$((ALIAS_CASCADE + REDIS_CASCADE + TIMEOUT_CASCADE + CONSTANTS_CASCADE + SUITE_CASCADE * 10))
    echo ""
    echo "  Estimated cascade potential: ~$ESTIMATED_CASCADE_POTENTIAL tests"
fi

echo ""
echo "============================================================"
echo "PATH DECISION"
echo "============================================================"

# Decision thresholds (from v7 plan)
if [[ $GAP_TO_90 -le 0 ]]; then
    echo ""
    echo "STATUS: ALREADY AT 90%+"
    echo "No burn-down needed. Focus on locking in ratchet."
    echo ""
    echo "Next step: npm run baseline:test:save"
    exit 0
elif [[ $GAP_TO_90 -le 100 ]]; then
    echo ""
    echo "STATUS: PATH A VIABLE"
    echo "Gap of $GAP_TO_90 is achievable with focused effort."
    echo ""
    echo "Recommended: Proceed with 90% target"
    echo "Priority: Fix cascade candidates first for maximum ROI"
    exit 0
elif [[ $GAP_TO_90 -le 150 ]]; then
    echo ""
    echo "STATUS: PATH A DIFFICULT"
    echo "Gap of $GAP_TO_90 requires significant cascade fixes."
    echo ""
    echo "Recommended: Attempt 90%, prepare fallback to 85%"
    echo "Priority: All cascade candidates must be resolved"
    exit 0
elif [[ $GAP_TO_90 -le 200 ]]; then
    echo ""
    echo "STATUS: PATH A CHALLENGING"
    echo "Gap of $GAP_TO_90 needs 2+ major cascade fixes to succeed."
    echo ""
    echo "Recommended: Evaluate cascade potential carefully"
    echo "If cascade potential < gap: Consider Path B (82%)"
    exit 0
else
    echo ""
    echo "STATUS: PATH B RECOMMENDED"
    echo "Gap of $GAP_TO_90 exceeds realistic sprint capacity."
    echo ""
    echo "Recommended: Target 82% (gap: $GAP_TO_82)"
    echo "This is still meaningful progress."
    exit 0
fi
