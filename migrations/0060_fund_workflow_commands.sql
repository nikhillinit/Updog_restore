-- @drift-patch
-- Reason: Fund workflow commands require durable replay and draft revision checks.
-- Drizzle owns the transaction that also records the migration ledger entry.
-- Refuse mixed or semantically different owned catalog before any DDL.
DO $$
DECLARE
  command_relation regclass := to_regclass('public.fund_workflow_commands');
  command_sequence regclass := to_regclass('public.fund_workflow_commands_id_seq');
  draft_column_present boolean;
  draft_constraint_present boolean;
  invalid_columns text[];
  invalid_constraints text[];
  invalid_indexes text[];
  invalid_triggers text[];
  canonical_trigger_present boolean;
  immutable_function_count integer;
  immutable_function_source text;
  immutable_function_language text;
  immutable_function_return_type text;
  sequence_is_canonical boolean;
BEGIN
  IF to_regclass('public.fundconfigs') IS NULL
    OR to_regclass('public.users') IS NULL
    OR to_regclass('public.funds') IS NULL
    OR to_regclass('public.calc_runs') IS NULL
  THEN
    RAISE EXCEPTION 'fund_workflow_commands_preflight_failed: required parent table missing';
  END IF;

  SELECT count(*)
  INTO immutable_function_count
  FROM pg_proc AS function_catalog
  JOIN pg_namespace AS namespace_catalog ON namespace_catalog.oid = function_catalog.pronamespace
  WHERE namespace_catalog.nspname = 'public'
    AND function_catalog.proname = 'internal_economics_forbid_update'
    AND pg_get_function_identity_arguments(function_catalog.oid) = '';

  IF immutable_function_count <> 1 THEN
    RAISE EXCEPTION 'fund_workflow_commands_semantic_drift: internal_economics_forbid_update must have one public zero-argument function';
  END IF;

  SELECT function_catalog.prosrc, language_catalog.lanname,
    function_catalog.prorettype::regtype::text
  INTO immutable_function_source, immutable_function_language, immutable_function_return_type
  FROM pg_proc AS function_catalog
  JOIN pg_namespace AS namespace_catalog ON namespace_catalog.oid = function_catalog.pronamespace
  JOIN pg_language AS language_catalog ON language_catalog.oid = function_catalog.prolang
  WHERE namespace_catalog.nspname = 'public'
    AND function_catalog.proname = 'internal_economics_forbid_update'
    AND pg_get_function_identity_arguments(function_catalog.oid) = '';

  IF immutable_function_language IS DISTINCT FROM 'plpgsql'
    OR immutable_function_return_type IS DISTINCT FROM 'trigger'
    OR immutable_function_source IS DISTINCT FROM $canonical_forbid_update$
BEGIN
  RAISE EXCEPTION 'immutable_row_update_forbidden: %', TG_TABLE_NAME;
END;
$canonical_forbid_update$
  THEN
    RAISE EXCEPTION 'fund_workflow_commands_semantic_drift: internal_economics_forbid_update definition changed';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fundconfigs' AND column_name = 'draft_revision'
  ) INTO draft_column_present;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.fundconfigs'::regclass
      AND conname = 'fundconfigs_draft_revision_positive'
  ) INTO draft_constraint_present;

  IF NOT (
    (command_relation IS NULL AND NOT draft_column_present AND NOT draft_constraint_present)
    OR (command_relation IS NOT NULL AND draft_column_present AND draft_constraint_present)
  ) THEN
    RAISE EXCEPTION 'fund_workflow_commands_partial_catalog_state: owned table, draft column, and draft constraint must be wholly absent or wholly present';
  END IF;

  IF command_relation IS NULL THEN
    IF command_sequence IS NOT NULL
      OR to_regclass('public.fund_workflow_commands_fund_idx') IS NOT NULL
      OR to_regclass('public.fund_workflow_commands_identity_unique') IS NOT NULL
      OR to_regclass('public.fund_workflow_commands_pkey') IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'fund_workflow_commands_forbid_update_trigger' AND NOT tgisinternal
      )
    THEN
      RAISE EXCEPTION 'fund_workflow_commands_partial_catalog_state: owned sequence, index, or trigger exists without command table';
    END IF;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = command_relation AND (relkind <> 'r' OR relpersistence <> 'p')
  ) THEN
    RAISE EXCEPTION 'fund_workflow_commands_partial_catalog_state: command object must be a permanent ordinary table';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'fundconfigs'
      AND column_name = 'draft_revision'
      AND data_type = 'bigint'
      AND udt_name = 'int8'
      AND is_nullable = 'NO'
      AND column_default = '1'
      AND is_identity = 'NO'
      AND is_generated = 'NEVER'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.fundconfigs'::regclass
      AND conname = 'fundconfigs_draft_revision_positive'
      AND pg_get_constraintdef(oid) = 'CHECK ((draft_revision > 0))'
  ) THEN
    RAISE EXCEPTION 'fund_workflow_commands_semantic_drift: fundconfigs draft revision is not canonical';
  END IF;

  WITH required_column(name, data_type, udt_name, nullable, length, default_value) AS (
    VALUES
      ('id', 'integer', 'int4', 'NO', NULL::integer, 'nextval(''fund_workflow_commands_id_seq''::regclass)'),
      ('actor_user_id', 'integer', 'int4', 'NO', NULL::integer, NULL::text),
      ('operation', 'text', 'text', 'NO', NULL::integer, NULL::text),
      ('idempotency_key', 'uuid', 'uuid', 'NO', NULL::integer, NULL::text),
      ('request_hash', 'character varying', 'varchar', 'NO', 64, NULL::text),
      ('contract_version', 'text', 'text', 'NO', NULL::integer, NULL::text),
      ('response_status', 'integer', 'int4', 'NO', NULL::integer, NULL::text),
      ('response_body', 'jsonb', 'jsonb', 'NO', NULL::integer, NULL::text),
      ('result_etag', 'text', 'text', 'NO', NULL::integer, NULL::text),
      ('fund_id', 'integer', 'int4', 'NO', NULL::integer, NULL::text),
      ('config_id', 'integer', 'int4', 'NO', NULL::integer, NULL::text),
      ('run_id', 'integer', 'int4', 'YES', NULL::integer, NULL::text),
      ('created_at', 'timestamp with time zone', 'timestamptz', 'NO', NULL::integer, 'now()')
  ), invalid_column AS (
    SELECT required_column.name
    FROM required_column
    LEFT JOIN information_schema.columns AS actual
      ON actual.table_schema = 'public'
      AND actual.table_name = 'fund_workflow_commands'
      AND actual.column_name = required_column.name
    WHERE actual.column_name IS NULL
      OR actual.data_type IS DISTINCT FROM required_column.data_type
      OR actual.udt_name IS DISTINCT FROM required_column.udt_name
      OR actual.is_nullable IS DISTINCT FROM required_column.nullable
      OR actual.character_maximum_length IS DISTINCT FROM required_column.length
      OR actual.column_default IS DISTINCT FROM required_column.default_value
      OR actual.is_identity IS DISTINCT FROM 'NO'
      OR actual.is_generated IS DISTINCT FROM 'NEVER'
      OR EXISTS (
        SELECT 1
        FROM pg_attribute AS attribute_catalog
        JOIN pg_type AS type_catalog ON type_catalog.oid = attribute_catalog.atttypid
        WHERE attribute_catalog.attrelid = command_relation
          AND attribute_catalog.attname = required_column.name
          AND attribute_catalog.attcollation IS DISTINCT FROM type_catalog.typcollation
      )
    UNION ALL
    SELECT actual.column_name
    FROM information_schema.columns AS actual
    WHERE actual.table_schema = 'public'
      AND actual.table_name = 'fund_workflow_commands'
      AND NOT EXISTS (SELECT 1 FROM required_column WHERE name = actual.column_name)
  )
  SELECT array_agg(name ORDER BY name) INTO invalid_columns FROM invalid_column;

  WITH required_constraint(name, definition) AS (
    VALUES
      ('fund_workflow_commands_pkey', 'PRIMARY KEY (id)'),
      ('fund_workflow_commands_actor_user_id_fkey', 'FOREIGN KEY (actor_user_id) REFERENCES users(id)'),
      ('fund_workflow_commands_operation_check', 'CHECK ((operation = ANY (ARRAY[''create''::text, ''save_draft''::text, ''finalize''::text, ''publish_draft''::text])))'),
      ('fund_workflow_commands_hash_check', 'CHECK (((request_hash)::text ~ ''^[0-9a-f]{64}$''::text))'),
      ('fund_workflow_commands_etag_check', 'CHECK ((result_etag ~ ''^"[0-9a-f]{16}"$''::text))'),
      ('fund_workflow_commands_fund_id_fkey', 'FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE CASCADE'),
      ('fund_workflow_commands_config_id_fkey', 'FOREIGN KEY (config_id) REFERENCES fundconfigs(id)'),
      ('fund_workflow_commands_run_id_fkey', 'FOREIGN KEY (run_id) REFERENCES calc_runs(id)'),
      ('fund_workflow_commands_identity_unique', 'UNIQUE (actor_user_id, operation, idempotency_key)'),
      ('fund_workflow_commands_response_check', 'CHECK (((response_status = ANY (ARRAY[200, 201])) AND (jsonb_typeof(response_body) = ''object''::text)))')
  ), invalid_constraint AS (
    SELECT required_constraint.name
    FROM required_constraint
    LEFT JOIN pg_constraint AS actual
      ON actual.conrelid = command_relation AND actual.conname = required_constraint.name
    WHERE actual.oid IS NULL
      OR pg_get_constraintdef(actual.oid) IS DISTINCT FROM required_constraint.definition
    UNION ALL
    SELECT actual.conname
    FROM pg_constraint AS actual
    WHERE actual.conrelid = command_relation
      AND NOT EXISTS (SELECT 1 FROM required_constraint WHERE name = actual.conname)
  )
  SELECT array_agg(name ORDER BY name) INTO invalid_constraints FROM invalid_constraint;

  WITH required_index(name, definition) AS (
    VALUES
      ('fund_workflow_commands_pkey', 'CREATE UNIQUE INDEX fund_workflow_commands_pkey ON public.fund_workflow_commands USING btree (id)'),
      ('fund_workflow_commands_identity_unique', 'CREATE UNIQUE INDEX fund_workflow_commands_identity_unique ON public.fund_workflow_commands USING btree (actor_user_id, operation, idempotency_key)'),
      ('fund_workflow_commands_fund_idx', 'CREATE INDEX fund_workflow_commands_fund_idx ON public.fund_workflow_commands USING btree (fund_id)')
  ), invalid_index AS (
    SELECT required_index.name
    FROM required_index
    LEFT JOIN pg_class AS index_relation
      ON index_relation.relnamespace = 'public'::regnamespace AND index_relation.relname = required_index.name
    LEFT JOIN pg_index AS actual ON actual.indexrelid = index_relation.oid
    WHERE actual.indexrelid IS NULL
      OR actual.indrelid IS DISTINCT FROM command_relation
      OR pg_get_indexdef(actual.indexrelid) IS DISTINCT FROM required_index.definition
      OR NOT actual.indisvalid
      OR NOT actual.indisready
      OR NOT actual.indislive
    UNION ALL
    SELECT index_relation.relname
    FROM pg_index AS actual
    JOIN pg_class AS index_relation ON index_relation.oid = actual.indexrelid
    WHERE actual.indrelid = command_relation
      AND NOT EXISTS (SELECT 1 FROM required_index WHERE name = index_relation.relname)
  )
  SELECT array_agg(name ORDER BY name) INTO invalid_indexes FROM invalid_index;

  SELECT array_agg(trigger_catalog.tgname ORDER BY trigger_catalog.tgname)
  INTO invalid_triggers
  FROM pg_trigger AS trigger_catalog
  WHERE NOT trigger_catalog.tgisinternal
    AND (
      (trigger_catalog.tgrelid = command_relation AND (
        trigger_catalog.tgname <> 'fund_workflow_commands_forbid_update_trigger'
        OR trigger_catalog.tgenabled <> 'O'
        OR trigger_catalog.tgfoid <> 'public.internal_economics_forbid_update()'::regprocedure
        OR pg_get_triggerdef(trigger_catalog.oid) <> 'CREATE TRIGGER fund_workflow_commands_forbid_update_trigger BEFORE UPDATE ON public.fund_workflow_commands FOR EACH ROW EXECUTE FUNCTION internal_economics_forbid_update()'
      ))
      OR (trigger_catalog.tgrelid <> command_relation AND trigger_catalog.tgname = 'fund_workflow_commands_forbid_update_trigger')
    );

  SELECT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = command_relation
      AND tgname = 'fund_workflow_commands_forbid_update_trigger'
      AND NOT tgisinternal
      AND tgenabled = 'O'
      AND tgfoid = 'public.internal_economics_forbid_update()'::regprocedure
      AND pg_get_triggerdef(oid) = 'CREATE TRIGGER fund_workflow_commands_forbid_update_trigger BEFORE UPDATE ON public.fund_workflow_commands FOR EACH ROW EXECUTE FUNCTION internal_economics_forbid_update()'
  ) INTO canonical_trigger_present;

  SELECT EXISTS (
    SELECT 1
    FROM pg_class AS sequence_relation
    JOIN pg_namespace AS namespace_catalog ON namespace_catalog.oid = sequence_relation.relnamespace
    JOIN pg_sequence AS sequence_catalog ON sequence_catalog.seqrelid = sequence_relation.oid
    JOIN pg_depend AS ownership
      ON ownership.classid = 'pg_class'::regclass
      AND ownership.objid = sequence_relation.oid
      AND ownership.refclassid = 'pg_class'::regclass
      AND ownership.refobjid = command_relation
      AND ownership.refobjsubid = (
        SELECT attnum FROM pg_attribute WHERE attrelid = command_relation AND attname = 'id'
      )
      AND ownership.deptype = 'a'
    WHERE namespace_catalog.nspname = 'public'
      AND sequence_relation.relname = 'fund_workflow_commands_id_seq'
      AND sequence_relation.relpersistence = 'p'
      AND sequence_catalog.seqtypid = 'integer'::regtype
      AND sequence_catalog.seqstart = 1
      AND sequence_catalog.seqincrement = 1
      AND sequence_catalog.seqmin = 1
      AND sequence_catalog.seqmax = 2147483647
      AND NOT sequence_catalog.seqcycle
  ) INTO sequence_is_canonical;

  IF invalid_columns IS NOT NULL
    OR invalid_constraints IS NOT NULL
    OR invalid_indexes IS NOT NULL
    OR invalid_triggers IS NOT NULL
    OR NOT canonical_trigger_present
    OR NOT sequence_is_canonical
  THEN
    RAISE EXCEPTION 'fund_workflow_commands_semantic_drift: columns [%], constraints [%], indexes [%], triggers [%], sequence canonical [%]',
      coalesce(array_to_string(invalid_columns, ', '), ''),
      coalesce(array_to_string(invalid_constraints, ', '), ''),
      coalesce(array_to_string(invalid_indexes, ', '), ''),
      coalesce(array_to_string(invalid_triggers, ', '), ''),
      sequence_is_canonical;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fundconfigs' AND column_name = 'draft_revision'
  ) THEN
    ALTER TABLE fundconfigs ADD COLUMN draft_revision bigint NOT NULL DEFAULT 1
      CONSTRAINT fundconfigs_draft_revision_positive CHECK (draft_revision > 0);
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS fund_workflow_commands (
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
CREATE INDEX IF NOT EXISTS fund_workflow_commands_fund_idx ON fund_workflow_commands(fund_id);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.fund_workflow_commands'::regclass
      AND tgname = 'fund_workflow_commands_forbid_update_trigger'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER fund_workflow_commands_forbid_update_trigger
      BEFORE UPDATE ON fund_workflow_commands
      FOR EACH ROW EXECUTE FUNCTION internal_economics_forbid_update();
  END IF;
END $$;
