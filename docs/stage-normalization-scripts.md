# Stage Normalization Migration Scripts (ADR-011)

## Overview

Two production-ready TypeScript scripts for normalizing historical stage data in
the database. These scripts implement the Stage Normalization v2 architecture
defined in ADR-011.

## Scripts

### 1. `scripts/normalize-stages-v2.ts` - Migration Script

**Purpose**: Normalize all non-canonical stage values to their canonical forms
using batch processing.

**Key Features**:

- ✅ **Idempotent**: Safe to re-run on already normalized data
- ✅ **Batch Processing**: Configurable batch sizes (default: 5000 rows)
- ✅ **Progress Tracking**: Uses `stage_migration_batches` table for
  resumability
- ✅ **Multi-Tenant Support**: Automatically batches by `fund_id` if column
  exists
- ✅ **Canonical Validation**: Ensures all outputs are in canonical set
- ✅ **Structured Logging**: JSON or human-readable logging
- ✅ **Transaction Safety**: Each batch processed in a transaction with rollback
- ✅ **Replica-Safe**: Configurable sleep between batches to prevent lag
- ✅ **Audit Trail**: All changes logged to `stage_normalization_log` table

**Usage**:

```bash
# Dry-run (recommended first step)
npm run db:normalize-stages:dry-run

# Full migration
npm run db:normalize-stages

# Resume failed migration
npm run db:normalize-stages:resume

# Custom options
npx tsx scripts/normalize-stages-v2.ts --batch-size 1000 --sleep-ms 500 --fund-id 123
```

**CLI Options**:

| Option         | Type   | Default | Description                       |
| -------------- | ------ | ------- | --------------------------------- |
| `--batch-size` | number | 5000    | Rows per batch                    |
| `--sleep-ms`   | number | 100     | Delay between batches (ms)        |
| `--dry-run`    | flag   | false   | Log changes without applying      |
| `--fund-id`    | number | -       | Process only this fund            |
| `--table`      | string | -       | Process only this table           |
| `--resume`     | flag   | false   | Resume from last incomplete batch |
| `--force`      | flag   | false   | Skip confirmation prompts         |

**Example Output**:

```json
{
  "timestamp": "2025-10-30T12:00:00.000Z",
  "level": "info",
  "message": "Migration completed",
  "context": {
    "totalBatches": 15,
    "completedBatches": 15,
    "failedBatches": 0,
    "totalRowsUpdated": 72450,
    "totalRowsSkipped": 1250,
    "totalRowsFailed": 0,
    "durationSeconds": "45.32"
  }
}
```

**Tables Affected**:

- `portfoliocompanies` (column: `stage`)
- `deal_opportunities` (column: `stage`)

**Database Tables Used**:

- `stage_migration_batches` - Progress tracking
- `stage_normalization_log` - Audit trail

---

### 2. `scripts/verify-migration-integrity.ts` - Verification Script

**Purpose**: Comprehensive verification of migration integrity after
normalization completes.

**Key Features**:

- ✅ **8 Verification Checks**: Comprehensive data integrity validation
- ✅ **JSON Reports**: Export reports for documentation/compliance
- ✅ **Sample Inspection**: Random sampling for manual review
- ✅ **Per-Fund Analysis**: Multi-tenant statistics breakdown
- ✅ **Violation Detection**: Lists specific rows with issues
- ✅ **Recommendations**: Actionable guidance for failures
- ✅ **Strict Mode**: Optional fail-on-warnings mode

**Usage**:

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

**CLI Options**:

| Option          | Type   | Default | Description                     |
| --------------- | ------ | ------- | ------------------------------- |
| `--fund-id`     | number | -       | Verify only this fund           |
| `--sample-size` | number | 100     | Random sample count             |
| `--output`      | string | -       | Write report to JSON file       |
| `--table`       | string | -       | Verify only this table          |
| `--strict`      | flag   | false   | Fail on any warnings            |
| `--epsilon`     | number | 1e-6    | Tolerance for weight sum checks |

**Verification Checks**:

1. **Batch Tracking**: All batches completed successfully
   - Checks: incomplete batches, failed batches, total failures
   - Severity: ERROR if failures found

2. **Canonical Stage Validation**: All stage values are canonical
   - Checks: All stages in
     `['pre-seed', 'seed', 'series-a', 'series-b', 'series-c', 'series-c+']`
   - Severity: ERROR if non-canonical values found

3. **NULL Integrity Check**: No new NULLs introduced
   - Checks: NULL stages where data previously existed
   - Severity: WARNING (may be expected)

4. **Row Count Verification**: Total rows before/after match
   - Checks: Row counts, normalized counts
   - Severity: INFO (data loss detection)

5. **Audit Log Consistency**: All changes logged correctly
   - Checks: Audit log matches actual table data
   - Severity: ERROR if mismatches found

6. **Sample Inspection**: Random sample for manual review
   - Checks: Retrieves random sample of rows
   - Severity: INFO (for manual verification)

7. **Per-Fund Breakdown**: Multi-tenant statistics
   - Checks: Per-fund counts, unique stages
   - Severity: INFO (statistics only)

**Example Output**:

```
================================================================================
VERIFICATION REPORT
================================================================================

Timestamp: 2025-10-30T12:05:00.000Z

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

**JSON Report Schema**:

```typescript
interface VerificationReport {
  timestamp: string;
  summary: {
    totalChecks: number;
    passed: number;
    failed: number;
    warnings: number;
  };
  checks: Array<{
    name: string;
    passed: boolean;
    severity: 'error' | 'warning' | 'info';
    message: string;
    details?: Record<string, unknown>;
    violations?: Array<Record<string, unknown>>;
  }>;
  recommendations: string[];
  metadata: {
    databaseUrl: string; // Redacted
    fundId?: number;
    table?: string;
    sampleSize: number;
    epsilon: number;
  };
}
```

---

## Workflow

### Standard Production Workflow

```bash
# 1. Dry-run to preview changes
npm run db:normalize-stages:dry-run

# 2. Review output, then run migration
npm run db:normalize-stages

# 3. Verify migration completed successfully
npm run db:verify-migration

# 4. Generate compliance report
npx tsx scripts/verify-migration-integrity.ts --output migration-report-$(date +%Y%m%d).json
```

### Resume After Failure

```bash
# 1. Review failed batches
psql $DATABASE_URL -c "SELECT * FROM stage_migration_failures;"

# 2. Resume migration
npm run db:normalize-stages:resume

# 3. Verify again
npm run db:verify-migration
```

---

## Database Schema Dependencies

### Required Tables

Both scripts require these tables to be created first:

1. **`stage_migration_batches`** (from
   `migrations/20251030_stage_migration_tracking.sql`)
   - Tracks batch processing progress
   - Supports idempotent resumability
   - Provides real-time progress monitoring

2. **`stage_normalization_log`** (from
   `migrations/20251030_stage_normalization_log.sql`)
   - Audit trail for all changes
   - Supports rollback if needed
   - Compliance/retention logging

### Database Views

Helpful views for monitoring:

- `stage_migration_progress` - Overall progress summary
- `stage_migration_progress_by_fund` - Per-fund progress (if multi-tenant)
- `stage_migration_failures` - Failed batch details

---

## Normalization Logic

Both scripts use the same normalization logic from
`shared/schemas/investment-stages.ts`:

```typescript
import { normalizeInvestmentStage } from '@shared/schemas/investment-stages';

// Example usage
const result = normalizeInvestmentStage('Series A');
// => { ok: true, value: 'series-a' }

const failResult = normalizeInvestmentStage('late stage');
// => { ok: false, error: { kind: 'UnknownStage', original: 'late stage' } }
```

**Normalization Process**:

1. Unicode normalization (NFKD) - handles smart quotes, em-dashes, Cyrillic
2. Lowercase normalization
3. Whitespace compression
4. Explicit alias lookup
5. Return error if unknown (fail-closed)

**Supported Aliases**:

- Pre-seed: `pre-seed`, `preseed`, `pre_seed`, `pre seed`
- Seed: `seed`
- Series A: `series-a`, `series a`, `seriesa`, `series_a`
- Series B: `series-b`, `series b`, `seriesb`, `series_b`
- Series C: `series-c`, `series c`, `series_c`
- Series C+: `series-c+`, `series c+`, `seriesc+`, `series_c+`

---

## Error Handling

### Migration Script Errors

| Error                    | Severity | Resolution                                |
| ------------------------ | -------- | ----------------------------------------- |
| Unknown stages found     | ERROR    | Update alias mapping or manually fix data |
| Database connection lost | ERROR    | Resume migration with `--resume`          |
| Transaction rollback     | ERROR    | Review logs, fix issue, resume            |
| Normalization failed     | WARNING  | Logged and skipped, reported in stats     |

### Verification Script Errors

| Error                   | Severity | Resolution                               |
| ----------------------- | -------- | ---------------------------------------- |
| Non-canonical stages    | ERROR    | Re-run migration                         |
| Audit log mismatch      | ERROR    | Data corruption, investigate immediately |
| Batch tracking failures | ERROR    | Review failed batches, resume migration  |
| NULL integrity issues   | WARNING  | May be expected, review manually         |

---

## Performance Characteristics

### Migration Script

- **Batch Size Impact**:
  - 1000 rows: ~500ms/batch (safer, lower replica lag)
  - 5000 rows: ~1200ms/batch (balanced, default)
  - 10000 rows: ~2500ms/batch (faster but higher lag)

- **Sleep Time Impact**:
  - 0ms: No delay (highest replica lag risk)
  - 100ms: Minimal delay (default)
  - 500ms: Conservative (production safe)

- **Estimated Runtime**:
  - 100K rows @ 5000/batch + 100ms sleep: ~4-5 minutes
  - 1M rows @ 5000/batch + 100ms sleep: ~40-45 minutes

### Verification Script

- **Runtime**: 5-10 seconds for typical datasets
- **Sample Size Impact**: Linear with `--sample-size`
- **Per-Fund Breakdown**: Additional ~1s per fund

---

## Logging

Both scripts support structured JSON logging:

```bash
# Enable JSON logging
export LOG_FORMAT=json
npm run db:normalize-stages
```

**Log Levels**:

- `info` - Normal operation
- `warn` - Non-critical issues (skipped rows, etc.)
- `error` - Critical failures
- `debug` - Detailed diagnostic info
- `success` - Successful completion

---

## Exit Codes

Both scripts use consistent exit codes:

| Code | Meaning                                                          |
| ---- | ---------------------------------------------------------------- |
| 0    | Success (migration completed or dry-run finished)                |
| 1    | Failure (validation error, database error, or migration failure) |
| 2    | Invalid arguments                                                |

---

## Testing

### Test Migration Script

```bash
# Test on single fund with dry-run
npx tsx scripts/normalize-stages-v2.ts --dry-run --fund-id 1 --batch-size 100

# Test on single table with small batches
npx tsx scripts/normalize-stages-v2.ts --dry-run --table portfoliocompanies --batch-size 10
```

### Test Verification Script

```bash
# Test verification with small sample
npx tsx scripts/verify-migration-integrity.ts --sample-size 10 --fund-id 1

# Test strict mode
npx tsx scripts/verify-migration-integrity.ts --strict
```

---

## Compliance & Audit

Both scripts support compliance requirements:

1. **Audit Trail**: All changes logged to `stage_normalization_log`
2. **Retention**: Audit logs retained indefinitely
3. **Traceability**: Each change includes before/after values and timestamp
4. **Rollback**: Audit log supports full rollback if needed
5. **Reporting**: JSON reports exportable for compliance documentation

**Audit Query Examples**:

```sql
-- All changes in last migration
SELECT * FROM stage_normalization_log
WHERE run_at > '2025-10-30 00:00:00+00'
ORDER BY run_at DESC;

-- Summary by table
SELECT table_name, COUNT(*) as changes
FROM stage_normalization_log
GROUP BY table_name;

-- Rollback data for specific table
SELECT row_id, stage_before
FROM stage_normalization_log
WHERE table_name = 'portfoliocompanies'
  AND run_at > '2025-10-30 00:00:00+00';
```

---

## References

- **ADR-011**: Stage Normalization v2 Architecture Decision Record
- **Runbook**: `docs/runbooks/stage-normalization-migration.md`
- **Migration Tracking Schema**:
  `migrations/20251030_stage_migration_tracking.sql`
- **Audit Log Schema**: `migrations/20251030_stage_normalization_log.sql`
- **Normalization Logic**: `shared/schemas/investment-stages.ts`
- **Original Script**: `scripts/normalize-stages.ts` (v1, single-transaction
  approach)
