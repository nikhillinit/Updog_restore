#!/usr/bin/env bash
# scripts/verify-lockfile.sh - Comprehensive lockfile validation
set -euo pipefail

# 1. Lockfile must exist and be non-empty
[ -s package-lock.json ] || { echo "❌ Lockfile missing"; exit 1; }

# 2. Lockfile must match package.json (integrity check)
npm ci --ignore-scripts --prefer-offline >/dev/null || {
  echo "❌ Lockfile out of sync with package.json"
  exit 1
}

# 3. Catch phantom vite version (the exact bug we fixed)
if grep -q '"node_modules/vite"' package-lock.json; then
  if grep -q '"version": "5\.4\.20"' package-lock.json; then
    echo "❌ Lockfile references non-existent vite@5.4.20"
    exit 1
  fi
fi

# 4. Verify required devDeps resolve with version checks
node scripts/doctor.js || exit 1

echo "✅ Lockfile verified; required devDeps present"
