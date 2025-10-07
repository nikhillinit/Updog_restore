-- Migration: Add Scenario Analysis Tables
-- Created: 2025-10-07
-- Purpose: Support Construction vs Current portfolio analysis and deal-level scenario modeling

-- ============================================================================
-- Scenarios Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES portfolio_companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Version for future optimistic locking (Phase 2)
  version INTEGER NOT NULL DEFAULT 1,

  -- Is this the baseline/default scenario?
  is_default BOOLEAN NOT NULL DEFAULT false,

  -- Lock scenario to prevent edits (e.g., after board presentation)
  locked_at TIMESTAMP,

  -- Audit fields
  created_by UUID, -- Future: REFERENCES users(id)
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_default_per_company
    EXCLUDE (company_id WITH =) WHERE (is_default = true)
);

-- Indexes for performance
CREATE INDEX idx_scenarios_company_id ON scenarios(company_id);
CREATE INDEX idx_scenarios_created_by ON scenarios(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX idx_scenarios_created_at ON scenarios(created_at DESC);

-- Comments for documentation
COMMENT ON TABLE scenarios IS 'Scenario configurations for deal-level modeling';
COMMENT ON COLUMN scenarios.version IS 'Optimistic locking version (Phase 2)';
COMMENT ON COLUMN scenarios.is_default IS 'Only one default scenario per company allowed';

-- ============================================================================
-- Scenario Cases Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS scenario_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id UUID NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,

  -- Case identification
  case_name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Probability weighting (must sum to 1.0 across all cases in scenario)
  probability DECIMAL(10,8) NOT NULL CHECK (probability >= 0 AND probability <= 1),

  -- Financial projections
  investment DECIMAL(15,2) NOT NULL DEFAULT 0,
  follow_ons DECIMAL(15,2) NOT NULL DEFAULT 0,
  exit_proceeds DECIMAL(15,2) NOT NULL DEFAULT 0,
  exit_valuation DECIMAL(15,2) NOT NULL DEFAULT 0,

  -- Optional fields for advanced analysis
  months_to_exit INTEGER,
  ownership_at_exit DECIMAL(5,4) CHECK (ownership_at_exit >= 0 AND ownership_at_exit <= 1),
  fmv DECIMAL(15,2), -- Fair market value for liquidation scenarios

  -- Audit fields
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_probability CHECK (probability BETWEEN 0 AND 1),
  CONSTRAINT non_negative_investment CHECK (investment >= 0),
  CONSTRAINT non_negative_follow_ons CHECK (follow_ons >= 0),
  CONSTRAINT non_negative_exit_proceeds CHECK (exit_proceeds >= 0),
  CONSTRAINT non_negative_exit_valuation CHECK (exit_valuation >= 0)
);

-- Indexes for performance
CREATE INDEX idx_scenario_cases_scenario_id ON scenario_cases(scenario_id);
CREATE INDEX idx_scenario_cases_created_at ON scenario_cases(created_at DESC);

-- Comments for documentation
COMMENT ON TABLE scenario_cases IS 'Individual weighted cases within a scenario';
COMMENT ON COLUMN scenario_cases.probability IS 'Probability weight (0..1, sum should = 1.0 per scenario)';
COMMENT ON COLUMN scenario_cases.investment IS 'Total investment (initial + follow-ons)';

-- ============================================================================
-- Audit Log Table (Simplified for Internal Tool)
-- ============================================================================

CREATE TABLE IF NOT EXISTS scenario_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255), -- Simplified: just store user ID string
  entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('scenario', 'scenario_case')),
  entity_id UUID NOT NULL,
  action VARCHAR(20) NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE')),

  -- JSONB for flexible diff storage
  diff JSONB,

  timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for audit queries
CREATE INDEX idx_audit_logs_entity_id ON scenario_audit_logs(entity_id);
CREATE INDEX idx_audit_logs_user_id ON scenario_audit_logs(user_id);
CREATE INDEX idx_audit_logs_timestamp ON scenario_audit_logs(timestamp DESC);
CREATE INDEX idx_audit_logs_entity_type ON scenario_audit_logs(entity_type);

-- Comments
COMMENT ON TABLE scenario_audit_logs IS 'Audit trail for scenario changes (who, what, when)';
COMMENT ON COLUMN scenario_audit_logs.diff IS 'JSONB containing old/new values';

-- ============================================================================
-- Updated At Trigger Function
-- ============================================================================

-- Create or replace the trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to scenarios table
DROP TRIGGER IF EXISTS update_scenarios_updated_at ON scenarios;
CREATE TRIGGER update_scenarios_updated_at
  BEFORE UPDATE ON scenarios
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to scenario_cases table
DROP TRIGGER IF EXISTS update_scenario_cases_updated_at ON scenario_cases;
CREATE TRIGGER update_scenario_cases_updated_at
  BEFORE UPDATE ON scenario_cases
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Seed Data (Optional - For Testing)
-- ============================================================================

-- Note: Seed data commented out for production safety
-- Uncomment for development/testing environments

/*
-- Example: Create a default scenario for each company
INSERT INTO scenarios (company_id, name, description, is_default)
SELECT
  id,
  'Base Case',
  'Default scenario configuration',
  true
FROM portfolio_companies
WHERE NOT EXISTS (
  SELECT 1 FROM scenarios WHERE scenarios.company_id = portfolio_companies.id
);

-- Example: Add sample cases to each scenario
INSERT INTO scenario_cases (scenario_id, case_name, probability, investment, follow_ons, exit_proceeds, exit_valuation)
SELECT
  s.id,
  'Bull Case',
  0.30,
  5000000,
  3000000,
  40000000,
  100000000
FROM scenarios s
WHERE NOT EXISTS (
  SELECT 1 FROM scenario_cases WHERE scenario_id = s.id AND case_name = 'Bull Case'
);
*/

-- ============================================================================
-- Migration Complete
-- ============================================================================

-- Verify tables were created
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'scenarios') THEN
    RAISE EXCEPTION 'Migration failed: scenarios table was not created';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'scenario_cases') THEN
    RAISE EXCEPTION 'Migration failed: scenario_cases table was not created';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'scenario_audit_logs') THEN
    RAISE EXCEPTION 'Migration failed: scenario_audit_logs table was not created';
  END IF;

  RAISE NOTICE 'Migration 20251007_add_scenarios completed successfully';
END $$;
