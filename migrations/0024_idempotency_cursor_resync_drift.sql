-- @drift-patch
-- Reason: resync journal to shared/schema; add idempotency-key length CHECKs, the fund/investment/snapshot-scoped idempotency unique indexes, and the cursor indexes that exist in the Drizzle shape but lived only in the loose (non-journaled) 0001_portfolio_schema_hardening file. Additive (CREATE-only); no prod apply. The pre-existing global *_idempotency_unique_idx (journal 0001_certain_miracleman) is intentionally retained here and deferred to PR-1/operator alongside the FK-name reconcile seam.
-- forecast_snapshots
ALTER TABLE forecast_snapshots ADD CONSTRAINT forecast_snapshots_idem_key_len_check CHECK (idempotency_key IS NULL OR (length(idempotency_key) >= 1 AND length(idempotency_key) <= 128));
CREATE UNIQUE INDEX forecast_snapshots_fund_idem_key_idx ON forecast_snapshots (fund_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX forecast_snapshots_fund_cursor_idx ON forecast_snapshots (fund_id, snapshot_time DESC, id DESC);
-- investment_lots
ALTER TABLE investment_lots ADD CONSTRAINT investment_lots_idem_key_len_check CHECK (idempotency_key IS NULL OR (length(idempotency_key) >= 1 AND length(idempotency_key) <= 128));
CREATE UNIQUE INDEX investment_lots_investment_idem_key_idx ON investment_lots (investment_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX investment_lots_investment_cursor_idx ON investment_lots (investment_id, created_at DESC, id DESC);
-- reserve_allocations
ALTER TABLE reserve_allocations ADD CONSTRAINT reserve_allocations_idem_key_len_check CHECK (idempotency_key IS NULL OR (length(idempotency_key) >= 1 AND length(idempotency_key) <= 128));
CREATE UNIQUE INDEX reserve_allocations_snapshot_idem_key_idx ON reserve_allocations (snapshot_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX reserve_allocations_snapshot_cursor_idx ON reserve_allocations (snapshot_id, created_at DESC, id DESC);
