-- Migration: Multi-Tenant RLS Infrastructure Setup
-- Description: Implements production-grade Row Level Security for multi-tenant isolation
-- Author: Database Infrastructure Team
-- Date: 2024-11-10
-- Rollback: 0002_multi_tenant_rls_setup_ROLLBACK.sql

BEGIN;

-- ================================================================
-- PHASE 1: ADD ORGANIZATION_ID TO ALL TABLES
-- ================================================================

-- Add organization_id column to all tables (initially nullable)
ALTER TABLE funds
  ADD COLUMN IF NOT EXISTS organization_id UUID;

ALTER TABLE portfoliocompanies
  ADD COLUMN IF NOT EXISTS organization_id UUID;

ALTER TABLE investments
  ADD COLUMN IF NOT EXISTS organization_id UUID;

ALTER TABLE investment_lots
  ADD COLUMN IF NOT EXISTS organization_id UUID;

ALTER TABLE fundconfigs
  ADD COLUMN IF NOT EXISTS organization_id UUID;

ALTER TABLE fund_snapshots
  ADD COLUMN IF NOT EXISTS organization_id UUID;

ALTER TABLE fund_events
  ADD COLUMN IF NOT EXISTS organization_id UUID;

ALTER TABLE forecast_snapshots
  ADD COLUMN IF NOT EXISTS organization_id UUID;

ALTER TABLE reserve_allocations
  ADD COLUMN IF NOT EXISTS organization_id UUID;

-- Create organizations table if not exists
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  subscription_tier VARCHAR(50) DEFAULT 'standard',
  max_funds INTEGER DEFAULT 10,
  max_users INTEGER DEFAULT 25,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  archived_at TIMESTAMP WITH TIME ZONE
);

-- Create users_organizations junction table
CREATE TABLE IF NOT EXISTS users_organizations (
  user_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  role VARCHAR(50) NOT NULL DEFAULT 'viewer',
  is_default BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, organization_id)
);

-- Create fund_permissions table for fine-grained access
CREATE TABLE IF NOT EXISTS fund_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id INTEGER NOT NULL REFERENCES funds(id),
  user_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  permission_level VARCHAR(50) NOT NULL, -- 'view', 'edit', 'admin'
  granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  granted_by UUID,
  UNIQUE(fund_id, user_id, organization_id)
);

-- Create audit_events table
CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  actor_sub UUID NOT NULL,
  actor_email VARCHAR(255) NOT NULL,
  organization_id UUID NOT NULL,
  fund_id INTEGER,
  entity_type VARCHAR(50),
  entity_id UUID,
  action VARCHAR(50) NOT NULL,
  changes JSONB,
  metadata JSONB,
  event_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

-- ================================================================
-- PHASE 2: CREATE RLS HELPER FUNCTIONS
-- ================================================================

-- Fail-closed context functions (return invalid UUID if not set)
CREATE OR REPLACE FUNCTION current_org_id()
RETURNS UUID AS $$
BEGIN
  -- Return invalid UUID if context not set (fail closed)
  RETURN COALESCE(
    NULLIF(current_setting('app.current_org', true), '')::UUID,
    '00000000-0000-0000-0000-000000000000'::UUID
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION current_user_id()
RETURNS UUID AS $$
BEGIN
  RETURN COALESCE(
    NULLIF(current_setting('app.current_user', true), '')::UUID,
    '00000000-0000-0000-0000-000000000000'::UUID
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION current_user_role()
RETURNS TEXT AS $$
BEGIN
  RETURN COALESCE(
    NULLIF(current_setting('app.current_role', true), ''),
    'none'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION current_fund_id()
RETURNS INTEGER AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_fund', true), '')::INTEGER;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Role hierarchy check
CREATE OR REPLACE FUNCTION has_role_permission(required_role TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
  role_levels JSONB := '{"admin": 4, "partner": 3, "analyst": 2, "viewer": 1, "none": 0}'::JSONB;
  user_level INT;
  required_level INT;
BEGIN
  user_role := current_user_role();
  user_level := COALESCE((role_levels->user_role)::INT, 0);
  required_level := COALESCE((role_levels->required_role)::INT, 999);

  RETURN user_level >= required_level;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Fund access check
CREATE OR REPLACE FUNCTION has_fund_access(p_fund_id INTEGER, p_required_permission TEXT DEFAULT 'view')
RETURNS BOOLEAN AS $$
DECLARE
  has_access BOOLEAN;
BEGIN
  -- Admin and partner have implicit access
  IF has_role_permission('partner') THEN
    RETURN TRUE;
  END IF;

  -- Check explicit permissions
  SELECT EXISTS(
    SELECT 1
    FROM fund_permissions
    WHERE fund_id = p_fund_id
    AND user_id = current_user_id()
    AND organization_id = current_org_id()
    AND (
      (p_required_permission = 'view' AND permission_level IN ('view', 'edit', 'admin'))
      OR (p_required_permission = 'edit' AND permission_level IN ('edit', 'admin'))
      OR (p_required_permission = 'admin' AND permission_level = 'admin')
    )
  ) INTO has_access;

  RETURN has_access;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ================================================================
-- PHASE 3: CREATE MIGRATION TRACKING
-- ================================================================

CREATE TABLE IF NOT EXISTS migration_progress (
  id SERIAL PRIMARY KEY,
  migration_id UUID DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  processed_rows INTEGER NOT NULL DEFAULT 0,
  total_rows INTEGER NOT NULL,
  percentage NUMERIC(5,2),
  last_processed_id INTEGER,
  error_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running',
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB
);

-- ================================================================
-- PHASE 4: BACKFILL ORGANIZATION_ID
-- ================================================================

-- Create default organization for migration
INSERT INTO organizations (id, name, slug, status, subscription_tier)
VALUES (
  'a1111111-1111-1111-1111-111111111111'::UUID,
  'Default Organization',
  'default-org',
  'active',
  'enterprise'
) ON CONFLICT (slug) DO NOTHING;

-- Backfill funds
WITH org_update AS (
  UPDATE funds
  SET organization_id = 'a1111111-1111-1111-1111-111111111111'::UUID
  WHERE organization_id IS NULL
  RETURNING id
)
INSERT INTO migration_progress (table_name, processed_rows, total_rows, status)
SELECT
  'funds',
  COUNT(*),
  (SELECT COUNT(*) FROM funds),
  'completed'
FROM org_update;

-- Backfill portfoliocompanies (derive from fund relationship)
WITH org_update AS (
  UPDATE portfoliocompanies pc
  SET organization_id = f.organization_id
  FROM funds f
  WHERE pc.fund_id = f.id
  AND pc.organization_id IS NULL
  RETURNING pc.id
)
INSERT INTO migration_progress (table_name, processed_rows, total_rows, status)
SELECT
  'portfoliocompanies',
  COUNT(*),
  (SELECT COUNT(*) FROM portfoliocompanies),
  'completed'
FROM org_update;

-- Backfill investments (derive from fund relationship)
WITH org_update AS (
  UPDATE investments i
  SET organization_id = f.organization_id
  FROM funds f
  WHERE i.fund_id = f.id
  AND i.organization_id IS NULL
  RETURNING i.id
)
INSERT INTO migration_progress (table_name, processed_rows, total_rows, status)
SELECT
  'investments',
  COUNT(*),
  (SELECT COUNT(*) FROM investments),
  'completed'
FROM org_update;

-- Backfill investment_lots (derive from investment relationship)
WITH org_update AS (
  UPDATE investment_lots il
  SET organization_id = i.organization_id
  FROM investments i
  WHERE il.investment_id = i.id
  AND il.organization_id IS NULL
  RETURNING il.id
)
INSERT INTO migration_progress (table_name, processed_rows, total_rows, status)
SELECT
  'investment_lots',
  COUNT(*),
  (SELECT COUNT(*) FROM investment_lots),
  'completed'
FROM org_update;

-- Backfill other tables similarly
UPDATE fundconfigs fc
SET organization_id = f.organization_id
FROM funds f
WHERE fc.fund_id = f.id
AND fc.organization_id IS NULL;

UPDATE fund_snapshots fs
SET organization_id = f.organization_id
FROM funds f
WHERE fs.fund_id = f.id
AND fs.organization_id IS NULL;

UPDATE fund_events fe
SET organization_id = f.organization_id
FROM funds f
WHERE fe.fund_id = f.id
AND fe.organization_id IS NULL;

-- ================================================================
-- PHASE 5: ADD NOT NULL CONSTRAINTS
-- ================================================================

-- Add NOT NULL constraints after backfill
ALTER TABLE funds
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE portfoliocompanies
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE investments
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE investment_lots
  ALTER COLUMN organization_id SET NOT NULL;

-- Add foreign key constraints
ALTER TABLE funds
  ADD CONSTRAINT fk_funds_organization
  FOREIGN KEY (organization_id)
  REFERENCES organizations(id);

ALTER TABLE portfoliocompanies
  ADD CONSTRAINT fk_portfoliocompanies_organization
  FOREIGN KEY (organization_id)
  REFERENCES organizations(id);

ALTER TABLE investments
  ADD CONSTRAINT fk_investments_organization
  FOREIGN KEY (organization_id)
  REFERENCES organizations(id);

ALTER TABLE investment_lots
  ADD CONSTRAINT fk_investment_lots_organization
  FOREIGN KEY (organization_id)
  REFERENCES organizations(id);

-- ================================================================
-- PHASE 6: CREATE PERFORMANCE INDEXES
-- ================================================================

-- Compound indexes with organization_id as leading column
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_funds_org_id
  ON funds(organization_id, id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_funds_org_status
  ON funds(organization_id, status)
  WHERE is_active = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_portfoliocompanies_org_fund
  ON portfoliocompanies(organization_id, fund_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_investments_org_fund
  ON investments(organization_id, fund_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_investment_lots_org_investment
  ON investment_lots(organization_id, investment_id);

-- Partial indexes for active records
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_funds_org_active
  ON funds(organization_id, id)
  WHERE status = 'active';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_portfoliocompanies_org_active
  ON portfoliocompanies(organization_id, fund_id)
  WHERE status = 'active';

-- Audit table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_events_org_time
  ON audit_events(organization_id, event_time DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_events_actor
  ON audit_events(actor_sub, event_time DESC);

-- ================================================================
-- PHASE 7: ENABLE ROW LEVEL SECURITY
-- ================================================================

-- Enable RLS on all tables (FORCE ensures it applies to table owner too)
ALTER TABLE funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE funds FORCE ROW LEVEL SECURITY;

ALTER TABLE portfoliocompanies ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfoliocompanies FORCE ROW LEVEL SECURITY;

ALTER TABLE investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE investments FORCE ROW LEVEL SECURITY;

ALTER TABLE investment_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_lots FORCE ROW LEVEL SECURITY;

ALTER TABLE fundconfigs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fundconfigs FORCE ROW LEVEL SECURITY;

ALTER TABLE fund_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE fund_snapshots FORCE ROW LEVEL SECURITY;

ALTER TABLE fund_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE fund_events FORCE ROW LEVEL SECURITY;

ALTER TABLE forecast_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_snapshots FORCE ROW LEVEL SECURITY;

ALTER TABLE reserve_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reserve_allocations FORCE ROW LEVEL SECURITY;

ALTER TABLE fund_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fund_permissions FORCE ROW LEVEL SECURITY;

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

-- ================================================================
-- PHASE 8: CREATE RLS POLICIES
-- ================================================================

-- Note: These policies assume the application role name is defined
-- Replace 'application_role' with your actual role name (e.g., 'updog_app')

-- Funds policies
CREATE POLICY funds_select_policy ON funds
  FOR SELECT
  USING (organization_id = current_org_id());

CREATE POLICY funds_insert_policy ON funds
  FOR INSERT
  WITH CHECK (
    organization_id = current_org_id()
    AND has_role_permission('partner')
  );

CREATE POLICY funds_update_policy ON funds
  FOR UPDATE
  USING (organization_id = current_org_id())
  WITH CHECK (
    organization_id = current_org_id()
    AND has_role_permission('partner')
  );

CREATE POLICY funds_delete_policy ON funds
  FOR DELETE
  USING (
    organization_id = current_org_id()
    AND has_role_permission('admin')
  );

-- Portfolio companies policies (check fund relationship)
CREATE POLICY portfoliocompanies_select_policy ON portfoliocompanies
  FOR SELECT
  USING (
    organization_id = current_org_id()
    AND has_fund_access(fund_id, 'view')
  );

CREATE POLICY portfoliocompanies_insert_policy ON portfoliocompanies
  FOR INSERT
  WITH CHECK (
    organization_id = current_org_id()
    AND has_fund_access(fund_id, 'edit')
  );

CREATE POLICY portfoliocompanies_update_policy ON portfoliocompanies
  FOR UPDATE
  USING (organization_id = current_org_id())
  WITH CHECK (
    organization_id = current_org_id()
    AND has_fund_access(fund_id, 'edit')
  );

CREATE POLICY portfoliocompanies_delete_policy ON portfoliocompanies
  FOR DELETE
  USING (
    organization_id = current_org_id()
    AND has_fund_access(fund_id, 'admin')
  );

-- Investments policies
CREATE POLICY investments_select_policy ON investments
  FOR SELECT
  USING (
    organization_id = current_org_id()
    AND has_fund_access(fund_id, 'view')
  );

CREATE POLICY investments_insert_policy ON investments
  FOR INSERT
  WITH CHECK (
    organization_id = current_org_id()
    AND has_fund_access(fund_id, 'edit')
  );

CREATE POLICY investments_update_policy ON investments
  FOR UPDATE
  USING (organization_id = current_org_id())
  WITH CHECK (
    organization_id = current_org_id()
    AND has_fund_access(fund_id, 'edit')
  );

-- Investment lots policies
CREATE POLICY investment_lots_select_policy ON investment_lots
  FOR SELECT
  USING (organization_id = current_org_id());

CREATE POLICY investment_lots_insert_policy ON investment_lots
  FOR INSERT
  WITH CHECK (
    organization_id = current_org_id()
    AND EXISTS (
      SELECT 1 FROM investments i
      WHERE i.id = investment_lots.investment_id
      AND i.organization_id = current_org_id()
    )
  );

CREATE POLICY investment_lots_update_policy ON investment_lots
  FOR UPDATE
  USING (organization_id = current_org_id())
  WITH CHECK (organization_id = current_org_id());

-- Audit events policies (insert-only for apps, read for analytics)
CREATE POLICY audit_events_insert_policy ON audit_events
  FOR INSERT
  WITH CHECK (organization_id = current_org_id());

CREATE POLICY audit_events_select_policy ON audit_events
  FOR SELECT
  USING (
    organization_id = current_org_id()
    AND has_role_permission('analyst')
  );

-- Fund permissions policies
CREATE POLICY fund_permissions_select_policy ON fund_permissions
  FOR SELECT
  USING (
    organization_id = current_org_id()
    AND (
      has_role_permission('admin')
      OR user_id = current_user_id()
    )
  );

CREATE POLICY fund_permissions_insert_policy ON fund_permissions
  FOR INSERT
  WITH CHECK (
    organization_id = current_org_id()
    AND has_role_permission('admin')
  );

CREATE POLICY fund_permissions_update_policy ON fund_permissions
  FOR UPDATE
  USING (organization_id = current_org_id())
  WITH CHECK (
    organization_id = current_org_id()
    AND has_role_permission('admin')
  );

CREATE POLICY fund_permissions_delete_policy ON fund_permissions
  FOR DELETE
  USING (
    organization_id = current_org_id()
    AND has_role_permission('admin')
  );

-- ================================================================
-- PHASE 9: PERFORMANCE STATISTICS
-- ================================================================

-- Update table statistics for query planner
ANALYZE funds;
ANALYZE portfoliocompanies;
ANALYZE investments;
ANALYZE investment_lots;
ANALYZE fundconfigs;
ANALYZE fund_snapshots;
ANALYZE fund_events;
ANALYZE organizations;
ANALYZE fund_permissions;
ANALYZE audit_events;

-- ================================================================
-- PHASE 10: VERIFICATION
-- ================================================================

-- Create verification function
CREATE OR REPLACE FUNCTION verify_rls_setup()
RETURNS TABLE(
  check_name TEXT,
  status TEXT,
  details TEXT
) AS $$
BEGIN
  -- Check RLS is enabled
  RETURN QUERY
  SELECT
    'RLS Enabled on funds'::TEXT,
    CASE WHEN relrowsecurity THEN 'PASS' ELSE 'FAIL' END,
    'Row security is ' || CASE WHEN relrowsecurity THEN 'enabled' ELSE 'disabled' END
  FROM pg_class
  WHERE relname = 'funds';

  -- Check indexes exist
  RETURN QUERY
  SELECT
    'Organization indexes exist'::TEXT,
    CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END,
    COUNT(*) || ' organization indexes found'
  FROM pg_indexes
  WHERE indexname LIKE 'idx_%org%';

  -- Check policies exist
  RETURN QUERY
  SELECT
    'RLS policies created'::TEXT,
    CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END,
    COUNT(*) || ' policies found'
  FROM pg_policies
  WHERE schemaname = 'public';

  -- Check organization_id NOT NULL
  RETURN QUERY
  SELECT
    'organization_id NOT NULL on funds'::TEXT,
    CASE WHEN NOT attnotnull THEN 'FAIL' ELSE 'PASS' END,
    'Column is ' || CASE WHEN attnotnull THEN 'NOT NULL' ELSE 'nullable' END
  FROM pg_attribute
  WHERE attrelid = 'funds'::regclass
  AND attname = 'organization_id';
END;
$$ LANGUAGE plpgsql;

-- Run verification
SELECT * FROM verify_rls_setup();

-- ================================================================
-- MIGRATION COMPLETE
-- ================================================================

-- Log completion
INSERT INTO migration_progress (
  table_name,
  processed_rows,
  total_rows,
  percentage,
  status,
  completed_at
)
VALUES (
  'RLS_MIGRATION_COMPLETE',
  1,
  1,
  100,
  'completed',
  NOW()
);

COMMIT;