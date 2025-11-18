-- ============================================================================
-- Portfolio API Schema Hardening
-- Date: 2025-11-09
-- Branch: feat/portfolio-lot-moic-schema
-- Anti-Patterns Fixed: AP-LOCK-02, AP-CURSOR-01, AP-IDEM-03, AP-IDEM-05
-- ============================================================================
-- Changes:
--   1. Version columns: integer → bigint (overflow protection)
--   2. Idempotency indexes: Global → Scoped by parent entity
--   3. Cursor pagination indexes: Compound (timestamp DESC, id DESC)
--   4. Idempotency key length constraints: 1-128 characters
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

BEGIN;
DROP INDEX IF EXISTS forecast_snapshots_idempotency_unique_idx;
DROP INDEX IF EXISTS investment_lots_idempotency_unique_idx;
DROP INDEX IF EXISTS reserve_allocations_idempotency_unique_idx;
COMMIT;

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

-- forecast_snapshots: fund_id, snapshot_time DESC, id DESC
-- Supports efficient seek: WHERE fund_id = $1 AND (snapshot_time, id) < ($cursor_time, $cursor_id)
CREATE INDEX CONCURRENTLY IF NOT EXISTS
  forecast_snapshots_fund_cursor_idx
  ON forecast_snapshots(fund_id, snapshot_time DESC, id DESC);

-- investment_lots: investment_id, created_at DESC, id DESC
-- Supports efficient seek: WHERE investment_id = $1 AND (created_at, id) < ($cursor_time, $cursor_id)
CREATE INDEX CONCURRENTLY IF NOT EXISTS
  investment_lots_investment_cursor_idx
  ON investment_lots(investment_id, created_at DESC, id DESC);

-- reserve_allocations: snapshot_id, created_at DESC, id DESC
-- Supports efficient seek: WHERE snapshot_id = $1 AND (created_at, id) < ($cursor_time, $cursor_id)
CREATE INDEX CONCURRENTLY IF NOT EXISTS
  reserve_allocations_snapshot_cursor_idx
  ON reserve_allocations(snapshot_id, created_at DESC, id DESC);

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
    WHERE tablename = 'forecast_snapshots' AND indexname = 'forecast_snapshots_fund_cursor_idx'
  ) INTO v_forecast_cursor_idx;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'investment_lots' AND indexname = 'investment_lots_investment_cursor_idx'
  ) INTO v_lots_cursor_idx;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'reserve_allocations' AND indexname = 'reserve_allocations_snapshot_cursor_idx'
  ) INTO v_allocations_cursor_idx;

  -- Check scoped idempotency indexes exist
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'forecast_snapshots' AND indexname = 'forecast_snapshots_fund_idem_key_idx'
  ) INTO v_forecast_idem_idx;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'investment_lots' AND indexname = 'investment_lots_investment_idem_key_idx'
  ) INTO v_lots_idem_idx;

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
  RAISE NOTICE '  forecast_snapshots_fund_cursor_idx: %', v_forecast_cursor_idx;
  RAISE NOTICE '  investment_lots_investment_cursor_idx: %', v_lots_cursor_idx;
  RAISE NOTICE '  reserve_allocations_snapshot_cursor_idx: %', v_allocations_cursor_idx;
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
