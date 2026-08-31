-- @drift-patch
-- Reason: Issue #1289 adds the ADR-067 operating-decision spine, decision-sourced
-- evidence links, and additive task-create idempotency columns.
-- Journal tag: 0054_operating_decisions_spine. This migration is pinned by tag,
-- not by journal tail position.
-- Drizzle's PostgreSQL migrator owns the transaction and journal write.
-- Do not add BEGIN/COMMIT here.

-- Guard every object that later uses IF NOT EXISTS or trigger replacement. The
-- temporary check tables below exist only inside this verifier transaction and
-- are dropped before it completes; they provide PostgreSQL's own canonical
-- pg_get_constraintdef output for exact CHECK comparisons.
DO $migration$
DECLARE
  operating_decisions_present boolean;
  decision_evidence_links_present boolean;
  tasks_idempotency_key_present boolean;
  tasks_request_hash_present boolean;
  invalid_columns text[];
  invalid_constraints text[];
  expected_status_check text;
  expected_title_check text;
  expected_outcome_coupling_check text;
  expected_outcome_status_check text;
  expected_deferred_follow_up_check text;
  expected_target_kind_check text;
  expected_target_coupling_check text;
BEGIN
  IF to_regclass('public.tasks') IS NULL THEN
    RAISE EXCEPTION
      'operating_decisions_spine_preflight_failed: public.tasks is required';
  END IF;

  IF to_regclass('public.funds') IS NULL
     OR to_regclass('public.users') IS NULL
     OR to_regclass('public.internal_analysis_references') IS NULL
     OR to_regclass('public.internal_lp_economics_runs') IS NULL THEN
    RAISE EXCEPTION
      'operating_decisions_spine_preflight_failed: required parent tables are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.internal_analysis_references'::regclass
      AND conname = 'internal_analysis_references_id_fund_unique'
      AND pg_get_constraintdef(oid) = 'UNIQUE (id, fund_id)'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.internal_lp_economics_runs'::regclass
      AND conname = 'internal_lp_economics_runs_id_fund_unique'
      AND pg_get_constraintdef(oid) = 'UNIQUE (id, fund_id)'
  ) THEN
    RAISE EXCEPTION
      'operating_decisions_spine_preflight_failed: composite evidence FK targets are not exact';
  END IF;

  operating_decisions_present := to_regclass('public.operating_decisions') IS NOT NULL;
  decision_evidence_links_present := to_regclass('public.decision_evidence_links') IS NOT NULL;

  IF operating_decisions_present IS DISTINCT FROM decision_evidence_links_present THEN
    RAISE EXCEPTION
      'operating_decisions_spine_partial_catalog_state: decision tables must both be absent or present';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tasks'
      AND column_name = 'idempotency_key'
  )
  INTO tasks_idempotency_key_present;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tasks'
      AND column_name = 'request_hash'
  )
  INTO tasks_request_hash_present;

  IF tasks_idempotency_key_present IS DISTINCT FROM tasks_request_hash_present THEN
    RAISE EXCEPTION
      'operating_decisions_spine_partial_catalog_state: task idempotency columns must both be absent or present';
  END IF;

  IF operating_decisions_present THEN
    IF EXISTS (
      SELECT 1
      FROM pg_class
      WHERE oid IN (
        'public.operating_decisions'::regclass,
        'public.decision_evidence_links'::regclass
      )
        AND relkind <> 'r'
    ) THEN
      RAISE EXCEPTION
        'operating_decisions_spine_partial_catalog_state: decision objects must be ordinary tables';
    END IF;

    WITH required_column(
      table_name,
      name,
      data_type,
      udt_name,
      is_nullable,
      character_maximum_length,
      default_kind
    ) AS (
      VALUES
        ('operating_decisions', 'id', 'integer', 'int4', 'NO', NULL::integer, 'serial'),
        ('operating_decisions', 'fund_id', 'integer', 'int4', 'NO', NULL::integer, 'none'),
        ('operating_decisions', 'title', 'character varying', 'varchar', 'NO', 200, 'none'),
        ('operating_decisions', 'recommendation', 'text', 'text', 'NO', NULL::integer, 'none'),
        ('operating_decisions', 'status', 'character varying', 'varchar', 'NO', 16, 'proposed'),
        ('operating_decisions', 'supersedes_decision_id', 'integer', 'int4', 'YES', NULL::integer, 'none'),
        ('operating_decisions', 'outcome', 'text', 'text', 'YES', NULL::integer, 'none'),
        ('operating_decisions', 'outcome_recorded_at', 'timestamp with time zone', 'timestamptz', 'YES', NULL::integer, 'none'),
        ('operating_decisions', 'outcome_recorded_by', 'integer', 'int4', 'YES', NULL::integer, 'none'),
        ('operating_decisions', 'follow_up_owner_id', 'integer', 'int4', 'YES', NULL::integer, 'none'),
        ('operating_decisions', 'follow_up_date', 'date', 'date', 'YES', NULL::integer, 'none'),
        ('operating_decisions', 'idempotency_key', 'character varying', 'varchar', 'NO', 128, 'none'),
        ('operating_decisions', 'request_hash', 'character varying', 'varchar', 'NO', 64, 'none'),
        ('operating_decisions', 'created_by', 'integer', 'int4', 'YES', NULL::integer, 'none'),
        ('operating_decisions', 'created_at', 'timestamp with time zone', 'timestamptz', 'NO', NULL::integer, 'now'),
        ('operating_decisions', 'updated_at', 'timestamp with time zone', 'timestamptz', 'NO', NULL::integer, 'now'),
        ('decision_evidence_links', 'id', 'integer', 'int4', 'NO', NULL::integer, 'serial'),
        ('decision_evidence_links', 'fund_id', 'integer', 'int4', 'NO', NULL::integer, 'none'),
        ('decision_evidence_links', 'decision_id', 'integer', 'int4', 'NO', NULL::integer, 'none'),
        ('decision_evidence_links', 'target_kind', 'character varying', 'varchar', 'NO', NULL::integer, 'none'),
        ('decision_evidence_links', 'analysis_reference_id', 'integer', 'int4', 'YES', NULL::integer, 'none'),
        ('decision_evidence_links', 'economics_run_id', 'integer', 'int4', 'YES', NULL::integer, 'none'),
        ('decision_evidence_links', 'idempotency_key', 'character varying', 'varchar', 'NO', 128, 'none'),
        ('decision_evidence_links', 'request_hash', 'character varying', 'varchar', 'NO', 64, 'none'),
        ('decision_evidence_links', 'created_by', 'integer', 'int4', 'YES', NULL::integer, 'none'),
        ('decision_evidence_links', 'created_at', 'timestamp with time zone', 'timestamptz', 'NO', NULL::integer, 'now')
    ), invalid_column AS (
      SELECT required_column.table_name || '.' || required_column.name AS name
      FROM required_column
      LEFT JOIN information_schema.columns AS column_catalog
        ON column_catalog.table_schema = 'public'
        AND column_catalog.table_name = required_column.table_name
        AND column_catalog.column_name = required_column.name
      WHERE column_catalog.column_name IS NULL
        OR column_catalog.data_type IS DISTINCT FROM required_column.data_type
        OR column_catalog.udt_name IS DISTINCT FROM required_column.udt_name
        OR column_catalog.is_nullable IS DISTINCT FROM required_column.is_nullable
        OR column_catalog.character_maximum_length IS DISTINCT FROM required_column.character_maximum_length
        OR column_catalog.is_identity IS DISTINCT FROM 'NO'
        OR column_catalog.is_generated IS DISTINCT FROM 'NEVER'
        OR (
          required_column.default_kind = 'serial'
          AND (
            column_catalog.column_default IS DISTINCT FROM
              ('nextval(''' || required_column.table_name || '_id_seq''::regclass)')
            OR pg_get_serial_sequence(
              'public.' || required_column.table_name,
              required_column.name
            ) IS DISTINCT FROM ('public.' || required_column.table_name || '_id_seq')
          )
        )
        OR (
          required_column.default_kind = 'proposed'
          AND column_catalog.column_default IS DISTINCT FROM '''proposed''::character varying'
        )
        OR (
          required_column.default_kind = 'now'
          AND column_catalog.column_default IS DISTINCT FROM 'now()'
        )
        OR (
          required_column.default_kind = 'none'
          AND column_catalog.column_default IS NOT NULL
        )
      UNION ALL
      SELECT column_catalog.table_name || '.' || column_catalog.column_name
      FROM information_schema.columns AS column_catalog
      WHERE column_catalog.table_schema = 'public'
        AND column_catalog.table_name IN ('operating_decisions', 'decision_evidence_links')
        AND NOT EXISTS (
          SELECT 1
          FROM required_column
          WHERE required_column.table_name = column_catalog.table_name
            AND required_column.name = column_catalog.column_name
        )
    )
    SELECT array_agg(name ORDER BY name)
    INTO invalid_columns
    FROM invalid_column;

    DROP TABLE IF EXISTS pg_temp.__operating_decisions_expected_checks;
    DROP TABLE IF EXISTS pg_temp.__decision_evidence_expected_checks;

    CREATE TEMP TABLE __operating_decisions_expected_checks (
      title varchar(200),
      status varchar(16),
      outcome text,
      outcome_recorded_at timestamptz,
      outcome_recorded_by integer,
      follow_up_owner_id integer,
      follow_up_date date,
      CONSTRAINT __operating_decisions_status_check
        CHECK (status IN ('proposed', 'accepted', 'rejected', 'deferred')),
      CONSTRAINT __operating_decisions_title_nonempty_check
        CHECK (length(btrim(title)) > 0),
      CONSTRAINT __operating_decisions_outcome_coupling_check
        CHECK (
          (outcome IS NULL AND outcome_recorded_at IS NULL AND outcome_recorded_by IS NULL)
          OR (outcome IS NOT NULL AND outcome_recorded_at IS NOT NULL AND outcome_recorded_by IS NOT NULL)
        ),
      CONSTRAINT __operating_decisions_outcome_status_check
        CHECK (outcome IS NULL OR status IN ('accepted', 'rejected')),
      CONSTRAINT __operating_decisions_deferred_follow_up_check
        CHECK (
          status <> 'deferred'
          OR (follow_up_owner_id IS NOT NULL AND follow_up_date IS NOT NULL)
        )
    ) ON COMMIT DROP;

    CREATE TEMP TABLE __decision_evidence_expected_checks (
      target_kind varchar,
      analysis_reference_id integer,
      economics_run_id integer,
      CONSTRAINT __decision_evidence_target_kind_check
        CHECK (target_kind IN ('analysis_reference', 'internal_economics_run')),
      CONSTRAINT __decision_evidence_target_coupling_check
        CHECK (
          (target_kind = 'analysis_reference'
            AND analysis_reference_id IS NOT NULL
            AND economics_run_id IS NULL)
          OR (target_kind = 'internal_economics_run'
            AND economics_run_id IS NOT NULL
            AND analysis_reference_id IS NULL)
        )
    ) ON COMMIT DROP;

    SELECT pg_get_constraintdef(oid)
    INTO expected_status_check
    FROM pg_constraint
    WHERE conrelid = 'pg_temp.__operating_decisions_expected_checks'::regclass
      AND conname = '__operating_decisions_status_check';
    SELECT pg_get_constraintdef(oid)
    INTO expected_title_check
    FROM pg_constraint
    WHERE conrelid = 'pg_temp.__operating_decisions_expected_checks'::regclass
      AND conname = '__operating_decisions_title_nonempty_check';
    SELECT pg_get_constraintdef(oid)
    INTO expected_outcome_coupling_check
    FROM pg_constraint
    WHERE conrelid = 'pg_temp.__operating_decisions_expected_checks'::regclass
      AND conname = '__operating_decisions_outcome_coupling_check';
    SELECT pg_get_constraintdef(oid)
    INTO expected_outcome_status_check
    FROM pg_constraint
    WHERE conrelid = 'pg_temp.__operating_decisions_expected_checks'::regclass
      AND conname = '__operating_decisions_outcome_status_check';
    SELECT pg_get_constraintdef(oid)
    INTO expected_deferred_follow_up_check
    FROM pg_constraint
    WHERE conrelid = 'pg_temp.__operating_decisions_expected_checks'::regclass
      AND conname = '__operating_decisions_deferred_follow_up_check';
    SELECT pg_get_constraintdef(oid)
    INTO expected_target_kind_check
    FROM pg_constraint
    WHERE conrelid = 'pg_temp.__decision_evidence_expected_checks'::regclass
      AND conname = '__decision_evidence_target_kind_check';
    SELECT pg_get_constraintdef(oid)
    INTO expected_target_coupling_check
    FROM pg_constraint
    WHERE conrelid = 'pg_temp.__decision_evidence_expected_checks'::regclass
      AND conname = '__decision_evidence_target_coupling_check';

    WITH expected(table_name, constraint_name, definition) AS (
      VALUES
        ('operating_decisions', 'operating_decisions_pkey', 'PRIMARY KEY (id)'),
        ('operating_decisions', 'operating_decisions_fund_id_funds_id_fk', 'FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE CASCADE'),
        ('operating_decisions', 'operating_decisions_supersedes_decision_fund_fk', 'FOREIGN KEY (supersedes_decision_id, fund_id) REFERENCES operating_decisions(id, fund_id) ON DELETE RESTRICT'),
        ('operating_decisions', 'operating_decisions_outcome_recorded_by_fk', 'FOREIGN KEY (outcome_recorded_by) REFERENCES users(id)'),
        ('operating_decisions', 'operating_decisions_follow_up_owner_id_fk', 'FOREIGN KEY (follow_up_owner_id) REFERENCES users(id)'),
        ('operating_decisions', 'operating_decisions_created_by_fk', 'FOREIGN KEY (created_by) REFERENCES users(id)'),
        ('operating_decisions', 'operating_decisions_id_fund_unique', 'UNIQUE (id, fund_id)'),
        ('operating_decisions', 'operating_decisions_fund_idempotency_unique', 'UNIQUE (fund_id, idempotency_key)'),
        ('operating_decisions', 'operating_decisions_status_check', expected_status_check),
        ('operating_decisions', 'operating_decisions_title_nonempty_check', expected_title_check),
        ('operating_decisions', 'operating_decisions_outcome_coupling_check', expected_outcome_coupling_check),
        ('operating_decisions', 'operating_decisions_outcome_status_check', expected_outcome_status_check),
        ('operating_decisions', 'operating_decisions_deferred_follow_up_check', expected_deferred_follow_up_check),
        ('decision_evidence_links', 'decision_evidence_links_pkey', 'PRIMARY KEY (id)'),
        ('decision_evidence_links', 'decision_evidence_links_fund_id_funds_id_fk', 'FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE CASCADE'),
        ('decision_evidence_links', 'decision_evidence_links_decision_fund_fk', 'FOREIGN KEY (decision_id, fund_id) REFERENCES operating_decisions(id, fund_id) ON DELETE CASCADE'),
        ('decision_evidence_links', 'decision_evidence_links_analysis_reference_fund_fk', 'FOREIGN KEY (analysis_reference_id, fund_id) REFERENCES internal_analysis_references(id, fund_id) ON DELETE RESTRICT'),
        ('decision_evidence_links', 'decision_evidence_links_economics_run_fund_fk', 'FOREIGN KEY (economics_run_id, fund_id) REFERENCES internal_lp_economics_runs(id, fund_id) ON DELETE RESTRICT'),
        ('decision_evidence_links', 'decision_evidence_links_created_by_fk', 'FOREIGN KEY (created_by) REFERENCES users(id)'),
        ('decision_evidence_links', 'decision_evidence_links_fund_decision_idempotency_unique', 'UNIQUE (fund_id, decision_id, idempotency_key)'),
        ('decision_evidence_links', 'decision_evidence_links_target_kind_check', expected_target_kind_check),
        ('decision_evidence_links', 'decision_evidence_links_target_coupling_check', expected_target_coupling_check)
    ), invalid_constraint AS (
      SELECT expected.table_name || '.' || expected.constraint_name AS name
      FROM expected
      LEFT JOIN pg_constraint AS actual
        ON actual.conrelid = ('public.' || expected.table_name)::regclass
        AND actual.conname = expected.constraint_name
      WHERE actual.oid IS NULL
        OR pg_get_constraintdef(actual.oid) IS DISTINCT FROM expected.definition
      UNION ALL
      SELECT relation.relname || '.' || actual.conname
      FROM pg_constraint AS actual
      JOIN pg_class AS relation ON relation.oid = actual.conrelid
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname IN ('operating_decisions', 'decision_evidence_links')
        AND NOT EXISTS (
          SELECT 1
          FROM expected
          WHERE expected.table_name = relation.relname
            AND expected.constraint_name = actual.conname
        )
    )
    SELECT array_agg(name ORDER BY name)
    INTO invalid_constraints
    FROM invalid_constraint;

    DROP TABLE IF EXISTS pg_temp.__operating_decisions_expected_checks;
    DROP TABLE IF EXISTS pg_temp.__decision_evidence_expected_checks;

    IF invalid_columns IS NOT NULL OR invalid_constraints IS NOT NULL THEN
      RAISE EXCEPTION
        'operating_decisions_spine_all_present_catalog_drift: invalid columns %, invalid constraints %',
        invalid_columns,
        invalid_constraints;
    END IF;
  END IF;

  IF tasks_idempotency_key_present THEN
    WITH required_column(name, data_type, udt_name, is_nullable, character_maximum_length) AS (
      VALUES
        ('idempotency_key', 'character varying', 'varchar', 'YES', 128),
        ('request_hash', 'character varying', 'varchar', 'YES', 64)
    ), invalid_column AS (
      SELECT required_column.name
      FROM required_column
      LEFT JOIN information_schema.columns AS column_catalog
        ON column_catalog.table_schema = 'public'
        AND column_catalog.table_name = 'tasks'
        AND column_catalog.column_name = required_column.name
      WHERE column_catalog.column_name IS NULL
        OR column_catalog.data_type IS DISTINCT FROM required_column.data_type
        OR column_catalog.udt_name IS DISTINCT FROM required_column.udt_name
        OR column_catalog.is_nullable IS DISTINCT FROM required_column.is_nullable
        OR column_catalog.character_maximum_length IS DISTINCT FROM required_column.character_maximum_length
        OR column_catalog.column_default IS NOT NULL
        OR column_catalog.is_identity IS DISTINCT FROM 'NO'
        OR column_catalog.is_generated IS DISTINCT FROM 'NEVER'
    )
    SELECT array_agg(name ORDER BY name)
    INTO invalid_columns
    FROM invalid_column;

    IF invalid_columns IS NOT NULL THEN
      RAISE EXCEPTION
        'operating_decisions_spine_tasks_column_drift: invalid columns %',
        invalid_columns;
    END IF;
  END IF;
END
$migration$;
--> statement-breakpoint

-- Exact named-index preflight. A same-named index on the wrong relation or
-- with a different predicate is drift, not a successful replay.
DO $migration$
DECLARE
  relation_kind "char";
  relation_oid oid;
  index_definition text;
  index_usable boolean;
  unexpected_indexes text[];
BEGIN
  SELECT c.oid, c.relkind
  INTO relation_oid, relation_kind
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'tasks_fund_idempotency_unique';
  IF relation_oid IS NOT NULL THEN
    -- Validity flags matter: a failed CREATE INDEX CONCURRENTLY leaves a
    -- same-named INVALID index whose indexdef is byte-identical, and
    -- CREATE INDEX IF NOT EXISTS would silently keep it unusable.
    SELECT pg_get_indexdef(relation_oid), (i.indisvalid AND i.indisready AND i.indislive)
    INTO index_definition, index_usable
    FROM pg_index AS i
    WHERE i.indexrelid = relation_oid
      AND i.indrelid = 'public.tasks'::regclass;
    IF relation_kind IS DISTINCT FROM 'i'
       OR index_usable IS DISTINCT FROM true
       OR index_definition IS DISTINCT FROM
          'CREATE UNIQUE INDEX tasks_fund_idempotency_unique ON public.tasks USING btree (fund_id, idempotency_key) WHERE (idempotency_key IS NOT NULL)'
       OR NOT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'tasks'
           AND column_name = 'idempotency_key'
       ) THEN
      RAISE EXCEPTION
        'operating_decisions_spine_index_drift: tasks_fund_idempotency_unique';
    END IF;
  END IF;

  SELECT c.oid, c.relkind
  INTO relation_oid, relation_kind
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'operating_decisions_supersedes_decision_unique';
  IF relation_oid IS NOT NULL THEN
    SELECT pg_get_indexdef(relation_oid), (i.indisvalid AND i.indisready AND i.indislive)
    INTO index_definition, index_usable
    FROM pg_index AS i
    WHERE i.indexrelid = relation_oid
      AND i.indrelid = 'public.operating_decisions'::regclass;
    IF relation_kind IS DISTINCT FROM 'i'
       OR index_usable IS DISTINCT FROM true
       OR index_definition IS DISTINCT FROM
          'CREATE UNIQUE INDEX operating_decisions_supersedes_decision_unique ON public.operating_decisions USING btree (fund_id, supersedes_decision_id) WHERE (supersedes_decision_id IS NOT NULL)'
       OR to_regclass('public.operating_decisions') IS NULL THEN
      RAISE EXCEPTION
        'operating_decisions_spine_index_drift: operating_decisions_supersedes_decision_unique';
    END IF;
  END IF;

  SELECT c.oid, c.relkind
  INTO relation_oid, relation_kind
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'idx_decision_evidence_links_fund_decision_id';
  IF relation_oid IS NOT NULL THEN
    SELECT pg_get_indexdef(relation_oid), (i.indisvalid AND i.indisready AND i.indislive)
    INTO index_definition, index_usable
    FROM pg_index AS i
    WHERE i.indexrelid = relation_oid
      AND i.indrelid = 'public.decision_evidence_links'::regclass;
    IF relation_kind IS DISTINCT FROM 'i'
       OR index_usable IS DISTINCT FROM true
       OR index_definition IS DISTINCT FROM
          'CREATE INDEX idx_decision_evidence_links_fund_decision_id ON public.decision_evidence_links USING btree (fund_id, decision_id, id)'
       OR to_regclass('public.decision_evidence_links') IS NULL THEN
      RAISE EXCEPTION
        'operating_decisions_spine_index_drift: idx_decision_evidence_links_fund_decision_id';
    END IF;
  END IF;

  IF to_regclass('public.operating_decisions') IS NOT NULL THEN
    SELECT array_agg(c.relname ORDER BY c.relname)
    INTO unexpected_indexes
    FROM pg_index AS i
    JOIN pg_class AS c ON c.oid = i.indexrelid
    WHERE i.indrelid = 'public.operating_decisions'::regclass
      AND c.relname NOT IN (
        'operating_decisions_pkey',
        'operating_decisions_id_fund_unique',
        'operating_decisions_fund_idempotency_unique',
        'operating_decisions_supersedes_decision_unique'
      );
    IF unexpected_indexes IS NOT NULL THEN
      RAISE EXCEPTION
        'operating_decisions_spine_partial_catalog_state: unexpected operating_decisions indexes %',
        unexpected_indexes;
    END IF;
  END IF;

  IF to_regclass('public.decision_evidence_links') IS NOT NULL THEN
    SELECT array_agg(c.relname ORDER BY c.relname)
    INTO unexpected_indexes
    FROM pg_index AS i
    JOIN pg_class AS c ON c.oid = i.indexrelid
    WHERE i.indrelid = 'public.decision_evidence_links'::regclass
      AND c.relname NOT IN (
        'decision_evidence_links_pkey',
        'decision_evidence_links_fund_decision_idempotency_unique',
        'idx_decision_evidence_links_fund_decision_id'
      );
    IF unexpected_indexes IS NOT NULL THEN
      RAISE EXCEPTION
        'operating_decisions_spine_partial_catalog_state: unexpected decision_evidence_links indexes %',
        unexpected_indexes;
    END IF;
  END IF;
END
$migration$;
--> statement-breakpoint

-- Function/trigger dependencies are also checked before CREATE OR REPLACE or
-- DROP TRIGGER can hide a same-named object with the wrong ownership.
DO $migration$
DECLARE
  immutable_function_count integer;
  immutable_function_source text;
  immutable_function_language text;
  immutable_function_return_type text;
  lifecycle_function_count integer;
  lifecycle_function_source text;
  lifecycle_function_language text;
  lifecycle_function_return_type text;
  trigger_definition text;
  lifecycle_trigger_count integer;
  lifecycle_trigger_on_decisions_count integer;
  link_trigger_count integer;
  link_trigger_on_links_count integer;
  unexpected_triggers text[];
BEGIN
  SELECT count(*)
  INTO immutable_function_count
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'internal_economics_forbid_update'
    AND pg_get_function_identity_arguments(p.oid) = '';
  IF immutable_function_count <> 1 THEN
    RAISE EXCEPTION
      'operating_decisions_spine_dependency_drift: internal_economics_forbid_update must have one zero-argument function';
  END IF;

  SELECT p.prosrc, l.lanname, p.prorettype::regtype::text
  INTO immutable_function_source, immutable_function_language, immutable_function_return_type
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  JOIN pg_language AS l ON l.oid = p.prolang
  WHERE n.nspname = 'public'
    AND p.proname = 'internal_economics_forbid_update'
    AND pg_get_function_identity_arguments(p.oid) = '';
  -- Exact-body comparison against the canonical 0045 definition. A marker-text
  -- match is not enough: a same-named rewrite that keeps the marker in a
  -- comment but never raises would pass and be silently attached to
  -- decision_evidence_links, defanging immutability. prosrc is stored verbatim,
  -- so this is stable across PostgreSQL versions.
  IF immutable_function_language IS DISTINCT FROM 'plpgsql'
     OR immutable_function_return_type IS DISTINCT FROM 'trigger'
     OR immutable_function_source IS DISTINCT FROM $canonical_forbid_update$
BEGIN
  RAISE EXCEPTION 'immutable_row_update_forbidden: %', TG_TABLE_NAME;
END;
$canonical_forbid_update$ THEN
    RAISE EXCEPTION
      'operating_decisions_spine_dependency_drift: internal_economics_forbid_update definition changed';
  END IF;

  SELECT count(*)
  INTO lifecycle_function_count
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'operating_decisions_enforce_lifecycle'
    AND pg_get_function_identity_arguments(p.oid) = '';
  IF lifecycle_function_count > 1 THEN
    RAISE EXCEPTION
      'operating_decisions_spine_partial_catalog_state: lifecycle function has overloads';
  END IF;
  IF lifecycle_function_count = 1 THEN
    SELECT p.prosrc, l.lanname, p.prorettype::regtype::text
    INTO lifecycle_function_source, lifecycle_function_language, lifecycle_function_return_type
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    JOIN pg_language AS l ON l.oid = p.prolang
    WHERE n.nspname = 'public'
      AND p.proname = 'operating_decisions_enforce_lifecycle'
      AND pg_get_function_identity_arguments(p.oid) = '';
    IF lifecycle_function_language IS DISTINCT FROM 'plpgsql'
       OR lifecycle_function_return_type IS DISTINCT FROM 'trigger'
       OR position('operating_decision_immutable_field_update_forbidden' IN lifecycle_function_source) = 0
       OR position('operating_decision_lifecycle_violation' IN lifecycle_function_source) = 0 THEN
      RAISE EXCEPTION
        'operating_decisions_spine_partial_catalog_state: lifecycle function shape changed';
    END IF;
  END IF;

  SELECT count(*)
  INTO lifecycle_trigger_count
  FROM pg_trigger AS t
  JOIN pg_class AS c ON c.oid = t.tgrelid
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE NOT t.tgisinternal
    AND t.tgname = 'operating_decisions_enforce_lifecycle_trigger'
    AND n.nspname = 'public';
  SELECT count(*)
  INTO lifecycle_trigger_on_decisions_count
  FROM pg_trigger AS t
  WHERE NOT t.tgisinternal
    AND t.tgname = 'operating_decisions_enforce_lifecycle_trigger'
    AND t.tgrelid = to_regclass('public.operating_decisions');
  IF lifecycle_trigger_count <> lifecycle_trigger_on_decisions_count
     OR lifecycle_trigger_count > 1 THEN
    RAISE EXCEPTION
      'operating_decisions_spine_partial_catalog_state: lifecycle trigger misplaced or duplicated';
  END IF;
  IF lifecycle_trigger_on_decisions_count = 1 THEN
    SELECT pg_get_triggerdef(t.oid)
    INTO trigger_definition
    FROM pg_trigger AS t
    WHERE NOT t.tgisinternal
      AND t.tgname = 'operating_decisions_enforce_lifecycle_trigger'
      AND t.tgrelid = 'public.operating_decisions'::regclass;
    IF trigger_definition !~ '^CREATE TRIGGER operating_decisions_enforce_lifecycle_trigger BEFORE UPDATE ON public[.]operating_decisions FOR EACH ROW EXECUTE FUNCTION (public[.])?operating_decisions_enforce_lifecycle[(][)]$' THEN
      RAISE EXCEPTION
        'operating_decisions_spine_trigger_drift: lifecycle trigger definition changed';
    END IF;
  END IF;

  SELECT count(*)
  INTO link_trigger_count
  FROM pg_trigger AS t
  JOIN pg_class AS c ON c.oid = t.tgrelid
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE NOT t.tgisinternal
    AND t.tgname = 'decision_evidence_links_forbid_update_trigger'
    AND n.nspname = 'public';
  SELECT count(*)
  INTO link_trigger_on_links_count
  FROM pg_trigger AS t
  WHERE NOT t.tgisinternal
    AND t.tgname = 'decision_evidence_links_forbid_update_trigger'
    AND t.tgrelid = to_regclass('public.decision_evidence_links');
  IF link_trigger_count <> link_trigger_on_links_count
     OR link_trigger_count > 1 THEN
    RAISE EXCEPTION
      'operating_decisions_spine_partial_catalog_state: decision evidence trigger misplaced or duplicated';
  END IF;
  IF link_trigger_on_links_count = 1 THEN
    SELECT pg_get_triggerdef(t.oid)
    INTO trigger_definition
    FROM pg_trigger AS t
    WHERE NOT t.tgisinternal
      AND t.tgname = 'decision_evidence_links_forbid_update_trigger'
      AND t.tgrelid = 'public.decision_evidence_links'::regclass;
    IF trigger_definition !~ '^CREATE TRIGGER decision_evidence_links_forbid_update_trigger BEFORE UPDATE ON public[.]decision_evidence_links FOR EACH ROW EXECUTE FUNCTION (public[.])?internal_economics_forbid_update[(][)]$' THEN
      RAISE EXCEPTION
        'operating_decisions_spine_trigger_drift: decision evidence trigger definition changed';
    END IF;
  END IF;

  IF to_regclass('public.operating_decisions') IS NOT NULL THEN
    SELECT array_agg(t.tgname ORDER BY t.tgname)
    INTO unexpected_triggers
    FROM pg_trigger AS t
    WHERE t.tgrelid = 'public.operating_decisions'::regclass
      AND NOT t.tgisinternal
      AND t.tgname <> 'operating_decisions_enforce_lifecycle_trigger';
    IF unexpected_triggers IS NOT NULL THEN
      RAISE EXCEPTION
        'operating_decisions_spine_partial_catalog_state: unexpected operating_decisions triggers %',
        unexpected_triggers;
    END IF;
  END IF;

  IF to_regclass('public.decision_evidence_links') IS NOT NULL THEN
    SELECT array_agg(t.tgname ORDER BY t.tgname)
    INTO unexpected_triggers
    FROM pg_trigger AS t
    WHERE t.tgrelid = 'public.decision_evidence_links'::regclass
      AND NOT t.tgisinternal
      AND t.tgname <> 'decision_evidence_links_forbid_update_trigger';
    IF unexpected_triggers IS NOT NULL THEN
      RAISE EXCEPTION
        'operating_decisions_spine_partial_catalog_state: unexpected decision evidence triggers %',
        unexpected_triggers;
    END IF;
  END IF;
END
$migration$;
--> statement-breakpoint

LOCK TABLE "tasks" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "operating_decisions" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "title" varchar(200) NOT NULL,
  "recommendation" text NOT NULL,
  "status" varchar(16) DEFAULT 'proposed' NOT NULL,
  "supersedes_decision_id" integer,
  "outcome" text,
  "outcome_recorded_at" timestamp with time zone,
  "outcome_recorded_by" integer,
  "follow_up_owner_id" integer,
  "follow_up_date" date,
  "idempotency_key" varchar(128) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "created_by" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "operating_decisions_fund_id_funds_id_fk"
    FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade,
  CONSTRAINT "operating_decisions_supersedes_decision_fund_fk"
    FOREIGN KEY ("supersedes_decision_id", "fund_id")
    REFERENCES "public"."operating_decisions"("id", "fund_id") ON DELETE restrict,
  CONSTRAINT "operating_decisions_outcome_recorded_by_fk"
    FOREIGN KEY ("outcome_recorded_by") REFERENCES "public"."users"("id"),
  CONSTRAINT "operating_decisions_follow_up_owner_id_fk"
    FOREIGN KEY ("follow_up_owner_id") REFERENCES "public"."users"("id"),
  CONSTRAINT "operating_decisions_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id"),
  CONSTRAINT "operating_decisions_id_fund_unique"
    UNIQUE ("id", "fund_id"),
  CONSTRAINT "operating_decisions_fund_idempotency_unique"
    UNIQUE ("fund_id", "idempotency_key"),
  CONSTRAINT "operating_decisions_status_check"
    CHECK ("status" IN ('proposed', 'accepted', 'rejected', 'deferred')),
  CONSTRAINT "operating_decisions_title_nonempty_check"
    CHECK (length(btrim("title")) > 0),
  CONSTRAINT "operating_decisions_outcome_coupling_check"
    CHECK (
      ("outcome" IS NULL AND "outcome_recorded_at" IS NULL AND "outcome_recorded_by" IS NULL)
      OR ("outcome" IS NOT NULL AND "outcome_recorded_at" IS NOT NULL AND "outcome_recorded_by" IS NOT NULL)
    ),
  CONSTRAINT "operating_decisions_outcome_status_check"
    CHECK ("outcome" IS NULL OR "status" IN ('accepted', 'rejected')),
  CONSTRAINT "operating_decisions_deferred_follow_up_check"
    CHECK (
      "status" <> 'deferred'
      OR ("follow_up_owner_id" IS NOT NULL AND "follow_up_date" IS NOT NULL)
    )
);
--> statement-breakpoint

CREATE OR REPLACE FUNCTION operating_decisions_enforce_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.fund_id IS DISTINCT FROM OLD.fund_id
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.recommendation IS DISTINCT FROM OLD.recommendation
     OR NEW.supersedes_decision_id IS DISTINCT FROM OLD.supersedes_decision_id
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.request_hash IS DISTINCT FROM OLD.request_hash
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'operating_decision_immutable_field_update_forbidden';
  END IF;

  IF OLD.status IN ('accepted', 'rejected')
     AND OLD.outcome IS NULL
     AND OLD.outcome_recorded_at IS NULL
     AND OLD.outcome_recorded_by IS NULL
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.outcome IS NOT NULL
     AND NEW.outcome_recorded_at IS NOT NULL
     AND NEW.outcome_recorded_by IS NOT NULL
     AND NEW.follow_up_owner_id IS NOT DISTINCT FROM OLD.follow_up_owner_id
     AND NEW.follow_up_date IS NOT DISTINCT FROM OLD.follow_up_date THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'proposed'
     AND NEW.status IN ('accepted', 'rejected', 'deferred')
     AND NEW.outcome IS NULL
     AND NEW.outcome_recorded_at IS NULL
     AND NEW.outcome_recorded_by IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'deferred'
     AND NEW.status = 'deferred'
     AND NEW.outcome IS NOT DISTINCT FROM OLD.outcome
     AND NEW.outcome_recorded_at IS NOT DISTINCT FROM OLD.outcome_recorded_at
     AND NEW.outcome_recorded_by IS NOT DISTINCT FROM OLD.outcome_recorded_by THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'deferred'
     AND NEW.status IN ('accepted', 'rejected')
     AND NEW.outcome IS NOT DISTINCT FROM OLD.outcome
     AND NEW.outcome_recorded_at IS NOT DISTINCT FROM OLD.outcome_recorded_at
     AND NEW.outcome_recorded_by IS NOT DISTINCT FROM OLD.outcome_recorded_by
     AND NEW.follow_up_owner_id IS NOT DISTINCT FROM OLD.follow_up_owner_id
     AND NEW.follow_up_date IS NOT DISTINCT FROM OLD.follow_up_date THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'operating_decision_lifecycle_violation: % -> %',
    OLD.status,
    NEW.status;
END;
$function$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "operating_decisions_supersedes_decision_unique"
  ON "operating_decisions" USING btree ("fund_id", "supersedes_decision_id")
  WHERE ("supersedes_decision_id" IS NOT NULL);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "decision_evidence_links" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "decision_id" integer NOT NULL,
  "target_kind" varchar NOT NULL,
  "analysis_reference_id" integer,
  "economics_run_id" integer,
  "idempotency_key" varchar(128) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "created_by" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "decision_evidence_links_fund_id_funds_id_fk"
    FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade,
  CONSTRAINT "decision_evidence_links_decision_fund_fk"
    FOREIGN KEY ("decision_id", "fund_id")
    REFERENCES "public"."operating_decisions"("id", "fund_id") ON DELETE cascade,
  CONSTRAINT "decision_evidence_links_analysis_reference_fund_fk"
    FOREIGN KEY ("analysis_reference_id", "fund_id")
    REFERENCES "public"."internal_analysis_references"("id", "fund_id") ON DELETE restrict,
  CONSTRAINT "decision_evidence_links_economics_run_fund_fk"
    FOREIGN KEY ("economics_run_id", "fund_id")
    REFERENCES "public"."internal_lp_economics_runs"("id", "fund_id") ON DELETE restrict,
  CONSTRAINT "decision_evidence_links_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id"),
  CONSTRAINT "decision_evidence_links_fund_decision_idempotency_unique"
    UNIQUE ("fund_id", "decision_id", "idempotency_key"),
  CONSTRAINT "decision_evidence_links_target_kind_check"
    CHECK ("target_kind" IN ('analysis_reference', 'internal_economics_run')),
  CONSTRAINT "decision_evidence_links_target_coupling_check"
    CHECK (
      ("target_kind" = 'analysis_reference'
        AND "analysis_reference_id" IS NOT NULL
        AND "economics_run_id" IS NULL)
      OR ("target_kind" = 'internal_economics_run'
        AND "economics_run_id" IS NOT NULL
        AND "analysis_reference_id" IS NULL)
    )
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_decision_evidence_links_fund_decision_id"
  ON "decision_evidence_links" ("fund_id", "decision_id", "id");
--> statement-breakpoint

ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "idempotency_key" varchar(128);
--> statement-breakpoint

ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "request_hash" varchar(64);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "tasks_fund_idempotency_unique"
  ON "tasks" USING btree ("fund_id", "idempotency_key")
  WHERE ("idempotency_key" IS NOT NULL);
--> statement-breakpoint

DROP TRIGGER IF EXISTS "operating_decisions_enforce_lifecycle_trigger"
  ON "operating_decisions";
--> statement-breakpoint

CREATE TRIGGER "operating_decisions_enforce_lifecycle_trigger"
  BEFORE UPDATE ON "operating_decisions"
  FOR EACH ROW EXECUTE FUNCTION operating_decisions_enforce_lifecycle();
--> statement-breakpoint

DROP TRIGGER IF EXISTS "decision_evidence_links_forbid_update_trigger"
  ON "decision_evidence_links";
--> statement-breakpoint

CREATE TRIGGER "decision_evidence_links_forbid_update_trigger"
  BEFORE UPDATE ON "decision_evidence_links"
  FOR EACH ROW EXECUTE FUNCTION internal_economics_forbid_update();
