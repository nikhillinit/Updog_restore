-- LP Reporting Feature Migration
-- Adds support for Limited Partners, Commitments, Documents, and Communications

-- Limited Partners table
CREATE TABLE IF NOT EXISTS limited_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  org TEXT,
  type VARCHAR(50) DEFAULT 'individual', -- individual, institutional, family_office
  tax_id VARCHAR(100),
  address JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fund LP Commitments with temporal validity
CREATE TABLE IF NOT EXISTS fund_lp_commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id INTEGER REFERENCES funds(id) ON DELETE CASCADE,
  lp_id UUID REFERENCES limited_partners(id) ON DELETE CASCADE,
  commitment NUMERIC(20,2) NOT NULL,
  called NUMERIC(20,2) DEFAULT 0,
  distributed NUMERIC(20,2) DEFAULT 0,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_to TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59'::TIMESTAMPTZ,
  status VARCHAR(50) DEFAULT 'active',
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add temporal exclusion constraint to prevent overlapping validity windows
ALTER TABLE fund_lp_commitments 
  ADD CONSTRAINT no_overlapping_commitments 
  EXCLUDE USING gist (
    fund_id WITH =, 
    lp_id WITH =,
    tstzrange(valid_from, valid_to, '[]') WITH &&
  );

-- Documents table for generated reports
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id INTEGER REFERENCES funds(id) ON DELETE CASCADE,
  lp_id UUID REFERENCES limited_partners(id) ON DELETE SET NULL,
  kind VARCHAR(50) NOT NULL, -- capital_account, performance_letter, board_pack, etc.
  path TEXT NOT NULL, -- storage URL or file path
  preview BOOLEAN DEFAULT FALSE,
  watermarked BOOLEAN DEFAULT FALSE,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  as_of_date DATE,
  metadata JSONB,
  checksum VARCHAR(64), -- SHA256 hash for integrity
  size_bytes BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Communications log (for audit trail)
CREATE TABLE IF NOT EXISTS communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_lp_id UUID REFERENCES limited_partners(id) ON DELETE SET NULL,
  from_user_id INTEGER REFERENCES users(id),
  subject TEXT NOT NULL,
  doc_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  channel VARCHAR(50) DEFAULT 'email', -- email, portal, api
  status VARCHAR(50) DEFAULT 'pending', -- pending, sent, delivered, failed
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  metadata JSONB,
  idempotency_key VARCHAR(100) UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Capital calls and distributions tracking
CREATE TABLE IF NOT EXISTS capital_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id INTEGER REFERENCES funds(id) ON DELETE CASCADE,
  lp_id UUID REFERENCES limited_partners(id) ON DELETE CASCADE,
  transaction_type VARCHAR(20) NOT NULL, -- call, distribution
  amount NUMERIC(20,2) NOT NULL,
  percentage NUMERIC(5,4), -- percentage of commitment
  due_date DATE,
  paid_date DATE,
  reference_number VARCHAR(100),
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_lp_email ON limited_partners(email);
CREATE INDEX idx_commitments_fund_lp ON fund_lp_commitments(fund_id, lp_id);
CREATE INDEX idx_commitments_temporal ON fund_lp_commitments USING gist(tstzrange(valid_from, valid_to));
CREATE INDEX idx_documents_fund_kind ON documents(fund_id, kind);
CREATE INDEX idx_documents_as_of ON documents(as_of_date);
CREATE INDEX idx_communications_lp ON communications(to_lp_id);
CREATE INDEX idx_communications_idempotency ON communications(idempotency_key);
CREATE INDEX idx_capital_transactions_fund_lp ON capital_transactions(fund_id, lp_id);
CREATE INDEX idx_capital_transactions_date ON capital_transactions(due_date, paid_date);

-- Row-level security policies
ALTER TABLE limited_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE fund_lp_commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE capital_transactions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (adjust based on your auth model)
CREATE POLICY lp_org_isolation ON limited_partners 
  FOR ALL USING (
    auth.uid() IN (
      SELECT user_id FROM user_orgs 
      WHERE org_id = current_setting('app.current_org_id')::UUID
    )
  );

CREATE POLICY commitment_fund_access ON fund_lp_commitments
  FOR ALL USING (
    fund_id IN (
      SELECT id FROM funds 
      WHERE org_id = current_setting('app.current_org_id')::UUID
    )
  );

-- Add audit triggers
CREATE TRIGGER update_limited_partners_updated_at 
  BEFORE UPDATE ON limited_partners 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_fund_lp_commitments_updated_at 
  BEFORE UPDATE ON fund_lp_commitments 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();