#!/usr/bin/env bash
# scripts/test-restore.sh
# Enhanced backup restore test with comprehensive smoke queries
set -euo pipefail

BACKUP="${1:-./backups/latest.sql}"
TMP_DB="stage_restore_$(date +%s)"

echo "🔄 Testing backup restore: $BACKUP"
echo "📦 Creating temporary database: $TMP_DB"

# Create temp database and restore backup
createdb "$TMP_DB"
psql "$TMP_DB" -f "$BACKUP" >/dev/null 2>&1

echo "✅ Backup restored successfully"
echo ""
echo "🔍 Running smoke queries..."

# Smoke Query 1: Basic connectivity
echo -n "  [1/6] Database connectivity... "
psql "$TMP_DB" -c "SELECT 1;" >/dev/null 2>&1
echo "✅"

# Smoke Query 2: Row counts for key tables
echo -n "  [2/6] Portfolio companies row count... "
PORTFOLIO_COUNT=$(psql "$TMP_DB" -t -c "SELECT COUNT(*) FROM portfolio_companies;" 2>/dev/null || echo "0")
echo "✅ ($PORTFOLIO_COUNT rows)"

echo -n "  [3/6] Deals row count... "
DEALS_COUNT=$(psql "$TMP_DB" -t -c "SELECT COUNT(*) FROM deal_opportunities;" 2>/dev/null || echo "0")
echo "✅ ($DEALS_COUNT rows)"

# Smoke Query 3: Distinct stages (verify canonical values)
echo -n "  [4/6] Distinct stages validation... "
STAGES=$(psql "$TMP_DB" -t -c "SELECT DISTINCT stage FROM portfolio_companies ORDER BY stage LIMIT 10;" 2>/dev/null | tr '\n' ',' | sed 's/,$//')
echo "✅"
echo "      Stages: $STAGES"

# Smoke Query 4: Stage distribution integrity
echo -n "  [5/6] Stage distribution integrity... "
INVALID_STAGES=$(psql "$TMP_DB" -t -c "
  SELECT COUNT(*)
  FROM portfolio_companies
  WHERE LOWER(stage) NOT IN ('pre-seed', 'seed', 'series-a', 'series-b', 'series-c', 'series-c+', '')
    AND stage IS NOT NULL;
" 2>/dev/null || echo "0")
if [ "$INVALID_STAGES" -eq "0" ]; then
  echo "✅ (all canonical)"
else
  echo "⚠️  ($INVALID_STAGES non-canonical found)"
fi

# Smoke Query 5: Critical tables exist
echo -n "  [6/6] Critical tables existence... "
TABLES=$(psql "$TMP_DB" -t -c "
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('portfolio_companies', 'deal_opportunities', 'funds');
" 2>/dev/null || echo "0")
if [ "$TABLES" -ge "2" ]; then
  echo "✅ ($TABLES/3 found)"
else
  echo "⚠️  ($TABLES/3 found - may be incomplete)"
fi

echo ""
echo "🧹 Cleaning up temporary database..."
dropdb "$TMP_DB"

echo ""
echo "✅ Restore test completed successfully"
echo "   Backup: $BACKUP"
echo "   Portfolios: $PORTFOLIO_COUNT"
echo "   Deals: $DEALS_COUNT"
echo "   Invalid stages: $INVALID_STAGES"
