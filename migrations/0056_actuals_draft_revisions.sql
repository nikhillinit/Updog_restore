CREATE TABLE actuals_draft_revisions (
  fund_id integer NOT NULL CONSTRAINT actuals_draft_revisions_fund_id_funds_id_fk REFERENCES funds(id),
  revision integer NOT NULL CHECK (revision > 0),
  revision_hash varchar(64) NOT NULL CHECK (revision_hash ~ '^[a-f0-9]{64}$'),
  prior_revision integer,
  prior_revision_hash varchar(64),
  idempotency_key uuid NOT NULL,
  request_hash varchar(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  classification varchar(11) NOT NULL CHECK (classification IN ('provisional', 'synthetic')),
  as_of_date date CONSTRAINT actuals_draft_revisions_as_of_date_check CHECK (as_of_date IS NULL OR as_of_date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
  source_note text NOT NULL CHECK (length(btrim(source_note)) BETWEEN 1 AND 500),
  correction_reason text NOT NULL CHECK (length(btrim(correction_reason)) BETWEEN 1 AND 500),
  created_by integer NOT NULL CONSTRAINT actuals_draft_revisions_created_by_users_id_fk REFERENCES users(id),
  created_at timestamptz NOT NULL,
  ledger_source_artifact_id integer NOT NULL,
  ledger_template_version text NOT NULL CHECK (ledger_template_version = 'actuals-ledger/1.0.0'),
  ledger_file_name text NOT NULL CHECK (length(ledger_file_name) BETWEEN 1 AND 255),
  ledger_payload_sha256 varchar(64) NOT NULL CHECK (ledger_payload_sha256 ~ '^[a-f0-9]{64}$'),
  ledger_byte_count integer NOT NULL CHECK (ledger_byte_count BETWEEN 0 AND 122880),
  ledger_purge_after timestamptz NOT NULL,
  valuation_source_artifact_id integer,
  valuation_template_version text,
  valuation_file_name text,
  valuation_payload_sha256 varchar(64),
  valuation_byte_count integer,
  valuation_purge_after timestamptz,
  CONSTRAINT actuals_draft_revisions_pk PRIMARY KEY (fund_id, revision),
  CONSTRAINT actuals_draft_revisions_identity UNIQUE (fund_id, revision, revision_hash),
  CONSTRAINT actuals_draft_revisions_idempotency UNIQUE (fund_id, idempotency_key),
  CONSTRAINT actuals_draft_revisions_prior_fk FOREIGN KEY (fund_id, prior_revision, prior_revision_hash)
    REFERENCES actuals_draft_revisions(fund_id, revision, revision_hash),
  CONSTRAINT actuals_draft_revisions_prior_check CHECK (
    (revision = 1 AND prior_revision IS NULL AND prior_revision_hash IS NULL)
    OR (revision > 1 AND prior_revision IS NOT NULL AND prior_revision = revision - 1 AND prior_revision_hash IS NOT NULL)
  ),
  CONSTRAINT actuals_draft_revisions_ledger_fk FOREIGN KEY (ledger_source_artifact_id, fund_id)
    REFERENCES source_artifacts(id, fund_id),
  CONSTRAINT actuals_draft_revisions_valuation_fk FOREIGN KEY (valuation_source_artifact_id, fund_id)
    REFERENCES source_artifacts(id, fund_id),
  CONSTRAINT actuals_draft_revisions_valuation_check CHECK (
    (valuation_source_artifact_id IS NULL AND valuation_template_version IS NULL
      AND valuation_file_name IS NULL AND valuation_payload_sha256 IS NULL
      AND valuation_byte_count IS NULL AND valuation_purge_after IS NULL)
    OR (valuation_source_artifact_id IS NOT NULL
      AND valuation_template_version IS NOT NULL AND valuation_template_version = 'actuals-valuation/1.0.0'
      AND valuation_file_name IS NOT NULL AND length(valuation_file_name) BETWEEN 1 AND 255
      AND valuation_payload_sha256 IS NOT NULL AND valuation_payload_sha256 ~ '^[a-f0-9]{64}$'
      AND valuation_byte_count IS NOT NULL AND valuation_byte_count BETWEEN 0 AND 40960
      AND valuation_purge_after IS NOT NULL)
  ),
  CONSTRAINT actuals_draft_revisions_retention_check CHECK (
    ledger_purge_after > created_at AND (valuation_purge_after IS NULL OR valuation_purge_after > created_at)
  )
);
--> statement-breakpoint
CREATE FUNCTION actuals_draft_revisions_forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'actuals_draft_revisions are append-only' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER actuals_draft_revisions_immutable
BEFORE UPDATE OR DELETE ON actuals_draft_revisions
FOR EACH ROW EXECUTE FUNCTION actuals_draft_revisions_forbid_mutation();
