-- 0009_calc_runs.sql
-- Phase 2A Item 6: calcRuns table for dispatch state tracking

BEGIN;

CREATE TABLE IF NOT EXISTS calc_runs (
  id              SERIAL PRIMARY KEY,
  fund_id         INTEGER NOT NULL REFERENCES funds(id),
  config_id       INTEGER NOT NULL REFERENCES fundconfigs(id),
  config_version  INTEGER NOT NULL,
  correlation_id  VARCHAR(36) NOT NULL UNIQUE,
  engines         JSONB NOT NULL,
  dispatch_state  VARCHAR(20) NOT NULL,
  requested_at    TIMESTAMP NOT NULL,
  dispatched_at   TIMESTAMP,
  completed_at    TIMESTAMP,
  failed_at       TIMESTAMP,
  last_error      TEXT,
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS calc_runs_fund_id_idx ON calc_runs (fund_id);
CREATE INDEX IF NOT EXISTS calc_runs_config_id_idx ON calc_runs (config_id);

COMMIT;
