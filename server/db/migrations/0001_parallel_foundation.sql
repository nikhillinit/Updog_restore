-- Parallel Foundation Migration: Steps 2-6
-- This migration implements all critical infrastructure schemas upfront
-- Enabling parallel development of concurrency, tenancy, versioning, PII, and audit features

-- ============================================================
-- STEP 2: CONCURRENCY SAFETY
-- ============================================================

-- Add row version for optimistic concurrency control
ALTER TABLE fund_configs 
ADD COLUMN IF NOT EXISTS row_version VARCHAR(26) DEFAULT gen_random_uuid()::text,
ADD COLUMN IF NOT EXISTS locked_by UUID,
ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS lock_reason TEXT;

-- Create index for row version lookups
CREATE INDEX IF NOT EXISTS idx_fund_configs_row_version ON fund_configs(row_version);

-- Idempotency tracking for calculations
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(255) NOT NULL UNIQUE,
  fund_id INTEGER NOT NULL REFERENCES funds(id),
  params_hash VARCHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, completed, failed
  result_digest VARCHAR(64),
  response JSONB,
  error_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_idempotency_keys_lookup ON idempotency_keys(key, fund_id);
CREATE INDEX idx_idempotency_keys_expiry ON idempotency_keys(expires_at) WHERE status = 'completed';

-- ============================================================
-- STEP 3: MULTI-TENANCY WITH RLS
-- ============================================================

-- Add organization support
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add organization_id to funds and enable RLS
ALTER TABLE funds 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id),
ADD COLUMN IF NOT EXISTS tenant_isolation JSONB DEFAULT '{"enabled": true}';

-- Enable Row Level Security
ALTER TABLE funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE fund_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE investments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for fund isolation
CREATE POLICY fund_isolation ON funds
  USING (organization_id = current_setting('app.current_org', true)::UUID);

CREATE POLICY fund_config_isolation ON fund_configs
  USING (fund_id IN (SELECT id FROM funds WHERE organization_id = current_setting('app.current_org', true)::UUID));

-- Hierarchical feature flags
CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) NOT NULL,
  scope VARCHAR(20) NOT NULL, -- 'global', 'org', 'fund', 'user'
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
  UNIQUE(key, scope, scope_id)
);

CREATE INDEX idx_feature_flags_lookup ON feature_flags(key, scope, scope_id);
CREATE INDEX idx_feature_flags_enabled ON feature_flags(enabled) WHERE enabled = true;

-- ============================================================
-- STEP 4: CALCULATION VERSIONING & MIGRATIONS
-- ============================================================

-- Calculation versions registry
CREATE TABLE IF NOT EXISTS calc_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version VARCHAR(20) NOT NULL UNIQUE,
  engine_type VARCHAR(50) NOT NULL, -- 'reserves', 'pacing', 'cohort'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deprecated_at TIMESTAMPTZ,
  sunset_at TIMESTAMPTZ,
  migration_from VARCHAR(20),
  migration_function TEXT, -- JavaScript/TypeScript migration code
  changelog TEXT,
  breaking_changes BOOLEAN DEFAULT false,
  notes TEXT
);

-- WASM binary storage
CREATE TABLE IF NOT EXISTS wasm_binaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version VARCHAR(20) NOT NULL,
  engine_type VARCHAR(50) NOT NULL,
  sha256 VARCHAR(64) NOT NULL,
  size_bytes BIGINT NOT NULL,
  location TEXT NOT NULL, -- S3 URL or file path
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  validated_at TIMESTAMPTZ,
  validation_results JSONB,
  UNIQUE(version, engine_type, sha256)
);

-- Calculation execution history with version tracking
CREATE TABLE IF NOT EXISTS calc_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id INTEGER NOT NULL REFERENCES funds(id),
  calc_type VARCHAR(50) NOT NULL,
  calc_version VARCHAR(20) NOT NULL,
  wasm_sha256 VARCHAR(64),
  input_hash VARCHAR(64) NOT NULL,
  output_hash VARCHAR(64),
  flags_snapshot JSONB, -- Flags at execution time
  seed BIGINT,
  deterministic BOOLEAN DEFAULT true,
  execution_time_ms INTEGER,
  memory_usage_mb INTEGER,
  status VARCHAR(20) NOT NULL, -- 'started', 'completed', 'failed', 'timeout'
  error_details JSONB,
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_calc_executions_fund ON calc_executions(fund_id, calc_type, created_at DESC);
CREATE INDEX idx_calc_executions_version ON calc_executions(calc_version, calc_type);

-- ============================================================
-- STEP 5: PII PROTECTION WITH ENVELOPE ENCRYPTION
-- ============================================================

-- Organization-level data encryption keys
CREATE TABLE IF NOT EXISTS encryption_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  key_id VARCHAR(100) NOT NULL UNIQUE,
  encrypted_data_key TEXT NOT NULL, -- KMS-encrypted DEK
  kms_key_arn TEXT NOT NULL,
  algorithm VARCHAR(50) DEFAULT 'AES-256-GCM',
  active BOOLEAN DEFAULT true,
  rotation_schedule VARCHAR(20) DEFAULT 'quarterly',
  rotated_from UUID REFERENCES encryption_keys(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  rotated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_encryption_keys_org ON encryption_keys(organization_id, active);

-- PII-sensitive fields registry
CREATE TABLE IF NOT EXISTS pii_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name VARCHAR(100) NOT NULL,
  column_name VARCHAR(100) NOT NULL,
  encryption_required BOOLEAN DEFAULT true,
  masking_pattern VARCHAR(100), -- e.g., 'email:partial', 'ssn:last4'
  sensitivity_level VARCHAR(20) NOT NULL, -- 'high', 'medium', 'low'
  retention_days INTEGER DEFAULT 2555, -- 7 years default
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(table_name, column_name)
);

-- Encrypted LP (Limited Partner) information
CREATE TABLE IF NOT EXISTS limited_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id INTEGER NOT NULL REFERENCES funds(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  -- Non-sensitive fields (queryable)
  partner_type VARCHAR(50) NOT NULL, -- 'individual', 'institutional'
  commitment_amount DECIMAL(15, 2) NOT NULL,
  commitment_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'active',
  -- Encrypted sensitive fields
  encrypted_name TEXT, -- {ciphertext, iv, tag, key_id}
  encrypted_email TEXT,
  encrypted_tax_id TEXT,
  encrypted_address JSONB,
  encrypted_bank_info JSONB,
  -- Audit fields
  encryption_key_id UUID REFERENCES encryption_keys(id),
  last_accessed_at TIMESTAMPTZ,
  last_accessed_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_limited_partners_fund ON limited_partners(fund_id, status);

-- ============================================================
-- STEP 6: AUDIT PIPELINE (DB FIRST)
-- ============================================================

-- Comprehensive audit events table
CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(100) NOT NULL,
  severity VARCHAR(20) DEFAULT 'info', -- 'info', 'warning', 'error', 'critical'
  actor_id INTEGER REFERENCES users(id),
  actor_email VARCHAR(255),
  actor_ip INET,
  actor_user_agent TEXT,
  -- Event context
  organization_id UUID REFERENCES organizations(id),
  fund_id INTEGER REFERENCES funds(id),
  entity_type VARCHAR(50),
  entity_id UUID,
  -- Calculation specific
  calc_version VARCHAR(20),
  calc_type VARCHAR(50),
  input_hash VARCHAR(64),
  flags_hash VARCHAR(64),
  seed BIGINT,
  approval_id UUID,
  -- Event data
  action VARCHAR(100) NOT NULL,
  changes JSONB,
  metadata JSONB DEFAULT '{}',
  -- Compliance fields
  requires_approval BOOLEAN DEFAULT false,
  approval_status VARCHAR(20),
  approved_by INTEGER[] DEFAULT '{}',
  -- Timing
  event_time TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Stream processing
  streamed BOOLEAN DEFAULT false,
  stream_id VARCHAR(100),
  streamed_at TIMESTAMPTZ
);

CREATE INDEX idx_audit_events_lookup ON audit_events(organization_id, event_type, event_time DESC);
CREATE INDEX idx_audit_events_calc ON audit_events(calc_type, calc_version, event_time DESC);
CREATE INDEX idx_audit_events_stream ON audit_events(streamed, created_at) WHERE streamed = false;
CREATE INDEX idx_audit_events_compliance ON audit_events(requires_approval, approval_status);

-- Transactional outbox for guaranteed delivery
CREATE TABLE IF NOT EXISTS audit_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic VARCHAR(100) NOT NULL,
  partition_key VARCHAR(100),
  message_id VARCHAR(100) NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  headers JSONB DEFAULT '{}',
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_details TEXT,
  status VARCHAR(20) DEFAULT 'pending' -- 'pending', 'processing', 'completed', 'failed'
);

CREATE INDEX idx_audit_outbox_pending ON audit_outbox(status, created_at) WHERE status = 'pending';
CREATE INDEX idx_audit_outbox_retry ON audit_outbox(retry_count, failed_at) WHERE status = 'failed' AND retry_count < max_retries;

-- ============================================================
-- APPROVAL SYSTEM TABLES (From existing work)
-- ============================================================

-- Reserve strategy approvals with dual-signature requirement
CREATE TABLE IF NOT EXISTS reserve_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id VARCHAR(100) NOT NULL,
  fund_id INTEGER NOT NULL REFERENCES funds(id),
  requested_by VARCHAR(255) NOT NULL,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  -- Change details
  action VARCHAR(20) NOT NULL, -- 'create', 'update', 'delete'
  strategy_data JSONB NOT NULL,
  reason TEXT,
  -- Impact assessment
  affected_funds TEXT[],
  estimated_amount DECIMAL(15, 2),
  risk_level VARCHAR(20) NOT NULL, -- 'low', 'medium', 'high'
  -- Approvals
  approvals JSONB DEFAULT '[]', -- Array of {partner_id, email, approved_at, signature, ip_address}
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'expired'
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '48 hours',
  -- Metadata
  calculation_hash VARCHAR(64),
  audit_trail JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_reserve_approvals_status ON reserve_approvals(fund_id, status, created_at DESC);
CREATE INDEX idx_reserve_approvals_expiry ON reserve_approvals(expires_at) WHERE status = 'pending';

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Function to generate ULID
CREATE OR REPLACE FUNCTION gen_ulid() RETURNS VARCHAR(26) AS $$
DECLARE
  timestamp BIGINT;
  random_component VARCHAR(16);
BEGIN
  timestamp := EXTRACT(EPOCH FROM NOW())::BIGINT * 1000;
  random_component := encode(gen_random_bytes(10), 'hex');
  RETURN timestamp::TEXT || random_component;
END;
$$ LANGUAGE plpgsql;

-- Function to clean expired idempotency keys
CREATE OR REPLACE FUNCTION cleanup_expired_keys() RETURNS void AS $$
BEGIN
  DELETE FROM idempotency_keys 
  WHERE expires_at < NOW() AND status = 'completed';
  
  DELETE FROM audit_outbox 
  WHERE status = 'completed' AND processed_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- PERMISSIONS & GRANTS (adjust based on your user setup)
-- ============================================================

-- Grant necessary permissions to application user
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_user;
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- ============================================================
-- INITIAL DATA
-- ============================================================

-- Insert default PII field definitions
INSERT INTO pii_fields (table_name, column_name, sensitivity_level, masking_pattern) VALUES
  ('limited_partners', 'encrypted_name', 'high', 'name:initials'),
  ('limited_partners', 'encrypted_email', 'medium', 'email:partial'),
  ('limited_partners', 'encrypted_tax_id', 'high', 'ssn:last4'),
  ('limited_partners', 'encrypted_address', 'medium', 'address:city_state'),
  ('limited_partners', 'encrypted_bank_info', 'high', 'bank:masked')
ON CONFLICT DO NOTHING;

-- Insert default calculation versions
INSERT INTO calc_versions (version, engine_type, notes) VALUES
  ('1.0.0', 'reserves', 'Initial reserves engine'),
  ('1.1.0', 'reserves', 'Extra remain pass implementation'),
  ('1.0.0', 'pacing', 'Initial pacing engine'),
  ('1.0.0', 'cohort', 'Initial cohort analysis')
ON CONFLICT DO NOTHING;