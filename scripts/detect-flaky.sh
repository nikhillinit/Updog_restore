#!/usr/bin/env bash

# Flakiness Detection Script
#
# Usage:
#   ./scripts/detect-flaky.sh <test-target> [runs] [--expect-pass|--expect-fail] [--show-failures] [--keep-logs] [--reporter=<name>] [-- <extra test args>]
#
# Examples:
#   ./scripts/detect-flaky.sh tests/foo.test.ts
#   ./scripts/detect-flaky.sh "tests/**/*.test.ts" 10 --expect-pass
#   ./scripts/detect-flaky.sh tests/foo.test.ts 20 --show-failures -- --sequence=shuffle
#
# Exit codes:
#   0  - Expected behavior observed (PASSING, or DETERMINISTIC FAILURE when --expect-fail)
#   1  - Unexpected / flaky behavior (mixed pass/fail, or any failure when --expect-pass)
#   2  - Usage or script error

set -euo pipefail

usage() {
  cat <<'USAGE'
Flakiness Detection Script

Usage:
  ./scripts/detect-flaky.sh <test-target> [runs] [options] [-- <extra test args>]

Options:
  --expect-pass   Gate mode: require all runs to pass (use after fixing)
  --expect-fail   Prove deterministic failure (use before fixing)
  --show-failures Print failure output inline
  --keep-logs     Always keep log directory
  --reporter=X    Test reporter (default: dot)

Examples:
  # Pre-fix: detect if test is flaky or deterministic
  ./scripts/detect-flaky.sh tests/unit/foo.test.ts

  # Post-fix gate: require 10 consecutive passes
  ./scripts/detect-flaky.sh tests/unit/foo.test.ts 10 --expect-pass

  # Debug: show failures and keep logs
  ./scripts/detect-flaky.sh tests/unit/foo.test.ts 5 --show-failures --keep-logs

Exit codes:
  0: expected outcome observed
  1: flaky / unexpected outcome
  2: usage or script error
USAGE
}

if [[ $# -lt 1 ]]; then
  usage
  exit 2
fi

TEST_TARGET="$1"
shift

# Optional numeric RUNS (default 5)
RUNS="5"
if [[ $# -ge 1 && "$1" =~ ^[0-9]+$ ]]; then
  RUNS="$1"
  shift
fi

if [[ "$RUNS" -lt 1 ]]; then
  echo "[detect-flaky] ERROR: runs must be >= 1 (got: $RUNS)" >&2
  exit 2
fi

EXPECT_MODE="auto"          # auto | pass | fail
SHOW_FAILURES="0"           # 0 | 1
KEEP_LOGS="0"               # 0 | 1
REPORTER="dot"              # vitest supports: default, verbose, dot, json, junit...
EXTRA_ARGS=()

# Parse flags until --
while [[ $# -gt 0 ]]; do
  case "$1" in
    --expect-pass|--gate)
      EXPECT_MODE="pass"
      shift
      ;;
    --expect-fail)
      EXPECT_MODE="fail"
      shift
      ;;
    --show-failures)
      SHOW_FAILURES="1"
      shift
      ;;
    --keep-logs)
      KEEP_LOGS="1"
      shift
      ;;
    --reporter=*)
      REPORTER="${1#*=}"
      shift
      ;;
    --)
      shift
      EXTRA_ARGS+=("$@")
      break
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      EXTRA_ARGS+=("$1")
      shift
      ;;
  esac
done

# Temp dir for run logs
TMP_DIR="$(mktemp -d -t detect-flaky.XXXXXX)"
VERDICT="UNKNOWN"

cleanup() {
  # Keep logs when requested or when verdict is not clean passing
  if [[ "$KEEP_LOGS" == "1" ]]; then
    echo "[detect-flaky] Logs kept at: $TMP_DIR"
    return 0
  fi

  case "$VERDICT" in
    PASSING)
      rm -rf "$TMP_DIR" || true
      ;;
    *)
      echo "[detect-flaky] Logs kept at: $TMP_DIR"
      ;;
  esac
}
trap cleanup EXIT

# NOTE: Using explicit assignment instead of ((var++)) to avoid set -e issues
# Bash arithmetic expressions return exit code 1 when result is 0, which
# combined with set -e would terminate the script on first increment.
PASS_COUNT=0
FAIL_COUNT=0

echo "=============================================="
echo "Flakiness Detection"
echo "  Target  : $TEST_TARGET"
echo "  Runs    : $RUNS"
echo "  Expect  : $EXPECT_MODE"
echo "  Reporter: $REPORTER"
if [[ ${#EXTRA_ARGS[@]} -gt 0 ]]; then
  echo "  Extra   : ${EXTRA_ARGS[*]}"
fi
echo "=============================================="

# Use a stable baseline environment by default.
# (You can override by explicitly setting env vars when invoking the script.)
: "${TZ:=UTC}"
: "${CI:=1}"
export TZ CI

for i in $(seq 1 "$RUNS"); do
  LOG_FILE="$TMP_DIR/run-$i.log"
  echo -n "Run $i/$RUNS: "

  # Run the test command; capture output for later inspection.
  # NOTE: We use explicit assignment to avoid ((var++)) which fails with set -e
  if npm test -- "$TEST_TARGET" --reporter="$REPORTER" "${EXTRA_ARGS[@]}" >"$LOG_FILE" 2>&1; then
    PASS_COUNT=$((PASS_COUNT + 1))
    echo "PASS"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo "FAIL"

    if [[ "$SHOW_FAILURES" == "1" ]]; then
      echo "---- Failure output (run $i) ----"
      tail -n 60 "$LOG_FILE" || true
      echo "---------------------------------"
    fi
  fi
done

echo ""
echo "=============================================="
echo "RESULTS"
echo "=============================================="
echo "Passes  : $PASS_COUNT"
echo "Failures: $FAIL_COUNT"
echo ""

# Decision logic based on expect mode
if [[ "$EXPECT_MODE" == "pass" ]]; then
  # Gate mode: all runs must pass
  if [[ "$FAIL_COUNT" -eq 0 ]]; then
    VERDICT="PASSING"
    echo "VERDICT: PASSING (stable across $RUNS runs)"
    exit 0
  fi

  if [[ "$PASS_COUNT" -gt 0 ]]; then
    VERDICT="FLAKY"
    echo "VERDICT: FLAKY (some passes, some fails)"
  else
    VERDICT="DETERMINISTIC FAILURE"
    echo "VERDICT: DETERMINISTIC FAILURE (failed every run)"
  fi

  echo ""
  echo "Gate FAILED: Expected PASS across all runs, but failures occurred."
  echo ""
  echo "Investigate (in order of likelihood):"
  echo "  1. Shared state / order dependence (Pattern E)"
  echo "     - Run with --isolate or shuffled order"
  echo "     - Check for module-level singletons, global mutations"
  echo "  2. Async race / missing await (Pattern A)"
  echo "     - Search for floating promises in setup/teardown"
  echo "     - Enable @typescript-eslint/no-floating-promises"
  echo "  3. Timer/time dependency (Pattern F)"
  echo "     - Check for Date.now, setTimeout without fake timers"
  echo "     - Verify TZ=UTC is set"
  exit 1
fi

if [[ "$EXPECT_MODE" == "fail" ]]; then
  # Prove deterministic failure mode
  if [[ "$FAIL_COUNT" -eq "$RUNS" ]]; then
    VERDICT="DETERMINISTIC FAILURE"
    echo "VERDICT: DETERMINISTIC FAILURE (failed every run)"
    echo ""
    echo "Failure is reproducible. Proceed with standard triage."
    exit 0
  fi

  if [[ "$PASS_COUNT" -eq "$RUNS" ]]; then
    VERDICT="PASSING"
    echo "VERDICT: PASSING (did not reproduce failure)"
    echo ""
    echo "Cannot reproduce. Check environment differences vs CI."
    exit 1
  fi

  VERDICT="FLAKY"
  echo "VERDICT: FLAKY (mixed pass/fail; failure is not deterministic)"
  echo ""
  echo "Failure is intermittent. Investigate flakiness patterns first."
  exit 1
fi

# Auto mode (default) - detect intermittent failures
if [[ "$PASS_COUNT" -gt 0 && "$FAIL_COUNT" -gt 0 ]]; then
  VERDICT="FLAKY"
  echo "VERDICT: FLAKY"
  echo ""
  echo "This target shows intermittent behavior."
  echo ""
  echo "Prioritize investigation of:"
  echo "  1. Shared state / order dependence (Pattern E)"
  echo "     - passes alone, fails in suite"
  echo "     - module-level singletons, global mutations"
  echo "     - fake timers enabled but not restored"
  echo "  2. Async race / missing await (Pattern A)"
  echo "     - floating promises in beforeEach/afterEach"
  echo "     - unresolved promises from previous test"
  echo "  3. Timer/time dependency (Pattern F)"
  echo "     - Date.now, setTimeout, setInterval"
  echo "     - TZ/locale sensitivity"
  echo ""
  echo "Quick diagnostics:"
  echo "  npm test -- \"$TEST_TARGET\" --reporter=verbose"
  echo "  npm test -- \"$TEST_TARGET\" --isolate"
  echo "  npm test -- \"$TEST_TARGET\" --sequence=shuffle"
  exit 1
fi

if [[ "$FAIL_COUNT" -eq "$RUNS" ]]; then
  VERDICT="DETERMINISTIC FAILURE"
  echo "VERDICT: DETERMINISTIC FAILURE"
  echo ""
  echo "This failure reproduces consistently."
  echo "Proceed with standard pattern triage (A/B/C/D)."
  echo ""
  echo "Run with verbose output for context:"
  echo "  npm test -- \"$TEST_TARGET\" --reporter=verbose"
  exit 0
fi

VERDICT="PASSING"
echo "VERDICT: PASSING"
echo ""
echo "This target passes consistently."
echo "If it's failing in CI, investigate environment differences:"
echo "  - TZ/locale settings"
echo "  - CPU/memory constraints"
echo "  - Test ordering / parallelism"
exit 0
