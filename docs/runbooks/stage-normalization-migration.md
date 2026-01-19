---
status: ACTIVE
last_updated: 2026-01-19
---

# Stage Normalization Migration Runbook (ADR-011)

## Overview

This runbook provides step-by-step instructions for running the Stage
Normalization v2 migration, which normalizes all historical stage data in the
database to canonical values.

**Canonical Stages:**

- `pre-seed`
- `seed`
- `series-a`
- `series-b`
- `series-c`
- `series-c+`

## Architecture

The migration uses a batch-based approach with progress tracking:

1. **Batch Planning**: Divides data into configurable batch sizes (default: 5000
   rows)
2. **Multi-Tenant**: Batches by `fund_id` if available in table schema
3. **Progress Tracking**: Uses `stage_migration_batches` table for resumability
4. **Idempotent**: Safe to re-run on already normalized data
5. **Transactional**: Each batch is processed in a transaction with rollback on
   failure
6. **Auditing**: All changes logged to `stage_normalization_log` table

## Prerequisites

1. **Database Access**: `DATABASE_URL` environment variable must be set
2. **Migration Tables**: Run these migrations first:
   - `migrations/20251030_stage_migration_tracking.sql`
   - `migrations/20251030_stage_normalization_log.sql`
3. **Backup**: Take a database snapshot before running in production
4. **Read Access**: Verify current stage values with:
   ```sql
   SELECT DISTINCT stage, COUNT(*)
   FROM portfoliocompanies
   GROUP BY stage
   ORDER BY stage;
   ```

## Migration Process

### Step 1: Dry-Run (Required)

Always start with a dry-run to see what will change:

```bash
# Full dry-run
npm run db:normalize-stages:dry-run

# With custom batch size
npx tsx scripts/normalize-stages-v2.ts --dry-run --batch-size 1000

# Test on single fund
npx tsx scripts/normalize-stages-v2.ts --dry-run --fund-id 123

# Test on single table
npx tsx scripts/normalize-stages-v2.ts --dry-run --table portfoliocompanies
```

**Review Output:**

- Number of batches planned
- Estimated rows to update
- Sample of changes (before → after)

### Step 2: Run Migration (Production)

After reviewing dry-run output:

```bash
# Standard production run
npm run db:normalize-stages

# With smaller batches and longer sleep (safer for production)
npx tsx scripts/normalize-stages-v2.ts --batch-size 1000 --sleep-ms 500

# Process only one table
npx tsx scripts/normalize-stages-v2.ts --table portfoliocompanies
```

**Monitor Progress:**

Query the `stage_migration_batches` table to track progress:

```sql
-- Overall progress
SELECT * FROM stage_migration_progress;

-- Per-fund progress (if multi-tenant)
SELECT * FROM stage_migration_progress_by_fund;

-- Failed batches (if any)
SELECT * FROM stage_migration_failures;
```

**Expected Output:**

```
[INFO] Starting migration script...
[INFO] Creating batch plans...
[INFO] Created 15 batch plans
[INFO] Recording batch plans in stage_migration_batches...
[INFO] Processing batch 1/15...
[INFO] Batch 1 completed {"rowsUpdated":4850,"rowsSkipped":150,"rowsFailed":0,"durationMs":1245}
[INFO] Sleeping 100ms before next batch...
...
[INFO] Migration completed {"totalBatches":15,"completedBatches":15,"failedBatches":0,...}
```

### Step 3: Resume Failed Migration (If Needed)

If migration fails partway through:

```bash
# Resume from last incomplete batch
npm run db:normalize-stages:resume

# Or with explicit flag
npx tsx scripts/normalize-stages-v2.ts --resume
```

The script will:

1. Query `stage_migration_batches` for incomplete batches
2. Process only pending/failed batches
3. Skip already completed batches

### Step 4: Verification (Required)

After migration completes, run comprehensive verification:

```bash
# Standard verification
npm run db:verify-migration

# Strict mode (fail on warnings)
npm run db:verify-migration:strict

# Generate JSON report
npx tsx scripts/verify-migration-integrity.ts --output migration-report.json

# Verify specific fund
npx tsx scripts/verify-migration-integrity.ts --fund-id 123 --sample-size 500
```

**Verification Checks:**

1. **Batch Tracking**: All batches completed successfully
2. **Canonical Validation**: All stage values are canonical
3. **NULL Integrity**: No new NULLs introduced
4. **Row Count Verification**: Total rows match before/after
5. **Audit Log Consistency**: All changes logged correctly
6. **Sample Inspection**: Random sample for manual review
7. **Per-Fund Breakdown**: Statistics by fund (if multi-tenant)

**Expected Output:**

```
================================================================================
VERIFICATION REPORT
================================================================================

SUMMARY:
  Total Checks: 7
  Passed: 7
  Failed: 0
  Warnings: 0

CHECKS:
  ✓ Batch Tracking: All batches completed successfully (15 total)
  ✓ Canonical Stage Validation: All stage values are canonical
  ✓ NULL Integrity Check: No unexpected NULL values found
  ✓ Row Count Verification: Row counts verified
  ✓ Audit Log Consistency: Audit log matches actual data
  ✓ Sample Inspection: Retrieved 100 random samples for manual review
  ✓ Per-Fund Breakdown: Generated breakdown for 5 fund(s)

================================================================================
```

## Rollback Procedure

If verification fails or issues are detected:

### 1. Identify Affected Rows

```sql
-- Get all changes from this migration run
SELECT table_name, row_id, stage_before, stage_after, run_at
FROM stage_normalization_log
WHERE run_at > '2025-10-30 00:00:00+00'  -- Adjust timestamp
ORDER BY run_at DESC;
```

### 2. Rollback Specific Tables

```sql
-- Rollback portfoliocompanies
UPDATE portfoliocompanies p
SET stage = l.stage_before
FROM stage_normalization_log l
WHERE l.table_name = 'portfoliocompanies'
  AND l.row_id = p.id::text
  AND l.run_at > '2025-10-30 00:00:00+00';  -- Adjust timestamp

-- Rollback deal_opportunities
UPDATE deal_opportunities d
SET stage = l.stage_before
FROM stage_normalization_log l
WHERE l.table_name = 'deal_opportunities'
  AND l.row_id = d.id::text
  AND l.run_at > '2025-10-30 00:00:00+00';  -- Adjust timestamp
```

### 3. Clear Migration Tracking

```sql
-- Clear failed batches to allow re-run
DELETE FROM stage_migration_batches
WHERE status IN ('failed', 'pending')
  AND created_at > '2025-10-30 00:00:00+00';  -- Adjust timestamp
```

### 4. Re-run Migration

After rollback, fix issues and re-run:

```bash
npm run db:normalize-stages:dry-run  # Verify changes
npm run db:normalize-stages          # Re-run migration
npm run db:verify-migration          # Verify again
```

## Troubleshooting

### Issue: Unknown Stages Found

**Symptom:**

```
[WARN] Found 3 unknown stage(s): late stage, growth, expansion
```

**Resolution:**

1. Review unknown stages in audit log
2. Decide if they should be:
   - Mapped to canonical stages (update `shared/schemas/investment-stages.ts`)
   - Manually fixed in database before migration
   - Left as-is and skipped during migration

### Issue: Batch Failures

**Symptom:**

```
[ERROR] Batch 5 failed: database connection lost
```

**Resolution:**

1. Check database connectivity
2. Review failed batch details:
   ```sql
   SELECT * FROM stage_migration_failures;
   ```
3. Resume migration:
   ```bash
   npm run db:normalize-stages:resume
   ```

### Issue: High Replica Lag

**Symptom:** Replica databases falling behind during migration

**Resolution:**

1. Increase sleep time between batches:
   ```bash
   npx tsx scripts/normalize-stages-v2.ts --sleep-ms 1000
   ```
2. Reduce batch size:
   ```bash
   npx tsx scripts/normalize-stages-v2.ts --batch-size 1000
   ```

### Issue: Verification Failures

**Symptom:**

```
[ERROR] Verification FAILED: One or more checks failed
```

**Resolution:**

1. Review verification report for specific failures
2. Check recommendations section
3. Query affected rows:
   ```sql
   -- Find non-canonical stages
   SELECT DISTINCT stage
   FROM portfoliocompanies
   WHERE LOWER(stage) NOT IN ('pre-seed', 'seed', 'series-a', 'series-b', 'series-c', 'series-c+');
   ```
4. Re-run migration on specific fund/table:
   ```bash
   npx tsx scripts/normalize-stages-v2.ts --fund-id 123
   ```

## Performance Considerations

### Batch Size Tuning

- **Small Batches (1000-2000)**: Safer for production, lower replica lag, longer
  runtime
- **Medium Batches (5000)**: Balanced (default)
- **Large Batches (10000+)**: Faster but higher replica lag risk

### Sleep Time Tuning

- **0ms**: No delay, fastest but highest replica lag
- **100ms**: Balanced (default)
- **500-1000ms**: Safer for production with active replicas

### Recommended Production Settings

```bash
# Conservative (safest)
npx tsx scripts/normalize-stages-v2.ts --batch-size 1000 --sleep-ms 500

# Balanced (default)
npx tsx scripts/normalize-stages-v2.ts --batch-size 5000 --sleep-ms 100

# Aggressive (fastest, use during maintenance window)
npx tsx scripts/normalize-stages-v2.ts --batch-size 10000 --sleep-ms 0
```

## Monitoring

### Real-Time Progress

```sql
-- Current progress
SELECT * FROM stage_migration_progress;

-- Last 10 completed batches
SELECT batch_id, fund_id, rows_updated, rows_skipped, rows_failed, duration_ms
FROM stage_migration_batches
WHERE status = 'completed'
ORDER BY completed_at DESC
LIMIT 10;
```

### Estimated Time Remaining

```sql
SELECT
  estimated_minutes_remaining,
  completion_percent,
  pending_batches
FROM stage_migration_progress;
```

## Post-Migration Checklist

- [ ] Dry-run completed and reviewed
- [ ] Migration completed successfully (no failed batches)
- [ ] Verification passed all checks
- [ ] Sample inspection reviewed
- [ ] Production validation (spot-check UI)
- [ ] Replica lag returned to normal
- [ ] Migration report archived
- [ ] Batch tracking data retained for audit
- [ ] Audit log data retained for compliance

## References

- **ADR-011**: Stage Normalization v2 architecture decision
- **Migration Tracking Schema**:
  `migrations/20251030_stage_migration_tracking.sql`
- **Audit Log Schema**: `migrations/20251030_stage_normalization_log.sql`
- **Normalization Logic**: `shared/schemas/investment-stages.ts`
- **Migration Script**: `scripts/normalize-stages-v2.ts`
- **Verification Script**: `scripts/verify-migration-integrity.ts`

## Support

For issues or questions:

1. Review this runbook
2. Check verification report for recommendations
3. Query audit logs for change history
4. Consult ADR-011 for architecture details
5. Contact database administrator if rollback needed
