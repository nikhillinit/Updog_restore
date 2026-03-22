---
status: ACTIVE
last_updated: 2026-01-19
---

# Portfolio API Schema Migration Analysis & Strategy

**Date**: 2025-11-09 **Branch**: `feat/portfolio-lot-moic-schema` **Target
Tables**: `forecast_snapshots`, `investment_lots`, `reserve_allocations`
**Status**: READY FOR EXECUTION

---

## Executive Summary

This document provides production-grade database schema hardening for the
Portfolio API tables. All changes are backwards-compatible and implement
critical anti-pattern protections identified in the
HANDOFF-PORTFOLIO-PHASE0-COMPLETE.md document.

**Migration Approach**: Online schema changes with zero downtime **Estimated
Duration**: ~5 minutes (indexes created concurrently) **Risk Level**: LOW (all
changes are additive or expansions)

---

## 1. Current Schema Analysis

### Table: `forecast_snapshots`

**Current State**:

```typescript
export const forecastSnapshots = pgTable(
  'forecast_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    status: text('status').notNull().default('pending'),
    sourceHash: text('source_hash'),
    calculatedMetrics: jsonb('calculated_metrics'),

    fundState: jsonb('fund_state'),
    portfolioState: jsonb('portfolio_state'),
    metricsState: jsonb('metrics_state'),

    snapshotTime: timestamp('snapshot_time', { withTimezone: true }).notNull(),
    version: integer('version').notNull().default(1), // ISSUE: Should be bigint
    idempotencyKey: text('idempotency_key'), // ISSUE: No length constraint, global unique (should be fund-scoped)

    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    fundTimeIdx: index('forecast_snapshots_fund_time_idx').on(
      table.fundId,
      table.snapshotTime.desc()
    ),
    sourceHashIdx: index('forecast_snapshots_source_hash_idx').on(
      table.sourceHash
    ),
    idempotencyUniqueIdx: uniqueIndex(
      'forecast_snapshots_idempotency_unique_idx'
    )
      .on(table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`), // ISSUE: Global, not fund-scoped
    sourceHashUniqueIdx: uniqueIndex(
      'forecast_snapshots_source_hash_unique_idx'
    )
      .on(table.sourceHash, table.fundId)
      .where(sql`${table.sourceHash} IS NOT NULL`),
    statusCheck: check(
      'forecast_snapshots_status_check',
      sql`${table.status} IN ('pending', 'calculating', 'complete', 'error')`
    ),
    // MISSING: Cursor pagination index on (snapshot_time DESC, id DESC)
    // MISSING: Length constraint on idempotency_key
  })
);
```

**Issues Identified**:

1. **AP-LOCK-02**: Version column is `integer` (max 2.1B), should be `bigint`
   for overflow protection
2. **AP-CURSOR-01**: Missing compound cursor pagination index
   `(snapshot_time DESC, id DESC)`
3. **AP-IDEM-03**: Idempotency unique index is global instead of fund-scoped
4. **AP-IDEM-05**: No length constraint on `idempotency_key` (allows unbounded
   strings)

---

### Table: `investment_lots`

**Current State**:

```typescript
export const investmentLots = pgTable(
  'investment_lots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    investmentId: integer('investment_id')
      .notNull()
      .references(() => investments.id, { onDelete: 'cascade' }),

    lotType: text('lot_type').notNull(),
    sharePriceCents: bigint('share_price_cents', { mode: 'bigint' }).notNull(),
    sharesAcquired: decimal('shares_acquired', {
      precision: 18,
      scale: 8,
    }).notNull(),
    costBasisCents: bigint('cost_basis_cents', { mode: 'bigint' }).notNull(),

    version: integer('version').notNull().default(1), // ISSUE: Should be bigint
    idempotencyKey: text('idempotency_key'), // ISSUE: No length constraint, global unique

    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    investmentLotTypeIdx: index('investment_lots_investment_lot_type_idx').on(
      table.investmentId,
      table.lotType
    ),
    idempotencyUniqueIdx: uniqueIndex('investment_lots_idempotency_unique_idx')
      .on(table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`), // ISSUE: Global, not investment-scoped
    lotTypeCheck: check(
      'investment_lots_lot_type_check',
      sql`${table.lotType} IN ('initial', 'follow_on', 'secondary')`
    ),
    // MISSING: Cursor pagination index on (created_at DESC, id DESC)
    // MISSING: Length constraint on idempotency_key
  })
);
```

**Issues Identified**:

1. **AP-LOCK-02**: Version column is `integer`, should be `bigint`
2. **AP-CURSOR-01**: Missing compound cursor pagination index
   `(created_at DESC, id DESC)`
3. **AP-IDEM-03**: Idempotency unique index is global instead of
   investment-scoped
4. **AP-IDEM-05**: No length constraint on `idempotency_key`

---

### Table: `reserve_allocations`

**Current State**:

```typescript
export const reserveAllocations = pgTable(
  'reserve_allocations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => forecastSnapshots.id, { onDelete: 'cascade' }),
    companyId: integer('company_id')
      .notNull()
      .references(() => portfolioCompanies.id, { onDelete: 'cascade' }),

    plannedReserveCents: bigint('planned_reserve_cents', {
      mode: 'bigint',
    }).notNull(),
    allocationScore: decimal('allocation_score', { precision: 10, scale: 6 }),
    priority: integer('priority'),
    rationale: text('rationale'),

    version: integer('version').notNull().default(1), // ISSUE: Should be bigint
    idempotencyKey: text('idempotency_key'), // ISSUE: No length constraint, missing unique index

    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    snapshotCompanyIdx: index('reserve_allocations_snapshot_company_idx').on(
      table.snapshotId,
      table.companyId
    ),
    companyIdx: index('reserve_allocations_company_idx').on(table.companyId),
    priorityIdx: index('reserve_allocations_priority_idx').on(
      table.snapshotId,
      table.priority
    ),
    idempotencyUniqueIdx: uniqueIndex(
      'reserve_allocations_idempotency_unique_idx'
    )
      .on(table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`), // ISSUE: Global, not snapshot-scoped
    // MISSING: Cursor pagination index on (created_at DESC, id DESC)
    // MISSING: Length constraint on idempotency_key
  })
);
```

**Issues Identified**:

1. **AP-LOCK-02**: Version column is `integer`, should be `bigint`
2. **AP-CURSOR-01**: Missing compound cursor pagination index
   `(created_at DESC, id DESC)`
3. **AP-IDEM-03**: Idempotency unique index is global instead of snapshot-scoped
4. **AP-IDEM-05**: No length constraint on `idempotency_key`

---

## 2. Migration Strategy

### Approach: Online Schema Changes (Zero Downtime)

PostgreSQL supports online schema modifications with these techniques:

1. **Column Type Expansion** (`integer` → `bigint`): Safe with no data loss
2. **Add Constraints**: Can be done online with validation
3. **Drop/Recreate Indexes**: Use `CREATE INDEX CONCURRENTLY` for zero downtime
4. **Add Check Constraints**: Use `NOT VALID` then `VALIDATE CONSTRAINT`

### Migration Phases

**Phase 1**: Alter column types (version: integer → bigint) **Phase 2**: Drop
existing global idempotency indexes **Phase 3**: Create scoped idempotency
indexes with `CREATE INDEX CONCURRENTLY` **Phase 4**: Create cursor pagination
indexes with `CREATE INDEX CONCURRENTLY` **Phase 5**: Add check constraints for
idempotency_key length

---

## 3. Production-Grade Migration SQL

### Migration File: `0001_portfolio_schema_hardening.sql`

```sql
-- ============================================================================
-- Portfolio API Schema Hardening
-- Date: 2025-11-09
-- Anti-Patterns Fixed: AP-LOCK-02, AP-CURSOR-01, AP-IDEM-03, AP-IDEM-05
-- ============================================================================

-- Set statement timeout for safety (30 seconds per statement)
SET statement_timeout = '30s';

-- ============================================================================
-- PHASE 1: Version Column Type Expansion (integer → bigint)
-- ============================================================================
-- Note: PostgreSQL allows safe widening of integer types without rewrites
-- The existing data (integers) fit perfectly in bigint range

BEGIN;

-- forecast_snapshots.version: integer → bigint
ALTER TABLE forecast_snapshots
  ALTER COLUMN version TYPE bigint;

-- investment_lots.version: integer → bigint
ALTER TABLE investment_lots
  ALTER COLUMN version TYPE bigint;

-- reserve_allocations.version: integer → bigint
ALTER TABLE reserve_allocations
  ALTER COLUMN version TYPE bigint;

COMMIT;

-- ============================================================================
-- PHASE 2: Drop Existing Global Idempotency Indexes
-- ============================================================================
-- These will be replaced with scoped indexes for proper isolation

DROP INDEX IF EXISTS forecast_snapshots_idempotency_unique_idx;
DROP INDEX IF EXISTS investment_lots_idempotency_unique_idx;
DROP INDEX IF EXISTS reserve_allocations_idempotency_unique_idx;

-- ============================================================================
-- PHASE 3: Create Scoped Idempotency Indexes (CONCURRENTLY)
-- ============================================================================
-- Prevents blocking reads/writes during index creation

-- forecast_snapshots: Fund-scoped idempotency
-- Allows same idempotency_key across different funds (proper isolation)
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  forecast_snapshots_fund_idem_key_idx
  ON forecast_snapshots(fund_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- investment_lots: Investment-scoped idempotency
-- Allows same idempotency_key across different investments
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  investment_lots_investment_idem_key_idx
  ON investment_lots(investment_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- reserve_allocations: Snapshot-scoped idempotency
-- Allows same idempotency_key across different snapshots
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  reserve_allocations_snapshot_idem_key_idx
  ON reserve_allocations(snapshot_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ============================================================================
-- PHASE 4: Create Cursor Pagination Indexes (CONCURRENTLY)
-- ============================================================================
-- Compound indexes for stable cursor pagination with ID tiebreaker

-- forecast_snapshots: snapshot_time DESC, id DESC
-- Supports efficient seek: WHERE (snapshot_time, id) < ($cursor_time, $cursor_id)
CREATE INDEX CONCURRENTLY IF NOT EXISTS
  forecast_snapshots_cursor_idx
  ON forecast_snapshots(snapshot_time DESC, id DESC);

-- investment_lots: created_at DESC, id DESC
-- Supports efficient seek: WHERE (created_at, id) < ($cursor_time, $cursor_id)
CREATE INDEX CONCURRENTLY IF NOT EXISTS
  investment_lots_cursor_idx
  ON investment_lots(created_at DESC, id DESC);

-- reserve_allocations: created_at DESC, id DESC
-- Supports efficient seek: WHERE (created_at, id) < ($cursor_time, $cursor_id)
CREATE INDEX CONCURRENTLY IF NOT EXISTS
  reserve_allocations_cursor_idx
  ON reserve_allocations(created_at DESC, id DESC);

-- ============================================================================
-- PHASE 5: Add Check Constraints for Idempotency Key Length
-- ============================================================================
-- Prevents unbounded strings (1-128 chars is industry standard)
-- Uses NOT VALID for online operation, then validates separately

BEGIN;

-- forecast_snapshots: idempotency_key length constraint
ALTER TABLE forecast_snapshots
  ADD CONSTRAINT forecast_snapshots_idem_key_len_check
  CHECK (idempotency_key IS NULL OR (length(idempotency_key) >= 1 AND length(idempotency_key) <= 128))
  NOT VALID;

-- investment_lots: idempotency_key length constraint
ALTER TABLE investment_lots
  ADD CONSTRAINT investment_lots_idem_key_len_check
  CHECK (idempotency_key IS NULL OR (length(idempotency_key) >= 1 AND length(idempotency_key) <= 128))
  NOT VALID;

-- reserve_allocations: idempotency_key length constraint
ALTER TABLE reserve_allocations
  ADD CONSTRAINT reserve_allocations_idem_key_len_check
  CHECK (idempotency_key IS NULL OR (length(idempotency_key) >= 1 AND length(idempotency_key) <= 128))
  NOT VALID;

COMMIT;

-- Validate constraints (scans table but doesn't block writes)
ALTER TABLE forecast_snapshots VALIDATE CONSTRAINT forecast_snapshots_idem_key_len_check;
ALTER TABLE investment_lots VALIDATE CONSTRAINT investment_lots_idem_key_len_check;
ALTER TABLE reserve_allocations VALIDATE CONSTRAINT reserve_allocations_idem_key_len_check;

-- ============================================================================
-- PHASE 6: Verify Migration Success
-- ============================================================================

DO $$
DECLARE
  v_forecast_version_type text;
  v_lots_version_type text;
  v_allocations_version_type text;
  v_forecast_cursor_idx boolean;
  v_lots_cursor_idx boolean;
  v_allocations_cursor_idx boolean;
  v_forecast_idem_idx boolean;
  v_lots_idem_idx boolean;
  v_allocations_idem_idx boolean;
BEGIN
  -- Check version column types
  SELECT data_type INTO v_forecast_version_type
  FROM information_schema.columns
  WHERE table_name = 'forecast_snapshots' AND column_name = 'version';

  SELECT data_type INTO v_lots_version_type
  FROM information_schema.columns
  WHERE table_name = 'investment_lots' AND column_name = 'version';

  SELECT data_type INTO v_allocations_version_type
  FROM information_schema.columns
  WHERE table_name = 'reserve_allocations' AND column_name = 'version';

  -- Check cursor indexes exist
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'forecast_snapshots' AND indexname = 'forecast_snapshots_cursor_idx'
  ) INTO v_forecast_cursor_idx;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'investment_lots' AND indexname = 'investment_lots_cursor_idx'
  ) INTO v_lots_cursor_idx;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'reserve_allocations' AND indexname = 'reserve_allocations_cursor_idx'
  ) INTO v_allocations_cursor_idx;

  -- Check scoped idempotency indexes exist
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'forecast_snapshots' AND indexname = 'forecast_snapshots_fund_idem_key_idx'
  ) INTO v_forecast_idem_idx;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'investment_lots' AND indexname = 'investment_lots_investment_idem_key_idx'
  ) ) INTO v_lots_idem_idx;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'reserve_allocations' AND indexname = 'reserve_allocations_snapshot_idem_key_idx'
  ) INTO v_allocations_idem_idx;

  -- Report results
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Portfolio Schema Migration Verification';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Version Columns:';
  RAISE NOTICE '  forecast_snapshots.version: % (expected: bigint)', v_forecast_version_type;
  RAISE NOTICE '  investment_lots.version: % (expected: bigint)', v_lots_version_type;
  RAISE NOTICE '  reserve_allocations.version: % (expected: bigint)', v_allocations_version_type;
  RAISE NOTICE '';
  RAISE NOTICE 'Cursor Pagination Indexes:';
  RAISE NOTICE '  forecast_snapshots_cursor_idx: %', v_forecast_cursor_idx;
  RAISE NOTICE '  investment_lots_cursor_idx: %', v_lots_cursor_idx;
  RAISE NOTICE '  reserve_allocations_cursor_idx: %', v_allocations_cursor_idx;
  RAISE NOTICE '';
  RAISE NOTICE 'Scoped Idempotency Indexes:';
  RAISE NOTICE '  forecast_snapshots_fund_idem_key_idx: %', v_forecast_idem_idx;
  RAISE NOTICE '  investment_lots_investment_idem_key_idx: %', v_lots_idem_idx;
  RAISE NOTICE '  reserve_allocations_snapshot_idem_key_idx: %', v_allocations_idem_idx;
  RAISE NOTICE '============================================================================';

  -- Fail if any verification failed
  IF v_forecast_version_type != 'bigint' OR
     v_lots_version_type != 'bigint' OR
     v_allocations_version_type != 'bigint' OR
     NOT v_forecast_cursor_idx OR
     NOT v_lots_cursor_idx OR
     NOT v_allocations_cursor_idx OR
     NOT v_forecast_idem_idx OR
     NOT v_lots_idem_idx OR
     NOT v_allocations_idem_idx THEN
    RAISE EXCEPTION 'Migration verification failed - see NOTICE output above';
  END IF;

  RAISE NOTICE 'SUCCESS: All migration changes verified';
END $$;

-- Reset statement timeout
RESET statement_timeout;
```

---

## 4. Index Creation Strategy

### Why `CREATE INDEX CONCURRENTLY`?

**Standard `CREATE INDEX`**:

- Acquires `SHARE` lock on table
- Blocks all writes (INSERT/UPDATE/DELETE) during creation
- Can take minutes on large tables
- Risk: Deadlocks if concurrent writes attempted

**`CREATE INDEX CONCURRENTLY`**:

- Acquires `SHARE UPDATE EXCLUSIVE` lock (less restrictive)
- Allows reads AND writes during creation
- Takes slightly longer but zero downtime
- Safe for production with active traffic

### Index Build Time Estimates

Based on typical PostgreSQL performance:

| Table Size | Rows     | Index Build Time (Concurrent) |
| ---------- | -------- | ----------------------------- |
| Small      | < 10K    | < 5 seconds                   |
| Medium     | 10K-100K | 10-30 seconds                 |
| Large      | 100K-1M  | 30-120 seconds                |
| Very Large | > 1M     | 2-10 minutes                  |

**Current Portfolio API**: Expected to be Small/Medium size during initial
rollout.

### Monitoring Index Creation

```sql
-- Check index creation progress
SELECT
  pid,
  now() - pg_stat_activity.query_start AS duration,
  query,
  state
FROM pg_stat_activity
WHERE query LIKE '%CREATE INDEX%'
  AND state != 'idle';

-- Check if index is valid (completed successfully)
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE indexname LIKE '%_cursor_idx'
   OR indexname LIKE '%_idem_key_idx';
```

---

## 5. Rollback Plan

### If Migration Fails During Execution

**Phase 1 Rollback** (Version column type change):

```sql
-- Revert version columns to integer
-- CAUTION: Only safe if no values exceed integer range
BEGIN;
ALTER TABLE forecast_snapshots ALTER COLUMN version TYPE integer;
ALTER TABLE investment_lots ALTER COLUMN version TYPE integer;
ALTER TABLE reserve_allocations ALTER COLUMN version TYPE integer;
COMMIT;
```

**Phase 3/4 Rollback** (Index creation):

```sql
-- Drop new scoped idempotency indexes
DROP INDEX CONCURRENTLY IF EXISTS forecast_snapshots_fund_idem_key_idx;
DROP INDEX CONCURRENTLY IF EXISTS investment_lots_investment_idem_key_idx;
DROP INDEX CONCURRENTLY IF EXISTS reserve_allocations_snapshot_idem_key_idx;

-- Drop cursor pagination indexes
DROP INDEX CONCURRENTLY IF EXISTS forecast_snapshots_cursor_idx;
DROP INDEX CONCURRENTLY IF EXISTS investment_lots_cursor_idx;
DROP INDEX CONCURRENTLY IF EXISTS reserve_allocations_cursor_idx;

-- Recreate original global idempotency indexes (if needed for compatibility)
CREATE UNIQUE INDEX CONCURRENTLY forecast_snapshots_idempotency_unique_idx
  ON forecast_snapshots(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX CONCURRENTLY investment_lots_idempotency_unique_idx
  ON investment_lots(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX CONCURRENTLY reserve_allocations_idempotency_unique_idx
  ON reserve_allocations(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
```

**Phase 5 Rollback** (Check constraints):

```sql
-- Drop length check constraints
BEGIN;
ALTER TABLE forecast_snapshots DROP CONSTRAINT IF EXISTS forecast_snapshots_idem_key_len_check;
ALTER TABLE investment_lots DROP CONSTRAINT IF EXISTS investment_lots_idem_key_len_check;
ALTER TABLE reserve_allocations DROP CONSTRAINT IF EXISTS reserve_allocations_idem_key_len_check;
COMMIT;
```

### Complete Rollback Script

```sql
-- ============================================================================
-- COMPLETE ROLLBACK SCRIPT
-- WARNING: Only use if migration must be fully reverted
-- ============================================================================

SET statement_timeout = '30s';

-- Drop all new indexes
DROP INDEX CONCURRENTLY IF EXISTS forecast_snapshots_fund_idem_key_idx;
DROP INDEX CONCURRENTLY IF EXISTS investment_lots_investment_idem_key_idx;
DROP INDEX CONCURRENTLY IF EXISTS reserve_allocations_snapshot_idem_key_idx;
DROP INDEX CONCURRENTLY IF EXISTS forecast_snapshots_cursor_idx;
DROP INDEX CONCURRENTLY IF EXISTS investment_lots_cursor_idx;
DROP INDEX CONCURRENTLY IF EXISTS reserve_allocations_cursor_idx;

-- Drop check constraints
BEGIN;
ALTER TABLE forecast_snapshots DROP CONSTRAINT IF EXISTS forecast_snapshots_idem_key_len_check;
ALTER TABLE investment_lots DROP CONSTRAINT IF EXISTS investment_lots_idem_key_len_check;
ALTER TABLE reserve_allocations DROP CONSTRAINT IF EXISTS reserve_allocations_idem_key_len_check;
COMMIT;

-- Revert version columns (ONLY if no values exceed integer range)
BEGIN;
ALTER TABLE forecast_snapshots ALTER COLUMN version TYPE integer;
ALTER TABLE investment_lots ALTER COLUMN version TYPE integer;
ALTER TABLE reserve_allocations ALTER COLUMN version TYPE integer;
COMMIT;

-- Recreate original indexes
CREATE UNIQUE INDEX CONCURRENTLY forecast_snapshots_idempotency_unique_idx
  ON forecast_snapshots(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX CONCURRENTLY investment_lots_idempotency_unique_idx
  ON investment_lots(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX CONCURRENTLY reserve_allocations_idempotency_unique_idx
  ON reserve_allocations(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

RESET statement_timeout;
```

---

## 6. Updated Schema.ts File

The TypeScript schema definition should be updated to reflect the migration:

```typescript
// ============================================================================
// INVESTMENT LOTS - Portfolio lot tracking with MOIC calculations
// ============================================================================
export const investmentLots = pgTable(
  'investment_lots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    investmentId: integer('investment_id')
      .notNull()
      .references(() => investments.id, { onDelete: 'cascade' }),

    lotType: text('lot_type').notNull(),
    sharePriceCents: bigint('share_price_cents', { mode: 'bigint' }).notNull(),
    sharesAcquired: decimal('shares_acquired', {
      precision: 18,
      scale: 8,
    }).notNull(),
    costBasisCents: bigint('cost_basis_cents', { mode: 'bigint' }).notNull(),

    version: bigint('version', { mode: 'bigint' }).notNull().default(0), // Changed: integer → bigint
    idempotencyKey: text('idempotency_key'), // Length validated by check constraint

    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    investmentLotTypeIdx: index('investment_lots_investment_lot_type_idx').on(
      table.investmentId,
      table.lotType
    ),

    // UPDATED: Investment-scoped idempotency (not global)
    idempotencyUniqueIdx: uniqueIndex('investment_lots_investment_idem_key_idx')
      .on(table.investmentId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),

    // NEW: Cursor pagination index
    cursorIdx: index('investment_lots_cursor_idx').on(
      table.createdAt.desc(),
      table.id.desc()
    ),

    lotTypeCheck: check(
      'investment_lots_lot_type_check',
      sql`${table.lotType} IN ('initial', 'follow_on', 'secondary')`
    ),

    // NEW: Length constraint (enforced at DB level)
    idempotencyKeyLenCheck: check(
      'investment_lots_idem_key_len_check',
      sql`${table.idempotencyKey} IS NULL OR (length(${table.idempotencyKey}) >= 1 AND length(${table.idempotencyKey}) <= 128)`
    ),
  })
);

export type InvestmentLot = typeof investmentLots.$inferSelect;
export type InsertInvestmentLot = typeof investmentLots.$inferInsert;

// ============================================================================
// FORECAST SNAPSHOTS - Point-in-time snapshots with async calculation
// ============================================================================
export const forecastSnapshots = pgTable(
  'forecast_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    status: text('status').notNull().default('pending'),
    sourceHash: text('source_hash'),
    calculatedMetrics: jsonb('calculated_metrics'),

    fundState: jsonb('fund_state'),
    portfolioState: jsonb('portfolio_state'),
    metricsState: jsonb('metrics_state'),

    snapshotTime: timestamp('snapshot_time', { withTimezone: true }).notNull(),
    version: bigint('version', { mode: 'bigint' }).notNull().default(0), // Changed: integer → bigint
    idempotencyKey: text('idempotency_key'), // Length validated by check constraint

    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    fundTimeIdx: index('forecast_snapshots_fund_time_idx').on(
      table.fundId,
      table.snapshotTime.desc()
    ),
    sourceHashIdx: index('forecast_snapshots_source_hash_idx').on(
      table.sourceHash
    ),

    // UPDATED: Fund-scoped idempotency (not global)
    idempotencyUniqueIdx: uniqueIndex('forecast_snapshots_fund_idem_key_idx')
      .on(table.fundId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),

    // NEW: Cursor pagination index
    cursorIdx: index('forecast_snapshots_cursor_idx').on(
      table.snapshotTime.desc(),
      table.id.desc()
    ),

    sourceHashUniqueIdx: uniqueIndex(
      'forecast_snapshots_source_hash_unique_idx'
    )
      .on(table.sourceHash, table.fundId)
      .where(sql`${table.sourceHash} IS NOT NULL`),

    statusCheck: check(
      'forecast_snapshots_status_check',
      sql`${table.status} IN ('pending', 'calculating', 'complete', 'error')`
    ),

    // NEW: Length constraint (enforced at DB level)
    idempotencyKeyLenCheck: check(
      'forecast_snapshots_idem_key_len_check',
      sql`${table.idempotencyKey} IS NULL OR (length(${table.idempotencyKey}) >= 1 AND length(${table.idempotencyKey}) <= 128)`
    ),
  })
);

export type ForecastSnapshot = typeof forecastSnapshots.$inferSelect;
export type InsertForecastSnapshot = typeof forecastSnapshots.$inferInsert;

// ============================================================================
// RESERVE ALLOCATIONS - Per-company reserve planning
// ============================================================================
export const reserveAllocations = pgTable(
  'reserve_allocations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => forecastSnapshots.id, { onDelete: 'cascade' }),
    companyId: integer('company_id')
      .notNull()
      .references(() => portfolioCompanies.id, { onDelete: 'cascade' }),

    plannedReserveCents: bigint('planned_reserve_cents', {
      mode: 'bigint',
    }).notNull(),
    allocationScore: decimal('allocation_score', { precision: 10, scale: 6 }),
    priority: integer('priority'),
    rationale: text('rationale'),

    version: bigint('version', { mode: 'bigint' }).notNull().default(0), // Changed: integer → bigint
    idempotencyKey: text('idempotency_key'), // Length validated by check constraint

    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    snapshotCompanyIdx: index('reserve_allocations_snapshot_company_idx').on(
      table.snapshotId,
      table.companyId
    ),
    companyIdx: index('reserve_allocations_company_idx').on(table.companyId),
    priorityIdx: index('reserve_allocations_priority_idx').on(
      table.snapshotId,
      table.priority
    ),

    // UPDATED: Snapshot-scoped idempotency (not global)
    idempotencyUniqueIdx: uniqueIndex(
      'reserve_allocations_snapshot_idem_key_idx'
    )
      .on(table.snapshotId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),

    // NEW: Cursor pagination index
    cursorIdx: index('reserve_allocations_cursor_idx').on(
      table.createdAt.desc(),
      table.id.desc()
    ),

    // NEW: Length constraint (enforced at DB level)
    idempotencyKeyLenCheck: check(
      'reserve_allocations_idem_key_len_check',
      sql`${table.idempotencyKey} IS NULL OR (length(${table.idempotencyKey}) >= 1 AND length(${table.idempotencyKey}) <= 128)`
    ),
  })
);

export type ReserveAllocation = typeof reserveAllocations.$inferSelect;
export type InsertReserveAllocation = typeof reserveAllocations.$inferInsert;
```

---

## 7. Migration Execution Plan

### Pre-Migration Checklist

- [ ] Verify database backup exists and is restorable
- [ ] Confirm PostgreSQL version supports `CREATE INDEX CONCURRENTLY` (9.2+)
- [ ] Check current table sizes:
      `SELECT pg_size_pretty(pg_total_relation_size('forecast_snapshots'));`
- [ ] Verify no existing data violates new constraints
- [ ] Ensure sufficient disk space for temporary index builds (2x table size)
- [ ] Schedule during low-traffic window (optional but recommended)
- [ ] Notify team of migration window
- [ ] Have rollback script ready

### Execution Steps

**Step 1**: Verify environment

```bash
# Check DATABASE_URL is set
echo $DATABASE_URL

# Test database connection
npm run db:studio  # Should connect successfully
```

**Step 2**: Create migration directory

```bash
mkdir -p migrations
```

**Step 3**: Save migration SQL

```bash
# Copy the SQL from Section 3 into this file
touch migrations/0001_portfolio_schema_hardening.sql
```

**Step 4**: Execute migration

```bash
# Option A: Using Drizzle Kit
npm run db:migrate

# Option B: Using psql directly
psql $DATABASE_URL -f migrations/0001_portfolio_schema_hardening.sql
```

**Step 5**: Verify migration success

```sql
-- Run verification queries from migration script
-- Check NOTICE output for "SUCCESS: All migration changes verified"
```

**Step 6**: Update schema.ts

```bash
# Copy updated schema from Section 6
# Replace sections for investmentLots, forecastSnapshots, reserveAllocations
```

**Step 7**: Generate TypeScript types

```bash
npm run build:types
```

**Step 8**: Run type checking

```bash
npm run check
```

**Step 9**: Test application

```bash
# Start development server
npm run dev:api

# Run integration tests (once implemented)
npm run test -- --project=server
```

### Post-Migration Validation

- [ ] All version columns are `bigint`
- [ ] Cursor pagination indexes exist and are valid
- [ ] Scoped idempotency indexes exist and are valid
- [ ] Check constraints exist and validated
- [ ] No application errors in logs
- [ ] API endpoints respond correctly
- [ ] Idempotency tests pass (once implemented)
- [ ] Cursor pagination tests pass (once implemented)

---

## 8. Risk Assessment & Mitigation

### Risk: Index Creation Timeout

**Likelihood**: LOW (small dataset expected) **Impact**: MEDIUM (migration
fails, must retry)

**Mitigation**:

- Use `CREATE INDEX CONCURRENTLY` (allows retry without cleanup)
- Set appropriate `statement_timeout` (30s is conservative)
- Monitor index creation progress with query from Section 4
- If timeout occurs, simply re-run migration (idempotent)

### Risk: Version Column Overflow in Production

**Likelihood**: VERY LOW (requires 2.1B updates to single record) **Impact**:
HIGH (data corruption, application errors)

**Mitigation**:

- **This migration fixes the risk** by expanding to `bigint` (9.2 quintillion
  max)
- Even with 1M updates/second, would take 292 million years to overflow

### Risk: Scoped Idempotency Breaking Existing Data

**Likelihood**: VERY LOW (table is new, no production data yet) **Impact**:
MEDIUM (duplicate key violations)

**Mitigation**:

- Verify no existing data has duplicate `(fund_id, idempotency_key)` pairs:
  ```sql
  SELECT fund_id, idempotency_key, COUNT(*)
  FROM forecast_snapshots
  WHERE idempotency_key IS NOT NULL
  GROUP BY fund_id, idempotency_key
  HAVING COUNT(*) > 1;
  ```
- If duplicates found, resolve before migration

### Risk: Application Downtime During Migration

**Likelihood**: VERY LOW (all changes are online) **Impact**: MEDIUM (API
unavailable)

**Mitigation**:

- All index creation uses `CONCURRENTLY` (zero blocking)
- Column type expansion is instant rewrite operation
- Check constraints added with `NOT VALID` then validated separately
- Total application impact: < 5 seconds

---

## 9. Success Criteria

**Migration Complete When**:

1. All 3 version columns are `bigint` type
2. All 3 cursor pagination indexes exist and valid
3. All 3 scoped idempotency indexes exist and valid
4. All 3 length check constraints exist and validated
5. Verification query at end of migration reports "SUCCESS"
6. schema.ts updated and type-checks pass
7. No application errors during smoke testing

**Quality Gates**:

- Zero data loss
- Zero application downtime
- All anti-pattern violations resolved
- Rollback plan tested and documented
- Post-migration validation complete

---

## 10. Next Steps After Migration

1. **Update Service Layer Code**:
   - Use new scoped idempotency indexes in `onConflictDoNothing()` queries
   - Implement cursor pagination with tuple predicate
   - Update optimistic locking to use `bigint` version

2. **Implement Integration Tests**:
   - Idempotency scenarios (see HANDOFF memo Section 7)
   - Cursor pagination edge cases
   - Optimistic locking conflicts
   - Length constraint validation

3. **Monitor Production Metrics**:
   - Index usage:
     `SELECT * FROM pg_stat_user_indexes WHERE schemaname = 'public';`
   - Query performance with new indexes
   - Idempotency replay rate
   - Version conflict rate

4. **Update Documentation**:
   - CHANGELOG.md: Document schema hardening
   - DECISIONS.md: Record scoped idempotency decision
   - API documentation: Update with new constraints

---

## Summary

**What Changed**:

- Version columns: `integer` → `bigint` (3 tables)
- Idempotency indexes: Global → Scoped by parent entity (3 tables)
- Added cursor pagination indexes with ID tiebreaker (3 tables)
- Added idempotency_key length constraints 1-128 chars (3 tables)

**Why It Matters**:

- Prevents version overflow in long-running systems (AP-LOCK-02)
- Enables stable cursor pagination under concurrent writes (AP-CURSOR-01)
- Allows proper tenant/fund isolation for idempotency (AP-IDEM-03)
- Prevents unbounded strings in idempotency keys (AP-IDEM-05)

**Risks**:

- LOW: All changes are additive or widening
- Zero downtime with CONCURRENTLY indexes
- Fully rollback-able if issues arise

**Timeline**:

- Migration execution: ~5 minutes
- Verification: ~2 minutes
- schema.ts updates: ~10 minutes
- Testing: ~15 minutes
- **Total: ~30 minutes**

---

**Ready for execution. Proceed with migration when approved.**
