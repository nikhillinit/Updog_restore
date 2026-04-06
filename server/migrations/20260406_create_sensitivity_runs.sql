-- Phase 0: persistence layer for sensitivity analysis runs.
-- Mirror of shared/schema.ts::sensitivityRuns and the
-- shared/contracts/sensitivity-run-v1.contract.ts enums.
-- Update all three in lockstep when adding new kinds or statuses.

CREATE TABLE sensitivity_runs (
  id SERIAL PRIMARY KEY,
  fund_id INTEGER NOT NULL REFERENCES funds(id),
  kind TEXT NOT NULL CHECK (kind IN ('one_way','two_way','stress')),
  status TEXT NOT NULL CHECK (status IN ('pending','running','completed','failed')),
  params JSONB NOT NULL,
  results JSONB,
  created_by INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  error_code TEXT,
  error_message TEXT
);

CREATE INDEX sensitivity_runs_fund_created_idx
  ON sensitivity_runs (fund_id, created_at DESC);

CREATE INDEX sensitivity_runs_fund_kind_created_idx
  ON sensitivity_runs (fund_id, kind, created_at DESC);
