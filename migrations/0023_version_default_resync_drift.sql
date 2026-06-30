-- @drift-patch
-- Reason: resync journal to shared/schema; version columns default 0 (shape) not 1 (journal). 0021_version_columns_bigint_drift fixed int->bigint type only; this fixes the residual DEFAULT drift. Additive ALTER; no prod apply.
ALTER TABLE forecast_snapshots ALTER COLUMN version SET DEFAULT 0;
ALTER TABLE investment_lots ALTER COLUMN version SET DEFAULT 0;
ALTER TABLE reserve_allocations ALTER COLUMN version SET DEFAULT 0;
