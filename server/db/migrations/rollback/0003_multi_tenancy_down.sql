-- Rollback 0003: Multi-Tenancy
-- Complete DOWN migration for 0003_multi_tenancy.sql

-- Drop flag cache
DROP TABLE IF EXISTS flag_cache CASCADE;

-- Drop feature flags
DROP INDEX IF EXISTS idx_feature_flags_version;
DROP INDEX IF EXISTS idx_feature_flags_enabled;
DROP INDEX IF EXISTS idx_feature_flags_lookup;
DROP TABLE IF EXISTS feature_flags CASCADE;

-- Disable RLS and drop policies
DROP POLICY IF EXISTS investment_isolation ON investments;
DROP POLICY IF EXISTS portfolio_isolation ON portfolio_companies;
DROP POLICY IF EXISTS fund_config_isolation ON fund_configs;
DROP POLICY IF EXISTS fund_isolation ON funds;

ALTER TABLE investments DISABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE fund_configs DISABLE ROW LEVEL SECURITY;
ALTER TABLE funds DISABLE ROW LEVEL SECURITY;

-- Remove organization references from funds
DROP INDEX IF EXISTS idx_funds_org;
ALTER TABLE funds 
  DROP COLUMN IF EXISTS organization_id,
  DROP COLUMN IF EXISTS tenant_isolation;

-- Drop partners table
DROP INDEX IF EXISTS idx_partners_email;
DROP INDEX IF EXISTS idx_partners_org;
DROP TABLE IF EXISTS partners CASCADE;

-- Drop organizations table
DROP TABLE IF EXISTS organizations CASCADE;