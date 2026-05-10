-- Roll back LP Reporting approved report package assembly.

DROP INDEX IF EXISTS idx_lp_report_packages_fund_assembled_at;
DROP INDEX IF EXISTS idx_lp_report_packages_fund_metric;
DROP INDEX IF EXISTS lp_report_packages_metric_run_unique;
DROP TABLE IF EXISTS lp_report_packages;
