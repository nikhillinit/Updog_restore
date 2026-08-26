#!/usr/bin/env bash
# -------------------------------------------------------------
# Pre-migration readiness check
# -------------------------------------------------------------
set -euo pipefail

echo "🔍 Pre-Migration Readiness Check"
echo "================================"

READY=true

# Check 1: Performance budget exists
if [ ! -f ".perf-budget.json" ]; then
  echo "❌ Missing .perf-budget.json"
  READY=false
else
  echo "✅ Performance budget configured"
fi

# Check 2: resilientLimit utility exists
if [ ! -f "client/src/utils/resilientLimit.ts" ]; then
  echo "❌ Missing resilientLimit.ts"
  READY=false
else
  echo "✅ Circuit breaker utility ready"
fi

# Check 3: Guardian workflow exists
if [ ! -f ".github/workflows/guardian.yml" ]; then
  echo "❌ Missing Guardian workflow"
  READY=false
else
  echo "✅ Guardian workflow configured"
fi

# Check 4: GitHub CLI authentication
if gh auth status >/dev/null 2>&1; then
  echo "✅ GitHub CLI authenticated"
else
  echo "❌ GitHub CLI not authenticated (run: gh auth login)"
  READY=false
fi

# Check 5: Metrics counter available
if ! grep -q "asyncRepl" server/metrics.ts 2>/dev/null; then
  echo "❌ Missing async_foreach_replacements_total counter"
  READY=false
else
  echo "✅ Metrics counter configured"
fi

# Check 6: Scripts are executable
SCRIPTS=("graduated-stress.sh" "bench-async.js" "stress-summary.sh" "update-perf-budget.js")
for script in "${SCRIPTS[@]}"; do
  if [ ! -x "scripts/$script" ]; then
    echo "⚠️  $script not executable (run: git update-index --chmod=+x scripts/$script)"
  fi
done

# Check 7: Clean working tree
if [ -n "$(git status --porcelain)" ]; then
  echo "⚠️  Uncommitted changes detected - commit or stash first"
  READY=false
else
  echo "✅ Working tree clean"
fi

echo ""
if [ "$READY" = true ]; then
  echo "✅ READY for migration PR!"
  echo ""
  echo "Next steps:"
  echo "1. git checkout -b async/fund-setup-cohort"
  echo "2. Apply resilientLimit to hot paths"
  echo "3. Test locally with: npm test tests/utils/async-iteration.test.ts"
  echo "4. Create PR with template"
else
  echo "❌ NOT READY - fix issues above first"
  exit 1
fi
