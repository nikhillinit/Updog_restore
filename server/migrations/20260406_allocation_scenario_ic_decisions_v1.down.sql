-- Rollback: Scenario-scoped reserve IC decisions
-- Created: 2026-04-06

DROP INDEX IF EXISTS allocation_scenario_ic_decisions_fund_idx;
DROP INDEX IF EXISTS allocation_scenario_ic_decisions_scenario_idx;
DROP TABLE IF EXISTS allocation_scenario_ic_decisions CASCADE;
