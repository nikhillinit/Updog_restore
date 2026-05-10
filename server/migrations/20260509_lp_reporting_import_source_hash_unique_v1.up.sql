-- Phase 1c: import commit idempotency.
-- Deterministic per-row source_hash values are unique within each fund while
-- preserving legacy/manual rows where source_hash is NULL.

CREATE UNIQUE INDEX IF NOT EXISTS cash_flow_events_fund_source_hash_unique
  ON cash_flow_events(fund_id, source_hash)
  WHERE source_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS valuation_marks_fund_source_hash_unique
  ON valuation_marks(fund_id, source_hash)
  WHERE source_hash IS NOT NULL;
