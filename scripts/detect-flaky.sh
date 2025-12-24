#!/usr/bin/env bash

# Flakiness Detection Script (v5.1)
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
#   --timeout=<seconds>        Timeout per test run (default: 300 = 5 min)
#   --test-cmd=<command>       Test command prefix (default: "npm test --")
#   --json                     Output JSON summary (for CI integration)
#   --no-color                 Disable ANSI colors
#   --version                  Print version and exit
#   --                         Pass remaining args to test command
#
# Exit codes:
#   0: Expected outcome observed (or --report-only)
#   1: Unexpected / flaky / failing / timeout outcome
#   2: Usage / script error
#   130: Interrupted (SIGINT)
#   143: Terminated (SIGTERM)
#
# NOTE: Timeouts are treated as failures (exit 1), not exit 124.
# The timeout count is included in JSON output for debugging.
#
# Fail-fast semantics per mode:
#   --expect-pass --fail-fast  → stop on first FAILURE (gate violated)
#   --expect-fail --fail-fast  → stop on first PASS (reproducibility violated)
#   auto --fail-fast           → stop when flakiness PROVEN (≥1 pass AND ≥1 fail)

set -euo pipefail

VERSION="5.1.0"
MIN_RECOMMENDED_RUNS=5

usage() {
  cat <<'USAGE'
Flakiness Detection Script (v5.1)

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
  --timeout=<seconds>        Timeout per test run (default: 300 = 5 min)
  --test-cmd=<command>       Test command prefix (default: "npm test --")
                             NOTE: Use quotes for multi-word commands:
                             --test-cmd="yarn test --"
  --json                     Output JSON summary (for CI integration)
                             NOTE: stdout will contain ONLY valid JSON
  --no-color                 Disable ANSI colors
  --version                  Print version and exit

Examples:
  # Pre-fix: detect if test is flaky or deterministic
  ./scripts/detect-flaky.sh tests/unit/foo.test.ts

  # Post-fix gate: require 10 consecutive passes, abort on first fail
  ./scripts/detect-flaky.sh tests/unit/foo.test.ts 10 --expect-pass --fail-fast

  # With timeout (2 minutes per run) and custom test command
  ./scripts/detect-flaky.sh tests/foo.test.ts 5 --timeout=120 --test-cmd="yarn test --"

  # JSON output for CI integration (stdout is pure JSON)
  ./scripts/detect-flaky.sh tests/foo.test.ts 10 --json

  # Classification only (always exits 0, for scripting)
  ./scripts/detect-flaky.sh tests/unit/foo.test.ts 10 --report-only

Fail-fast semantics:
  --expect-pass --fail-fast  Stop on first FAILURE (gate violated)
  --expect-fail --fail-fast  Stop on first PASS (reproducibility violated)
  auto --fail-fast           Stop when flakiness PROVEN (seen pass AND fail)

Exit codes:
  0: expected outcome (or --report-only)
  1: flaky / unexpected / timeout outcome
  2: usage or script error
  130: interrupted (Ctrl+C)
USAGE
}

# Handle --version and --help before argument parsing
for arg in "$@"; do
  case "$arg" in
    --version|-V)
      echo "detect-flaky.sh v${VERSION}"
      exit 0
      ;;
    --help|-h)
      usage
      exit 0
      ;;
  esac
done

if [[ $# -lt 1 ]]; then
  usage
  exit 2
fi

TEST_TARGET="$1"
shift

# Validate test target is not empty
if [[ -z "$TEST_TARGET" ]]; then
  echo "[detect-flaky] ERROR: test target cannot be empty" >&2
  exit 2
fi

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
JSON_OUTPUT="0"             # 0 | 1
TIMEOUT_SECONDS="300"       # 5 minutes default
TEST_CMD="npm test --"      # Configurable test command
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
    --json)
      JSON_OUTPUT="1"
      NO_COLOR_FLAG="1"  # Disable colors for JSON mode
      shift
      ;;
    --timeout=*)
      TIMEOUT_SECONDS="${1#*=}"
      if ! [[ "$TIMEOUT_SECONDS" =~ ^[0-9]+$ ]]; then
        echo "[detect-flaky] ERROR: --timeout must be a positive integer" >&2
        exit 2
      fi
      shift
      ;;
    --test-cmd=*)
      TEST_CMD="${1#*=}"
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
    *)
      EXTRA_ARGS+=("$1")
      shift
      ;;
  esac
done

# Parse TEST_CMD into an array safely
# This handles quoted commands like "yarn test --" correctly
TEST_CMD_ARRAY=()
eval "TEST_CMD_ARRAY=($TEST_CMD)" 2>/dev/null || {
  echo "[detect-flaky] ERROR: Invalid --test-cmd syntax: $TEST_CMD" >&2
  echo "[detect-flaky] Use quotes for multi-word commands: --test-cmd=\"yarn test --\"" >&2
  exit 2
}

if [[ ${#TEST_CMD_ARRAY[@]} -eq 0 ]]; then
  echo "[detect-flaky] ERROR: --test-cmd cannot be empty" >&2
  exit 2
fi

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
TIMEOUT_COUNT=0
START_TIME=$(date +%s)

# Helper for human output (only when not in JSON mode)
log_human() {
  [[ "$JSON_OUTPUT" != "1" ]] && echo "$@"
}

log_human_n() {
  [[ "$JSON_OUTPUT" != "1" ]] && echo -n "$@"
}

cleanup() {
  # Keep logs when requested or when verdict is not clean passing
  if [[ "$KEEP_LOGS" == "1" ]]; then
    log_human "${C_BLU}[detect-flaky] Logs kept at: $TMP_DIR${C_RST}"
    return 0
  fi

  case "$VERDICT" in
    PASSING)
      rm -rf "$TMP_DIR" || true
      ;;
    *)
      log_human "${C_BLU}[detect-flaky] Logs kept at: $TMP_DIR${C_RST}"
      ;;
  esac
}

on_interrupt() {
  VERDICT="INTERRUPTED"
  if [[ "$JSON_OUTPUT" == "1" ]]; then
    output_json
  else
    echo ""
    echo "${C_YLW}[detect-flaky] Interrupted${C_RST}"
  fi
  exit 130
}

on_terminate() {
  VERDICT="TERMINATED"
  if [[ "$JSON_OUTPUT" == "1" ]]; then
    output_json
  else
    echo ""
    echo "${C_YLW}[detect-flaky] Terminated${C_RST}"
  fi
  exit 143
}

# JSON output function - escapes special characters for valid JSON
json_escape() {
  local str="$1"
  str="${str//\\/\\\\}"   # Escape backslashes
  str="${str//\"/\\\"}"   # Escape quotes
  str="${str//$'\n'/\\n}" # Escape newlines
  str="${str//$'\t'/\\t}" # Escape tabs
  echo "$str"
}

output_json() {
  local end_time=$(date +%s)
  local duration=$((end_time - START_TIME))
  local exit_code=0

  case "$VERDICT" in
    PASSING) exit_code=0 ;;
    FLAKY|"DETERMINISTIC FAILURE"|"FAILED GATE"|"NOT DETERMINISTIC") exit_code=1 ;;
    INTERRUPTED) exit_code=130 ;;
    TERMINATED) exit_code=143 ;;
    *) exit_code=1 ;;
  esac

  if [[ "$REPORT_ONLY" == "1" ]]; then
    exit_code=0
  fi

  local escaped_target escaped_cmd
  escaped_target=$(json_escape "$TEST_TARGET")
  escaped_cmd=$(json_escape "$TEST_CMD")

  cat <<EOF
{
  "version": "${VERSION}",
  "target": "${escaped_target}",
  "verdict": "${VERDICT}",
  "runs": {
    "requested": ${RUNS},
    "completed": ${RAN:-0},
    "passed": ${PASS_COUNT:-0},
    "failed": ${FAIL_COUNT:-0},
    "timed_out": ${TIMEOUT_COUNT}
  },
  "config": {
    "expect_mode": "${EXPECT_MODE}",
    "fail_fast": ${FAIL_FAST},
    "report_only": ${REPORT_ONLY},
    "timeout_seconds": ${TIMEOUT_SECONDS},
    "test_cmd": "${escaped_cmd}"
  },
  "duration_seconds": ${duration},
  "exit_code": ${exit_code},
  "logs_dir": "${TMP_DIR}"
}
EOF
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

# Print header (unless JSON mode)
if [[ "$JSON_OUTPUT" != "1" ]]; then
  echo "${C_BLD}==============================================${C_RST}"
  echo "${C_BLD}Flakiness Detection (v${VERSION})${C_RST}"
  echo "  Target     : ${C_BLU}$TEST_TARGET${C_RST}"
  echo "  Runs       : $RUNS"
  echo "  Expect     : $EXPECT_MODE"
  echo "  Fail-fast  : $FAIL_FAST"
  echo "  Timeout    : ${TIMEOUT_SECONDS}s per run"
  echo "  Test cmd   : ${TEST_CMD_ARRAY[*]}"
  echo "  Report-only: $REPORT_ONLY"
  echo "  Reporter   : $REPORTER"
  if [[ ${#EXTRA_ARGS[@]} -gt 0 ]]; then
    echo "  Extra      : ${EXTRA_ARGS[*]}"
  fi
  echo "${C_BLD}==============================================${C_RST}"

  # Warn if runs < recommended minimum
  if [[ "$RUNS" -lt "$MIN_RECOMMENDED_RUNS" ]]; then
    echo "${C_YLW}[detect-flaky] WARNING: $RUNS runs may not reliably detect flakiness.${C_RST}"
    echo "${C_YLW}             Recommend at least $MIN_RECOMMENDED_RUNS runs for confidence.${C_RST}"
  fi
fi

# Use a stable baseline environment by default.
# (You can override by explicitly setting env vars when invoking the script.)
: "${TZ:=UTC}"
: "${CI:=1}"
export TZ CI

# Check if timeout command is available
HAS_TIMEOUT=0
if command -v timeout >/dev/null 2>&1; then
  HAS_TIMEOUT=1
elif [[ "$JSON_OUTPUT" != "1" && "$TIMEOUT_SECONDS" != "300" ]]; then
  echo "${C_YLW}[detect-flaky] WARNING: 'timeout' command not found. --timeout will be ignored.${C_RST}" >&2
fi

# Main test loop - C-style for portability (no external 'seq' dependency)
for ((i=1; i<=RUNS; i++)); do
  RAN=$i
  LOG_FILE="$TMP_DIR/run-$i.log"

  log_human_n "Run $i/$RUNS: "

  # Build the full test command with target and reporter
  FULL_CMD=("${TEST_CMD_ARRAY[@]}" "$TEST_TARGET" --reporter="$REPORTER" "${EXTRA_ARGS[@]}")

  # Run with or without timeout
  RUN_EXIT_CODE=0
  if [[ "$HAS_TIMEOUT" == "1" ]]; then
    if timeout "${TIMEOUT_SECONDS}s" "${FULL_CMD[@]}" >"$LOG_FILE" 2>&1; then
      RUN_EXIT_CODE=0
    else
      RUN_EXIT_CODE=$?
    fi
  else
    if "${FULL_CMD[@]}" >"$LOG_FILE" 2>&1; then
      RUN_EXIT_CODE=0
    else
      RUN_EXIT_CODE=$?
    fi
  fi

  # Handle result
  # NOTE: Timeout (exit 124) is treated as a failure, counted separately for debugging
  if [[ "$RUN_EXIT_CODE" -eq 0 ]]; then
    ((PASS_COUNT+=1))
    log_human "${C_GRN}PASS${C_RST}"
  elif [[ "$RUN_EXIT_CODE" -eq 124 ]]; then
    # Timeout occurred - counts as failure
    ((FAIL_COUNT+=1))
    ((TIMEOUT_COUNT+=1))
    log_human "${C_RED}TIMEOUT${C_RST} (exceeded ${TIMEOUT_SECONDS}s)"
  else
    ((FAIL_COUNT+=1))
    log_human "${C_RED}FAIL${C_RST}"

    if [[ "$SHOW_FAILURES" == "1" && "$JSON_OUTPUT" != "1" ]]; then
      echo "${C_DIM}---- Failure output (run $i) ----${C_RST}"
      tail -n 80 "$LOG_FILE" || true
      echo "${C_DIM}---------------------------------${C_RST}"
    fi
  fi

  # Fail-fast logic (mode-aware)
  if [[ "$FAIL_FAST" == "1" ]]; then
    # --expect-pass: stop on first failure (gate violated)
    if [[ "$EXPECT_MODE" == "pass" && "$FAIL_COUNT" -gt 0 ]]; then
      log_human "${C_YLW}[detect-flaky] --fail-fast: Gate violated (failure detected)${C_RST}"
      break
    fi

    # --expect-fail: stop on first pass (reproducibility violated)
    if [[ "$EXPECT_MODE" == "fail" && "$PASS_COUNT" -gt 0 ]]; then
      log_human "${C_YLW}[detect-flaky] --fail-fast: Reproducibility violated (pass detected)${C_RST}"
      break
    fi

    # auto mode: only stop when flakiness is PROVEN (seen both pass AND fail)
    # This preserves ability to distinguish FLAKY from DETERMINISTIC
    if [[ "$EXPECT_MODE" == "auto" && "$PASS_COUNT" -gt 0 && "$FAIL_COUNT" -gt 0 ]]; then
      log_human "${C_YLW}[detect-flaky] --fail-fast: Flakiness proven (seen pass AND fail)${C_RST}"
      break
    fi
  fi
done

# Helper function to exit with proper code (respects --report-only)
exit_with_code() {
  local code="$1"
  if [[ "$JSON_OUTPUT" == "1" ]]; then
    output_json
  fi
  if [[ "$REPORT_ONLY" == "1" ]]; then
    exit 0
  fi
  exit "$code"
}

# Print results (unless JSON mode - handled at exit)
if [[ "$JSON_OUTPUT" != "1" ]]; then
  echo ""
  echo "${C_BLD}==============================================${C_RST}"
  echo "${C_BLD}RESULTS${C_RST}"
  echo "${C_BLD}==============================================${C_RST}"
  echo "Ran      : $RAN / $RUNS"
  echo "Passes   : ${C_GRN}$PASS_COUNT${C_RST}"
  echo "Failures : ${C_RED}$FAIL_COUNT${C_RST}"
  if [[ "$TIMEOUT_COUNT" -gt 0 ]]; then
    echo "Timeouts : ${C_RED}$TIMEOUT_COUNT${C_RST} (included in failures)"
  fi
  echo ""
fi

# Decision logic based on expect mode

if [[ "$EXPECT_MODE" == "pass" ]]; then
  # Gate mode: all runs must pass (timeouts count as failures)
  if [[ "$FAIL_COUNT" -eq 0 ]]; then
    VERDICT="PASSING"
    log_human "VERDICT: ${C_GRN}${C_BLD}PASSING${C_RST} (stable across $RAN runs)"
    exit_with_code 0
  fi

  VERDICT="FAILED GATE"
  if [[ "$JSON_OUTPUT" != "1" ]]; then
    if [[ "$PASS_COUNT" -gt 0 ]]; then
      echo "VERDICT: ${C_YLW}${C_BLD}FAILED GATE (FLAKY)${C_RST} (some passes, some fails)"
    else
      echo "VERDICT: ${C_RED}${C_BLD}FAILED GATE (DETERMINISTIC)${C_RST} (failed every run)"
    fi

    echo ""
    echo "${C_RED}Gate FAILED: Expected PASS across all runs, but failures occurred.${C_RST}"
    if [[ "$TIMEOUT_COUNT" -gt 0 ]]; then
      echo "${C_YLW}Note: $TIMEOUT_COUNT run(s) timed out. Consider increasing --timeout.${C_RST}"
    fi
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
  fi
  exit_with_code 1
fi

if [[ "$EXPECT_MODE" == "fail" ]]; then
  # Prove deterministic failure mode
  # NOTE: Timeouts count as failures, so they satisfy --expect-fail
  if [[ "$FAIL_COUNT" -eq "$RAN" && "$RAN" -eq "$RUNS" ]]; then
    VERDICT="DETERMINISTIC FAILURE"
    if [[ "$JSON_OUTPUT" != "1" ]]; then
      echo "VERDICT: ${C_GRN}${C_BLD}DETERMINISTIC FAILURE${C_RST} (reproduced every run)"
      if [[ "$TIMEOUT_COUNT" -gt 0 ]]; then
        echo "${C_YLW}Note: $TIMEOUT_COUNT run(s) were timeouts. This may indicate Pattern F.${C_RST}"
      fi
      echo ""
      echo "Failure is reproducible. Proceed with standard pattern triage (A-F)."
    fi
    exit_with_code 0
  fi

  VERDICT="NOT DETERMINISTIC"
  if [[ "$JSON_OUTPUT" != "1" ]]; then
    if [[ "$PASS_COUNT" -eq "$RAN" ]]; then
      echo "VERDICT: ${C_YLW}${C_BLD}NOT DETERMINISTIC (all passed)${C_RST}"
      echo ""
      echo "Cannot reproduce. Check environment differences vs CI."
    else
      echo "VERDICT: ${C_YLW}${C_BLD}NOT DETERMINISTIC (flaky)${C_RST}"
      echo ""
      echo "Failure is intermittent. Investigate flakiness patterns first."
    fi
  fi
  exit_with_code 1
fi

# Auto mode (default) - detect and classify test behavior
# CRITICAL: In auto mode, any failure (flaky OR deterministic OR timeout) must exit 1
# This prevents broken tests from silently passing CI pipelines.
# Use --expect-fail to prove deterministic failure (exit 0).
# Use --report-only if you just want classification without exit codes.

if [[ "$PASS_COUNT" -gt 0 && "$FAIL_COUNT" -gt 0 ]]; then
  VERDICT="FLAKY"
  if [[ "$JSON_OUTPUT" != "1" ]]; then
    echo "VERDICT: ${C_YLW}${C_BLD}FLAKY${C_RST}"
    echo ""
    echo "This target shows intermittent behavior."
    echo ""
    echo "Investigate in this order: ${C_BLD}Pattern E${C_RST} (shared state) -> ${C_BLD}A${C_RST} (async) -> ${C_BLD}F${C_RST} (timers)"
    echo ""
    echo "Quick diagnostics:"
    echo "  ${TEST_CMD_ARRAY[*]} \"$TEST_TARGET\" --reporter=verbose"
    echo "  ${TEST_CMD_ARRAY[*]} \"$TEST_TARGET\" --isolate"
    echo "  ${TEST_CMD_ARRAY[*]} \"$TEST_TARGET\" --sequence=shuffle"
  fi
  exit_with_code 1
fi

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  VERDICT="DETERMINISTIC FAILURE"
  if [[ "$JSON_OUTPUT" != "1" ]]; then
    echo "VERDICT: ${C_RED}${C_BLD}DETERMINISTIC FAILURE${C_RST}"
    echo ""
    echo "This failure reproduces consistently."
    echo "Proceed with standard pattern triage (A/B/C/D/E/F)."
    if [[ "$TIMEOUT_COUNT" -gt 0 ]]; then
      echo ""
      echo "${C_YLW}Note: $TIMEOUT_COUNT run(s) timed out. This may indicate Pattern F (timers/hanging).${C_RST}"
    fi
    echo ""
    echo "Run with verbose output for context:"
    echo "  ${TEST_CMD_ARRAY[*]} \"$TEST_TARGET\" --reporter=verbose"
    echo ""
    echo "To prove reproducibility for documentation:"
    echo "  ./scripts/detect-flaky.sh \"$TEST_TARGET\" $RUNS --expect-fail"
  fi
  exit_with_code 1
fi

VERDICT="PASSING"
if [[ "$JSON_OUTPUT" != "1" ]]; then
  echo "VERDICT: ${C_GRN}${C_BLD}PASSING${C_RST}"
  echo ""
  echo "This target passes consistently."
  echo "If it's failing in CI, investigate environment differences:"
  echo "  - TZ/locale settings"
  echo "  - CPU/memory constraints"
  echo "  - Test ordering / parallelism"
fi
exit_with_code 0
