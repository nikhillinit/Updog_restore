---
status: ACTIVE
last_updated: 2026-01-19
---

# Portfolio Schema Migration - Quick Start Guide

**Status**: READY FOR EXECUTION **Risk**: LOW (zero downtime, fully reversible)
**Duration**: 5-10 minutes

---

## Pre-Flight Check (2 minutes)

```bash
# 1. Verify environment
echo $DATABASE_URL
# Should show PostgreSQL connection string

# 2. Check TypeScript compilation
npm run check:shared
# Should complete with no errors

# 3. Verify no conflicting data
psql $DATABASE_URL -c "
SELECT fund_id, idempotency_key, COUNT(*)
FROM forecast_snapshots
WHERE idempotency_key IS NOT NULL
GROUP BY fund_id, idempotency_key
HAVING COUNT(*) > 1;
"
# Should return 0 rows
```

**Expected**: All checks PASS, no duplicate keys found

---

## Execute Migration (5-10 minutes)

### Option A: Using Drizzle Kit (Recommended)

```bash
npm run db:migrate
```

### Option B: Using psql directly

```bash
psql $DATABASE_URL -f migrations/0001_portfolio_schema_hardening.sql
```

**Watch for**: NOTICE messages ending with "SUCCESS: All migration changes
verified"

---

## Post-Migration Verification (2 minutes)

```bash
# 1. Verify version column types
psql $DATABASE_URL -c "
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name IN ('forecast_snapshots', 'investment_lots', 'reserve_allocations')
  AND column_name = 'version';
"
# Expected: All rows show "bigint"

# 2. Verify indexes created
psql $DATABASE_URL -c "
SELECT tablename, indexname
FROM pg_indexes
WHERE tablename IN ('forecast_snapshots', 'investment_lots', 'reserve_allocations')
  AND (indexname LIKE '%cursor_idx' OR indexname LIKE '%idem_key_idx')
ORDER BY tablename, indexname;
"
# Expected: 6 rows (2 indexes per table)

# 3. Rebuild TypeScript types
npm run build:types

# 4. Verify TypeScript still compiles
npm run check

# 5. Start dev server (smoke test)
npm run dev:api
# Check for any errors in startup logs
```

**Expected**: All verifications PASS, application starts without errors

---

## If Something Goes Wrong

### Rollback Procedure

```bash
# Execute rollback script
psql $DATABASE_URL -f migrations/0001_portfolio_schema_hardening_ROLLBACK.sql

# Verify rollback success (check NOTICE output)

# Revert schema.ts changes
git checkout shared/schema.ts

# Rebuild types
npm run build:types

# Verify
npm run check:shared
```

**Note**: Rollback is safe only if no version values exceed 2,147,483,647

---

## Success Indicators

**Green Flags**:

- Migration SQL outputs: "SUCCESS: All migration changes verified"
- TypeScript compilation: No errors
- Application starts: No schema-related errors in logs
- psql queries: All expected indexes and constraints present

**Red Flags** (initiate rollback):

- Migration fails with ERROR
- TypeScript compilation errors after migration
- Application fails to start with schema errors
- Missing indexes or constraints in verification queries

---

## What Changed

**3 Tables Modified**:

- `forecast_snapshots`
- `investment_lots`
- `reserve_allocations`

**Per Table** (4 changes each):

1. Version: integer → bigint (overflow protection)
2. Idempotency index: Global → Scoped (proper isolation)
3. Cursor index: Added compound (timestamp DESC, id DESC)
4. Length constraint: Added (1-128 chars for idempotency_key)

**Total Changes**: 12 schema changes across 3 tables

---

## Files Modified

**Created**:

- `migrations/0001_portfolio_schema_hardening.sql` (migration)
- `migrations/0001_portfolio_schema_hardening_ROLLBACK.sql` (rollback)
- `PORTFOLIO-SCHEMA-MIGRATION-ANALYSIS.md` (detailed analysis)
- `PORTFOLIO-SCHEMA-MIGRATION-SUMMARY.md` (executive summary)
- `MIGRATION-QUICK-START.md` (this file)

**Updated**:

- `shared/schema.ts` (3 table definitions hardened)

---

## Time Budget

| Phase                       | Duration     |
| --------------------------- | ------------ |
| Pre-flight checks           | 2 min        |
| Migration execution         | 5-10 min     |
| Post-migration verification | 2 min        |
| **Total**                   | **9-14 min** |

---

## Need More Info?

**Quick reference**: PORTFOLIO-SCHEMA-MIGRATION-SUMMARY.md (executive summary)

**Deep dive**: PORTFOLIO-SCHEMA-MIGRATION-ANALYSIS.md (900+ lines, complete
analysis)

**Rollback**: migrations/0001_portfolio_schema_hardening_ROLLBACK.sql

**Anti-patterns**: cheatsheets/anti-pattern-prevention.md

---

## One-Liner Execution (For the Confident)

```bash
npm run db:migrate && npm run build:types && npm run check && echo "Migration complete!"
```

**Caution**: Only use if you've reviewed the migration SQL and understand the
changes

---

**Ready to execute? Start with Pre-Flight Check above.**
