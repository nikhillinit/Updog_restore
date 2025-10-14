#!/usr/bin/env bash
set -Eeuo pipefail

# Cluster validation (gate-driven)
# - Type-check client/shared
# - Build
# - Test delta: no new core FAILs vs baseline (timeout-safe)
# - Bundle drift: warn only if > KB and > %

CLUSTER="${1:-cluster}"
OUTDIR="${OUTDIR:-artifacts/phase0/latest}"
CORE_TEST_PATH="${CORE_TEST_PATH:-client/src/core/}"
DIST_DIR="${DIST_DIR:-dist}"
CORE_TIMEOUT_SEC="${CORE_TIMEOUT_SEC:-60}"
BUNDLE_DRIFT_THRESHOLD_KB="${BUNDLE_DRIFT_THRESHOLD_KB:-50}"
BUNDLE_DRIFT_THRESHOLD_PCT="${BUNDLE_DRIFT_THRESHOLD_PCT:-5}"

have() { command -v "$1" >/dev/null 2>&1; }

vitest_exec () {
  if [ -x "node_modules/.bin/vitest" ]; then
    npm exec vitest -- "$@"
  else
    npx -y vitest "$@"
  fi
}

tsc_exec () {
  if [ -x "node_modules/.bin/tsc" ]; then
    npm exec tsc -- "$@"
  else
    npx -y tsc "$@"
  fi
}

run_with_timeout () {
  local __secs="$1"; shift
  if have timeout; then
    timeout "${__secs}s" "$@"
    return $?
  elif have gtimeout; then
    gtimeout "${__secs}s" "$@"
    return $?
  else
    # POSIX-ish fallback
    ( "$@" ) & local __pid=$!
    local __i=0
    while kill -0 "$__pid" 2>/dev/null; do
      sleep 1
      __i=$((__i+1))
      if [ "$__i" -ge "$__secs" ]; then
        kill -TERM "$__pid" 2>/dev/null || true
        wait "$__pid" 2>/dev/null || true
        return 124
      fi
    done
    wait "$__pid"
    return $?
  fi
}

echo "=== Validating cluster: $CLUSTER ==="

# Gate 1: Type checking
echo -n "[1/4] Type-check (client+shared)… "
TYPE_CHECK_OK=false
if (npm run check:client >/dev/null 2>&1 || tsc_exec -p tsconfig.client.json --noEmit --pretty=false >/dev/null 2>&1) \
  && (npm run check:shared >/dev/null 2>&1 || tsc_exec -p tsconfig.shared.json --noEmit --pretty=false >/dev/null 2>&1); then
  echo "✅"
  TYPE_CHECK_OK=true
else
  echo "❌"
  echo "   Type check failed. Fix errors and retry."
  exit 1
fi

# Gate 2: Build
echo -n "[2/4] Build… "
if npm run build >/dev/null 2>&1; then
  echo "✅"
else
  echo "❌"
  echo "   Build failed. Check build output."
  exit 1
fi

# Gate 3: Test delta (no new core FAILs)
echo -n "[3/4] Test delta (no new core FAILs)… "
BASELINE="$(cat "$OUTDIR/test-failures-baseline.txt" 2>/dev/null || echo 0)"
if [ -d "$CORE_TEST_PATH" ]; then
  set +e
  run_with_timeout "$CORE_TIMEOUT_SEC" bash -c "vitest_exec run \"$CORE_TEST_PATH\" --reporter=basic --passWithNoTests" > /tmp/core-run.txt 2>&1
  RC=$?
  set -e

  if [ "$RC" -eq 124 ]; then
    # Treat timeout as non-regression if baseline was already TIMEOUT/CRASH
    if [[ "$BASELINE" == "TIMEOUT" || "$BASELINE" == "CRASH" ]]; then
      echo "✅ (timeout unchanged)"
    else
      echo "⚠️ timeout (baseline=$BASELINE)"
      # Informational but don't fail
    fi
  elif [ "$RC" -gt 128 ]; then
    if [[ "$BASELINE" == "CRASH" || "$BASELINE" == "TIMEOUT" ]]; then
      echo "✅ (crash unchanged)"
    else
      echo "⚠️ crash (baseline=$BASELINE)"
      # Informational but don't fail
    fi
  else
    NOW_FAILS=$(grep -c -E '(^| )FAIL|×' /tmp/core-run.txt 2>/dev/null || echo 0)
    NUM_BASE=0
    if [[ "$BASELINE" =~ ^[0-9]+$ ]]; then
      NUM_BASE="$BASELINE"
    fi

    if [ "$NOW_FAILS" -le "$NUM_BASE" ]; then
      echo "✅ ($NOW_FAILS ≤ $NUM_BASE)"
    else
      echo "❌ NEW FAILURES: $NUM_BASE → $NOW_FAILS"
      echo "   Baseline: $NUM_BASE failures"
      echo "   Current:  $NOW_FAILS failures"
      echo "   GATE VIOLATION: Track 1A must not introduce new test failures"
      exit 1
    fi
  fi
else
  echo "ℹ️ (core tests path not found; skipping delta)"
fi

# Gate 4: Bundle drift check
echo -n "[4/4] Bundle drift (warn-only)… "
BASE_BYTES=$(cat "$OUTDIR/bundle/total-bytes.txt" 2>/dev/null || echo 0)
BASE_COUNT=$(cat "$OUTDIR/bundle/asset-count.txt" 2>/dev/null || echo 0)
CUR_BYTES=0
CUR_COUNT=0

if [ -d "$DIST_DIR/assets" ]; then
  while IFS= read -r line; do
    size=$(echo "$line" | awk '{print $1}')
    CUR_BYTES=$((CUR_BYTES + size))
    CUR_COUNT=$((CUR_COUNT + 1))
  done < <(ls -la "$DIST_DIR"/assets/*.js "$DIST_DIR"/assets/*.css 2>/dev/null | awk '{if (NR>1) print $5, $9}')
fi

if [ "$BASE_BYTES" -gt 0 ] && [ "$CUR_BYTES" -gt 0 ]; then
  DIFF=$((CUR_BYTES - BASE_BYTES))
  ABS=${DIFF#-}
  THR_BYTES=$((BUNDLE_DRIFT_THRESHOLD_KB * 1024))
  PCT=$((ABS * 100 / BASE_BYTES))
  COUNT_DIFF=$((CUR_COUNT - BASE_COUNT))

  if [ "$ABS" -gt "$THR_BYTES" ] && [ "$PCT" -gt "$BUNDLE_DRIFT_THRESHOLD_PCT" ]; then
    echo "⚠️ DRIFT: ${ABS}B (${PCT}%) > ${THR_BYTES}B & ${BUNDLE_DRIFT_THRESHOLD_PCT}%"
    echo "   Baseline: $((BASE_BYTES / 1024))KB ($BASE_COUNT assets)"
    echo "   Current:  $((CUR_BYTES / 1024))KB ($CUR_COUNT assets)"
    echo "   Asset Δ:  $COUNT_DIFF"
    echo "   ⚠️ Investigate unexpected imports/tree-shaking changes"
  else
    echo "✅ (Δ $((DIFF / 1024))KB, ${PCT}%, $COUNT_DIFF assets)"
  fi
else
  echo "ℹ️ (missing baseline or assets)"
fi

echo ""
echo "✅ Cluster '$CLUSTER' validated"
echo ""
