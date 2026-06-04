ALTER TABLE evidence_records
  ADD COLUMN IF NOT EXISTS idempotency_key varchar(128);

CREATE UNIQUE INDEX IF NOT EXISTS evidence_records_metric_run_idempotency_unique
  ON evidence_records (fund_id, metric_run_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
