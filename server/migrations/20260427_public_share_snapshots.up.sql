ALTER TABLE shares
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS idempotency_request_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS shares_creator_idempotency_key_idx
  ON shares (created_by, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS share_snapshots (
  id text PRIMARY KEY,
  share_id text NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
  fund_id_internal text NOT NULL,
  payload_version text NOT NULL DEFAULT 'public-share-snapshot.v1',
  as_of_date timestamptz NOT NULL,
  source_calculation_run_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  hidden_metric_policy jsonb NOT NULL,
  generated_by text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  payload_hash text NOT NULL,
  payload jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS share_snapshots_share_generated_idx
  ON share_snapshots (share_id, generated_at);

CREATE INDEX IF NOT EXISTS share_snapshots_payload_hash_idx
  ON share_snapshots (payload_hash);
