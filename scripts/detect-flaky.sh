#!/usr/bin/env bash

# Flakiness Detection Script (v4)
#
# Usage:
#   ./scripts/detect-flaky.sh <test-target> [runs] [options] [-- <extra test args>]
#
# Options:
#   --expect-pass | --gate     Require all runs to pass (use after fixing)
#   --expect-fail              Require all runs to fail (prove reproducibility)
#   --fail-fast                Stop early when expectation violated (mode-aware)
#   --report-only              Always exit 0; print classification only
#   --show-failures            Tail failing output inline
#   --keep-logs                Keep per-run logs even on PASSING
#   --reporter=<name>          Test reporter (default: dot)
#   --no-color                 Disable ANSI colors
#   --                         Pass remaining args to `npm test -- ...`
#
# Exit codes:
#   0: Expected outcome observed (or --report-only)
#   1: Unexpected / flaky / failing outcome
#   2: Usage / script error
#   130: Interrupted (SIGINT)
#   143: Terminated (SIGTERM)
#
# Fail-fast semantics per mode:
#   --expect-pass --fail-fast  → stop on first FAILURE (gate violated)
#   --expect-fail --fail-fast  → stop on first PASS (reproducibility violated)
#   auto --fail-fast           → stop when flakiness PROVEN (≥1 pass AND ≥1 fail)

set -euo pipefail

usage() {
  cat <<'USAGE'
Flakiness Detection Script (v4)

Usage:
  ./scripts/detect-flaky.sh <test-target> [runs] [options] [-- <extra test args>]

Options:
  --expect-pass | --gate     Require all runs to pass (use after fixing)
  --expect-fail              Require all runs to fail (prove reproducibility)
  --fail-fast                Stop early when expectation violated (mode-aware)
  --report-only              Always exit 0; print classification only
  --show-failures            Tail failing output inline
  --keep-logs                Keep per-run logs even on PASSING
  --reporter=<name>          Test reporter (default: dot)
  --no-color                 Disable ANSI colors

Examples:
  # Pre-fix: detect if test is flaky or deterministic
  ./scripts/detect-flaky.sh tests/unit/foo.test.ts

  # Post-fix gate: require 10 consecutive passes, abort on first fail
  ./scripts/detect-flaky.sh tests/unit/foo.test.ts 10 --expect-pass --fail-fast

  # Classification only (always exits 0, for scripting)
  ./scripts/detect-flaky.sh tests/unit/foo.test.ts 10 --report-only

  # Debug: show failures and keep logs
  ./scripts/detect-flaky.sh tests/unit/foo.test.ts 5 --show-failures --keep-logs

Fail-fast semantics:
  --expect-pass --fail-fast  Stop on first FAILURE (gate violated)
  --expect-fail --fail-fast  Stop on first PASS (reproducibility violated)
  auto --fail-fast           Stop when flakiness PROVEN (seen pass AND fail)

Exit codes:
  0: expected outcome (or --report-only)
  1: flaky / unexpected outcome
  2: usage or script error
  130: interrupted (Ctrl+C)
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
FAIL_FAST="0"               # 0 | 1
REPORT_ONLY="0"             # 0 | 1 (always exit 0)
REPORTER="dot"              # vitest supports: default, verbose, dot, json, junit...
NO_COLOR_FLAG="0"           # 0 | 1
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
    --fail-fast)
      FAIL_FAST="1"
      shift
      ;;
    --report-only|--no-exit-nonzero)
      REPORT_ONLY="1"
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
    --no-color)
      NO_COLOR_FLAG="1"
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

# ANSI color codes
# Disabled if: not a TTY, NO_COLOR env is set, or --no-color flag
if [[ -t 1 && "${NO_COLOR:-}" != "1" && "$NO_COLOR_FLAG" != "1" ]]; then
  C_RED=$'\033[31m'
  C_GRN=$'\033[32m'
  C_YLW=$'\033[33m'
  C_BLU=$'\033[34m'
  C_DIM=$'\033[2m'
  C_BLD=$'\033[1m'
  C_RST=$'\033[0m'
else
  C_RED=""
  C_GRN=""
  C_YLW=""
  C_BLU=""
  C_DIM=""
  C_BLD=""
  C_RST=""
fi

# Temp dir for run logs
TMP_DIR="$(mktemp -d -t detect-flaky.XXXXXX)"
VERDICT="UNKNOWN"

cleanup() {
  # Keep logs when requested or when verdict is not clean passing
  if [[ "$KEEP_LOGS" == "1" ]]; then
    echo "${C_BLU}[detect-flaky] Logs kept at: $TMP_DIR${C_RST}"
    return 0
  fi

  case "$VERDICT" in
    PASSING)
      rm -rf "$TMP_DIR" || true
      ;;
    *)
      echo "${C_BLU}[detect-flaky] Logs kept at: $TMP_DIR${C_RST}"
      ;;
  esac
}

on_interrupt() {
  VERDICT="INTERRUPTED"
  echo ""
  echo "${C_YLW}[detect-flaky] Interrupted${C_RST}"
  exit 130
}

on_terminate() {
  VERDICT="TERMINATED"
  echo ""
  echo "${C_YLW}[detect-flaky] Terminated${C_RST}"
  exit 143
}

# Trap EXIT for cleanup, INT/TERM for proper signal exit codes
trap cleanup EXIT
trap on_interrupt INT
trap on_terminate TERM

# Counters
# NOTE: Using ((var+=1)) is safe with set -e (compound assignment returns new value)
# The unsafe pattern is ((var++)) which returns old value (0 when var=0 -> exit 1)
PASS_COUNT=0
FAIL_COUNT=0
RAN=0

echo "${C_BLD}==============================================${C_RST}"
echo "${C_BLD}Flakiness Detection (v4)${C_RST}"
echo "  Target    : ${C_BLU}$TEST_TARGET${C_RST}"
echo "  Runs      : $RUNS"
echo "  Expect    : $EXPECT_MODE"
echo "  Fail-fast : $FAIL_FAST"
echo "  Report-only: $REPORT_ONLY"
echo "  Reporter  : $REPORTER"
if [[ ${#EXTRA_ARGS[@]} -gt 0 ]]; then
  echo "  Extra     : ${EXTRA_ARGS[*]}"
fi
echo "${C_BLD}==============================================${C_RST}"

# Use a stable baseline environment by default.
# (You can override by explicitly setting env vars when invoking the script.)
: "${TZ:=UTC}"
: "${CI:=1}"
export TZ CI

# Main test loop - C-style for portability (no external 'seq' dependency)
for ((i=1; i<=RUNS; i++)); do
  RAN=$i
  LOG_FILE="$TMP_DIR/run-$i.log"
  echo -n "Run $i/$RUNS: "

  # Run the test command; capture output for later inspection.
  if npm test -- "$TEST_TARGET" --reporter="$REPORTER" "${EXTRA_ARGS[@]}" >"$LOG_FILE" 2>&1; then
    ((PASS_COUNT+=1))
    echo "${C_GRN}PASS${C_RST}"
  else
    ((FAIL_COUNT+=1))
    echo "${C_RED}FAIL${C_RST}"

    if [[ "$SHOW_FAILURES" == "1" ]]; then
      echo "${C_DIM}---- Failure output (run $i) ----${C_RST}"
      tail -n 80 "$LOG_FILE" || true
      echo "${C_DIM}---------------------------------${C_RST}"
    fi
  fi

  # Fail-fast logic (mode-aware)
  if [[ "$FAIL_FAST" == "1" ]]; then
    # --expect-pass: stop on first failure (gate violated)
    if [[ "$EXPECT_MODE" == "pass" && "$FAIL_COUNT" -gt 0 ]]; then
      echo "${C_YLW}[detect-flaky] --fail-fast: Gate violated (failure detected)${C_RST}"
      break
    fi

    # --expect-fail: stop on first pass (reproducibility violated)
    if [[ "$EXPECT_MODE" == "fail" && "$PASS_COUNT" -gt 0 ]]; then
      echo "${C_YLW}[detect-flaky] --fail-fast: Reproducibility violated (pass detected)${C_RST}"
      break
    fi

    # auto mode: only stop when flakiness is PROVEN (seen both pass AND fail)
    # This preserves ability to distinguish FLAKY from DETERMINISTIC
    if [[ "$EXPECT_MODE" == "auto" && "$PASS_COUNT" -gt 0 && "$FAIL_COUNT" -gt 0 ]]; then
      echo "${C_YLW}[detect-flaky] --fail-fast: Flakiness proven (seen pass AND fail)${C_RST}"
      break
    fi
  fi
done

echo ""
echo "${C_BLD}==============================================${C_RST}"
echo "${C_BLD}RESULTS${C_RST}"
echo "${C_BLD}==============================================${C_RST}"
echo "Ran      : $RAN / $RUNS"
echo "Passes   : ${C_GRN}$PASS_COUNT${C_RST}"
echo "Failures : ${C_RED}$FAIL_COUNT${C_RST}"
echo ""

# Helper function to exit with proper code (respects --report-only)
exit_with_code() {
  local code="$1"
  if [[ "$REPORT_ONLY" == "1" ]]; then
    exit 0
  fi
  exit "$code"
}

# Decision logic based on expect mode

if [[ "$EXPECT_MODE" == "pass" ]]; then
  # Gate mode: all runs must pass
  if [[ "$FAIL_COUNT" -eq 0 ]]; then
    VERDICT="PASSING"
    echo "VERDICT: ${C_GRN}${C_BLD}PASSING${C_RST} (stable across $RAN runs)"
    exit_with_code 0
  fi

  VERDICT="FAILED GATE"
  if [[ "$PASS_COUNT" -gt 0 ]]; then
    echo "VERDICT: ${C_YLW}${C_BLD}FAILED GATE (FLAKY)${C_RST} (some passes, some fails)"
  else
    echo "VERDICT: ${C_RED}${C_BLD}FAILED GATE (DETERMINISTIC)${C_RST} (failed every run)"
  fi

  echo ""
  echo "${C_RED}Gate FAILED: Expected PASS across all runs, but failures occurred.${C_RST}"
  echo ""
  echo "Tip: rerun without --fail-fast if you need detailed flaky vs deterministic classification."
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
  exit_with_code 1
fi

if [[ "$EXPECT_MODE" == "fail" ]]; then
  # Prove deterministic failure mode
  if [[ "$FAIL_COUNT" -eq "$RAN" && "$RAN" -eq "$RUNS" ]]; then
    VERDICT="DETERMINISTIC FAILURE"
    echo "VERDICT: ${C_GRN}${C_BLD}DETERMINISTIC FAILURE${C_RST} (reproduced every run)"
    echo ""
    echo "Failure is reproducible. Proceed with standard pattern triage (A-F)."
    exit_with_code 0
  fi

  VERDICT="NOT DETERMINISTIC"
  if [[ "$PASS_COUNT" -eq "$RAN" ]]; then
    echo "VERDICT: ${C_YLW}${C_BLD}NOT DETERMINISTIC (all passed)${C_RST}"
    echo ""
    echo "Cannot reproduce. Check environment differences vs CI."
  else
    echo "VERDICT: ${C_YLW}${C_BLD}NOT DETERMINISTIC (flaky)${C_RST}"
    echo ""
    echo "Failure is intermittent. Investigate flakiness patterns first."
  fi
  exit_with_code 1
fi

# Auto mode (default) - detect and classify test behavior
# CRITICAL: In auto mode, any failure (flaky OR deterministic) must exit 1
# This prevents broken tests from silently passing CI pipelines.
# Use --expect-fail to prove deterministic failure (exit 0).
# Use --report-only if you just want classification without exit codes.

if [[ "$PASS_COUNT" -gt 0 && "$FAIL_COUNT" -gt 0 ]]; then
  VERDICT="FLAKY"
  echo "VERDICT: ${C_YLW}${C_BLD}FLAKY${C_RST}"
  echo ""
  echo "This target shows intermittent behavior."
  echo ""
  echo "Investigate in this order: ${C_BLD}Pattern E${C_RST} (shared state) -> ${C_BLD}A${C_RST} (async) -> ${C_BLD}F${C_RST} (timers)"
  echo ""
  echo "Quick diagnostics:"
  echo "  npm test -- \"$TEST_TARGET\" --reporter=verbose"
  echo "  npm test -- \"$TEST_TARGET\" --isolate"
  echo "  npm test -- \"$TEST_TARGET\" --sequence=shuffle"
  exit_with_code 1
fi

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  VERDICT="DETERMINISTIC FAILURE"
  echo "VERDICT: ${C_RED}${C_BLD}DETERMINISTIC FAILURE${C_RST}"
  echo ""
  echo "This failure reproduces consistently."
  echo "Proceed with standard pattern triage (A/B/C/D/E/F)."
  echo ""
  echo "Run with verbose output for context:"
  echo "  npm test -- \"$TEST_TARGET\" --reporter=verbose"
  echo ""
  echo "To prove reproducibility for documentation:"
  echo "  ./scripts/detect-flaky.sh \"$TEST_TARGET\" $RUNS --expect-fail"
  exit_with_code 1
fi

VERDICT="PASSING"
echo "VERDICT: ${C_GRN}${C_BLD}PASSING${C_RST}"
echo ""
echo "This target passes consistently."
echo "If it's failing in CI, investigate environment differences:"
echo "  - TZ/locale settings"
echo "  - CPU/memory constraints"
echo "  - Test ordering / parallelism"
exit_with_code 0
