-- Migration: Fund Allocation Management - Phase 1a
-- Created: 2025-10-07
-- Purpose: Extend portfoliocompanies table with allocation tracking fields
-- Reference: DeepSeek Architecture Review - Option A (Extend Existing Table)

-- ============================================================================
-- PHASE 1a: Extend portfoliocompanies Table
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Starting Fund Allocation Management Phase 1a migration...';
  RAISE NOTICE 'Extending portfoliocompanies table with allocation tracking fields';
END $$;

-- ============================================================================
-- Add New Columns to portfoliocompanies
-- ============================================================================

-- Reserve tracking (stored in cents for precision)
ALTER TABLE portfoliocompanies
  ADD COLUMN IF NOT EXISTS deployed_reserves_cents BIGINT DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS planned_reserves_cents BIGINT DEFAULT 0 NOT NULL;

-- Exit and ownership metrics
ALTER TABLE portfoliocompanies
  ADD COLUMN IF NOT EXISTS exit_moic_bps INTEGER,
  ADD COLUMN IF NOT EXISTS ownership_current_pct DECIMAL(7,4);

-- Allocation management
ALTER TABLE portfoliocompanies
  ADD COLUMN IF NOT EXISTS allocation_cap_cents BIGINT,
  ADD COLUMN IF NOT EXISTS allocation_reason TEXT,
  ADD COLUMN IF NOT EXISTS allocation_iteration INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS last_allocation_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS allocation_version INTEGER DEFAULT 1 NOT NULL;

-- ============================================================================
-- Add Constraints
-- ============================================================================

-- Reserve amounts must be non-negative
ALTER TABLE portfoliocompanies
  ADD CONSTRAINT IF NOT EXISTS check_deployed_reserves_non_negative
    CHECK (deployed_reserves_cents >= 0);

ALTER TABLE portfoliocompanies
  ADD CONSTRAINT IF NOT EXISTS check_planned_reserves_non_negative
    CHECK (planned_reserves_cents >= 0);

-- MOIC in basis points should be reasonable (0 to 1,000,000 bps = 0x to 10,000x)
ALTER TABLE portfoliocompanies
  ADD CONSTRAINT IF NOT EXISTS check_exit_moic_reasonable
    CHECK (exit_moic_bps IS NULL OR (exit_moic_bps >= 0 AND exit_moic_bps <= 10000000));

-- Ownership percentage should be between 0 and 1 (0% to 100%)
ALTER TABLE portfoliocompanies
  ADD CONSTRAINT IF NOT EXISTS check_ownership_valid
    CHECK (ownership_current_pct IS NULL OR (ownership_current_pct >= 0 AND ownership_current_pct <= 1));

-- Allocation cap must be non-negative
ALTER TABLE portfoliocompanies
  ADD CONSTRAINT IF NOT EXISTS check_allocation_cap_non_negative
    CHECK (allocation_cap_cents IS NULL OR allocation_cap_cents >= 0);

-- Allocation iteration must be non-negative
ALTER TABLE portfoliocompanies
  ADD CONSTRAINT IF NOT EXISTS check_allocation_iteration_non_negative
    CHECK (allocation_iteration >= 0);

-- Allocation version must be positive
ALTER TABLE portfoliocompanies
  ADD CONSTRAINT IF NOT EXISTS check_allocation_version_positive
    CHECK (allocation_version >= 1);

-- ============================================================================
-- Create Performance Indexes
-- ============================================================================

-- Index for sorting companies by exit MOIC (descending, nulls last)
-- Used for prioritizing allocation to high-performing companies
CREATE INDEX IF NOT EXISTS idx_portfoliocompanies_fund_exit_moic
  ON portfoliocompanies(fund_id, exit_moic_bps DESC NULLS LAST)
  WHERE status = 'active';

-- Composite index for sector-based queries
-- Used for sector allocation and filtering
CREATE INDEX IF NOT EXISTS idx_portfoliocompanies_fund_status_sector
  ON portfoliocompanies(fund_id, status, sector);

-- Cursor-based pagination index
-- Used for efficient pagination through companies
CREATE INDEX IF NOT EXISTS idx_portfoliocompanies_cursor
  ON portfoliocompanies(fund_id, id DESC);

-- Index on allocation timestamp for recent activity queries
CREATE INDEX IF NOT EXISTS idx_portfoliocompanies_last_allocation
  ON portfoliocompanies(fund_id, last_allocation_at DESC NULLS LAST)
  WHERE last_allocation_at IS NOT NULL;

-- ============================================================================
-- Add Column Comments
-- ============================================================================

COMMENT ON COLUMN portfoliocompanies.deployed_reserves_cents IS
  'Already deployed reserve capital in cents (BIGINT for precision)';

COMMENT ON COLUMN portfoliocompanies.planned_reserves_cents IS
  'Planned/allocated reserve capital in cents (BIGINT for precision)';

COMMENT ON COLUMN portfoliocompanies.exit_moic_bps IS
  'Exit MOIC in basis points (10000 bps = 1.0x multiple). NULL if no exit yet.';

COMMENT ON COLUMN portfoliocompanies.ownership_current_pct IS
  'Current ownership percentage (0.0000 to 1.0000 = 0% to 100%)';

COMMENT ON COLUMN portfoliocompanies.allocation_cap_cents IS
  'Maximum allocation cap for this company in cents. NULL = no cap.';

COMMENT ON COLUMN portfoliocompanies.allocation_reason IS
  'Human-readable reason for allocation decision or cap';

COMMENT ON COLUMN portfoliocompanies.allocation_iteration IS
  'Iteration counter for allocation algorithm (0 = initial state)';

COMMENT ON COLUMN portfoliocompanies.last_allocation_at IS
  'Timestamp of last allocation calculation/update';

COMMENT ON COLUMN portfoliocompanies.allocation_version IS
  'Version number for allocation schema/algorithm (starts at 1)';

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
DECLARE
  column_count INTEGER;
BEGIN
  -- Count newly added columns
  SELECT COUNT(*) INTO column_count
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

  IF column_count < 9 THEN
    RAISE EXCEPTION 'Migration failed: Expected 9 new columns, found %', column_count;
  END IF;

  -- Verify indexes were created
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'portfoliocompanies'
      AND indexname = 'idx_portfoliocompanies_fund_exit_moic'
  ) THEN
    RAISE EXCEPTION 'Migration failed: idx_portfoliocompanies_fund_exit_moic not created';
  END IF;

  RAISE NOTICE 'Migration 20251007_fund_allocation_phase1a completed successfully';
  RAISE NOTICE 'Added 9 columns and 4 indexes to portfoliocompanies table';
END $$;

-- ============================================================================
-- Migration Complete
-- ============================================================================
