-- Migration 0004: Versioning & Encryption (Steps 4-5)
-- Reversible migration for calculation versioning and PII protection

-- ============================================================
-- UP MIGRATION
-- ============================================================

-- ============================================================
-- CALCULATION VERSIONING (Step 4)
-- ============================================================

-- Calculation versions registry
CREATE TABLE IF NOT EXISTS calc_versions (
  version VARCHAR(20) PRIMARY KEY,
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
  version VARCHAR(20) NOT NULL,
  engine_type VARCHAR(50) NOT NULL,
  sha256 VARCHAR(64) NOT NULL,
  size_bytes BIGINT NOT NULL,
  location TEXT NOT NULL, -- S3 URL or file path
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  validated_at TIMESTAMPTZ,
  validation_results JSONB,
  PRIMARY KEY (version, engine_type),
  FOREIGN KEY (version) REFERENCES calc_versions(version)
);

CREATE INDEX IF NOT EXISTS idx_wasm_binaries_sha ON wasm_binaries(sha256);

-- Calculation execution history with version tracking
CREATE TABLE IF NOT EXISTS calc_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id INTEGER NOT NULL REFERENCES funds(id),
  calc_type VARCHAR(50) NOT NULL,
  calc_version VARCHAR(20) NOT NULL REFERENCES calc_versions(version),
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

CREATE INDEX IF NOT EXISTS idx_calc_executions_fund ON calc_executions(fund_id, calc_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calc_executions_version ON calc_executions(calc_version, calc_type);

-- ============================================================
-- PII PROTECTION WITH ENVELOPE ENCRYPTION (Step 5)
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

CREATE INDEX IF NOT EXISTS idx_encryption_keys_org ON encryption_keys(organization_id, active);

-- PII-sensitive fields registry
CREATE TABLE IF NOT EXISTS pii_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name VARCHAR(100) NOT NULL,
  column_name VARCHAR(100) NOT NULL,
  encryption_required BOOLEAN DEFAULT true,
  masking_pattern VARCHAR(100), -- e.g., 'email:partial', 'ssn:last4'
  sensitivity_level VARCHAR(20) NOT NULL CHECK (sensitivity_level IN ('high', 'medium', 'low')),
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
  -- Encrypted sensitive fields stored as JSONB
  encrypted_name JSONB, -- {ciphertext, iv, tag, key_id, algo}
  encrypted_email JSONB,
  encrypted_tax_id JSONB,
  encrypted_address JSONB,
  encrypted_bank_info JSONB,
  -- Audit fields
  encryption_key_id UUID REFERENCES encryption_keys(id),
  last_accessed_at TIMESTAMPTZ,
  last_accessed_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_limited_partners_fund ON limited_partners(fund_id, status);
CREATE INDEX IF NOT EXISTS idx_limited_partners_org ON limited_partners(organization_id);

-- PII access log
CREATE TABLE IF NOT EXISTS pii_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id INTEGER REFERENCES users(id),
  actor_email VARCHAR(255),
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  access_type VARCHAR(20) NOT NULL CHECK (access_type IN ('read', 'write', 'decrypt')),
  purpose VARCHAR(255),
  ip_address INET,
  user_agent TEXT,
  accessed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pii_access_log_actor ON pii_access_log(actor_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pii_access_log_entity ON pii_access_log(entity_type, entity_id, accessed_at DESC);

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
ON CONFLICT (table_name, column_name) DO NOTHING;

-- Insert default calculation versions
INSERT INTO calc_versions (version, engine_type, notes) VALUES
  ('1.0.0', 'reserves', 'Initial reserves engine'),
  ('1.1.0', 'reserves', 'Extra remain pass implementation'),
  ('1.0.0', 'pacing', 'Initial pacing engine'),
  ('1.0.0', 'cohort', 'Initial cohort analysis')
ON CONFLICT (version) DO NOTHING;

-- ============================================================
-- DOWN MIGRATION
-- ============================================================

-- To rollback, run:
-- DROP TABLE IF EXISTS pii_access_log;
-- DROP TABLE IF EXISTS limited_partners;
-- DROP TABLE IF EXISTS pii_fields;
-- DROP TABLE IF EXISTS encryption_keys;
-- DROP TABLE IF EXISTS calc_executions;
-- DROP TABLE IF EXISTS wasm_binaries;
-- DROP TABLE IF EXISTS calc_versions;