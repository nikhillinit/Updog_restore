#!/bin/bash
#
# scripts/test-ratchet-check.sh (v7.1)
#
# Focused test ratchet enforcement using NORMALIZED test-summary.json.
# Separates burn-down metric (NonPassingTests) from gate metric (SuiteFailures).
#
# v7.1 changes:
# - Reads from .test-baseline.json (file-based ratchets)
# - Separate limits: maxFailedTests, maxSkippedTests, maxSuiteFailures
# - Stderr capture instead of 2>/dev/null
# - File existence and size guards
#
# Usage:
#   ./scripts/test-ratchet-check.sh              # Check against baseline
#   ./scripts/test-ratchet-check.sh --init       # Initialize baseline from current state
#
# Workflow:
#   1. npm test -- --reporter=json --outputFile=artifacts/test-results.json 2> artifacts/test-run.stderr.txt
#   2. node scripts/analyze-failure-clusters.js  # Produces test-summary.json
#   3. ./scripts/test-ratchet-check.sh           # Check ratchets
#
# Exit codes:
#   0 - All ratchets pass
#   1 - Ratchet violation (regression detected)
#   2 - Setup error (missing files, etc.)

set -e

BASELINE_FILE=".test-baseline.json"
SUMMARY_FILE="artifacts/test-summary.json"
STDERR_FILE="artifacts/test-run.stderr.txt"
RESULTS_FILE="artifacts/test-results.json"
MIN_FILE_SIZE=100

echo "============================================================"
echo "TEST RATCHET CHECK (v7.1)"
echo "============================================================"

# Handle --init flag
if [[ "${1:-}" == "--init" ]]; then
    if [[ ! -f "$SUMMARY_FILE" ]]; then
        echo "ERROR: Run cluster analysis first:"
        echo "  node scripts/analyze-failure-clusters.js"
        exit 2
    fi

    # Create baseline from normalized summary
    FAILED=$(jq -r '.counts.failed' "$SUMMARY_FILE")
    SKIPPED=$(jq -r '.counts.skipped' "$SUMMARY_FILE")
    SUITE_FAILURES=$(jq -r '.gate.suiteFailures' "$SUMMARY_FILE")
    TIMESTAMP=$(jq -r '.meta.timestamp' "$SUMMARY_FILE")

    jq -n \
        --arg timestamp "$TIMESTAMP" \
        --argjson maxFailedTests "$FAILED" \
        --argjson maxSkippedTests "$SKIPPED" \
        --argjson maxSuiteFailures "$SUITE_FAILURES" \
        '{
            version: "7.1",
            created: $timestamp,
            maxFailedTests: $maxFailedTests,
            maxSkippedTests: $maxSkippedTests,
            maxSuiteFailures: $maxSuiteFailures,
            note: "Ratchets can only decrease. Update by running --init after improvements."
        }' > "$BASELINE_FILE"

    echo "Created $BASELINE_FILE:"
    cat "$BASELINE_FILE"
    echo ""
    echo "Commit this file to lock in the ratchet."
    exit 0
fi

# Guard: Check baseline file exists
if [[ ! -f "$BASELINE_FILE" ]]; then
    echo "ERROR: Baseline file not found: $BASELINE_FILE"
    echo ""
    echo "Initialize baseline with:"
    echo "  npm test -- --reporter=json --outputFile=$RESULTS_FILE 2> $STDERR_FILE"
    echo "  node scripts/analyze-failure-clusters.js"
    echo "  ./scripts/test-ratchet-check.sh --init"
    exit 2
fi

# Guard: Check test-summary.json exists and is valid
if [[ ! -f "$SUMMARY_FILE" ]]; then
    echo "ERROR: Summary file not found: $SUMMARY_FILE"
    echo ""
    echo "Run cluster analysis first:"
    echo "  node scripts/analyze-failure-clusters.js"
    exit 2
fi

# Guard: Check file size (catches empty/truncated files)
SUMMARY_SIZE=$(stat -c%s "$SUMMARY_FILE" 2>/dev/null || stat -f%z "$SUMMARY_FILE" 2>/dev/null || echo 0)
if [[ "$SUMMARY_SIZE" -lt "$MIN_FILE_SIZE" ]]; then
    echo "ERROR: Summary file too small ($SUMMARY_SIZE bytes)"
    echo "This usually means test run failed before producing output."
    if [[ -f "$STDERR_FILE" ]]; then
        echo ""
        echo "Last 20 lines from $STDERR_FILE:"
        tail -20 "$STDERR_FILE" || true
    fi
    exit 2
fi

# Read baseline ratchets
MAX_FAILED=$(jq -r '.maxFailedTests // 999999' "$BASELINE_FILE")
MAX_SKIPPED=$(jq -r '.maxSkippedTests // 999999' "$BASELINE_FILE")
MAX_SUITE_FAILURES=$(jq -r '.maxSuiteFailures // 999999' "$BASELINE_FILE")

# Read current values from normalized summary
CURRENT_FAILED=$(jq -r '.counts.failed' "$SUMMARY_FILE")
CURRENT_SKIPPED=$(jq -r '.counts.skipped' "$SUMMARY_FILE")
CURRENT_SUITE_FAILURES=$(jq -r '.gate.suiteFailures' "$SUMMARY_FILE")
CURRENT_TOTAL=$(jq -r '.counts.total' "$SUMMARY_FILE")
CURRENT_PASSED=$(jq -r '.counts.passed' "$SUMMARY_FILE")
CURRENT_PASS_RATE=$(jq -r '.burnDown.passRate' "$SUMMARY_FILE")

# Calculate NonPassingTests (primary burn-down metric)
CURRENT_NON_PASSING=$((CURRENT_FAILED + CURRENT_SKIPPED))
MAX_NON_PASSING=$((MAX_FAILED + MAX_SKIPPED))

echo ""
echo "BASELINE RATCHETS (from $BASELINE_FILE):"
echo "  maxFailedTests:      $MAX_FAILED"
echo "  maxSkippedTests:     $MAX_SKIPPED"
echo "  maxSuiteFailures:    $MAX_SUITE_FAILURES"
echo "  ─────────────────────────────"
echo "  maxNonPassingTests:  $MAX_NON_PASSING (derived)"
echo ""
echo "CURRENT VALUES (from $SUMMARY_FILE):"
echo "  totalTests:          $CURRENT_TOTAL"
echo "  passedTests:         $CURRENT_PASSED"
echo "  failedTests:         $CURRENT_FAILED"
echo "  skippedTests:        $CURRENT_SKIPPED"
echo "  suiteFailures:       $CURRENT_SUITE_FAILURES"
echo "  ─────────────────────────────"
echo "  NonPassingTests:     $CURRENT_NON_PASSING (burn-down metric)"
echo "  passRate:            $CURRENT_PASS_RATE%"
echo ""

FAILED_CHECK=0
IMPROVED_FAILED=0
IMPROVED_SKIPPED=0

# Check failed tests ratchet
if [[ "$CURRENT_FAILED" -gt "$MAX_FAILED" ]]; then
    echo "[FAIL] Failed tests increased: $CURRENT_FAILED > $MAX_FAILED"
    REGRESSION=$((CURRENT_FAILED - MAX_FAILED))
    echo "       Regression: +$REGRESSION new failures"
    FAILED_CHECK=1
else
    IMPROVED_FAILED=$((MAX_FAILED - CURRENT_FAILED))
    if [[ "$IMPROVED_FAILED" -gt 0 ]]; then
        echo "[PASS] Failed tests: $CURRENT_FAILED <= $MAX_FAILED (improved by $IMPROVED_FAILED)"
    else
        echo "[PASS] Failed tests: $CURRENT_FAILED <= $MAX_FAILED"
    fi
fi

# Check skipped tests ratchet
if [[ "$CURRENT_SKIPPED" -gt "$MAX_SKIPPED" ]]; then
    echo "[FAIL] Skipped tests increased: $CURRENT_SKIPPED > $MAX_SKIPPED"
    REGRESSION=$((CURRENT_SKIPPED - MAX_SKIPPED))
    echo "       Regression: +$REGRESSION new skips"
    FAILED_CHECK=1
else
    IMPROVED_SKIPPED=$((MAX_SKIPPED - CURRENT_SKIPPED))
    if [[ "$IMPROVED_SKIPPED" -gt 0 ]]; then
        echo "[PASS] Skipped tests: $CURRENT_SKIPPED <= $MAX_SKIPPED (improved by $IMPROVED_SKIPPED)"
    else
        echo "[PASS] Skipped tests: $CURRENT_SKIPPED <= $MAX_SKIPPED"
    fi
fi

# Check suite failures gate (SEPARATE from burn-down)
echo ""
echo "GATE METRIC (suite failures must trend to zero):"
if [[ "$CURRENT_SUITE_FAILURES" -gt "$MAX_SUITE_FAILURES" ]]; then
    echo "[FAIL] Suite failures increased: $CURRENT_SUITE_FAILURES > $MAX_SUITE_FAILURES"
    echo "       Suite failures hide N tests each - high priority fix"
    FAILED_CHECK=1
else
    if [[ "$CURRENT_SUITE_FAILURES" -eq 0 ]]; then
        echo "[PASS] Suite failures: 0 (gate satisfied)"
    else
        IMPROVED_SUITE=$((MAX_SUITE_FAILURES - CURRENT_SUITE_FAILURES))
        if [[ "$IMPROVED_SUITE" -gt 0 ]]; then
            echo "[PASS] Suite failures: $CURRENT_SUITE_FAILURES <= $MAX_SUITE_FAILURES (improved by $IMPROVED_SUITE)"
        else
            echo "[PASS] Suite failures: $CURRENT_SUITE_FAILURES <= $MAX_SUITE_FAILURES"
        fi
    fi
fi

echo ""
echo "============================================================"

if [[ "$FAILED_CHECK" -eq 1 ]]; then
    echo "RESULT: RATCHET VIOLATION"
    echo ""
    echo "Ratchets can only decrease. To fix:"
    echo "  1. Fix the failing/skipped tests"
    echo "  2. Run: node scripts/analyze-failure-clusters.js"
    echo "     to identify regression clusters"
    echo ""

    # Show what regressed if we have detailed data
    if [[ -f "artifacts/cluster-analysis.json" ]]; then
        echo "Top failing directories:"
        jq -r '.clusters.failing | to_entries | sort_by(-.value) | .[0:5] | .[] | "  \(.value) failures in \(.key)"' artifacts/cluster-analysis.json 2>/dev/null || true
        echo ""
        echo "Top error patterns:"
        jq -r '.clusters.failing | to_entries | sort_by(-.value) | .[0:3] | .[] | "  \(.key)"' artifacts/cluster-analysis.json 2>/dev/null || true
    fi

    exit 1
else
    echo "RESULT: ALL RATCHETS PASS"

    # Calculate total improvement
    TOTAL_BURNED=$((IMPROVED_FAILED + IMPROVED_SKIPPED))
    if [[ "$TOTAL_BURNED" -gt 0 ]]; then
        echo ""
        echo "Defects burned this cycle: $TOTAL_BURNED"
        echo "  - Failed tests fixed: $IMPROVED_FAILED"
        echo "  - Skipped tests fixed: $IMPROVED_SKIPPED"
        echo ""
        echo "Lock in progress by updating baseline:"
        echo "  ./scripts/test-ratchet-check.sh --init"
    fi

    exit 0
fi
