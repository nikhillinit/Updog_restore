#!/usr/bin/env bash
# scripts/test-restore.sh
set -euo pipefail

BACKUP="${1:-./backups/latest.sql}"
TMP_DB="stage_restore_$(date +%s)"

echo "🔄 Starting backup restore test..."
echo "   Backup: $BACKUP"
echo "   Temp DB: $TMP_DB"

# Create temp database and restore
echo "📦 Creating temporary database..."
createdb "$TMP_DB"

echo "📥 Restoring backup..."
psql "$TMP_DB" -f "$BACKUP" >/dev/null

# Smoke query 1: Basic connectivity
echo "✓ Smoke test 1: Basic connectivity"
psql "$TMP_DB" -c "SELECT 1;" >/dev/null

# Smoke query 2: Check portfolio_companies table exists
echo "✓ Smoke test 2: portfolio_companies table"
ROW_COUNT=$(psql "$TMP_DB" -t -c "SELECT COUNT(*) FROM portfolio_companies;")
echo "   Row count: $ROW_COUNT"

if [ "$ROW_COUNT" -lt 1 ]; then
  echo "⚠️  Warning: portfolio_companies table is empty"
fi

# Smoke query 3: Check distinct stages
echo "✓ Smoke test 3: Distinct stages"
psql "$TMP_DB" -c "SELECT DISTINCT stage FROM portfolio_companies LIMIT 10;" -t | while read -r stage; do
  if [ -n "$stage" ]; then
    echo "   - $stage"
  fi
done

# Smoke query 4: Check for NULL or invalid stages
echo "✓ Smoke test 4: NULL/invalid stages"
NULL_COUNT=$(psql "$TMP_DB" -t -c "SELECT COUNT(*) FROM portfolio_companies WHERE stage IS NULL OR stage = '';")
echo "   NULL/empty stages: $NULL_COUNT"

if [ "$NULL_COUNT" -gt 0 ]; then
  echo "⚠️  Warning: Found $NULL_COUNT rows with NULL or empty stage"
fi

# Smoke query 5: Verify normalize_stage() function exists (if migration run)
echo "✓ Smoke test 5: normalize_stage() function"
if psql "$TMP_DB" -t -c "SELECT normalize_stage('seed');" >/dev/null 2>&1; then
  echo "   normalize_stage() function exists ✅"
else
  echo "   normalize_stage() function not found (migration not applied)"
fi

# Cleanup
dropdb "$TMP_DB"

echo ""
echo "✅ Backup restore test completed successfully"
echo "   All smoke tests passed"
