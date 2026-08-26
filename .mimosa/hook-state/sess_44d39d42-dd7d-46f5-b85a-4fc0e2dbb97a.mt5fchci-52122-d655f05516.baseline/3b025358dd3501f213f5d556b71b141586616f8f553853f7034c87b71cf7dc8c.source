#!/usr/bin/env bash
# -------------------------------------------------------------
# Verify auto-rollback mechanism is working
# -------------------------------------------------------------
set -euo pipefail

echo "🔄 Rollback Mechanism Verification"
echo "=================================="

# Check for rollback branches
ROLLBACK_BRANCHES=$(git branch -r | grep -c "origin/rollback/auto-" || echo "0")
echo "Found $ROLLBACK_BRANCHES auto-rollback branches"

# Check Guardian workflow for rollback logic
if grep -q "rollback/auto-" .github/workflows/guardian.yml; then
  echo "✅ Guardian has auto-rollback logic"
else
  echo "❌ Guardian missing auto-rollback logic"
fi

# Check for rollback issues
if command -v gh &> /dev/null; then
  ROLLBACK_ISSUES=$(gh issue list --label "auto-rollback" --json number --jq '. | length')
  echo "Found $ROLLBACK_ISSUES auto-rollback issues"
else
  echo "⚠️  GitHub CLI not installed - skipping issue check"
fi

# Simulate error rate check
echo ""
echo "Simulating error rate check..."
ERROR_RATE=6  # Simulate 6% error rate (above 5% threshold)

if [ "$ERROR_RATE" -gt 5 ]; then
  echo "⚠️  ERROR_RATE=$ERROR_RATE% > 5% threshold"
  echo "   Guardian would create rollback/auto-$(date +%Y%m%d-%H%M%S)"
else
  echo "✅ ERROR_RATE=$ERROR_RATE% within threshold"
fi

echo ""
echo "To test rollback drill:"
echo "1. Create branch: git checkout -b simulate-bad-async"
echo "2. Add error to hot path: throw new Error('simulate')"
echo "3. Push and watch Guardian create rollback branch"
