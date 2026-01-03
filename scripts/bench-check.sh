#!/bin/bash
# scripts/bench-check.sh
#
# Run performance benchmarks and compare to committed baselines.
# Detects performance regressions in calculation-heavy code paths.
#
# Exit codes:
#   0 - No regression (within threshold)
#   1 - Regression detected (exceeds threshold)
#
# Usage:
#   ./scripts/bench-check.sh              # Run benchmarks and compare
#   ./scripts/bench-check.sh --update     # Update baseline after approval
#   ./scripts/bench-check.sh --verbose    # Show detailed timing
#
# Environment variables:
#   USE_EMOJI=false     # Disable emoji output

set -euo pipefail

#------------------------------------------------------------------------------
# Configuration
#------------------------------------------------------------------------------

BASELINE_FILE=".baselines/bench.json"
RESULTS_FILE="/tmp/bench-results-$$.json"
REGRESSION_THRESHOLD=10  # Percent slowdown that triggers failure
WARNING_THRESHOLD=5      # Percent slowdown that triggers warning
BENCHMARK_RUNS=3         # Number of runs to average (reduces noise)

# Seed for deterministic benchmarks
BENCH_SEED=42

# Configurable options
USE_EMOJI=${USE_EMOJI:-true}
VERBOSE=${VERBOSE:-false}
UPDATE_MODE=false
REGRESSION_FOUND=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

#------------------------------------------------------------------------------
# Dependency Checks
#------------------------------------------------------------------------------

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Error: Required command '$1' not found. Please install it."
    exit 1
  }
}

require_cmd jq
require_cmd npm

#------------------------------------------------------------------------------
# Logging Functions (emoji-configurable)
#------------------------------------------------------------------------------

log_success() {
  if [[ "$USE_EMOJI" == "true" ]]; then
    echo -e "${GREEN}[OK] $1${NC}"
  else
    echo -e "${GREEN}OK: $1${NC}"
  fi
}

log_warning() {
  if [[ "$USE_EMOJI" == "true" ]]; then
    echo -e "${YELLOW}[WARN] $1${NC}"
  else
    echo -e "${YELLOW}WARN: $1${NC}"
  fi
}

log_error() {
  if [[ "$USE_EMOJI" == "true" ]]; then
    echo -e "${RED}[ERR] $1${NC}"
  else
    echo -e "${RED}ERROR: $1${NC}"
  fi
}

log_info() {
  if [[ "$USE_EMOJI" == "true" ]]; then
    echo -e "${BLUE}[INFO] $1${NC}"
  else
    echo -e "${BLUE}INFO: $1${NC}"
  fi
}

log_verbose() {
  [[ "$VERBOSE" == "true" ]] && echo -e "   $1" || true
}

#------------------------------------------------------------------------------
# Standard Failure Block (for subagent handoff)
#------------------------------------------------------------------------------

emit_failure_block() {
  local title=$1
  local summary=$2
  local cause=$3
  local next_step=$4
  local subagent=${5:-""}

  echo ""
  echo "==============================================================================="
  echo "VALIDATION FAILED: $title"
  echo "==============================================================================="
  echo "SUMMARY: $summary"
  echo "PROBABLE_CAUSE: $cause"
  if [[ -n "$subagent" ]]; then
    echo "INVOKE_SUBAGENT: $subagent"
  fi
  echo "NEXT_STEP: $next_step"
  echo "==============================================================================="
  echo ""
}

# Parse arguments
for arg in "$@"; do
  case $arg in
    --verbose|-v)
      VERBOSE=true
      ;;
    --update|-u)
      UPDATE_MODE=true
      ;;
    --threshold=*)
      REGRESSION_THRESHOLD="${arg#*=}"
      ;;
  esac
done

#------------------------------------------------------------------------------
# Utility Functions
#------------------------------------------------------------------------------

# Run a benchmark multiple times and return median
run_bench() {
  local name=$1
  local command=$2
  local results=()

  log_verbose "Running $name ($BENCHMARK_RUNS iterations)..."

  for i in $(seq 1 $BENCHMARK_RUNS); do
    # Time the command, capture duration in milliseconds
    local start_time end_time duration
    start_time=$(date +%s%N)
    eval "$command" > /dev/null 2>&1 || true
    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))  # Convert to ms
    results+=("$duration")
    log_verbose "  Run $i: ${duration}ms"
  done

  # Return median
  printf '%s\n' "${results[@]}" | sort -n | sed -n "$((BENCHMARK_RUNS / 2 + 1))p"
}

# Compare two values and return status
compare_timing() {
  local name=$1
  local baseline=$2
  local current=$3

  if [[ "$baseline" -eq 0 ]]; then
    echo "NEW"
    return 0
  fi

  local delta=$(( (current - baseline) * 100 / baseline ))

  if [[ "$delta" -gt "$REGRESSION_THRESHOLD" ]]; then
    echo "REGRESSION:$delta"
    return 1
  elif [[ "$delta" -gt "$WARNING_THRESHOLD" ]]; then
    echo "WARNING:$delta"
    return 0
  elif [[ "$delta" -lt -5 ]]; then
    echo "IMPROVED:$delta"
    return 0
  else
    echo "OK:$delta"
    return 0
  fi
}

#------------------------------------------------------------------------------
# Benchmark Definitions
#------------------------------------------------------------------------------

# Define benchmarks as: "name:command"
# Commands should be deterministic (use fixed seeds, fixed data sizes)
# Placeholder benchmarks - customize for your project

BENCHMARKS=(
  "typecheck:npm run check -- --noEmit 2>/dev/null"
  "lint_sample:npm run lint -- --max-warnings=99999 client/src/lib/ 2>/dev/null"
)

#------------------------------------------------------------------------------
# Benchmark Runner
#------------------------------------------------------------------------------

run_all_benchmarks() {
  log_info "Running performance benchmarks..."
  echo ""

  local results="{"
  local first=true

  for bench in "${BENCHMARKS[@]}"; do
    IFS=':' read -r name command <<< "$bench"

    log_info "Benchmark: $name"

    local timing
    timing=$(run_bench "$name" "$command")

    log_verbose "Median: ${timing}ms"

    if [[ "$first" == "true" ]]; then
      first=false
    else
      results+=","
    fi
    results+="\"$name\":$timing"
  done

  results+="}"

  echo "$results" > "$RESULTS_FILE"
  log_success "Benchmarks complete. Results saved to $RESULTS_FILE"
}

#------------------------------------------------------------------------------
# Baseline Comparison
#------------------------------------------------------------------------------

compare_to_baseline() {
  log_info "Comparing to baseline..."
  echo ""

  if [[ ! -f "$BASELINE_FILE" ]]; then
    log_warning "No baseline file found at $BASELINE_FILE"
    log_info "Run with --update to create initial baseline"
    return 0
  fi

  # Parse results and baseline
  local results baseline
  results=$(cat "$RESULTS_FILE")
  baseline=$(cat "$BASELINE_FILE" | jq -r '.metrics')

  echo "+-------------------------+----------+----------+----------+----------+"
  echo "| Benchmark               | Baseline | Current  | Delta    | Status   |"
  echo "+-------------------------+----------+----------+----------+----------+"

  # Iterate through current results
  echo "$results" | jq -r 'to_entries[] | "\(.key):\(.value)"' | while IFS=':' read -r name current; do
    local baseline_val status delta_pct status_text
    baseline_val=$(echo "$baseline" | jq -r ".[\"$name\"] // 0")

    if [[ "$baseline_val" -eq 0 ]]; then
      status_text="NEW"
      delta_pct="--"
    else
      delta_pct=$(( (current - baseline_val) * 100 / baseline_val ))

      if [[ "$delta_pct" -gt "$REGRESSION_THRESHOLD" ]]; then
        status_text="${RED}REGRESS${NC}"
        REGRESSION_FOUND=1
      elif [[ "$delta_pct" -gt "$WARNING_THRESHOLD" ]]; then
        status_text="${YELLOW}WARN${NC}"
      elif [[ "$delta_pct" -lt -5 ]]; then
        status_text="${GREEN}FASTER${NC}"
      else
        status_text="${GREEN}OK${NC}"
      fi

      if [[ "$delta_pct" -gt 0 ]]; then
        delta_pct="+${delta_pct}%"
      else
        delta_pct="${delta_pct}%"
      fi
    fi

    printf "| %-23s | %6sms | %6sms | %8s | %-8b |\n" \
      "$name" "$baseline_val" "$current" "$delta_pct" "$status_text"
  done

  echo "+-------------------------+----------+----------+----------+----------+"
  echo ""
}

#------------------------------------------------------------------------------
# Baseline Update
#------------------------------------------------------------------------------

update_baseline() {
  local reason=${1:-"Manual update"}

  log_info "Updating baseline..."

  # Run benchmarks if results don't exist
  if [[ ! -f "$RESULTS_FILE" ]]; then
    run_all_benchmarks
  fi

  # Create baseline file
  local results
  results=$(cat "$RESULTS_FILE")

  mkdir -p "$(dirname "$BASELINE_FILE")"

  cat > "$BASELINE_FILE" << EOF
{
  "updatedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "updatedBy": "$(git config user.name 2>/dev/null || echo "unknown")",
  "reason": "$reason",
  "config": {
    "runs": $BENCHMARK_RUNS,
    "seed": $BENCH_SEED,
    "threshold": $REGRESSION_THRESHOLD
  },
  "metrics": $results
}
EOF

  log_success "Baseline updated: $BASELINE_FILE"
  log_info "Commit this file to lock in the new baseline"
}

#------------------------------------------------------------------------------
# Main
#------------------------------------------------------------------------------

main() {
  echo ""
  echo "======================================================="
  echo "  Performance Benchmark Check"
  echo "======================================================="
  echo ""
  echo "  Threshold: ${REGRESSION_THRESHOLD}% regression triggers failure"
  echo "  Runs: ${BENCHMARK_RUNS} iterations per benchmark (median)"
  echo "  Seed: ${BENCH_SEED} (deterministic)"
  echo ""

  if [[ "$UPDATE_MODE" == "true" ]]; then
    run_all_benchmarks
    update_baseline "Baseline update via bench-check.sh --update"
    exit 0
  fi

  # Run benchmarks
  run_all_benchmarks
  echo ""

  # Compare to baseline
  compare_to_baseline

  # Summary
  echo "======================================================="
  echo "  Summary"
  echo "======================================================="
  echo ""

  if [[ "$REGRESSION_FOUND" -eq 1 ]]; then
    log_error "Performance regression detected!"
    echo ""

    # Emit standard failure block for subagent handoff
    emit_failure_block \
      "Performance Regression" \
      "A benchmark exceeded the ${REGRESSION_THRESHOLD}% slowdown threshold" \
      "Recent code changes increased computation time in hot paths" \
      "Profile the affected benchmark and optimize, or update baseline with justification" \
      "perf-regression-triager"

    echo "  Options:"
    echo "    1. Fix the performance regression"
    echo "    2. If intentional (e.g., added safety checks):"
    echo "       ./scripts/bench-check.sh --update"
    echo "       Then add 'perf-baseline-change' label to PR"
    echo ""
    echo "  To diagnose, invoke perf-regression-triager subagent:"
    echo "    @perf-regression-triager \"Diagnose regression in <benchmark>\""
    echo ""
    exit 1
  else
    log_success "No performance regression detected!"
    exit 0
  fi
}

main
