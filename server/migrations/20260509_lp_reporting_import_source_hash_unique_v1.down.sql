-- Rollback: Phase 1c import commit idempotency indexes.

DROP INDEX IF EXISTS valuation_marks_fund_source_hash_unique;
DROP INDEX IF EXISTS cash_flow_events_fund_source_hash_unique;
