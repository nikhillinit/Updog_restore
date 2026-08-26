#!/bin/bash
#
# CI Gate: Check for DB imports in skipped test files
#
# This prevents the anti-pattern where describe.skip files still import
# from server/db, causing pool creation at import time.
#
# Usage: ./scripts/check-db-imports-in-skipped-tests.sh
# Exit: 0 = pass, 1 = violations found
#
# See: docs/plans/option2-session-logs/task_plan.md - Phase 5

set -e

echo "[CI Gate] Checking for DB imports in skipped test files..."

# Find files with describe.skip that have STATIC top-level imports from server/db
# Pattern: ^import ... from '...server/db...' (not dynamic await import)
OFFENDERS=$(grep -rl "describe\.skip" tests/ --include="*.test.ts" 2>/dev/null | \
  xargs grep -l "^import .* from ['\"].*server/db" 2>/dev/null || true)

if [ -n "$OFFENDERS" ]; then
  echo ""
  echo "[FAIL] Found DB imports in skipped test files:"
  echo "========================================"
  echo "$OFFENDERS" | while read -r file; do
    echo "  - $file"
  done
  echo "========================================"
  echo ""
  echo "These files import from server/db but use describe.skip."
  echo "This causes pool creation at import time (ESM hoisting)."
  echo ""
  echo "Fix: Use dynamic imports inside beforeAll:"
  echo "  const describeMaybe = process.env.ENABLE_TESTS === 'true' ? describe : describe.skip;"
  echo "  describeMaybe('Suite', () => {"
  echo "    let db;"
  echo "    beforeAll(async () => {"
  echo "      const mod = await import('../../server/db');"
  echo "      db = mod.db;"
  echo "    });"
  echo "  });"
  echo ""
  echo "See: docs/plans/2026-01-13-integration-test-cleanup.md"
  exit 1
fi

echo "[PASS] No DB imports found in skipped test files"
exit 0
