#!/usr/bin/env bash
# -------------------------------------------------------------
# Emergency async migration rollback
#  • Reverts the last 2 commits with "refactor(async)" prefix
#  • Use when async migration causes issues
# -------------------------------------------------------------
set -euo pipefail

echo "🔄 Rolling back async migration commits..."

# Find and revert last 2 async commits
COMMITS=$(git log --grep="refactor(async)" -n 2 --format=%H)

if [ -z "$COMMITS" ]; then
  echo "❌ No async migration commits found"
  exit 1
fi

echo "Found commits to revert:"
git log --grep="refactor(async)" -n 2 --oneline

# Revert without edit (batch operation)
git revert --no-edit $COMMITS

echo "✅ Async migration rolled back"
echo "Run 'npm test' to verify rollback success"
