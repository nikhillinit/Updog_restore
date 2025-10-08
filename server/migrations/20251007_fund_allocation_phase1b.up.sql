-- Migration: Fund Allocation Management - Phase 1b
-- Created: 2025-10-07
-- Purpose: Create reallocation_audit table for tracking allocation changes
-- Reference: DeepSeek Architecture Review - Phase 1b (Reallocation API)

-- ============================================================================
-- PHASE 1b: Reallocation Audit Trail
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Starting Fund Allocation Management Phase 1b migration...';
  RAISE NOTICE 'Creating reallocation_audit table for change tracking';
END $$;

-- ============================================================================
-- Create reallocation_audit Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS reallocation_audit (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Fund and user context
  fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),

  -- Version tracking
  baseline_version INTEGER NOT NULL,
  new_version INTEGER NOT NULL,

  -- Change details (stored as JSONB for flexibility)
  changes_json JSONB NOT NULL,

  -- Human-readable reason for reallocation
  reason TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Constraints
  CONSTRAINT check_version_increment CHECK (new_version > baseline_version),
  CONSTRAINT check_changes_not_empty CHECK (changes_json != '{}'::jsonb)
);

-- ============================================================================
-- Create Indexes
-- ============================================================================

-- Index for fund-based queries (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_reallocation_audit_fund
  ON reallocation_audit(fund_id, created_at DESC);

-- Index for user-based audit queries
CREATE INDEX IF NOT EXISTS idx_reallocation_audit_user
  ON reallocation_audit(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Index for version-based queries
CREATE INDEX IF NOT EXISTS idx_reallocation_audit_versions
  ON reallocation_audit(fund_id, baseline_version, new_version);

-- GIN index for JSONB change search
CREATE INDEX IF NOT EXISTS idx_reallocation_audit_changes_gin
  ON reallocation_audit USING GIN(changes_json);

-- ============================================================================
-- Add Column Comments
-- ============================================================================

COMMENT ON TABLE reallocation_audit IS
  'Audit trail for reserve allocation changes. Tracks all modifications to planned_reserves_cents with full change history.';

COMMENT ON COLUMN reallocation_audit.id IS
  'Unique identifier for each audit record (UUID for distributed systems)';

COMMENT ON COLUMN reallocation_audit.fund_id IS
  'Foreign key to funds table. Links this audit record to a specific fund.';

COMMENT ON COLUMN reallocation_audit.user_id IS
  'Foreign key to users table. Tracks which user made the change. NULL for system-generated changes.';

COMMENT ON COLUMN reallocation_audit.baseline_version IS
  'Version number of allocations before this change. Used for optimistic locking.';

COMMENT ON COLUMN reallocation_audit.new_version IS
  'Version number of allocations after this change. Must be > baseline_version.';

COMMENT ON COLUMN reallocation_audit.changes_json IS
  'JSONB array of change records. Each record contains: {company_id, company_name, from_cents, to_cents, delta_cents}';

COMMENT ON COLUMN reallocation_audit.reason IS
  'Optional human-readable explanation for why this reallocation was made';

COMMENT ON COLUMN reallocation_audit.created_at IS
  'Timestamp when this audit record was created';

-- ============================================================================
-- Add Sample Data Comment
-- ============================================================================

COMMENT ON COLUMN reallocation_audit.changes_json IS
  'JSONB array of change records. Example structure:
  [
    {
      "company_id": 1,
      "company_name": "Acme Corp",
      "from_cents": 100000000,
      "to_cents": 150000000,
      "delta_cents": 50000000
    },
    {
      "company_id": 2,
      "company_name": "Beta Inc",
      "from_cents": 50000000,
      "to_cents": 40000000,
      "delta_cents": -10000000
    }
  ]';

-- ============================================================================
-- Create Helper Function for Audit Insertion
-- ============================================================================

CREATE OR REPLACE FUNCTION log_reallocation_audit(
  p_fund_id INTEGER,
  p_user_id INTEGER,
  p_baseline_version INTEGER,
  p_new_version INTEGER,
  p_changes_json JSONB,
  p_reason TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_audit_id UUID;
BEGIN
  INSERT INTO reallocation_audit (
    fund_id,
    user_id,
    baseline_version,
    new_version,
    changes_json,
    reason
  ) VALUES (
    p_fund_id,
    p_user_id,
    p_baseline_version,
    p_new_version,
    p_changes_json,
    p_reason
  )
  RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION log_reallocation_audit IS
  'Helper function to insert audit records. Returns the UUID of the created audit record.';

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
DECLARE
  table_exists BOOLEAN;
  index_count INTEGER;
BEGIN
  -- Verify table was created
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'reallocation_audit'
  ) INTO table_exists;

  IF NOT table_exists THEN
    RAISE EXCEPTION 'Migration failed: reallocation_audit table not created';
  END IF;

  -- Verify indexes were created
  SELECT COUNT(*) INTO index_count
  FROM pg_indexes
  WHERE tablename = 'reallocation_audit'
    AND indexname IN (
      'idx_reallocation_audit_fund',
      'idx_reallocation_audit_user',
      'idx_reallocation_audit_versions',
      'idx_reallocation_audit_changes_gin'
    );

  IF index_count < 4 THEN
    RAISE EXCEPTION 'Migration failed: Expected 4 indexes, found %', index_count;
  END IF;

  -- Verify helper function exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'log_reallocation_audit'
  ) THEN
    RAISE EXCEPTION 'Migration failed: log_reallocation_audit function not created';
  END IF;

  RAISE NOTICE 'Migration 20251007_fund_allocation_phase1b completed successfully';
  RAISE NOTICE 'Created reallocation_audit table with 4 indexes and helper function';
END $$;

-- ============================================================================
-- Migration Complete
-- ============================================================================
