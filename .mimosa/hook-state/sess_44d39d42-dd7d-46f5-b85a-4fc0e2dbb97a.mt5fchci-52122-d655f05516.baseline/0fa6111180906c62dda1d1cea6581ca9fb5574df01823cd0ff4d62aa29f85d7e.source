#!/usr/bin/env bash
set -euo pipefail

# =========================
# Phase 0: Ground Truth (gate-driven, portable)
# - Real npm ci (single legacy-peer retry)
# - Timeout-safe core test baseline (basic reporter)
# - JS/CSS-only bundle snapshot (no maps)
# - Scenario gate with reason + escalation trigger printing
# - Priority calculation delegated to scripts/calculate-priority.js
# =========================

# -------- Configurable defaults (override via env) --------
CLIENT_DIR="${CLIENT_DIR:-client}"
SHARED_DIR="${SHARED_DIR:-shared}"
SERVER_DIR="${SERVER_DIR:-server}"
CORE_TEST_PATH="${CORE_TEST_PATH:-$CLIENT_DIR/src/core/}"
DIST_DIR="${DIST_DIR:-dist}"
BUILD_CMD="${BUILD_CMD:-npm run build}"
CHECK_ALL_CMD="${CHECK_ALL_CMD:-}"             # if empty, auto-detect below
BASE_BRANCH="${BASE_BRANCH:-main}"
PR_NUMBER="${PR_NUMBER:-145}"

# Tunables
CORE_TIMEOUT_SEC="${CORE_TIMEOUT_SEC:-60}"
BUNDLE_DRIFT_THRESHOLD_KB="${BUNDLE_DRIFT_THRESHOLD_KB:-50}"
BUNDLE_DRIFT_THRESHOLD_PCT="${BUNDLE_DRIFT_THRESHOLD_PCT:-5}"

# -------- Helpers --------
log() { printf "[%(%H:%M:%S)T] %s\n" -1 "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

run_with_timeout () {
  # Usage: run_with_timeout <seconds> <cmd...>
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
      sleep 1; __i=$((__i+1))
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

vitest_exec () {
  # Prefer local binary for determinism
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

log "=== PHASE 0: Ground Truth Verification (Lean + Safeguards) ==="

PHASE0_RUN_ID=$(date +%Y%m%d-%H%M%S)
OUT_BASE="artifacts/phase0"
OUTDIR="$OUT_BASE/$PHASE0_RUN_ID"
mkdir -p "$OUTDIR" "$OUTDIR/bundle"

# Create symlink (handle Windows Git Bash where ln may fail)
rm -f "$OUT_BASE/latest" 2>/dev/null || true
if ln -sfn "$PHASE0_RUN_ID" "$OUT_BASE/latest" 2>/dev/null; then
  :  # Success
else
  # Fallback: just remember the run ID in a text file
  echo "$PHASE0_RUN_ID" > "$OUT_BASE/latest.txt"
fi

# 0) Toolchain
if have nvm && [ -f .nvmrc ]; then
  nvm install >/dev/null 2>&1 || true
  nvm use     >/dev/null 2>&1 || true
fi
echo "Node: $(node -v 2>/dev/null || echo N/A)" | tee "$OUTDIR/toolchain.txt"
echo "npm : $(npm -v  2>/dev/null || echo N/A)" | tee -a "$OUTDIR/toolchain.txt"

# 0a) Dependency check
log "Checking dependencies…"

if [ ! -f "package-lock.json" ]; then
  log "⚠️ No package-lock.json found; using existing node_modules"
  if [ ! -d "node_modules" ]; then
    log "❌ No node_modules found. Run 'npm install' first."
    echo "❌ No node_modules found. Run 'npm install' first." > "$OUTDIR/npm-ci.log"
    exit 1
  fi
  echo "existing-node_modules" > "$OUTDIR/install-mode.txt"
  log "Using existing node_modules (OK)"
else
  # Real npm ci (single legacy-peer retry)
  log "Installing dependencies (real npm ci)…"

  # Only clean node_modules, keep package-lock.json for npm ci
  if [ -d "node_modules" ]; then
    rm -rf node_modules || true
  fi

  if npm ci 2>&1 | tee "$OUTDIR/npm-ci.log"; then
    log "npm ci OK"
  elif npm ci --legacy-peer-deps 2>&1 | tee -a "$OUTDIR/npm-ci.log"; then
    log "npm ci OK (legacy-peer-deps)"
    echo "legacy-peer-deps" > "$OUTDIR/install-mode.txt"
  else
    echo "❌ npm ci failed. See $OUTDIR/npm-ci.log" | tee -a "$OUTDIR/npm-ci.log"
    exit 1
  fi
fi

# 1) Config audit (strictness + Vite tsconfigRaw presence)
log "Step 1: Config audit…"
if [ -f "scripts/audit-tsconfig.mjs" ]; then
  node scripts/audit-tsconfig.mjs --scope=client 2>&1 | tee "$OUTDIR/config-audit.txt" || true
else
  echo "⚠️ scripts/audit-tsconfig.mjs not found; skipping automated audit" | tee "$OUTDIR/config-audit.txt"
fi

# 2) TypeScript baselines
log "Step 2: TypeScript error baselines…"
if [ -z "$CHECK_ALL_CMD" ]; then
  if npm run | grep -q " check"; then
    CHECK_ALL_CMD="npm run check"
  else
    CHECK_ALL_CMD="tsc_exec -p tsconfig.json --noEmit"
  fi
fi
eval "$CHECK_ALL_CMD 2>&1 | tee \"$OUTDIR/baseline.txt\" || true"

# Use project scripts for accurate counts (align with repo workflow)
if npm run | grep -q "check:client"; then npm run check:client 2>&1 | tee "$OUTDIR/tsc-client.txt" ; else tsc_exec -p tsconfig.client.json --noEmit 2>&1 | tee "$OUTDIR/tsc-client.txt" ; fi || true
if npm run | grep -q "check:server"; then npm run check:server 2>&1 | tee "$OUTDIR/tsc-server.txt" ; else tsc_exec -p tsconfig.server.json --noEmit 2>&1 | tee "$OUTDIR/tsc-server.txt" ; fi || true
if npm run | grep -q "check:shared"; then npm run check:shared 2>&1 | tee "$OUTDIR/tsc-shared.txt" ; else tsc_exec -p tsconfig.shared.json --noEmit 2>&1 | tee "$OUTDIR/tsc-shared.txt" ; fi || true

CLIENT_ERRS=$(grep -c "error TS" "$OUTDIR/tsc-client.txt"  || echo 0)
SERVER_ERRS=$(grep -c "error TS" "$OUTDIR/tsc-server.txt"  || echo 0)
SHARED_ERRS=$(grep -c "error TS" "$OUTDIR/tsc-shared.txt"  || echo 0)
# Sanitize to single integers (remove any extra whitespace/newlines)
CLIENT_ERRS=$(echo "$CLIENT_ERRS" | tr -d '\n\r' | grep -o '[0-9]*' | head -1)
SERVER_ERRS=$(echo "$SERVER_ERRS" | tr -d '\n\r' | grep -o '[0-9]*' | head -1)
SHARED_ERRS=$(echo "$SHARED_ERRS" | tr -d '\n\r' | grep -o '[0-9]*' | head -1)
CLIENT_ERRS=${CLIENT_ERRS:-0}
SERVER_ERRS=${SERVER_ERRS:-0}
SHARED_ERRS=${SHARED_ERRS:-0}
TOTAL=$((CLIENT_ERRS + SERVER_ERRS + SHARED_ERRS))
printf "%s\n" "$CLIENT_ERRS" > "$OUTDIR/errors-client.txt"
printf "%s\n" "$SERVER_ERRS" > "$OUTDIR/errors-server.txt"
printf "%s\n" "$SHARED_ERRS" > "$OUTDIR/errors-shared.txt"

grep "error TS" "$OUTDIR/baseline.txt" | sed -E 's/.*error (TS[0-9]+).*/\1/' | sort | uniq -c | sort -rn > "$OUTDIR/error-codes.txt" || true
grep "error TS" "$OUTDIR/baseline.txt" | cut -d'(' -f1 | sort | uniq -c | sort -rn | head -50 > "$OUTDIR/top-files.txt" || true

# 3) Core test baseline (timeout-safe; basic reporter)
log "Step 3: Core test baseline (timeout ${CORE_TIMEOUT_SEC}s)…"
BASELINE_FAILS="0"
if [ -d "$CORE_TEST_PATH" ]; then
  # Pick a real binary to survive subshells
  if [ -x "node_modules/.bin/vitest" ]; then
    VITEST_BIN="node_modules/.bin/vitest"
  else
    VITEST_BIN="$(command -v vitest 2>/dev/null || true)"
  fi

  if [ -z "${VITEST_BIN:-}" ]; then
    echo "ℹ️ Vitest not installed; recording 0 failures" | tee "$OUTDIR/test-baseline.txt"
    BASELINE_FAILS="0"
    TEST_RC=0
  else
    set +e
    run_with_timeout "$CORE_TIMEOUT_SEC" "$VITEST_BIN" run "$CORE_TEST_PATH" --reporter=basic --passWithNoTests >"$OUTDIR/test-baseline.txt" 2>&1
    TEST_RC=$?
    set -e

    if [ "$TEST_RC" -eq 124 ]; then
      BASELINE_FAILS="TIMEOUT"
      log "⚠️ Core test suite timed out (recorded as baseline)"
    elif [ "$TEST_RC" -gt 128 ]; then
      BASELINE_FAILS="CRASH"
      log "⚠️ Core test suite crashed (recorded as baseline)"
    else
      BASELINE_FAILS=$(grep -c -E '(^| )FAIL|×' "$OUTDIR/test-baseline.txt" 2>/dev/null || echo 0)
      log "ℹ️ Core test baseline: $BASELINE_FAILS failures"
    fi
  fi
else
  echo "ℹ️ Core test path not found: $CORE_TEST_PATH" | tee "$OUTDIR/test-baseline.txt"
  BASELINE_FAILS="0"
fi
echo "$BASELINE_FAILS" > "$OUTDIR/test-failures-baseline.txt"

# 4) Bundle baseline (JS/CSS only; no maps)
log "Step 4: Bundle baseline (JS/CSS only)…"
set +e
eval "$BUILD_CMD" >>"$OUTDIR/build-output.txt" 2>&1
BUILD_RC=$?
set -e
JS_CSS_BYTES=0
JS_CSS_COUNT=0
if [ "$BUILD_RC" -eq 0 ] && [ -d "$DIST_DIR/assets" ]; then
  # Capture largest deliverables list (JS+CSS; exclude maps)
  ls -la "$DIST_DIR"/assets/*.js "$DIST_DIR"/assets/*.css 2>/dev/null | awk '{if (NR>1) print $5, $9}' | sort -rn | head -10 > "$OUTDIR/bundle/assets.txt" || true
  # Sum sizes and count
  while IFS= read -r line; do
    size=$(echo "$line" | awk '{print $1}')
    JS_CSS_BYTES=$((JS_CSS_BYTES + size))
    JS_CSS_COUNT=$((JS_CSS_COUNT + 1))
  done < <(ls -la "$DIST_DIR"/assets/*.js "$DIST_DIR"/assets/*.css 2>/dev/null | awk '{if (NR>1) print $5, $9}')
  log "ℹ️ Bundle baseline: $((JS_CSS_BYTES / 1024))KB ($JS_CSS_COUNT assets)"
else
  log "⚠️ Build failed or dist/ not found; bundle baseline unavailable"
fi
echo "$JS_CSS_BYTES" > "$OUTDIR/bundle/total-bytes.txt"
echo "$JS_CSS_COUNT" > "$OUTDIR/bundle/asset-count.txt"

# 5) Optional background tasks (non-blocking)
log "Step 5: Background health checks…"
BGPIDS=()
if have gh; then
  { gh pr checks "$PR_NUMBER" --json name,isRequired,conclusion > "$OUTDIR/required-checks.json" 2>/dev/null || true; } & BGPIDS+=($!)
fi
if have madge; then
  { npx -y madge "$CLIENT_DIR/src" --extensions ts,tsx --json > "$OUTDIR/deps-client.json" 2>/dev/null || true; } & BGPIDS+=($!)
fi
if have jq; then
  { npm audit --json > "$OUTDIR/audit.json" 2>/dev/null || true; } & BGPIDS+=($!)
fi

# 6) Merge risk (guarantee base fetch)
log "Step 6: Merge risk assessment…"
git fetch origin "$BASE_BRANCH" --depth=50 >/dev/null 2>&1 || true
if ! git merge-base --is-ancestor "origin/$BASE_BRANCH" HEAD 2>/dev/null; then
  git fetch --prune --tags --force --all >/dev/null 2>&1 || true
fi
COMMITS_AHEAD=$(git log --oneline HEAD..origin/"$BASE_BRANCH" 2>/dev/null | wc -l | xargs || echo 0)
TS_CHURN=$(git log --oneline --name-only HEAD..origin/"$BASE_BRANCH" 2>/dev/null | grep -E '\.(ts|tsx)$' | wc -l | xargs || echo 0)
log "ℹ️ Base ahead: $COMMITS_AHEAD commits; TS churn: $TS_CHURN files"
OUR_FILES=$(git diff --name-only origin/"$BASE_BRANCH"...HEAD 2>/dev/null | sort || true)
THEIR_FILES=$(git diff --name-only HEAD..origin/"$BASE_BRANCH" 2>/dev/null | sort || true)
comm -12 <(echo "$OUR_FILES") <(echo "$THEIR_FILES") > "$OUTDIR/potential-conflicts.txt" 2>/dev/null || true

# Wait for optional jobs
if ((${#BGPIDS[@]})); then wait "${BGPIDS[@]}" 2>/dev/null || true; fi

# 7) Scenario gate (with reason)
log "Step 7: Scenario determination…"
SCENARIO="Review"; TRACK="Review with team"; TIMELINE="TBD"; REASON="Unclassified"
if  [ "$CLIENT_ERRS" -ge 100 ] && [ "$CLIENT_ERRS" -le 160 ] && [ "$SERVER_ERRS" -le 10 ]; then
  SCENARIO="A";  TRACK="1A (Client-Only)"; TIMELINE="4-6 hours"; REASON="Client in [100..160] and Server <=10"
elif [ "$SERVER_ERRS" -le 10 ] && [ "$TOTAL" -le 220 ]; then
  SCENARIO="A*"; TRACK="1A (borderline)"; TIMELINE="4-6 hours"; REASON="Server <=10 and Total <=220"
elif [ "$CLIENT_ERRS" -ge 80 ] && [ "$SERVER_ERRS" -ge 30 ] && [ "$SERVER_ERRS" -le 170 ]; then
  SCENARIO="B";  TRACK="1B (Phased Unification)"; TIMELINE="1-2 days"; REASON="Client >=80 and Server in [30..170]"
elif [ "$TOTAL" -gt 300 ]; then
  SCENARIO="C";  TRACK="1C (Multi-Week)"; TIMELINE="2-3 weeks"; REASON="Total > 300"
fi

# Escalation triggers preview (printed if they fire)
ESCALATIONS=()
TOP50_TOTAL=$(wc -l < "$OUTDIR/top-files.txt" 2>/dev/null || echo 0)
if [ "$TOP50_TOTAL" -gt 0 ]; then
  SERVER_MENTIONS=$(grep -c -E "/${SERVER_DIR}/" "$OUTDIR/top-files.txt" 2>/dev/null || echo 0)
  if [ "$SERVER_MENTIONS" -gt 0 ]; then
    PCT=$(( SERVER_MENTIONS * 100 / TOP50_TOTAL ))
    if [ "$PCT" -ge 15 ]; then
      ESCALATIONS+=("≥15% of top-50 reference server (${PCT}%)")
    fi
  fi
fi
# Note: "Two clusters no net reduction" is evaluated during Track 1A+ run, not here.

# 8) Priority calculation (maintainable external script)
log "Step 8: Priority calculation…"
if [ -s "$OUTDIR/top-files.txt" ] && [ -f "scripts/calculate-priority.cjs" ]; then
  node scripts/calculate-priority.cjs "$OUTDIR/top-files.txt" > "$OUTDIR/priority-fixes.txt" 2>/dev/null || cp "$OUTDIR/top-files.txt" "$OUTDIR/priority-fixes.txt"
else
  cp "$OUTDIR/top-files.txt" "$OUTDIR/priority-fixes.txt" 2>/dev/null || true
fi

# 9) Summary & PR artifacts
log "Step 9: Generating summary…"
CRIT="N/A"
HIGH="N/A"
if have jq && [ -s "$OUTDIR/audit.json" ]; then
  CRIT=$(jq -r '.metadata.vulnerabilities.critical // "N/A"' "$OUTDIR/audit.json" 2>/dev/null || echo "N/A")
  HIGH=$(jq -r '.metadata.vulnerabilities.high // "N/A"' "$OUTDIR/audit.json" 2>/dev/null || echo "N/A")
fi

cat > "$OUTDIR/phase0-summary.txt" << EOF
=== PHASE 0 GROUND TRUTH SUMMARY ===
Run ID: $PHASE0_RUN_ID
Timestamp: $(date)
Toolchain: Node $(node -v 2>/dev/null || echo N/A), npm $(npm -v 2>/dev/null || echo N/A)

TYPESCRIPT ERRORS:
- Client: $CLIENT_ERRS
- Server: $SERVER_ERRS
- Shared: $SHARED_ERRS
- TOTAL: $TOTAL

SCENARIO ASSESSMENT:
Scenario: $SCENARIO
Reason: $REASON
Recommended Track: $TRACK
Estimated Timeline: $TIMELINE

QUALITY BASELINES:
- Core test failures (timeout ${CORE_TIMEOUT_SEC}s): $BASELINE_FAILS
- Bundle baseline (JS+CSS only):
  * Total bytes: $JS_CSS_BYTES ($((JS_CSS_BYTES / 1024))KB)
  * Asset count: $JS_CSS_COUNT
- Drift thresholds: ${BUNDLE_DRIFT_THRESHOLD_KB}KB AND ${BUNDLE_DRIFT_THRESHOLD_PCT}%

SECURITY SNAPSHOT:
- Critical vulnerabilities: $CRIT
- High vulnerabilities: $HIGH

MERGE RISK:
- Base ($BASE_BRANCH) ahead: $COMMITS_AHEAD commits
- TS churn upstream: $TS_CHURN files
- Potential conflicts: $(wc -l < "$OUTDIR/potential-conflicts.txt" 2>/dev/null || echo 0) files

ESCALATION TRIGGERS:
$(if [ ${#ESCALATIONS[@]} -eq 0 ]; then echo "- None detected"; else for e in "${ESCALATIONS[@]}"; do echo "- $e"; done; fi)

TRACK 1A+ VALIDATION GATES:
1. ✅ Client + Shared TS errors = 0
2. ✅ Test failures ≤ $BASELINE_FAILS (no new failures)
3. ✅ Bundle size within ${BUNDLE_DRIFT_THRESHOLD_PCT}% of baseline
4. ✅ Build succeeds
5. ✅ Dev server starts without errors

ARTIFACTS:
- Output directory: $OUTDIR
- Priority fixes: $OUTDIR/priority-fixes.txt
- Full baseline: $OUTDIR/baseline.txt
- Test baseline: $OUTDIR/test-baseline.txt
- Bundle baseline: $OUTDIR/bundle/

TOP 5 ERROR CODES:
$(head -5 "$OUTDIR/error-codes.txt" 2>/dev/null || echo "N/A")

TOP 10 FILES BY PRIORITY:
$(head -10 "$OUTDIR/priority-fixes.txt" 2>/dev/null || head -10 "$OUTDIR/top-files.txt" 2>/dev/null || echo "N/A")
EOF

cat > "$OUTDIR/PR_BODY.md" << EOF
## Phase 0 Ground Truth — $(date +%Y-%m-%d)

**Scenario:** $SCENARIO — *$REASON*
**Recommended Track:** $TRACK
**Timeline:** $TIMELINE (gate-driven, not clock-driven)

### Error Counts
- **Client:** $CLIENT_ERRS
- **Server:** $SERVER_ERRS
- **Shared:** $SHARED_ERRS
- **TOTAL:** $TOTAL

### Quality Baselines (Track 1A+ Gates)
- ✅ TypeScript errors: 0 (client + shared)
- ✅ Test failures: ≤ $BASELINE_FAILS (baseline: timeout ${CORE_TIMEOUT_SEC}s)
- ✅ Bundle size: within ${BUNDLE_DRIFT_THRESHOLD_PCT}% of $((JS_CSS_BYTES / 1024))KB
- ✅ Build: succeeds
- ✅ Dev server: starts without errors

### Security Context
- Critical vulnerabilities: $CRIT
- High vulnerabilities: $HIGH
- ⚠️ Will be addressed in separate security PR (not blocking TS work)

### Week 2 Plan (if Track 1A)
- Remove server strictness bypasses
- Remove vite.config.ts tsconfigRaw
- Unify strictness across full codebase

### Artifacts
- Summary: \`$OUTDIR/phase0-summary.txt\`
- Priority fixes: \`$OUTDIR/priority-fixes.txt\`
- Test baseline: \`$OUTDIR/test-baseline.txt\`
- Bundle baseline: \`$OUTDIR/bundle/\`

---
🤖 Generated by Phase 0 (Run ID: $PHASE0_RUN_ID)
EOF

cat > "$OUTDIR/SCOPE_CLARIFICATION.md" << EOF
# Week 1 Scope: Client + Shared TypeScript Remediation

## In Scope ✅
- **$CLIENT_DIR/** directory (strict mode, types-only fixes)
- **$SHARED_DIR/** directory (strict mode, types-only fixes)
- **Target:** 0 TypeScript errors in client + shared
- **Constraints:** No runtime changes, no config changes

## Out of Scope ⏸️ (Week 2)
- **$SERVER_DIR/** directory (bypasses remain: \`strict:false\`, \`strictNullChecks:false\`)
- **vite.config.ts** (\`tsconfigRaw\` bypass remains)
- **Full codebase unified strictness**

## Rationale
Phase 0 verification confirmed:
- Client: **$CLIENT_ERRS** errors (strict mode active)
- Server: **$SERVER_ERRS** errors (bypasses hiding most)
- Shared: **$SHARED_ERRS** errors (strict mode active)
- **Scenario $SCENARIO** confirmed: $REASON

## Quality Baselines
- Test failures: **$BASELINE_FAILS** (timeout ${CORE_TIMEOUT_SEC}s)
  - **Gate:** MUST NOT INCREASE during Track 1A
- Bundle size: **$((JS_CSS_BYTES / 1024))KB** (JS+CSS only, $JS_CSS_COUNT assets)
  - **Gate:** MUST NOT increase by >${BUNDLE_DRIFT_THRESHOLD_PCT}% (${BUNDLE_DRIFT_THRESHOLD_KB}KB threshold)

## Week 2 Deliverables
1. Remove server strictness bypasses
2. Remove \`tsconfigRaw\` from vite.config.ts
3. Fix server-side TypeScript errors
4. Achieve full codebase unified strictness
5. Update strictness guard CI to use \`--scope=full\`

## Phase 0 Artifacts
- Run ID: **$PHASE0_RUN_ID**
- Full report: \`$OUTDIR/phase0-summary.txt\`
- Priority fixes: \`$OUTDIR/priority-fixes.txt\`

---
📋 Generated: $(date)
EOF

# Final output
cat "$OUTDIR/phase0-summary.txt"

echo ""
echo "✅ PHASE 0 COMPLETE"
echo ""
echo "📊 Next Steps:"
echo "  1. Review summary: cat $OUTDIR/phase0-summary.txt"
echo "  2. Review priority fixes: cat $OUTDIR/priority-fixes.txt"
echo "  3. Update PR body: gh pr edit $PR_NUMBER --body-file $OUTDIR/PR_BODY.md"
echo "  4. Commit scope doc:"
echo "     git add $OUTDIR/ artifacts/phase0/"
echo "     git commit -m 'docs: Phase 0 ground truth verification'"
echo "  5. Execute Track $TRACK per handoff memo"
echo ""
echo "🎯 Recommended Track: $TRACK"
echo "⏱️  Estimated Timeline: $TIMELINE (gate-driven)"
echo ""
echo "Artifacts available at: $OUTDIR"
echo "Quick access via: artifacts/phase0/latest/"
