-- LP Reporting approved report package assembly.
-- Creates one internal assembled package per locked metric run.

CREATE TABLE IF NOT EXISTS lp_report_packages (
  id SERIAL PRIMARY KEY,
  fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  metric_run_id INTEGER NOT NULL REFERENCES lp_metric_runs(id) ON DELETE CASCADE,
  status VARCHAR(32) NOT NULL DEFAULT 'assembled',
  as_of_date DATE NOT NULL,
  metric_run_version INTEGER NOT NULL,
  metric_run_locked_by INTEGER REFERENCES users(id),
  metric_run_locked_at TIMESTAMP WITH TIME ZONE,
  narrative_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  assembled_by INTEGER NOT NULL REFERENCES users(id),
  assembled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT lp_report_package_status_check CHECK (status IN ('assembled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS lp_report_packages_metric_run_unique
  ON lp_report_packages(metric_run_id);

CREATE INDEX IF NOT EXISTS idx_lp_report_packages_fund_metric
  ON lp_report_packages(fund_id, metric_run_id);

CREATE INDEX IF NOT EXISTS idx_lp_report_packages_fund_assembled_at
  ON lp_report_packages(fund_id, assembled_at DESC);
