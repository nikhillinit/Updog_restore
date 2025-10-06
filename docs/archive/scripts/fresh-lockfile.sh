#!/usr/bin/env bash
# FRESH Path: Regenerate lockfile when package.json changed
set -euo pipefail

echo "🆕 Regenerating package-lock.json (package.json changed)..."

# Regenerate lockfile without downloading deps
npm install --package-lock-only

echo "📋 Lockfile changes preview (first 120 lines):"
echo "---"

# Spot-check deltas
git diff -- package-lock.json | sed -n '1,120p' || echo "(No git diff available)"

echo "---"
echo ""
echo "📦 Installing dependencies from new lockfile..."

# Deterministic install from new lockfile
npm ci

echo "🔒 Checking for production vulnerabilities..."

# Check for prod vulnerabilities (dev vulns handled separately)
npm audit --omit=dev --audit-level=high || echo "⚠️  Vulnerabilities found - review needed"

echo "✅ Testing installation..."

# Verify
npm test -- --run || echo "⚠️  Tests failed - may need investigation"

# Update pointer
git rev-parse HEAD > .lockfile-pointer

echo ""
echo "✅ FRESH complete - new deterministic baseline established"
echo "📝 Review lockfile changes above and commit if acceptable"
