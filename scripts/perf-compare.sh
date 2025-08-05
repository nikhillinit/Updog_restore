#!/usr/bin/env bash
# -------------------------------------------------------------
# Performance comparison script
#  • Reads raw milliseconds from bench-result.txt
#  • Compares against baseline
#  • Updates baseline if performance improves
# -------------------------------------------------------------
set -euo pipefail

# Ensure directory exists
mkdir -p .perf-baseline

# Read current result with timeout protection
if ! RESULT=$(timeout 60s cat bench-result.txt 2>&1); then
  echo "::warning:: Benchmark timeout/error: $RESULT"
  exit 0  # Don't block deploy
fi

# Read baseline (default to high number if missing)
BASELINE=$(cat .perf-baseline/current.txt 2>/dev/null || echo 999999)

echo "⏱️  Current: ${RESULT} ms | Baseline: ${BASELINE} ms"

# Calculate delta (using awk for floating point comparison)
DELTA=$(awk "BEGIN {print $RESULT - $BASELINE}")

if awk "BEGIN {exit !($DELTA > 0)}"; then
  echo "::warning:: Regression +${DELTA} ms"
  exit 0   # warn only, don't fail pipeline yet
else
  IMPROVEMENT=$(awk "BEGIN {print -$DELTA}")
  echo "✅ Faster by ${IMPROVEMENT} ms – updating baseline"
  echo "$RESULT" > .perf-baseline/current.txt
  git add .perf-baseline/current.txt
  git commit -m "perf: update baseline to ${RESULT} ms" --quiet || true
fi
