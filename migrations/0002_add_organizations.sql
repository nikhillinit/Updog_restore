-- Migration: Add organizations table for multi-tenancy
-- Author: DX Optimization
-- Date: 2025-11-10
-- Purpose: Enable Row-Level Security (RLS) for multi-tenant isolation

-- ============================================================================
-- ORGANIZATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS organizations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,

  -- Feature flags and limits per organization
  settings JSONB DEFAULT '{}'::jsonb,

  -- Soft delete support
  deleted_at TIMESTAMP WITH TIME ZONE,

  CONSTRAINT organizations_slug_format CHECK (slug ~ '^[a-z0-9-]+$')
);

CREATE INDEX idx_organizations_slug ON organizations(slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_organizations_deleted ON organizations(deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================================
-- ADD ORGANIZATION FOREIGN KEYS TO EXISTING TABLES
-- ============================================================================

-- Add org_id to funds table
ALTER TABLE funds ADD COLUMN IF NOT EXISTS org_id INTEGER;
ALTER TABLE funds ADD CONSTRAINT fk_funds_organization
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_funds_org_id ON funds(org_id);

-- Add org_id to portfoliocompanies table
ALTER TABLE portfoliocompanies ADD COLUMN IF NOT EXISTS org_id INTEGER;
ALTER TABLE portfoliocompanies ADD CONSTRAINT fk_portfoliocompanies_organization
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_portfoliocompanies_org_id ON portfoliocompanies(org_id);

-- Add org_id to investments table
ALTER TABLE investments ADD COLUMN IF NOT EXISTS org_id INTEGER;
ALTER TABLE investments ADD CONSTRAINT fk_investments_organization
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_investments_org_id ON investments(org_id);

-- Add org_id to fundconfigs table
ALTER TABLE fundconfigs ADD COLUMN IF NOT EXISTS org_id INTEGER;
ALTER TABLE fundconfigs ADD CONSTRAINT fk_fundconfigs_organization
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_fundconfigs_org_id ON fundconfigs(org_id);

-- ============================================================================
-- ROW-LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all tenant-scoped tables
ALTER TABLE funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfoliocompanies ENABLE ROW LEVEL SECURITY;
ALTER TABLE investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE fundconfigs ENABLE ROW LEVEL SECURITY;

-- Create policy helper function to get current org_id from session
CREATE OR REPLACE FUNCTION current_org_id() RETURNS INTEGER AS $$
  SELECT NULLIF(current_setting('app.current_org_id', TRUE), '')::INTEGER;
$$ LANGUAGE SQL STABLE;

-- Funds policies
CREATE POLICY funds_isolation_policy ON funds
  USING (org_id = current_org_id());

CREATE POLICY funds_insert_policy ON funds
  FOR INSERT
  WITH CHECK (org_id = current_org_id());

-- Portfolio companies policies
CREATE POLICY portfoliocompanies_isolation_policy ON portfoliocompanies
  USING (org_id = current_org_id());

CREATE POLICY portfoliocompanies_insert_policy ON portfoliocompanies
  FOR INSERT
  WITH CHECK (org_id = current_org_id());

-- Investments policies
CREATE POLICY investments_isolation_policy ON investments
  USING (org_id = current_org_id());

CREATE POLICY investments_insert_policy ON investments
  FOR INSERT
  WITH CHECK (org_id = current_org_id());

-- Fund configs policies
CREATE POLICY fundconfigs_isolation_policy ON fundconfigs
  USING (org_id = current_org_id());

CREATE POLICY fundconfigs_insert_policy ON fundconfigs
  FOR INSERT
  WITH CHECK (org_id = current_org_id());

-- ============================================================================
-- AUDIT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- HELPER FUNCTIONS FOR DEVELOPMENT
-- ============================================================================

-- Switch tenant context (for testing)
CREATE OR REPLACE FUNCTION switch_tenant(org_id_param INTEGER) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.current_org_id', org_id_param::TEXT, FALSE);
END;
$$ LANGUAGE plpgsql;

-- Get current tenant context
CREATE OR REPLACE FUNCTION get_tenant() RETURNS INTEGER AS $$
  SELECT current_org_id();
$$ LANGUAGE SQL;

-- Reset tenant context (for cleanup)
CREATE OR REPLACE FUNCTION reset_tenant() RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.current_org_id', '', FALSE);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION switch_tenant IS 'Switch to a specific organization context for testing';
COMMENT ON FUNCTION get_tenant IS 'Get the current organization ID from session';
COMMENT ON FUNCTION reset_tenant IS 'Clear the current organization context';
