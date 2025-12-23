-- ============================================================================
-- LP REPORTING DASHBOARD SCHEMA
-- ============================================================================
-- Created: 2025-12-23
-- Purpose: Comprehensive schema for LP reporting, capital account tracking,
--          and performance analytics
--
-- Key Design Decisions:
-- 1. Decimal/Cents Storage: All money columns use bigint (cents) for precision
-- 2. Immutable Records: Capital activities and performance snapshots are append-only
-- 3. Denormalization: Performance snapshots pre-calculated for fast retrieval
-- 4. Partitioning: Ready for date-range partitioning on activity/snapshot tables
--
-- ============================================================================

-- ============================================================================
-- LIMITED PARTNERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS limited_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name TEXT NOT NULL,
  entity_type VARCHAR(50) NOT NULL DEFAULT 'institutional',
  -- Types: individual, institutional, family_office, trust, foundation, etc.

  -- Contact Information
  primary_contact_email TEXT,
  primary_contact_name TEXT,
  secondary_contact_email TEXT,
  secondary_contact_name TEXT,

  -- Address
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state_province TEXT,
  postal_code TEXT,
  country_code VARCHAR(2),

  -- Tax Information
  tax_id VARCHAR(50),
  tax_jurisdiction VARCHAR(50),

  -- Status & Dates
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  -- Status: active, inactive, prospect, onboarding
  onboarded_at TIMESTAMP WITH TIME ZONE,
  last_activity_at TIMESTAMP WITH TIME ZONE,

  -- Preferences (JSONB for flexibility)
  preferences JSONB DEFAULT '{
    "report_frequency": "quarterly",
    "report_format": "pdf",
    "email_notifications": true,
    "notify_on_capital_call": true,
    "notify_on_distribution": true
  }'::JSONB,

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,

  CONSTRAINT lp_status_check CHECK (status IN ('active', 'inactive', 'prospect', 'onboarding'))
);

CREATE INDEX idx_limited_partners_status ON limited_partners(status);
CREATE INDEX idx_limited_partners_email ON limited_partners(primary_contact_email);
CREATE INDEX idx_limited_partners_created ON limited_partners(created_at DESC);


-- ============================================================================
-- LP FUND COMMITMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS lp_fund_commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lp_id UUID NOT NULL REFERENCES limited_partners(id) ON DELETE CASCADE,
  fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE RESTRICT,

  -- Commitment Amount (in cents for precision)
  commitment_amount_cents BIGINT NOT NULL,

  -- Commitment Status
  commitment_status VARCHAR(20) NOT NULL DEFAULT 'active',
  -- Status: active, inactive, full_redemption, partial_redemption

  -- Capital Call Configuration
  callable_percentage DECIMAL(5, 4) NOT NULL DEFAULT 1.0,
  -- Percentage of commitment that can be called (e.g., 0.95 = 95%)

  -- Co-Investment
  is_co_investment BOOLEAN DEFAULT FALSE,
  co_investment_amount_cents BIGINT,

  -- Dates
  committed_date DATE NOT NULL,
  activation_date DATE,
  termination_date DATE,

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,

  UNIQUE(lp_id, fund_id),

  CONSTRAINT status_check CHECK (commitment_status IN
    ('active', 'inactive', 'full_redemption', 'partial_redemption')
  ),
  CONSTRAINT commitment_amount_check CHECK (commitment_amount_cents > 0),
  CONSTRAINT callable_percentage_check CHECK
    (callable_percentage >= 0 AND callable_percentage <= 1)
);

CREATE INDEX idx_lp_fund_commitments_lp ON lp_fund_commitments(lp_id);
CREATE INDEX idx_lp_fund_commitments_fund ON lp_fund_commitments(fund_id);
CREATE INDEX idx_lp_fund_commitments_status ON lp_fund_commitments(commitment_status);
CREATE INDEX idx_lp_fund_commitments_active ON lp_fund_commitments(lp_id, fund_id)
  WHERE commitment_status = 'active';


-- ============================================================================
-- CAPITAL ACTIVITIES TABLE
-- ============================================================================
-- Immutable record of all capital calls, distributions, and other activities
-- Append-only design for audit trail
-- ============================================================================

CREATE TABLE IF NOT EXISTS capital_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commitment_id UUID NOT NULL REFERENCES lp_fund_commitments(id) ON DELETE CASCADE,
  fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,

  -- Activity Type
  type VARCHAR(30) NOT NULL,
  -- Types: capital_call, distribution, return_of_capital, management_fee,
  --        carried_interest, other

  -- Amount (in cents)
  amount_cents BIGINT NOT NULL,

  -- Dates
  activity_date DATE NOT NULL,
  due_date DATE,
  -- due_date used for capital calls (when payment due)

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- Status: pending, completed, failed, reversed

  payment_date DATE,
  -- Date payment received/made

  -- Description
  description TEXT,
  reference_number VARCHAR(100),

  -- Audit Trail
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by UUID,
  -- Created by reference (user_id if available)

  CONSTRAINT type_check CHECK (type IN (
    'capital_call', 'distribution', 'return_of_capital',
    'management_fee', 'carried_interest', 'other'
  )),
  CONSTRAINT status_check CHECK (status IN
    ('pending', 'completed', 'failed', 'reversed')
  ),
  CONSTRAINT amount_check CHECK (amount_cents != 0)
);

-- CRITICAL INDEXES for capital account queries
CREATE INDEX idx_capital_activities_commitment_date ON capital_activities(
  commitment_id, activity_date DESC
);
-- Used by: getCapitalAccountTransactions (cursor pagination)

CREATE INDEX idx_capital_activities_fund_date ON capital_activities(
  fund_id, activity_date DESC
);
-- Used by: Fund-level activity queries

CREATE INDEX idx_capital_activities_type_date ON capital_activities(
  type, activity_date DESC
);
-- Used by: Activity type filtering

CREATE INDEX idx_capital_activities_status ON capital_activities(status)
  WHERE status != 'completed';
-- Partial index for pending/overdue items

-- Audit trail index
CREATE INDEX idx_capital_activities_created ON capital_activities(created_at DESC);


-- ============================================================================
-- LP CAPITAL ACCOUNTS TABLE
-- ============================================================================
-- Denormalized summary of LP capital position in each commitment
-- Updated by materialized view refresh job
-- ============================================================================

CREATE TABLE IF NOT EXISTS lp_capital_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commitment_id UUID NOT NULL REFERENCES lp_fund_commitments(id) ON DELETE CASCADE,
  lp_id UUID NOT NULL REFERENCES limited_partners(id) ON DELETE CASCADE,
  fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,

  -- Capital Amounts (in cents)
  contributed_capital_cents BIGINT NOT NULL DEFAULT 0,
  distributed_capital_cents BIGINT NOT NULL DEFAULT 0,
  current_nav_cents BIGINT NOT NULL DEFAULT 0,

  -- Calculated Fields
  unfunded_commitment_cents BIGINT NOT NULL DEFAULT 0,
  -- = original_commitment - contributed_capital

  total_value_cents BIGINT NOT NULL DEFAULT 0,
  -- = distributed_capital + current_nav

  -- Performance Tracking
  cost_basis_cents BIGINT NOT NULL DEFAULT 0,
  -- LP's cost basis for tax purposes

  gains_losses_cents BIGINT NOT NULL DEFAULT 0,
  -- Unrealized gains/losses

  -- Valuation Date
  as_of_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Calculated IRR/MOIC (cached)
  irr_percent DECIMAL(7, 4),
  moic DECIMAL(7, 4),

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,

  UNIQUE(commitment_id, as_of_date),

  CONSTRAINT contributed_non_negative CHECK (contributed_capital_cents >= 0),
  CONSTRAINT distributed_non_negative CHECK (distributed_capital_cents >= 0),
  CONSTRAINT nav_non_negative CHECK (current_nav_cents >= 0)
);

CREATE INDEX idx_lp_capital_accounts_commitment ON lp_capital_accounts(commitment_id);
CREATE INDEX idx_lp_capital_accounts_lp ON lp_capital_accounts(lp_id);
CREATE INDEX idx_lp_capital_accounts_fund ON lp_capital_accounts(fund_id);
CREATE INDEX idx_lp_capital_accounts_asof ON lp_capital_accounts(as_of_date DESC);
-- Latest snapshot for each commitment
CREATE INDEX idx_lp_capital_accounts_latest ON lp_capital_accounts(
  commitment_id, as_of_date DESC
);


-- ============================================================================
-- LP PERFORMANCE SNAPSHOTS TABLE
-- ============================================================================
-- Time-series data for performance trending
-- Populated by nightly refresh job
-- Allows efficient historical performance queries
-- ============================================================================

CREATE TABLE IF NOT EXISTS lp_performance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commitment_id UUID NOT NULL REFERENCES lp_fund_commitments(id) ON DELETE CASCADE,
  lp_id UUID NOT NULL REFERENCES limited_partners(id) ON DELETE CASCADE,
  fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,

  -- Snapshot Date
  snapshot_date DATE NOT NULL,

  -- Performance Metrics (all as percentages/decimals)
  irr_percent DECIMAL(7, 4) NOT NULL,
  -- Internal Rate of Return

  moic_percent DECIMAL(7, 4) NOT NULL,
  -- Multiple on Invested Capital (MOIC)

  dpi_percent DECIMAL(7, 4) NOT NULL,
  -- Distributions to Paid-In Capital

  rvpi_percent DECIMAL(7, 4) NOT NULL,
  -- Residual Value to Paid-In Capital

  tvpi_percent DECIMAL(7, 4) NOT NULL,
  -- Total Value to Paid-In Capital = DPI + RVPI

  -- Breakdown IRR
  gross_irr_percent DECIMAL(7, 4),
  -- Gross IRR before fees

  net_irr_percent DECIMAL(7, 4),
  -- Net IRR after fees

  -- Capital Amounts (snapshot)
  nav_cents BIGINT NOT NULL,
  paid_in_cents BIGINT NOT NULL,
  distributed_cents BIGINT NOT NULL,

  -- Calculation Metadata
  calculation_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  calculation_version VARCHAR(20),
  -- Track which version of XIRR/MOIC calculation was used

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,

  UNIQUE(commitment_id, snapshot_date),

  CONSTRAINT irr_reasonable CHECK (irr_percent >= -1 AND irr_percent <= 10),
  -- Allow -100% to 1000% range for validation
  CONSTRAINT moic_positive CHECK (moic_percent > 0)
);

-- CRITICAL INDEX for timeseries queries
CREATE INDEX idx_lp_perf_snapshots_commitment_date ON lp_performance_snapshots(
  commitment_id, snapshot_date DESC
);
-- Used by: getPerformanceTimeseries (range queries)

CREATE INDEX idx_lp_perf_snapshots_fund_date ON lp_performance_snapshots(
  fund_id, snapshot_date DESC
);
-- Used by: Fund-level performance queries

CREATE INDEX idx_lp_perf_snapshots_lp_date ON lp_performance_snapshots(
  lp_id, snapshot_date DESC
);
-- Used by: LP aggregate queries

CREATE INDEX idx_lp_perf_snapshots_date ON lp_performance_snapshots(snapshot_date DESC);
-- Used by: Date-range filtering


-- ============================================================================
-- LP REPORTS TABLE
-- ============================================================================
-- Tracks generated reports (PDF/Excel exports)
-- ============================================================================

CREATE TABLE IF NOT EXISTS lp_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lp_id UUID NOT NULL REFERENCES limited_partners(id) ON DELETE CASCADE,

  -- Report Type & Period
  report_type VARCHAR(30) NOT NULL,
  -- Types: quarterly, annual, ad_hoc
  period_start_date DATE NOT NULL,
  period_end_date DATE NOT NULL,

  -- Generation
  format VARCHAR(10) NOT NULL,
  -- Format: pdf, excel, both
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- Status: pending, processing, completed, failed

  -- File Storage
  file_path TEXT,
  file_size_bytes INTEGER,
  -- S3 path or local path

  -- Expiration (for security)
  expires_at TIMESTAMP WITH TIME ZONE,
  -- Generated reports expire after 90 days

  -- Report Inclusion
  include_holdings BOOLEAN DEFAULT TRUE,
  include_capital_activity BOOLEAN DEFAULT TRUE,
  include_performance_history BOOLEAN DEFAULT TRUE,

  -- Report Data (JSONB for flexibility)
  report_data JSONB,
  -- Stores computed totals, summaries, etc.

  -- Error Tracking
  error_message TEXT,
  error_details JSONB,

  -- Dates
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,

  CONSTRAINT report_type_check CHECK (report_type IN ('quarterly', 'annual', 'ad_hoc')),
  CONSTRAINT format_check CHECK (format IN ('pdf', 'excel', 'both')),
  CONSTRAINT status_check CHECK (
    status IN ('pending', 'processing', 'completed', 'failed')
  ),
  CONSTRAINT date_range_check CHECK (period_start_date <= period_end_date)
);

CREATE INDEX idx_lp_reports_lp ON lp_reports(lp_id);
CREATE INDEX idx_lp_reports_status ON lp_reports(status);
CREATE INDEX idx_lp_reports_created ON lp_reports(created_at DESC);
CREATE INDEX idx_lp_reports_period ON lp_reports(period_start_date, period_end_date);

-- JSONB index for full-text search in reports
CREATE INDEX idx_lp_reports_data_gin ON lp_reports USING GIN (report_data);


-- ============================================================================
-- FUND NAV SNAPSHOTS TABLE (for reference)
-- ============================================================================
-- Fund-level NAV history for aggregate calculations
-- ============================================================================

CREATE TABLE IF NOT EXISTS fund_nav_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,

  -- Valuation Date
  snapshot_date DATE NOT NULL,

  -- Fund-Level Metrics
  gross_nav_cents BIGINT NOT NULL,
  net_nav_cents BIGINT NOT NULL,
  -- After management fees

  committed_capital_cents BIGINT NOT NULL,
  called_capital_cents BIGINT NOT NULL,
  distributed_capital_cents BIGINT NOT NULL,

  -- Derived
  moic DECIMAL(7, 4),
  dpi DECIMAL(7, 4),
  rvpi DECIMAL(7, 4),

  -- Metadata
  calculation_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(fund_id, snapshot_date),

  CONSTRAINT nav_positive CHECK (gross_nav_cents >= 0),
  CONSTRAINT called_less_than_committed CHECK
    (called_capital_cents <= committed_capital_cents)
);

CREATE INDEX idx_fund_nav_snapshots_fund_date ON fund_nav_snapshots(
  fund_id, snapshot_date DESC
);


-- ============================================================================
-- AUDIT TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_limited_partners_updated_at
  BEFORE UPDATE ON limited_partners
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lp_fund_commitments_updated_at
  BEFORE UPDATE ON lp_fund_commitments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_capital_activities_updated_at
  BEFORE UPDATE ON capital_activities
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lp_capital_accounts_updated_at
  BEFORE UPDATE ON lp_capital_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lp_reports_updated_at
  BEFORE UPDATE ON lp_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- End of migration
