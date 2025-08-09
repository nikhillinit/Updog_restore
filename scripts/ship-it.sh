#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Starting full PR workflow..."

# Run all steps with clear progress
steps=(
  "validate-pr:Validating code"
  "commit-features:Creating commits"
  "create-stacked-pr:Opening PR"
)

for step in "${steps[@]}"; do
  IFS=: read -r script desc <<< "$step"
  echo ""
  echo "▶️ $desc..."
  if ./scripts/${script}.sh "$@"; then
    echo "✅ $desc complete"
  else
    echo "❌ $desc failed"
    exit 1
  fi
done

echo ""
echo "🎉 Ready for QA!"
echo "Run: npm run dev:qa"
