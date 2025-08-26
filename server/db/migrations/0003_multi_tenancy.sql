-- Migration 0003: Multi-Tenancy with RLS (Step 3)
-- Reversible migration for organizations, RLS policies, and hierarchical flags

-- ============================================================
-- UP MIGRATION
-- ============================================================

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partners table for proper approval validation
CREATE TABLE IF NOT EXISTS partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  partner_id VARCHAR(100) NOT NULL UNIQUE, -- Canonical partner identifier
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'partner', -- partner, senior_partner, managing_partner
  can_approve BOOLEAN DEFAULT true,
  totp_secret VARCHAR(255), -- For 2FA on approvals
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partners_org ON partners(organization_id);
CREATE INDEX IF NOT EXISTS idx_partners_email ON partners(email);

-- Add organization_id to funds
ALTER TABLE funds 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id),
ADD COLUMN IF NOT EXISTS tenant_isolation JSONB DEFAULT '{"enabled": true}';

-- Create indexes for tenant queries
CREATE INDEX IF NOT EXISTS idx_funds_org ON funds(organization_id);

-- Enable Row Level Security on tenant-scoped tables
ALTER TABLE funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE fund_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE investments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for fund isolation
DO $$ 
BEGIN
  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS fund_isolation ON funds;
  DROP POLICY IF EXISTS fund_config_isolation ON fund_configs;
  DROP POLICY IF EXISTS portfolio_isolation ON portfolio_companies;
  DROP POLICY IF EXISTS investment_isolation ON investments;
  
  -- Create new policies
  CREATE POLICY fund_isolation ON funds
    USING (organization_id = NULLIF(current_setting('app.current_org', true), '')::UUID);
  
  CREATE POLICY fund_config_isolation ON fund_configs
    USING (fund_id IN (
      SELECT id FROM funds 
      WHERE organization_id = NULLIF(current_setting('app.current_org', true), '')::UUID
    ));
  
  CREATE POLICY portfolio_isolation ON portfolio_companies
    USING (fund_id IN (
      SELECT id FROM funds 
      WHERE organization_id = NULLIF(current_setting('app.current_org', true), '')::UUID
    ));
  
  CREATE POLICY investment_isolation ON investments
    USING (fund_id IN (
      SELECT id FROM funds 
      WHERE organization_id = NULLIF(current_setting('app.current_org', true), '')::UUID
    ));
END $$;

-- Hierarchical feature flags
CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) NOT NULL,
  scope VARCHAR(20) NOT NULL CHECK (scope IN ('global', 'org', 'fund', 'user')),
  scope_id UUID, -- NULL for global, otherwise org/fund/user id
  value JSONB NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT true,
  rollout_percentage INTEGER DEFAULT 100 CHECK (rollout_percentage BETWEEN 0 AND 100),
  conditions JSONB DEFAULT '[]', -- targeting rules
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  version INTEGER DEFAULT 1,
  UNIQUE(key, scope, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_lookup ON feature_flags(key, scope, scope_id);
CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled ON feature_flags(enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_feature_flags_version ON feature_flags(version);

-- Flag evaluation cache (for performance)
CREATE TABLE IF NOT EXISTS flag_cache (
  cache_key VARCHAR(255) PRIMARY KEY,
  resolved_flags JSONB NOT NULL,
  etag VARCHAR(64) NOT NULL,
  org_id UUID,
  fund_id UUID,
  user_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '15 seconds'
);

CREATE INDEX IF NOT EXISTS idx_flag_cache_expiry ON flag_cache(expires_at);

-- ============================================================
-- DOWN MIGRATION
-- ============================================================

-- To rollback, run:
-- DROP TABLE IF EXISTS flag_cache;
-- DROP TABLE IF EXISTS feature_flags;
-- DROP POLICY IF EXISTS fund_isolation ON funds;
-- DROP POLICY IF EXISTS fund_config_isolation ON fund_configs;
-- DROP POLICY IF EXISTS portfolio_isolation ON portfolio_companies;
-- DROP POLICY IF EXISTS investment_isolation ON investments;
-- ALTER TABLE funds DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE fund_configs DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE portfolio_companies DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE investments DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE funds 
--   DROP COLUMN IF EXISTS organization_id,
--   DROP COLUMN IF EXISTS tenant_isolation;
-- DROP TABLE IF EXISTS partners;
-- DROP TABLE IF EXISTS organizations;