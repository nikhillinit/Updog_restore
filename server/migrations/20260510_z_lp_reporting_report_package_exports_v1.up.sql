-- LP Reporting stored JSON export artifacts.
-- Creates one immutable JSON export artifact per report package/export version.

CREATE TABLE IF NOT EXISTS lp_report_package_exports (
  id SERIAL PRIMARY KEY,
  fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  metric_run_id INTEGER NOT NULL REFERENCES lp_metric_runs(id) ON DELETE CASCADE,
  report_package_id INTEGER NOT NULL REFERENCES lp_report_packages(id) ON DELETE CASCADE,
  format VARCHAR(16) NOT NULL DEFAULT 'json',
  export_version INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(32) NOT NULL DEFAULT 'ready',
  content_hash_algorithm VARCHAR(16) NOT NULL DEFAULT 'sha256',
  content_hash VARCHAR(64) NOT NULL,
  artifact_payload JSONB NOT NULL,
  artifact_size_bytes INTEGER NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  ready_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT lp_report_package_export_format_check CHECK (format IN ('json')),
  CONSTRAINT lp_report_package_export_version_check CHECK (export_version = 1),
  CONSTRAINT lp_report_package_export_status_check CHECK (status IN ('ready')),
  CONSTRAINT lp_report_package_export_hash_algorithm_check CHECK (content_hash_algorithm IN ('sha256')),
  CONSTRAINT lp_report_package_export_hash_check CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT lp_report_package_export_artifact_size_check CHECK (artifact_size_bytes >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS lp_report_package_exports_package_format_version_unique
  ON lp_report_package_exports(report_package_id, format, export_version);

CREATE INDEX IF NOT EXISTS idx_lp_report_package_exports_fund_metric
  ON lp_report_package_exports(fund_id, metric_run_id);

CREATE INDEX IF NOT EXISTS idx_lp_report_package_exports_fund_metric_package
  ON lp_report_package_exports(fund_id, metric_run_id, report_package_id);

CREATE INDEX IF NOT EXISTS idx_lp_report_package_exports_fund_ready_at
  ON lp_report_package_exports(fund_id, ready_at DESC);
