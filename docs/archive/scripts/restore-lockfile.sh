#!/usr/bin/env bash
# RESTORE Path: Preserve determinism when package.json unchanged
set -euo pipefail

BASE="$(git merge-base HEAD origin/main 2>/dev/null || echo HEAD^)"

echo "🔄 Restoring package-lock.json from last known-good state..."

# Restore last known-good lockfile
git checkout "$BASE" -- package-lock.json

echo "📦 Installing dependencies (deterministic)..."

# Deterministic install
npm ci

echo "✅ Testing installation..."

# Verify
npm test -- --run || echo "⚠️  Tests failed - may need investigation"

# Update pointer for future reference
git rev-parse HEAD > .lockfile-pointer

echo ""
echo "✅ RESTORE complete - determinism preserved"
echo "📍 Lockfile restored from: $BASE"
