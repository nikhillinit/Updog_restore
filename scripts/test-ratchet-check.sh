#!/bin/bash
#
# scripts/test-ratchet-check.sh (v7.2)
#
# Focused test ratchet enforcement using NORMALIZED test-summary.json.
# Separates burn-down metric (NonPassingTests) from gate metric (SuiteFailures).
#
# v7.2 changes:
# - Split --init (first time only) vs --update (downward only)
# - --init refuses if baseline exists (use --force-init to override)
# - --update only allows decreasing thresholds
# - Enhanced delta report on failure
#
# Usage:
#   ./scripts/test-ratchet-check.sh              # Check against baseline
#   ./scripts/test-ratchet-check.sh --init       # Initialize baseline (first time only)
#   ./scripts/test-ratchet-check.sh --force-init # Force overwrite baseline (dangerous)
#   ./scripts/test-ratchet-check.sh --update     # Lock in improvements (downward only)
#
# Exit codes:
#   0 - All ratchets pass (or init/update succeeded)
#   1 - Ratchet violation (regression detected)
#   2 - Setup error (missing files, etc.)
#   3 - Governance error (tried to ratchet upward)

set -e

BASELINE_FILE=".test-baseline.json"
SUMMARY_FILE="artifacts/test-summary.json"
STDERR_FILE="artifacts/test-run.stderr.txt"
RESULTS_FILE="artifacts/test-results.json"
CLUSTER_FILE="artifacts/cluster-analysis.json"
MIN_FILE_SIZE=100

echo "============================================================"
echo "TEST RATCHET CHECK (v7.2)"
echo "============================================================"

# Helper: Check summary file exists and is valid
check_summary_exists() {
    if [[ ! -f "$SUMMARY_FILE" ]]; then
        echo "ERROR: Summary file not found: $SUMMARY_FILE"
        echo ""
        echo "Run the full pipeline first:"
        echo "  npm run baseline:test:check"
        echo ""
        echo "Or manually:"
        echo "  npm run baseline:test:run"
        echo "  npm run baseline:test:analyze"
        exit 2
    fi

    local size
    size=$(stat -c%s "$SUMMARY_FILE" 2>/dev/null || stat -f%z "$SUMMARY_FILE" 2>/dev/null || echo 0)
    if [[ "$size" -lt "$MIN_FILE_SIZE" ]]; then
        echo "ERROR: Summary file too small ($size bytes)"
        echo "This usually means test run failed before producing output."
        if [[ -f "$STDERR_FILE" ]]; then
            echo ""
            echo "Last 20 lines from $STDERR_FILE:"
            tail -20 "$STDERR_FILE" || true
        fi
        exit 2
    fi
}

# Helper: Create baseline JSON from summary
create_baseline_json() {
    local failed skipped suite_failures timestamp
    failed=$(jq -r '.counts.failed' "$SUMMARY_FILE")
    skipped=$(jq -r '.counts.skipped' "$SUMMARY_FILE")
    suite_failures=$(jq -r '.gate.suiteFailures' "$SUMMARY_FILE")
    timestamp=$(jq -r '.meta.timestamp' "$SUMMARY_FILE")

    jq -n \
        --arg timestamp "$timestamp" \
        --argjson maxFailedTests "$failed" \
        --argjson maxSkippedTests "$skipped" \
        --argjson maxSuiteFailures "$suite_failures" \
        '{
            version: "7.2",
            created: $timestamp,
            maxFailedTests: $maxFailedTests,
            maxSkippedTests: $maxSkippedTests,
            maxSuiteFailures: $maxSuiteFailures,
            note: "Ratchets can only decrease. Use --update to lock in improvements."
        }'
}

# Handle --init flag (first time only)
if [[ "${1:-}" == "--init" ]]; then
    check_summary_exists

    # GOVERNANCE: Refuse if baseline already exists
    if [[ -f "$BASELINE_FILE" ]]; then
        echo "ERROR: Baseline already exists at $BASELINE_FILE"
        echo ""
        echo "To lock in improvements, use:"
        echo "  ./scripts/test-ratchet-check.sh --update"
        echo ""
        echo "To force overwrite (DANGEROUS - can ratchet upward), use:"
        echo "  ./scripts/test-ratchet-check.sh --force-init"
        exit 3
    fi

    create_baseline_json > "$BASELINE_FILE"

    echo "Created $BASELINE_FILE:"
    cat "$BASELINE_FILE"
    echo ""
    echo "Commit this file to lock in the ratchet."
    exit 0
fi

# Handle --force-init flag (dangerous override)
if [[ "${1:-}" == "--force-init" ]]; then
    check_summary_exists

    echo "WARNING: Force-initializing baseline. This can normalize regressions!"
    echo ""

    if [[ -f "$BASELINE_FILE" ]]; then
        echo "Previous baseline:"
        cat "$BASELINE_FILE"
        echo ""
    fi

    create_baseline_json > "$BASELINE_FILE"

    echo "New baseline:"
    cat "$BASELINE_FILE"
    echo ""
    echo "CAUTION: Review carefully before committing."
    exit 0
fi

# Handle --update flag (downward only)
if [[ "${1:-}" == "--update" ]]; then
    check_summary_exists

    if [[ ! -f "$BASELINE_FILE" ]]; then
        echo "ERROR: No baseline to update. Use --init first."
        exit 2
    fi

    # Read current baseline
    OLD_FAILED=$(jq -r '.maxFailedTests' "$BASELINE_FILE")
    OLD_SKIPPED=$(jq -r '.maxSkippedTests' "$BASELINE_FILE")
    OLD_SUITE=$(jq -r '.maxSuiteFailures' "$BASELINE_FILE")

    # Read new values
    NEW_FAILED=$(jq -r '.counts.failed' "$SUMMARY_FILE")
    NEW_SKIPPED=$(jq -r '.counts.skipped' "$SUMMARY_FILE")
    NEW_SUITE=$(jq -r '.gate.suiteFailures' "$SUMMARY_FILE")

    # GOVERNANCE: Refuse any upward movement
    UPWARD=0
    if [[ "$NEW_FAILED" -gt "$OLD_FAILED" ]]; then
        echo "ERROR: Cannot update - failed tests increased ($NEW_FAILED > $OLD_FAILED)"
        UPWARD=1
    fi
    if [[ "$NEW_SKIPPED" -gt "$OLD_SKIPPED" ]]; then
        echo "ERROR: Cannot update - skipped tests increased ($NEW_SKIPPED > $OLD_SKIPPED)"
        UPWARD=1
    fi
    if [[ "$NEW_SUITE" -gt "$OLD_SUITE" ]]; then
        echo "ERROR: Cannot update - suite failures increased ($NEW_SUITE > $OLD_SUITE)"
        UPWARD=1
    fi

    if [[ "$UPWARD" -eq 1 ]]; then
        echo ""
        echo "Ratchets can only decrease. Fix the regressions first."
        exit 3
    fi

    # Check if anything improved
    IMPROVED=0
    if [[ "$NEW_FAILED" -lt "$OLD_FAILED" ]]; then IMPROVED=1; fi
    if [[ "$NEW_SKIPPED" -lt "$OLD_SKIPPED" ]]; then IMPROVED=1; fi
    if [[ "$NEW_SUITE" -lt "$OLD_SUITE" ]]; then IMPROVED=1; fi

    if [[ "$IMPROVED" -eq 0 ]]; then
        echo "No improvements to lock in. Baseline unchanged."
        exit 0
    fi

    # Show delta
    echo "BASELINE UPDATE (locking in improvements):"
    echo ""
    echo "  maxFailedTests:    $OLD_FAILED -> $NEW_FAILED (delta: -$((OLD_FAILED - NEW_FAILED)))"
    echo "  maxSkippedTests:   $OLD_SKIPPED -> $NEW_SKIPPED (delta: -$((OLD_SKIPPED - NEW_SKIPPED)))"
    echo "  maxSuiteFailures:  $OLD_SUITE -> $NEW_SUITE (delta: -$((OLD_SUITE - NEW_SUITE)))"
    echo ""

    create_baseline_json > "$BASELINE_FILE"

    echo "Updated $BASELINE_FILE"
    echo "Commit this file to lock in the improvements."
    exit 0
fi

# Default: Check mode
check_summary_exists

# Guard: Check baseline file exists
if [[ ! -f "$BASELINE_FILE" ]]; then
    echo "ERROR: Baseline file not found: $BASELINE_FILE"
    echo ""
    echo "Initialize baseline with:"
    echo "  npm run baseline:test:init"
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
REGRESSION_FAILED=0
REGRESSION_SKIPPED=0
REGRESSION_SUITE=0

# Check failed tests ratchet
if [[ "$CURRENT_FAILED" -gt "$MAX_FAILED" ]]; then
    echo "[FAIL] Failed tests increased: $CURRENT_FAILED > $MAX_FAILED"
    REGRESSION_FAILED=$((CURRENT_FAILED - MAX_FAILED))
    echo "       Regression: +$REGRESSION_FAILED new failures"
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
    REGRESSION_SKIPPED=$((CURRENT_SKIPPED - MAX_SKIPPED))
    echo "       Regression: +$REGRESSION_SKIPPED new skips"
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
    REGRESSION_SUITE=$((CURRENT_SUITE_FAILURES - MAX_SUITE_FAILURES))
    echo "       Regression: +$REGRESSION_SUITE new suite failures"
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

    # DELTA REPORT: Show exactly what regressed
    echo "DELTA REPORT:"
    echo "  Baseline vs Current:"
    echo "  ─────────────────────────────────────────────────"
    printf "  %-20s %10s %10s %10s\n" "Metric" "Baseline" "Current" "Delta"
    echo "  ─────────────────────────────────────────────────"
    printf "  %-20s %10d %10d %+10d\n" "Failed Tests" "$MAX_FAILED" "$CURRENT_FAILED" "$((CURRENT_FAILED - MAX_FAILED))"
    printf "  %-20s %10d %10d %+10d\n" "Skipped Tests" "$MAX_SKIPPED" "$CURRENT_SKIPPED" "$((CURRENT_SKIPPED - MAX_SKIPPED))"
    printf "  %-20s %10d %10d %+10d\n" "Suite Failures" "$MAX_SUITE_FAILURES" "$CURRENT_SUITE_FAILURES" "$((CURRENT_SUITE_FAILURES - MAX_SUITE_FAILURES))"
    echo "  ─────────────────────────────────────────────────"
    printf "  %-20s %10d %10d %+10d\n" "NonPassingTests" "$MAX_NON_PASSING" "$CURRENT_NON_PASSING" "$((CURRENT_NON_PASSING - MAX_NON_PASSING))"
    echo ""

    # Show cluster analysis if available
    if [[ -f "$CLUSTER_FILE" ]]; then
        echo "TOP FAILING DIRECTORIES (from cluster analysis):"
        jq -r '.clusters.failing | to_entries | sort_by(-.value) | .[0:5] | .[] | "  \(.value) failures in \(.key)"' "$CLUSTER_FILE" 2>/dev/null || true
        echo ""

        echo "TOP ERROR PATTERNS:"
        # Note: using cascades for pattern info
        ALIAS=$(jq -r '.cascades.alias.count // 0' "$CLUSTER_FILE")
        REDIS=$(jq -r '.cascades.redis.count // 0' "$CLUSTER_FILE")
        TIMEOUT=$(jq -r '.cascades.timeout.count // 0' "$CLUSTER_FILE")
        if [[ "$ALIAS" -gt 0 ]]; then echo "  Alias resolution errors: $ALIAS"; fi
        if [[ "$REDIS" -gt 0 ]]; then echo "  Redis/connection errors: $REDIS"; fi
        if [[ "$TIMEOUT" -gt 0 ]]; then echo "  Timeout errors: $TIMEOUT"; fi
        echo ""
    fi

    # Point to stderr if it might help
    if [[ -f "$STDERR_FILE" ]]; then
        echo "For test runner errors, check: $STDERR_FILE"
    fi

    echo ""
    echo "To fix: address the regressions, then re-run:"
    echo "  npm run baseline:test:check"

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
        echo "  npm run baseline:test:update"
    fi

    exit 0
fi
