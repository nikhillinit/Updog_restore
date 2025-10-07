-- Migration Rollback: Remove Scenario Analysis Tables
-- Created: 2025-10-07
-- Purpose: Safely rollback scenario analysis feature if needed

-- ============================================================================
-- WARNING: This will delete all scenario data!
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Rolling back scenario analysis migration...';
  RAISE NOTICE 'WARNING: This will delete all scenario data!';
END $$;

-- ============================================================================
-- Drop Tables (in reverse order of dependencies)
-- ============================================================================

-- Drop audit logs first (no dependencies)
DROP TABLE IF EXISTS scenario_audit_logs CASCADE;

-- Drop scenario cases (depends on scenarios)
DROP TABLE IF EXISTS scenario_cases CASCADE;

-- Drop scenarios (depends on portfolio_companies)
DROP TABLE IF EXISTS scenarios CASCADE;

-- ============================================================================
-- Drop Trigger Function (if not used elsewhere)
-- ============================================================================

-- Note: Only drop if not used by other tables
-- Commented out for safety - verify usage before dropping

/*
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
*/

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'scenarios') THEN
    RAISE EXCEPTION 'Rollback failed: scenarios table still exists';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'scenario_cases') THEN
    RAISE EXCEPTION 'Rollback failed: scenario_cases table still exists';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'scenario_audit_logs') THEN
    RAISE EXCEPTION 'Rollback failed: scenario_audit_logs table still exists';
  END IF;

  RAISE NOTICE 'Migration 20251007_add_scenarios rolled back successfully';
END $$;
