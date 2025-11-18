-- ============================================================================
-- ROLLBACK SCRIPT: Portfolio API Schema Hardening
-- Date: 2025-11-09
-- WARNING: Only use if migration must be fully reverted
-- ============================================================================
-- This script reverts all changes from 0001_portfolio_schema_hardening.sql
-- ============================================================================

SET statement_timeout = '30s';

-- ============================================================================
-- PHASE 1: Drop New Scoped Idempotency Indexes
-- ============================================================================
DROP INDEX CONCURRENTLY IF EXISTS forecast_snapshots_fund_idem_key_idx;
DROP INDEX CONCURRENTLY IF EXISTS investment_lots_investment_idem_key_idx;
DROP INDEX CONCURRENTLY IF EXISTS reserve_allocations_snapshot_idem_key_idx;

-- ============================================================================
-- PHASE 2: Drop Cursor Pagination Indexes
-- ============================================================================
DROP INDEX CONCURRENTLY IF EXISTS forecast_snapshots_fund_cursor_idx;
DROP INDEX CONCURRENTLY IF EXISTS investment_lots_investment_cursor_idx;
DROP INDEX CONCURRENTLY IF EXISTS reserve_allocations_snapshot_cursor_idx;

-- ============================================================================
-- PHASE 3: Drop Check Constraints
-- ============================================================================
BEGIN;
ALTER TABLE forecast_snapshots DROP CONSTRAINT IF EXISTS forecast_snapshots_idem_key_len_check;
ALTER TABLE investment_lots DROP CONSTRAINT IF EXISTS investment_lots_idem_key_len_check;
ALTER TABLE reserve_allocations DROP CONSTRAINT IF EXISTS reserve_allocations_idem_key_len_check;
COMMIT;

-- ============================================================================
-- PHASE 4: Revert Version Columns to Integer
-- ============================================================================
-- CAUTION: Only safe if no values exceed integer range (2,147,483,647)
-- Check first with:
--   SELECT MAX(version) FROM forecast_snapshots;
--   SELECT MAX(version) FROM investment_lots;
--   SELECT MAX(version) FROM reserve_allocations;

BEGIN;

-- Verify no values exceed integer range
DO $$
DECLARE
  v_max_forecast bigint;
  v_max_lots bigint;
  v_max_allocations bigint;
BEGIN
  SELECT COALESCE(MAX(version), 0) INTO v_max_forecast FROM forecast_snapshots;
  SELECT COALESCE(MAX(version), 0) INTO v_max_lots FROM investment_lots;
  SELECT COALESCE(MAX(version), 0) INTO v_max_allocations FROM reserve_allocations;

  IF v_max_forecast > 2147483647 THEN
    RAISE EXCEPTION 'Cannot rollback: forecast_snapshots.version has values > integer max (max=%)', v_max_forecast;
  END IF;

  IF v_max_lots > 2147483647 THEN
    RAISE EXCEPTION 'Cannot rollback: investment_lots.version has values > integer max (max=%)', v_max_lots;
  END IF;

  IF v_max_allocations > 2147483647 THEN
    RAISE EXCEPTION 'Cannot rollback: reserve_allocations.version has values > integer max (max=%)', v_max_allocations;
  END IF;

  RAISE NOTICE 'Version range check passed - safe to rollback';
END $$;

-- Perform rollback
ALTER TABLE forecast_snapshots ALTER COLUMN version TYPE integer;
ALTER TABLE investment_lots ALTER COLUMN version TYPE integer;
ALTER TABLE reserve_allocations ALTER COLUMN version TYPE integer;

COMMIT;

-- ============================================================================
-- PHASE 5: Recreate Original Global Idempotency Indexes
-- ============================================================================
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  forecast_snapshots_idempotency_unique_idx
  ON forecast_snapshots(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  investment_lots_idempotency_unique_idx
  ON investment_lots(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  reserve_allocations_idempotency_unique_idx
  ON reserve_allocations(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ============================================================================
-- PHASE 6: Verify Rollback Success
-- ============================================================================

DO $$
DECLARE
  v_forecast_version_type text;
  v_lots_version_type text;
  v_allocations_version_type text;
  v_forecast_old_idx boolean;
  v_lots_old_idx boolean;
  v_allocations_old_idx boolean;
  v_forecast_new_idx boolean;
  v_lots_new_idx boolean;
  v_allocations_new_idx boolean;
BEGIN
  -- Check version column types reverted to integer
  SELECT data_type INTO v_forecast_version_type
  FROM information_schema.columns
  WHERE table_name = 'forecast_snapshots' AND column_name = 'version';

  SELECT data_type INTO v_lots_version_type
  FROM information_schema.columns
  WHERE table_name = 'investment_lots' AND column_name = 'version';

  SELECT data_type INTO v_allocations_version_type
  FROM information_schema.columns
  WHERE table_name = 'reserve_allocations' AND column_name = 'version';

  -- Check old global idempotency indexes restored
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'forecast_snapshots' AND indexname = 'forecast_snapshots_idempotency_unique_idx'
  ) INTO v_forecast_old_idx;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'investment_lots' AND indexname = 'investment_lots_idempotency_unique_idx'
  ) INTO v_lots_old_idx;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'reserve_allocations' AND indexname = 'reserve_allocations_idempotency_unique_idx'
  ) INTO v_allocations_old_idx;

  -- Check new indexes removed
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'forecast_snapshots' AND indexname IN ('forecast_snapshots_fund_idem_key_idx', 'forecast_snapshots_fund_cursor_idx')
  ) INTO v_forecast_new_idx;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'investment_lots' AND indexname IN ('investment_lots_investment_idem_key_idx', 'investment_lots_investment_cursor_idx')
  ) INTO v_lots_new_idx;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'reserve_allocations' AND indexname IN ('reserve_allocations_snapshot_idem_key_idx', 'reserve_allocations_snapshot_cursor_idx')
  ) INTO v_allocations_new_idx;

  -- Report results
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Portfolio Schema Rollback Verification';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Version Columns (should be integer):';
  RAISE NOTICE '  forecast_snapshots.version: %', v_forecast_version_type;
  RAISE NOTICE '  investment_lots.version: %', v_lots_version_type;
  RAISE NOTICE '  reserve_allocations.version: %', v_allocations_version_type;
  RAISE NOTICE '';
  RAISE NOTICE 'Old Global Idempotency Indexes (should be true):';
  RAISE NOTICE '  forecast_snapshots_idempotency_unique_idx: %', v_forecast_old_idx;
  RAISE NOTICE '  investment_lots_idempotency_unique_idx: %', v_lots_old_idx;
  RAISE NOTICE '  reserve_allocations_idempotency_unique_idx: %', v_allocations_old_idx;
  RAISE NOTICE '';
  RAISE NOTICE 'New Indexes Removed (should be false):';
  RAISE NOTICE '  forecast_snapshots new indexes: %', v_forecast_new_idx;
  RAISE NOTICE '  investment_lots new indexes: %', v_lots_new_idx;
  RAISE NOTICE '  reserve_allocations new indexes: %', v_allocations_new_idx;
  RAISE NOTICE '============================================================================';

  -- Fail if rollback incomplete
  IF v_forecast_version_type != 'integer' OR
     v_lots_version_type != 'integer' OR
     v_allocations_version_type != 'integer' OR
     NOT v_forecast_old_idx OR
     NOT v_lots_old_idx OR
     NOT v_allocations_old_idx OR
     v_forecast_new_idx OR
     v_lots_new_idx OR
     v_allocations_new_idx THEN
    RAISE EXCEPTION 'Rollback verification failed - see NOTICE output above';
  END IF;

  RAISE NOTICE 'SUCCESS: All rollback changes verified';
END $$;

RESET statement_timeout;
