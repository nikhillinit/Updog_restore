-- Expand LP Reporting stored export artifacts to CSV.

ALTER TABLE lp_report_package_exports
  DROP CONSTRAINT IF EXISTS lp_report_package_export_format_check;

ALTER TABLE lp_report_package_exports
  ADD CONSTRAINT lp_report_package_export_format_check CHECK (format IN ('json','csv'));
