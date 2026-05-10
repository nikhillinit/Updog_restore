DROP INDEX IF EXISTS evidence_records_metric_run_idempotency_unique;

ALTER TABLE evidence_records
  DROP COLUMN IF EXISTS idempotency_key;
