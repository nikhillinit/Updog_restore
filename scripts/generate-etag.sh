#!/usr/bin/env bash
# Usage: ./scripts/generate-etag.sh <path>
set -euo pipefail
FILE="${1:?path required}"
STAMP=$(date +%s)
HASH=$(sha1sum "$FILE" 2>/dev/null | cut -c1-8 || echo "new")
echo "${STAMP}:${HASH}"
