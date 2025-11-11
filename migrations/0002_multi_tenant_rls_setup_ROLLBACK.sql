-- Rollback: Multi-Tenant RLS Infrastructure Setup
-- Description: Safely rolls back RLS implementation while preserving data
-- Author: Database Infrastructure Team
-- Date: 2024-11-10
-- Forward Migration: 0002_multi_tenant_rls_setup.sql

BEGIN;

-- ================================================================
-- PHASE 1: DISABLE ROW LEVEL SECURITY
-- ================================================================

-- Disable RLS on all tables (preserves data)
ALTER TABLE funds DISABLE ROW LEVEL SECURITY;
ALTER TABLE funds NO FORCE ROW LEVEL SECURITY;

ALTER TABLE portfoliocompanies DISABLE ROW LEVEL SECURITY;
ALTER TABLE portfoliocompanies NO FORCE ROW LEVEL SECURITY;

ALTER TABLE investments DISABLE ROW LEVEL SECURITY;
ALTER TABLE investments NO FORCE ROW LEVEL SECURITY;

ALTER TABLE investment_lots DISABLE ROW LEVEL SECURITY;
ALTER TABLE investment_lots NO FORCE ROW LEVEL SECURITY;

ALTER TABLE fundconfigs DISABLE ROW LEVEL SECURITY;
ALTER TABLE fundconfigs NO FORCE ROW LEVEL SECURITY;

ALTER TABLE fund_snapshots DISABLE ROW LEVEL SECURITY;
ALTER TABLE fund_snapshots NO FORCE ROW LEVEL SECURITY;

ALTER TABLE fund_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE fund_events NO FORCE ROW LEVEL SECURITY;

ALTER TABLE forecast_snapshots DISABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_snapshots NO FORCE ROW LEVEL SECURITY;

ALTER TABLE reserve_allocations DISABLE ROW LEVEL SECURITY;
ALTER TABLE reserve_allocations NO FORCE ROW LEVEL SECURITY;

ALTER TABLE fund_permissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE fund_permissions NO FORCE ROW LEVEL SECURITY;

ALTER TABLE audit_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events NO FORCE ROW LEVEL SECURITY;

-- ================================================================
-- PHASE 2: DROP RLS POLICIES
-- ================================================================

-- Drop all policies (safe - doesn't affect data)
DROP POLICY IF EXISTS funds_select_policy ON funds;
DROP POLICY IF EXISTS funds_insert_policy ON funds;
DROP POLICY IF EXISTS funds_update_policy ON funds;
DROP POLICY IF EXISTS funds_delete_policy ON funds;

DROP POLICY IF EXISTS portfoliocompanies_select_policy ON portfoliocompanies;
DROP POLICY IF EXISTS portfoliocompanies_insert_policy ON portfoliocompanies;
DROP POLICY IF EXISTS portfoliocompanies_update_policy ON portfoliocompanies;
DROP POLICY IF EXISTS portfoliocompanies_delete_policy ON portfoliocompanies;

DROP POLICY IF EXISTS investments_select_policy ON investments;
DROP POLICY IF EXISTS investments_insert_policy ON investments;
DROP POLICY IF EXISTS investments_update_policy ON investments;

DROP POLICY IF EXISTS investment_lots_select_policy ON investment_lots;
DROP POLICY IF EXISTS investment_lots_insert_policy ON investment_lots;
DROP POLICY IF EXISTS investment_lots_update_policy ON investment_lots;

DROP POLICY IF EXISTS audit_events_insert_policy ON audit_events;
DROP POLICY IF EXISTS audit_events_select_policy ON audit_events;

DROP POLICY IF EXISTS fund_permissions_select_policy ON fund_permissions;
DROP POLICY IF EXISTS fund_permissions_insert_policy ON fund_permissions;
DROP POLICY IF EXISTS fund_permissions_update_policy ON fund_permissions;
DROP POLICY IF EXISTS fund_permissions_delete_policy ON fund_permissions;

-- ================================================================
-- PHASE 3: DROP INDEXES (KEEP DATA)
-- ================================================================

-- Drop organization-specific indexes
DROP INDEX IF EXISTS idx_funds_org_id;
DROP INDEX IF EXISTS idx_funds_org_status;
DROP INDEX IF EXISTS idx_funds_org_active;
DROP INDEX IF EXISTS idx_portfoliocompanies_org_fund;
DROP INDEX IF EXISTS idx_portfoliocompanies_org_active;
DROP INDEX IF EXISTS idx_investments_org_fund;
DROP INDEX IF EXISTS idx_investment_lots_org_investment;
DROP INDEX IF EXISTS idx_audit_events_org_time;
DROP INDEX IF EXISTS idx_audit_events_actor;

-- ================================================================
-- PHASE 4: DROP HELPER FUNCTIONS
-- ================================================================

DROP FUNCTION IF EXISTS current_org_id();
DROP FUNCTION IF EXISTS current_user_id();
DROP FUNCTION IF EXISTS current_user_role();
DROP FUNCTION IF EXISTS current_fund_id();
DROP FUNCTION IF EXISTS has_role_permission(TEXT);
DROP FUNCTION IF EXISTS has_fund_access(INTEGER, TEXT);
DROP FUNCTION IF EXISTS verify_rls_setup();

-- ================================================================
-- PHASE 5: BACKUP ORGANIZATION DATA BEFORE REMOVAL
-- ================================================================

-- Create backup table for organization references
CREATE TABLE IF NOT EXISTS _backup_organization_refs AS
SELECT
  'funds' as table_name,
  id as record_id,
  organization_id
FROM funds
UNION ALL
SELECT
  'portfoliocompanies' as table_name,
  id as record_id,
  organization_id
FROM portfoliocompanies
UNION ALL
SELECT
  'investments' as table_name,
  id as record_id,
  organization_id
FROM investments
UNION ALL
SELECT
  'investment_lots' as table_name,
  id as record_id,
  organization_id
FROM investment_lots;

-- Add backup timestamp
ALTER TABLE _backup_organization_refs
  ADD COLUMN backed_up_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- ================================================================
-- PHASE 6: DROP FOREIGN KEY CONSTRAINTS
-- ================================================================

ALTER TABLE funds
  DROP CONSTRAINT IF EXISTS fk_funds_organization;

ALTER TABLE portfoliocompanies
  DROP CONSTRAINT IF EXISTS fk_portfoliocompanies_organization;

ALTER TABLE investments
  DROP CONSTRAINT IF EXISTS fk_investments_organization;

ALTER TABLE investment_lots
  DROP CONSTRAINT IF EXISTS fk_investment_lots_organization;

-- ================================================================
-- PHASE 7: DROP ORGANIZATION_ID COLUMNS (OPTIONAL)
-- ================================================================

-- WARNING: Only uncomment if you want to fully remove multi-tenancy
-- This will permanently delete the organization associations!

-- ALTER TABLE funds DROP COLUMN IF EXISTS organization_id;
-- ALTER TABLE portfoliocompanies DROP COLUMN IF EXISTS organization_id;
-- ALTER TABLE investments DROP COLUMN IF EXISTS organization_id;
-- ALTER TABLE investment_lots DROP COLUMN IF EXISTS organization_id;
-- ALTER TABLE fundconfigs DROP COLUMN IF EXISTS organization_id;
-- ALTER TABLE fund_snapshots DROP COLUMN IF EXISTS organization_id;
-- ALTER TABLE fund_events DROP COLUMN IF EXISTS organization_id;
-- ALTER TABLE forecast_snapshots DROP COLUMN IF EXISTS organization_id;
-- ALTER TABLE reserve_allocations DROP COLUMN IF EXISTS organization_id;

-- ================================================================
-- PHASE 8: DROP SUPPORTING TABLES (OPTIONAL)
-- ================================================================

-- WARNING: Only uncomment if you want to fully remove multi-tenancy infrastructure

-- DROP TABLE IF EXISTS fund_permissions;
-- DROP TABLE IF EXISTS audit_events;
-- DROP TABLE IF EXISTS users_organizations;
-- DROP TABLE IF EXISTS organizations;
-- DROP TABLE IF EXISTS migration_progress;

-- ================================================================
-- PHASE 9: LOG ROLLBACK COMPLETION
-- ================================================================

-- Create rollback log if migration_progress still exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'migration_progress') THEN
    INSERT INTO migration_progress (
      table_name,
      processed_rows,
      total_rows,
      percentage,
      status,
      completed_at,
      metadata
    )
    VALUES (
      'RLS_ROLLBACK_COMPLETE',
      1,
      1,
      100,
      'rolled_back',
      NOW(),
      jsonb_build_object(
        'backup_table', '_backup_organization_refs',
        'policies_dropped', true,
        'rls_disabled', true,
        'data_preserved', true
      )
    );
  END IF;
END $$;

-- ================================================================
-- ROLLBACK COMPLETE
-- ================================================================

COMMIT;

-- ================================================================
-- POST-ROLLBACK VERIFICATION
-- ================================================================

-- Run these queries manually to verify rollback success:

-- 1. Check RLS is disabled:
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- AND tablename IN ('funds', 'portfoliocompanies', 'investments');

-- 2. Check policies are removed:
-- SELECT COUNT(*) as policy_count
-- FROM pg_policies
-- WHERE schemaname = 'public';

-- 3. Verify data is intact:
-- SELECT COUNT(*) FROM funds;
-- SELECT COUNT(*) FROM portfoliocompanies;
-- SELECT COUNT(*) FROM investments;

-- 4. Check backup table exists:
-- SELECT COUNT(*) FROM _backup_organization_refs;