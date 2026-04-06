-- Rollback: Human Reserve IC decisions for allocation scenarios
-- Created: 2026-04-06

DROP INDEX IF EXISTS allocation_scenario_decisions_fund_scenario_idx;
DROP INDEX IF EXISTS allocation_scenario_decisions_scenario_updated_idx;
DROP TABLE IF EXISTS allocation_scenario_decisions CASCADE;
