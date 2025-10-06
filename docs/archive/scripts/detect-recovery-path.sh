#!/usr/bin/env bash
# Detection: Determine RESTORE vs FRESH recovery path
set -euo pipefail

# Use merge-base (works on forks/CI, no hardcoded SHAs)
BASE="$(git merge-base HEAD origin/main 2>/dev/null || echo HEAD^)"

if git diff --quiet "$BASE"...HEAD -- package.json; then
  echo "✅ package.json UNCHANGED → RESTORE path (preserve determinism)"
  echo "RESTORE"
else
  echo "⚠️  package.json CHANGED → FRESH path (regenerate lockfile)"
  echo "FRESH"
fi
