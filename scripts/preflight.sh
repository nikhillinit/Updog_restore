#!/usr/bin/env bash
set -euo pipefail

echo "✈️ Pre-flight checks..."

# Check required tools
for cmd in git gh npm node; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "❌ $cmd is required but not installed."; exit 1; }
done

# Check gh auth
if ! gh auth status >/dev/null 2>&1; then
  echo "❌ GitHub CLI not authenticated. Run: gh auth login"
  exit 1
fi

# Check Node version
NODE_VERSION=$(node -v | cut -d'v' -f2)
MIN_NODE="18.0.0"

if [[ -n "${CI:-}" ]]; then
  # Strict in CI
  if [[ "$(printf '%s\n' "$MIN_NODE" "$NODE_VERSION" | sort -V | head -n1)" != "$MIN_NODE" ]]; then
    echo "❌ Node >= $MIN_NODE required in CI"
    exit 1
  fi
else
  # Warn locally
  if [[ "$(printf '%s\n' "$MIN_NODE" "$NODE_VERSION" | sort -V | head -n1)" != "$MIN_NODE" ]]; then
    echo "⚠️ Node $NODE_VERSION detected, recommend >= $MIN_NODE"
  fi
fi

# Check for uncommitted changes (skip in CI)
if [[ -z "${CI:-}" ]]; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "⚠️ Uncommitted changes detected"
    read -p "Continue anyway? (y/N): " -r REPLY
    [[ "${REPLY:-N}" =~ ^[Yy]$ ]] || exit 1
  fi
fi

echo "✅ Pre-flight passed"
