#!/usr/bin/env bash
# -------------------------------------------
# Canary Health Check - Auto-promote if healthy
# -------------------------------------------
set -euo pipefail

HEALTH_URL="${HEALTH_URL:-http://localhost:3000/healthz}"

if ! ERROR_RATE=$(curl -sf "$HEALTH_URL" | jq -r '.error_rate' 2>/dev/null); then
  echo "❌ Health endpoint unreachable at $HEALTH_URL"
  exit 1
fi

# Fallback if jq parsing fails
ERROR_RATE=${ERROR_RATE:-1}

if awk "BEGIN {exit !($ERROR_RATE < 0.01)}"; then
  echo "✅ Error rate $ERROR_RATE < 1% - canary healthy"
  
  # Only promote if we're not already at 100%
  CURRENT_SIZE=$(cat .canary-size 2>/dev/null || echo 5)
  if [ "$CURRENT_SIZE" -lt 100 ]; then
    echo "🚀 Rolling out remaining $((100 - CURRENT_SIZE))% ..."
    ./launch-script.sh --batch-size $((100 - CURRENT_SIZE))
    echo "100" > .canary-size
    echo "✅ Full rollout complete"
  else
    echo "ℹ️  Already at 100% deployment"
  fi
else
  echo "⚠️  Error rate $ERROR_RATE >= 1% - holding rollout"
  exit 1
fi
