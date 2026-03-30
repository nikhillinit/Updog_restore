-- Migration: Durable allocation planning scenarios
-- Created: 2026-03-30

CREATE TABLE IF NOT EXISTS allocation_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  notes TEXT,
  source_allocation_version INTEGER,
  company_count INTEGER NOT NULL DEFAULT 0,
  total_planned_cents BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS allocation_scenarios_fund_updated_idx
  ON allocation_scenarios (fund_id, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS allocation_scenario_items (
  scenario_id UUID NOT NULL REFERENCES allocation_scenarios(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES portfoliocompanies(id) ON DELETE CASCADE,
  planned_reserves_cents BIGINT NOT NULL DEFAULT 0,
  allocation_cap_cents BIGINT,
  allocation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scenario_id, company_id),
  CONSTRAINT allocation_scenario_items_non_negative_planned
    CHECK (planned_reserves_cents >= 0),
  CONSTRAINT allocation_scenario_items_non_negative_cap
    CHECK (allocation_cap_cents IS NULL OR allocation_cap_cents >= 0),
  CONSTRAINT allocation_scenario_items_cap_gte_planned
    CHECK (allocation_cap_cents IS NULL OR allocation_cap_cents >= planned_reserves_cents)
);

CREATE INDEX IF NOT EXISTS allocation_scenario_items_scenario_idx
  ON allocation_scenario_items (scenario_id, company_id);
