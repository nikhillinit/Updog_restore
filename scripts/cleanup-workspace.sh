#!/usr/bin/env bash
set -euo pipefail

CI_MODE="${CI:-}"
AUTO_CLEAN="${CLEAN:-}"

echo "📋 Workspace Status:"
git status -s

echo -e "\n🔍 Would remove:"
git clean -nd

if [[ -n "$CI_MODE" || "$AUTO_CLEAN" == "1" ]]; then
  git clean -df
  echo "✅ Cleaned (non-interactive)"
else
  read -p "Clean these files? (y/N): " -r REPLY
  echo
  if [[ "${REPLY:-N}" =~ ^[Yy]$ ]]; then
    git clean -df
    echo "✅ Cleaned"
  fi
fi

# Auto-update .gitignore if test artifacts appear
if git status -s | grep -Eq "(playwright-report|test-results|coverage)"; then
  echo "📝 Updating .gitignore..."
  {
    echo
    echo "# Test artifacts"
    echo "playwright-report/"
    echo "playwright/.cache/"
    echo ".test-results/"
    echo "test-results/"
    echo "coverage/"
  } >> .gitignore
  git add .gitignore && git commit -m "chore: ignore test artifacts" || true
fi
