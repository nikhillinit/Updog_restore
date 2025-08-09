#!/usr/bin/env bash
set -euo pipefail

START_TIME=$(date +%s)

# Run preflight
./scripts/preflight.sh

echo "🧹 Cleaning workspace..."
./scripts/cleanup-workspace.sh

echo "📦 Installing dependencies..."
npm ci --prefer-offline --no-audit

echo "🧪 Running tests..."
if npm run test:all; then
  echo "✅ Tests passed"
else
  echo "❌ Tests failed - check output above"
  exit 1
fi

echo "🏗️ Building..."
if npm run build; then
  echo "✅ Build succeeded"
else
  echo "❌ Build failed"
  exit 1
fi

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
echo "⏱️ Total time: ${DURATION}s"
echo "✅ All checks passed!"
