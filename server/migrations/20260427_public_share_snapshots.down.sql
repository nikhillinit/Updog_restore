DROP INDEX IF EXISTS share_snapshots_payload_hash_idx;
DROP INDEX IF EXISTS share_snapshots_share_generated_idx;
DROP TABLE IF EXISTS share_snapshots;
DROP INDEX IF EXISTS shares_creator_idempotency_key_idx;
ALTER TABLE shares
  DROP COLUMN IF EXISTS idempotency_request_hash,
  DROP COLUMN IF EXISTS idempotency_key,
  DROP COLUMN IF EXISTS version;
