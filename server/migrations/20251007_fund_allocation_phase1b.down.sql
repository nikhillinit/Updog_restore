-- Migration Rollback: Fund Allocation Management - Phase 1b
-- Created: 2025-10-07
-- Purpose: Remove reallocation_audit table and related objects

-- ============================================================================
-- ROLLBACK: Phase 1b
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Rolling back Fund Allocation Management Phase 1b migration...';
END $$;

-- ============================================================================
-- Drop Helper Function
-- ============================================================================

DROP FUNCTION IF EXISTS log_reallocation_audit(
  INTEGER, INTEGER, INTEGER, INTEGER, JSONB, TEXT
);

-- ============================================================================
-- Drop Indexes (if table drop fails, indexes should be cleaned up)
-- ============================================================================

DROP INDEX IF EXISTS idx_reallocation_audit_fund;
DROP INDEX IF EXISTS idx_reallocation_audit_user;
DROP INDEX IF EXISTS idx_reallocation_audit_versions;
DROP INDEX IF EXISTS idx_reallocation_audit_changes_gin;

-- ============================================================================
-- Drop Table
-- ============================================================================

DROP TABLE IF EXISTS reallocation_audit CASCADE;

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'reallocation_audit'
  ) THEN
    RAISE EXCEPTION 'Rollback failed: reallocation_audit table still exists';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'log_reallocation_audit'
  ) THEN
    RAISE EXCEPTION 'Rollback failed: log_reallocation_audit function still exists';
  END IF;

  RAISE NOTICE 'Rollback of Phase 1b completed successfully';
END $$;

-- ============================================================================
-- Rollback Complete
-- ============================================================================
