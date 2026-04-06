-- Rollback: Phase 0 sensitivity_runs persistence layer.

DROP INDEX IF EXISTS sensitivity_runs_fund_kind_created_idx;
DROP INDEX IF EXISTS sensitivity_runs_fund_created_idx;
DROP TABLE IF EXISTS sensitivity_runs CASCADE;
