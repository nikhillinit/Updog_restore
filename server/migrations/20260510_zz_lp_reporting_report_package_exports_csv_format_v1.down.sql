-- Restore LP Reporting stored export artifacts to JSON-only format.

ALTER TABLE lp_report_package_exports
  DROP CONSTRAINT IF EXISTS lp_report_package_export_format_check;

-- CSV rows were introduced by this migration. Remove them before restoring
-- the JSON-only constraint so rollback remains executable after use.
DELETE FROM lp_report_package_exports
WHERE format = 'csv';

ALTER TABLE lp_report_package_exports
  ADD CONSTRAINT lp_report_package_export_format_check CHECK (format IN ('json'));
