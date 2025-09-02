#!/bin/bash
################################################################################
# 🔧  AUTOMATION‑HARDENING HOT‑FIX  (NOW 🟢)  –  FULLY HANDS‑FREE
################################################################################
set -euo pipefail

echo '🌱  Creating hot‑fix branch'
git switch -c automation-hardening-hotfix

###############################################################################
# 1. Rollback safety tag
###############################################################################
tag="pre-auto-hardening-$(date +%y%m%d-%H%M)"
git tag -a "$tag" -m 'Rollback point before hot‑fix'
echo "✅  Created rollback tag: $tag"

###############################################################################
# 2. CI minutes guard patch (billing API)
###############################################################################
apply_guard() {
  local file='.github/workflows/migration-orchestrator.yml'
  echo "🔧  Patching CI minutes guard in $file"
  
  # Check if the old pattern exists
  if grep -q 'included_minutes - .total_minutes_used' "$file"; then
    echo "  ℹ️  CI minutes guard already uses correct API"
    return 0
  fi
  
  # Apply the fix if needed
  if grep -q 'settings/billing/actions' "$file"; then
    sed -i.bak 's/--jq '\''.*included_minutes.*'\''/--jq '\''.included_minutes - .total_minutes_used'\''/' "$file"
    echo "  ✅  Updated billing API query"
  fi
}
apply_guard

###############################################################################
# 3. Gist back‑off [skip ci] injection
###############################################################################
apply_skip_ci() {
  local file='.github/workflows/migration-orchestrator.yml'
  echo "🔧  Adding [skip ci] to gist fallback commits"
  
  # Check if [skip ci] already exists in the fallback commit
  if grep -q 'chore: migration progress.*\[skip ci\]' "$file"; then
    echo "  ℹ️  [skip ci] already present in fallback"
    return 0
  fi
  
  # Add [skip ci] to the commit message
  sed -i.bak 's/chore: migration progress \${percent}%/chore: migration progress ${percent}% [skip ci]/' "$file"
  echo "  ✅  Added [skip ci] to fallback commits"
}
apply_skip_ci

###############################################################################
# 4. Pre‑flight Slack dep grep (quiet, case‑insensitive)
###############################################################################
echo '🔧  Adding Slack dependency guard'
# First check if launch-script.sh exists, if not create it
if [ ! -f "launch-script.sh" ]; then
  echo "  📝  Creating launch-script.sh"
  cat > launch-script.sh << 'EOF'
#!/bin/bash
set -euo pipefail

# Pre-flight checks
echo "🔍  Running pre-flight checks..."
npm ls --depth=0 | grep -qi slack && { echo "❌  Slack dep found"; exit 1; } || echo "✅  Slack‑free"
npm run test:quick || { echo "❌  Quick tests failed"; exit 1; }

# Main launch sequence
echo "🚀  Launching automation..."
git checkout main && git pull
git merge --no-ff automation-hardening -m "merge: automation hardening patches"
git push origin main

# Tag release
tag="v1.3.4-auto-hardening-$(date +%y%m%d)"
git tag -a "$tag" -m "Automation guard-rails merged"
git push origin "$tag"

# Trigger orchestrator
gh workflow run migration-orchestrator.yml -F force=true

# Tail latest orchestrator run
echo "⌛  Waiting for orchestrator..."
sleep 5
gh run watch --exit-status --latest
EOF
  chmod +x launch-script.sh
else
  # Add the check if not already present
  if ! grep -q 'npm ls --depth=0.*slack' launch-script.sh; then
    sed -i.bak '/^#.*[Mm]ain.*sequence/i\
# Pre-flight checks\
echo "🔍  Running pre-flight checks..."\
npm ls --depth=0 | grep -qi slack && { echo "❌  Slack dep found"; exit 1; } || echo "✅  Slack‑free"\
npm run test:quick || { echo "❌  Quick tests failed"; exit 1; }\
' launch-script.sh
  fi
fi
echo "  ✅  Slack dependency guard added"

###############################################################################
# 5. Health‑check simplification using gh run list
###############################################################################
apply_health_loop() {
  local file='launch-script.sh'
  echo "🔧  Adding simplified health check"
  
  if grep -q 'gh run list' "$file"; then
    echo "  ℹ️  Health check already uses gh run list"
    return 0
  fi
  
  # Add health check after the watch command
  sed -i.bak '/gh run watch/a\
\
# Check final status\
echo "🔍  Checking orchestrator status..."\
gh run list --workflow "Migration Orchestrator" --limit 1 --json status,conclusion | jq -r '\''.[0] | "Status: \\(.status), Conclusion: \\(.conclusion)"'\''' "$file"
  echo "  ✅  Added simplified health check"
}
apply_health_loop

###############################################################################
# 6. Clean up backup files
###############################################################################
find . -name "*.bak" -type f -delete

###############################################################################
# 7. Show what changed
###############################################################################
echo ""
echo "📋  Summary of changes:"
git diff --stat
echo ""

###############################################################################
# 8. Commit changes
###############################################################################
git add -A
if git diff --staged --quiet; then
  echo "ℹ️  No changes to commit"
else
  git commit -m 'chore: automation hot‑fix (NOW bucket)

- Add rollback tag for easy recovery
- Fix CI minutes guard to use total billing API
- Add [skip ci] to gist fallback commits
- Add pre-flight Slack dependency check
- Simplify health check with gh run list

These are the high-priority, low-effort fixes from the NOW bucket'
  echo "✅  Changes committed"
fi

echo ""
echo "🎯  Hot-fix branch ready!"
echo "   Rollback tag: $tag"
echo ""
echo "Next steps:"
echo "1. Review changes: git diff automation-hardening"
echo "2. Push branch: git push -u origin automation-hardening-hotfix"
echo "3. Create PR: gh pr create --fill --label hotfix"
echo "4. Run launch script: ./launch-script.sh"
