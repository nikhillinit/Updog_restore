#!/bin/bash
# Script to verify all GitHub Actions are pinned to SHAs

set -euo pipefail

echo "🔍 Checking for unpinned GitHub Actions..."

unpinned=$(grep -r "uses:" .github/workflows/*.yml \
  | grep -v "@[a-f0-9]\{40\}" \
  | grep -v "step-security/harden-runner" || true)

if [ -n "$unpinned" ]; then
  echo "❌ Found unpinned actions:"
  echo "$unpinned"
  exit 1
else
  echo "✅ All actions are pinned to commit SHAs"
fi
