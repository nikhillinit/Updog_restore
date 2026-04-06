-- Migration: Scenario-scoped reserve IC decisions
-- Created: 2026-04-06

CREATE TABLE IF NOT EXISTS allocation_scenario_ic_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id UUID NOT NULL REFERENCES allocation_scenarios(id) ON DELETE CASCADE,
  fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES portfoliocompanies(id) ON DELETE CASCADE,
  decision_type VARCHAR(32) NOT NULL,
  decision_status VARCHAR(32) NOT NULL DEFAULT 'draft',
  rationale TEXT NOT NULL,
  proposed_planned_reserves_cents BIGINT,
  final_planned_reserves_cents BIGINT,
  decided_by_user_id INTEGER REFERENCES users(id),
  decided_by_label TEXT,
  decided_at TIMESTAMPTZ,
  source_allocation_version INTEGER,
  live_allocation_version INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT allocation_scenario_ic_decisions_unique_company
    UNIQUE (scenario_id, company_id),
  CONSTRAINT allocation_scenario_ic_decisions_type_check
    CHECK (decision_type IN ('follow_on', 'defer', 'cut_reserve', 'no_action')),
  CONSTRAINT allocation_scenario_ic_decisions_status_check
    CHECK (decision_status IN ('draft', 'proposed', 'approved', 'rejected')),
  CONSTRAINT allocation_scenario_ic_decisions_proposed_non_negative
    CHECK (
      proposed_planned_reserves_cents IS NULL OR proposed_planned_reserves_cents >= 0
    ),
  CONSTRAINT allocation_scenario_ic_decisions_final_non_negative
    CHECK (
      final_planned_reserves_cents IS NULL OR final_planned_reserves_cents >= 0
    )
);

CREATE INDEX IF NOT EXISTS allocation_scenario_ic_decisions_scenario_idx
  ON allocation_scenario_ic_decisions (scenario_id, company_id);

CREATE INDEX IF NOT EXISTS allocation_scenario_ic_decisions_fund_idx
  ON allocation_scenario_ic_decisions (fund_id, scenario_id, updated_at DESC, id DESC);
