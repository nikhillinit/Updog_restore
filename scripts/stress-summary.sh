#!/usr/bin/env bash
# -------------------------------------------------------------
# Stress test summary - compare before/after results
# Auto-detects latest date folder or uses provided date
# -------------------------------------------------------------
set -euo pipefail

# Auto-detect latest date or use provided argument
if [ $# -gt 0 ]; then
  DATE="$1"
  LATEST_DIR=".stress/$DATE"
else
  LATEST_DIR=$(find .stress -name "20*" -type d 2>/dev/null | sort | tail -1)
  if [ -z "$LATEST_DIR" ]; then
    echo "⚠️  No stress results found. Run graduated-stress.sh first."
    exit 1
  fi
  DATE=$(basename "$LATEST_DIR")
fi

echo "📊 Stress Test Results for: $DATE"
echo "=================================="

# Quick summary table
printf "%-12s %-8s %-8s %-10s %-8s\n" "Concurrency" "P95_ms" "Avg_ms" "RPS" "Errors"
for f in "$LATEST_DIR"/stress-c*.json; do
  if [ -f "$f" ]; then
    C=$(basename "$f" | sed -E 's/[^0-9]//g')
    P95=$(jq -r '.latency.p95 // 0' "$f")
    AVG=$(jq -r '.latency.mean // 0' "$f")
    RPS=$(jq -r '.requests.average // 0' "$f")
    ERR=$(jq -r '.errors // 0' "$f")
    printf "c=%-10s %-8s %-8s %-10s %-8s\n" "$C" "$P95" "$AVG" "$RPS" "$ERR"
  fi
done

# Create comparison using jq
echo "📊 Stress Test Comparison"
echo "========================"

# Check if we have previous results for comparison
PREV_DIR=$(find .stress -name "20*" -type d | sort | tail -2 | head -1)
if [ -n "$PREV_DIR" ] && [ "$PREV_DIR" != "$LATEST_DIR" ]; then
  PREV_DATE=$(basename "$PREV_DIR")
  echo "Comparing $PREV_DATE → $DATE"
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
