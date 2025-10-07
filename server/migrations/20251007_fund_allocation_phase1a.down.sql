-- Migration Rollback: Fund Allocation Management - Phase 1a
-- Created: 2025-10-07
-- Purpose: Safely rollback Phase 1a allocation tracking extensions

-- ============================================================================
-- WARNING: This will delete allocation tracking data!
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Rolling back Fund Allocation Management Phase 1a migration...';
  RAISE NOTICE 'WARNING: This will remove allocation tracking columns and data!';
END $$;

-- ============================================================================
-- Drop Indexes First
-- ============================================================================

DROP INDEX IF EXISTS idx_portfoliocompanies_fund_exit_moic;
DROP INDEX IF EXISTS idx_portfoliocompanies_fund_status_sector;
DROP INDEX IF EXISTS idx_portfoliocompanies_cursor;
DROP INDEX IF EXISTS idx_portfoliocompanies_last_allocation;

-- ============================================================================
-- Drop Constraints
-- ============================================================================

ALTER TABLE portfoliocompanies
  DROP CONSTRAINT IF EXISTS check_deployed_reserves_non_negative;

ALTER TABLE portfoliocompanies
  DROP CONSTRAINT IF EXISTS check_planned_reserves_non_negative;

ALTER TABLE portfoliocompanies
  DROP CONSTRAINT IF EXISTS check_exit_moic_reasonable;

ALTER TABLE portfoliocompanies
  DROP CONSTRAINT IF EXISTS check_ownership_valid;

ALTER TABLE portfoliocompanies
  DROP CONSTRAINT IF EXISTS check_allocation_cap_non_negative;

ALTER TABLE portfoliocompanies
  DROP CONSTRAINT IF EXISTS check_allocation_iteration_non_negative;

ALTER TABLE portfoliocompanies
  DROP CONSTRAINT IF EXISTS check_allocation_version_positive;

-- ============================================================================
-- Drop Columns (in reverse order of addition)
-- ============================================================================

ALTER TABLE portfoliocompanies
  DROP COLUMN IF EXISTS allocation_version,
  DROP COLUMN IF EXISTS last_allocation_at,
  DROP COLUMN IF EXISTS allocation_iteration,
  DROP COLUMN IF EXISTS allocation_reason,
  DROP COLUMN IF EXISTS allocation_cap_cents,
  DROP COLUMN IF EXISTS ownership_current_pct,
  DROP COLUMN IF EXISTS exit_moic_bps,
  DROP COLUMN IF EXISTS planned_reserves_cents,
  DROP COLUMN IF EXISTS deployed_reserves_cents;

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
DECLARE
  remaining_columns INTEGER;
BEGIN
  -- Verify columns were removed
  SELECT COUNT(*) INTO remaining_columns
  FROM information_schema.columns
  WHERE table_name = 'portfoliocompanies'
    AND column_name IN (
      'deployed_reserves_cents',
      'planned_reserves_cents',
      'exit_moic_bps',
      'ownership_current_pct',
      'allocation_cap_cents',
      'allocation_reason',
      'allocation_iteration',
      'last_allocation_at',
      'allocation_version'
    );

  IF remaining_columns > 0 THEN
    RAISE EXCEPTION 'Rollback failed: % allocation columns still exist', remaining_columns;
  END IF;

  -- Verify indexes were removed
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'portfoliocompanies'
      AND indexname IN (
        'idx_portfoliocompanies_fund_exit_moic',
        'idx_portfoliocompanies_fund_status_sector',
        'idx_portfoliocompanies_cursor',
        'idx_portfoliocompanies_last_allocation'
      )
  ) THEN
    RAISE EXCEPTION 'Rollback failed: Some indexes still exist';
  END IF;

  RAISE NOTICE 'Migration 20251007_fund_allocation_phase1a rolled back successfully';
  RAISE NOTICE 'Removed 9 columns and 4 indexes from portfoliocompanies table';
END $$;

-- ============================================================================
-- Rollback Complete
-- ============================================================================
