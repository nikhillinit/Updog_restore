-- Rollback: Phase 0.2 LP Reporting & Evidence Pack foundation schema.
-- Drops the 8 tables in REVERSE FK dependency order. No CASCADE on the
-- DROP TABLE statements -- a misordered down.sql should fail loudly
-- rather than silently dropping unrelated data.
-- Indexes are dropped automatically when the parent table is dropped.

DROP TABLE IF EXISTS lp_vehicle_participation_history;
DROP TABLE IF EXISTS lp_vehicle_participation;
DROP TABLE IF EXISTS evidence_records;
DROP TABLE IF EXISTS narrative_runs;
DROP TABLE IF EXISTS lp_metric_runs;
DROP TABLE IF EXISTS valuation_marks;
DROP TABLE IF EXISTS cash_flow_events;
DROP TABLE IF EXISTS vehicles;
