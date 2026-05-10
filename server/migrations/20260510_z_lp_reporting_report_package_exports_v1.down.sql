-- Roll back LP Reporting stored JSON export artifacts.

DROP INDEX IF EXISTS idx_lp_report_package_exports_fund_ready_at;
DROP INDEX IF EXISTS idx_lp_report_package_exports_fund_metric_package;
DROP INDEX IF EXISTS idx_lp_report_package_exports_fund_metric;
DROP INDEX IF EXISTS lp_report_package_exports_package_format_version_unique;
DROP TABLE IF EXISTS lp_report_package_exports;
