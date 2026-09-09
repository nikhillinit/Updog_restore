-- @drift-patch
-- Reason: Add immutable correction lineage without regenerating historical schema snapshots.
-- Additive restatement provenance; existing actuals rows remain unchanged.
ALTER TABLE cash_flow_events ADD CONSTRAINT cash_flow_events_id_fund_unique UNIQUE (id, fund_id);
--> statement-breakpoint
ALTER TABLE valuation_marks ADD CONSTRAINT valuation_marks_id_fund_unique UNIQUE (id, fund_id);
--> statement-breakpoint
CREATE TABLE actuals_restatement_commands (
  id serial PRIMARY KEY,
  command_id uuid NOT NULL,
  fund_id integer NOT NULL CONSTRAINT actuals_restatement_commands_fund_id_fkey REFERENCES funds(id),
  idempotency_key uuid NOT NULL,
  operation_hash varchar(64) NOT NULL,
  expected_snapshot_id integer NOT NULL,
  expected_snapshot_input_hash varchar(64) NOT NULL,
  expected_preview_hash varchar(64) NOT NULL,
  as_of_date date NOT NULL,
  reason text NOT NULL,
  created_by integer NOT NULL CONSTRAINT actuals_restatement_commands_created_by_fkey REFERENCES users(id),
  created_at timestamptz NOT NULL,
  publication_snapshot_id integer NOT NULL,
  ledger_source_artifact_id integer,
  valuation_source_artifact_id integer,
  CONSTRAINT actuals_restatement_commands_command_unique UNIQUE (command_id),
  CONSTRAINT actuals_restatement_commands_command_fund_unique UNIQUE (command_id, fund_id),
  CONSTRAINT actuals_restatement_commands_idempotency_unique UNIQUE (fund_id, idempotency_key),
  CONSTRAINT actuals_restatement_commands_publication_unique UNIQUE (publication_snapshot_id),
  CONSTRAINT actuals_restatement_commands_expected_snapshot_fk FOREIGN KEY (expected_snapshot_id, fund_id) REFERENCES financial_facts_snapshots(id, fund_id),
  CONSTRAINT actuals_restatement_commands_publication_fk FOREIGN KEY (publication_snapshot_id, fund_id) REFERENCES financial_facts_snapshots(id, fund_id),
  CONSTRAINT actuals_restatement_commands_ledger_artifact_fk FOREIGN KEY (ledger_source_artifact_id, fund_id) REFERENCES source_artifacts(id, fund_id),
  CONSTRAINT actuals_restatement_commands_valuation_artifact_fk FOREIGN KEY (valuation_source_artifact_id, fund_id) REFERENCES source_artifacts(id, fund_id),
  CONSTRAINT actuals_restatement_commands_hash_check CHECK (operation_hash ~ '^[a-f0-9]{64}$' AND expected_snapshot_input_hash ~ '^[a-f0-9]{64}$' AND expected_preview_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT actuals_restatement_commands_reason_check CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  CONSTRAINT actuals_restatement_commands_artifacts_check CHECK (ledger_source_artifact_id IS NOT NULL OR valuation_source_artifact_id IS NOT NULL),
  CONSTRAINT actuals_restatement_commands_successor_check CHECK (expected_snapshot_id <> publication_snapshot_id)
);
--> statement-breakpoint
CREATE TABLE actuals_restatement_items (
  id serial PRIMARY KEY,
  command_id uuid NOT NULL,
  fund_id integer NOT NULL CONSTRAINT actuals_restatement_items_fund_id_fkey REFERENCES funds(id),
  target_cash_flow_event_id integer,
  replacement_cash_flow_event_id integer,
  target_valuation_mark_id integer,
  replacement_valuation_mark_id integer,
  target_source_hash varchar(64) NOT NULL,
  target_content_hash varchar(64) NOT NULL,
  replacement_source_hash varchar(64) NOT NULL,
  replacement_content_hash varchar(64) NOT NULL,
  replacement_external_ref varchar(128) NOT NULL,
  original_publication_snapshot_id integer NOT NULL,
  original_publication_snapshot_input_hash varchar(64) NOT NULL,
  original_publication_operation_hash varchar(64) NOT NULL,
  CONSTRAINT actuals_restatement_items_command_fk FOREIGN KEY (command_id, fund_id) REFERENCES actuals_restatement_commands(command_id, fund_id),
  CONSTRAINT actuals_restatement_items_target_cash_fk FOREIGN KEY (target_cash_flow_event_id, fund_id) REFERENCES cash_flow_events(id, fund_id),
  CONSTRAINT actuals_restatement_items_replacement_cash_fk FOREIGN KEY (replacement_cash_flow_event_id, fund_id) REFERENCES cash_flow_events(id, fund_id),
  CONSTRAINT actuals_restatement_items_target_mark_fk FOREIGN KEY (target_valuation_mark_id, fund_id) REFERENCES valuation_marks(id, fund_id),
  CONSTRAINT actuals_restatement_items_replacement_mark_fk FOREIGN KEY (replacement_valuation_mark_id, fund_id) REFERENCES valuation_marks(id, fund_id),
  CONSTRAINT actuals_restatement_items_original_publication_fk FOREIGN KEY (original_publication_snapshot_id, fund_id) REFERENCES financial_facts_snapshots(id, fund_id),
  CONSTRAINT actuals_restatement_items_cash_successor_unique UNIQUE (fund_id, target_cash_flow_event_id),
  CONSTRAINT actuals_restatement_items_cash_replacement_unique UNIQUE (fund_id, replacement_cash_flow_event_id),
  CONSTRAINT actuals_restatement_items_mark_successor_unique UNIQUE (fund_id, target_valuation_mark_id),
  CONSTRAINT actuals_restatement_items_mark_replacement_unique UNIQUE (fund_id, replacement_valuation_mark_id),
  CONSTRAINT actuals_restatement_items_external_ref_unique UNIQUE (command_id, replacement_external_ref),
  CONSTRAINT actuals_restatement_items_kind_check CHECK ((target_cash_flow_event_id IS NOT NULL AND replacement_cash_flow_event_id IS NOT NULL AND target_valuation_mark_id IS NULL AND replacement_valuation_mark_id IS NULL) OR (target_cash_flow_event_id IS NULL AND replacement_cash_flow_event_id IS NULL AND target_valuation_mark_id IS NOT NULL AND replacement_valuation_mark_id IS NOT NULL)),
  CONSTRAINT actuals_restatement_items_no_self_check CHECK ((target_cash_flow_event_id IS NULL OR target_cash_flow_event_id <> replacement_cash_flow_event_id) AND (target_valuation_mark_id IS NULL OR target_valuation_mark_id <> replacement_valuation_mark_id) AND target_source_hash <> replacement_source_hash),
  CONSTRAINT actuals_restatement_items_hash_check CHECK (target_source_hash ~ '^[a-f0-9]{64}$' AND target_content_hash ~ '^[a-f0-9]{64}$' AND replacement_source_hash ~ '^[a-f0-9]{64}$' AND replacement_content_hash ~ '^[a-f0-9]{64}$' AND original_publication_snapshot_input_hash ~ '^[a-f0-9]{64}$' AND original_publication_operation_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT actuals_restatement_items_external_ref_check CHECK (replacement_external_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$')
);
--> statement-breakpoint
CREATE FUNCTION reject_actuals_restatement_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Actuals restatement provenance is append-only' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER actuals_restatement_commands_immutable
BEFORE UPDATE OR DELETE ON actuals_restatement_commands
FOR EACH ROW EXECUTE FUNCTION reject_actuals_restatement_mutation();
--> statement-breakpoint
CREATE TRIGGER actuals_restatement_items_immutable
BEFORE UPDATE OR DELETE ON actuals_restatement_items
FOR EACH ROW EXECUTE FUNCTION reject_actuals_restatement_mutation();
