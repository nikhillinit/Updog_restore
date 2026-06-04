#!/usr/bin/env bash
set -euo pipefail

START_TIME=$(date +%s)

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

node scripts/pre-push.mjs "$@"

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
echo "Total time: ${DURATION}s"
echo "All checks passed."
