#!/bin/bash
# Flakiness Detection Script
# Usage: ./scripts/detect-flaky.sh <test-file> [runs]
#
# Runs a test multiple times to detect intermittent failures.
# FLAKY tests should be investigated for Pattern A (async race) first.

set -e

TEST_FILE="${1:?Usage: $0 <test-file> [runs]}"
RUNS="${2:-5}"

PASS_COUNT=0
FAIL_COUNT=0

echo "=============================================="
echo "Flakiness Detection for: $TEST_FILE"
echo "Number of runs: $RUNS"
echo "=============================================="
echo ""

for i in $(seq 1 "$RUNS"); do
  echo -n "Run $i/$RUNS: "

  if npm test -- "$TEST_FILE" --reporter=dot 2>/dev/null; then
    ((PASS_COUNT++))
    echo "PASS"
  else
    ((FAIL_COUNT++))
    echo "FAIL"
  fi
done

echo ""
echo "=============================================="
echo "RESULTS"
echo "=============================================="
echo "Passes: $PASS_COUNT"
echo "Failures: $FAIL_COUNT"
echo ""

if [ "$PASS_COUNT" -gt 0 ] && [ "$FAIL_COUNT" -gt 0 ]; then
  echo "VERDICT: FLAKY"
  echo ""
  echo "Recommendation:"
  echo "  This test shows intermittent behavior."
  echo "  Investigate Pattern A (async race) FIRST:"
  echo "  - Check for missing 'await' in setup/teardown"
  echo "  - Check for shared state between tests"
  echo "  - Check for timing-dependent assertions"
  echo "  - Consider adding test isolation"
  echo ""
  echo "Diagnostic commands:"
  echo "  grep -n 'beforeEach\\|afterEach' $TEST_FILE | head -10"
  echo "  npm test -- $TEST_FILE --isolate"
  exit 1

elif [ "$FAIL_COUNT" -eq "$RUNS" ]; then
  echo "VERDICT: DETERMINISTIC FAILURE"
  echo ""
  echo "Recommendation:"
  echo "  This test fails consistently."
  echo "  Proceed with standard triage flowchart:"
  echo "  1. Read error message carefully"
  echo "  2. Match to Pattern A/B/C/D"
  echo "  3. Apply pattern-specific diagnostic"
  echo "  4. Fix with single variable change"
  echo ""
  echo "Run with verbose output:"
  echo "  npm test -- $TEST_FILE --reporter=verbose"
  exit 0

elif [ "$PASS_COUNT" -eq "$RUNS" ]; then
  echo "VERDICT: PASSING"
  echo ""
  echo "This test passes consistently."
  echo "It may have been fixed or the failure is environment-specific."
  exit 0

else
  echo "VERDICT: UNKNOWN"
  echo "Unexpected result combination."
  exit 2
fi
