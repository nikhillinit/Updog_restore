-- @drift-patch
-- Reason: Fund workflow commands require durable replay and draft revision checks.
ALTER TABLE fundconfigs ADD COLUMN draft_revision bigint NOT NULL DEFAULT 1
  CONSTRAINT fundconfigs_draft_revision_positive CHECK (draft_revision > 0);
--> statement-breakpoint
CREATE TABLE fund_workflow_commands (
  id serial PRIMARY KEY,
  actor_user_id integer NOT NULL REFERENCES users(id),
  operation text NOT NULL CONSTRAINT fund_workflow_commands_operation_check
    CHECK (operation IN ('create', 'save_draft', 'finalize', 'publish_draft')),
  idempotency_key uuid NOT NULL,
  request_hash varchar(64) NOT NULL CONSTRAINT fund_workflow_commands_hash_check
    CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  contract_version text NOT NULL,
  response_status integer NOT NULL,
  response_body jsonb NOT NULL,
  result_etag text NOT NULL CONSTRAINT fund_workflow_commands_etag_check
    CHECK (result_etag ~ '^"[0-9a-f]{16}"$'),
  fund_id integer NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  config_id integer NOT NULL REFERENCES fundconfigs(id),
  run_id integer REFERENCES calc_runs(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fund_workflow_commands_identity_unique UNIQUE(actor_user_id, operation, idempotency_key),
  CONSTRAINT fund_workflow_commands_response_check CHECK (
    response_status IN (200, 201) AND jsonb_typeof(response_body) = 'object'
  )
);
--> statement-breakpoint
CREATE INDEX fund_workflow_commands_fund_idx ON fund_workflow_commands(fund_id);
--> statement-breakpoint
CREATE TRIGGER fund_workflow_commands_forbid_update_trigger
  BEFORE UPDATE ON fund_workflow_commands
  FOR EACH ROW EXECUTE FUNCTION internal_economics_forbid_update();
