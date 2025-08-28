#!/bin/bash
# Guardian workflow evaluator - checks rolling window of canary runs
# Requires: gh CLI, jq
# Exit codes: 0=healthy, 1=unhealthy, 2=insufficient data

set -euo pipefail

REPO="${GITHUB_REPOSITORY:-$(git remote get-url origin | sed 's/.*github.com[:/]\([^.]*\).*/\1/')}"
GUARDIAN_WINDOW_SIZE="${GUARDIAN_WINDOW_SIZE:-3}"
GUARDIAN_MIN_SUCCESS="${GUARDIAN_MIN_SUCCESS:-2}"

echo "🔍 Evaluating Guardian health (${GUARDIAN_MIN_SUCCESS}/${GUARDIAN_WINDOW_SIZE} success required)"

# Get recent Guardian runs (completed only)
runs=$(gh run list \
  --repo "$REPO" \
  --workflow="guardian.yml" \
  --status=completed \
  --limit="$GUARDIAN_WINDOW_SIZE" \
  --json status,conclusion,createdAt)

total_runs=$(echo "$runs" | jq length)
if [ "$total_runs" -lt "$GUARDIAN_WINDOW_SIZE" ]; then
  echo "⚠️  Insufficient Guardian history ($total_runs < $GUARDIAN_WINDOW_SIZE)"
  exit 2
fi

# Count successful runs
success_count=$(echo "$runs" | jq '[.[] | select(.conclusion == "success")] | length')

echo "📊 Guardian window: $success_count/$total_runs successful"

if [ "$success_count" -ge "$GUARDIAN_MIN_SUCCESS" ]; then
  echo "✅ Guardian health: PASS"
  exit 0
else
  echo "❌ Guardian health: FAIL"
  exit 1
fi