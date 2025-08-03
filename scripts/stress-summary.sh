#!/usr/bin/env bash
# -------------------------------------------------------------
# Stress test summary - compare before/after results
# -------------------------------------------------------------
set -euo pipefail

# Find the latest stress test results
LATEST_DIR=$(find .stress -name "20*" -type d | sort | tail -1)
if [ -z "$LATEST_DIR" ]; then
  echo "⚠️  No stress results found. Run graduated-stress.sh first."
  exit 1
fi

LATEST_DATE=$(basename "$LATEST_DIR")
echo "Using results from: $LATEST_DATE"

# Create comparison using jq
echo "📊 Stress Test Comparison"
echo "========================"

# Check if we have previous results for comparison
PREV_DIR=$(find .stress -name "20*" -type d | sort | tail -2 | head -1)
if [ -n "$PREV_DIR" ] && [ "$PREV_DIR" != "$LATEST_DIR" ]; then
  PREV_DATE=$(basename "$PREV_DIR")
  echo "Comparing $PREV_DATE → $LATEST_DATE"
  jq -s '
    sort_by(.concurrency // .c) |
    (["Concurrency", "P95_Before", "P95_After", "Delta_ms", "Delta_%"] | @tsv),
    (. as $all |
     range(0; length/2) as $i |
     $all[$i] as $before |
     $all[$i + length/2] as $after |
     [
       ($after.concurrency // $after.c // "N/A"),
       ($before.latency.p95 // 0),
       ($after.latency.p95 // 0),
       (($after.latency.p95 // 0) - ($before.latency.p95 // 0)),
       ((($after.latency.p95 // 0) - ($before.latency.p95 // 0)) / ($before.latency.p95 // 1) * 100)
     ] | @tsv)
  ' "$PREV_DIR"/stress-c*.json "$LATEST_DIR"/stress-c*.json | column -t
else
  echo "Single run summary:"
  jq -r '
    (["Concurrency", "P95_ms", "Avg_ms", "RPS", "Errors"] | @tsv),
    (. | [
      .concurrency // "N/A",
      .latency.p95 // 0,
      .latency.mean // 0,
      .requests.average // 0,
      .errors // 0
    ] | @tsv)
  ' "$LATEST_DIR"/stress-c*.json | column -t
fi

# Check against budget
if [ -f ".perf-budget.json" ]; then
  BUDGET_P95=$(jq -r '.p95Max // 400' .perf-budget.json)
  MAX_P95=$(jq '[.latency.p95 // 0] | max' "$LATEST_DIR"/stress-c*.json)
  
  echo ""
  echo "Budget Check:"
  echo "  P95 Budget: ${BUDGET_P95}ms"
  echo "  Max P95:    ${MAX_P95}ms"
  
  if (( $(echo "$MAX_P95 > $BUDGET_P95" | bc -l) )); then
    echo "  Status:     ❌ OVER BUDGET"
  else
    echo "  Status:     ✅ Within budget"
  fi
fi
