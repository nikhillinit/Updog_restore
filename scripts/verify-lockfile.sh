#!/usr/bin/env bash
set -euo pipefail

# Verify package-lock.json exists and is valid JSON
echo "[verify-lockfile] Checking package-lock.json..."

if [ ! -f "package-lock.json" ]; then
  echo "[ERROR] package-lock.json not found"
  exit 1
fi

# Verify it's valid JSON
if ! jq empty package-lock.json 2>/dev/null; then
  echo "[ERROR] package-lock.json is not valid JSON"
  exit 1
fi

# Verify lockfileVersion is present
if ! jq -e '.lockfileVersion' package-lock.json > /dev/null; then
  echo "[ERROR] package-lock.json missing lockfileVersion"
  exit 1
fi

# Verify packages exist
if ! jq -e '.packages' package-lock.json > /dev/null; then
  echo "[ERROR] package-lock.json missing packages"
  exit 1
fi

echo "[verify-lockfile] ✅ package-lock.json is valid"
