-- @drift-patch
-- Reason: F_1.10.0 Phase 3 adds durable claim/replay/provenance state for
-- manual current-forecast recompute commands.
-- Journal tag: 0055_current_forecast_recompute_commands. This migration is
-- pinned by tag, not by journal tail position.
-- Drizzle's PostgreSQL migrator owns transaction and journal writes.
-- Do not add BEGIN/COMMIT here.

-- Fail closed when replay encounters a partial or incompatible catalog shape.
DO $migration$
DECLARE
 command_table_present boolean;
 invalid_columns text[];
 invalid_constraints text[];
 invalid_indexes text[];
  expected_status_check text;
  expected_request_hash_check text;
  expected_failure_code_check text;
  expected_terminal_coupling_check text;
  expected_finalized_at_check text;
  expected_created_reconciliation_check text;
BEGIN
  IF to_regclass('public.funds') IS NULL
    OR to_regclass('public.users') IS NULL
    OR to_regclass('public.substrate_shadow_reconciliations') IS NULL THEN
    RAISE EXCEPTION
      'current_forecast_recompute_commands_preflight_failed: required parent tables missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.funds'::regclass
      AND contype = 'p'
      AND pg_get_constraintdef(oid) = 'PRIMARY KEY (id)'
  )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.users'::regclass
        AND contype = 'p'
        AND pg_get_constraintdef(oid) = 'PRIMARY KEY (id)'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.substrate_shadow_reconciliations'::regclass
        AND contype = 'p'
        AND pg_get_constraintdef(oid) = 'PRIMARY KEY (id)'
    ) THEN
    RAISE EXCEPTION
      'current_forecast_recompute_commands_preflight_failed: FK targets require primary key (id)';
  END IF;

  command_table_present :=
    to_regclass('public.current_forecast_recompute_commands') IS NOT NULL;

  IF command_table_present THEN
    IF EXISTS (
      SELECT 1
      FROM pg_class
      WHERE oid = 'public.current_forecast_recompute_commands'::regclass
        AND relkind <> 'r'
    ) THEN
      RAISE EXCEPTION
        'current_forecast_recompute_commands_partial_catalog_state: object must be an ordinary table';
    END IF;

    WITH required_column(
      name,
      data_type,
      udt_name,
      is_nullable,
      character_maximum_length,
      default_kind
    ) AS (
      VALUES
        ('id', 'integer', 'int4', 'NO', NULL::integer, 'serial'),
        ('fund_id', 'integer', 'int4', 'NO', NULL::integer, 'none'),
        ('idempotency_key', 'character varying', 'varchar', 'NO', 128, 'none'),
        ('request_hash', 'character varying', 'varchar', 'NO', 64, 'none'),
        ('status', 'character varying', 'varchar', 'NO', 16, 'pending'),
        ('failure_code', 'character varying', 'varchar', 'YES', 64, 'none'),
        ('shadow_reconciliation_id', 'integer', 'int4', 'YES', NULL::integer, 'none'),
        ('created_reconciliation', 'boolean', 'bool', 'NO', NULL::integer, 'false'),
        ('started_at', 'timestamp with time zone', 'timestamptz', 'NO', NULL::integer, 'now'),
        ('finalized_at', 'timestamp with time zone', 'timestamptz', 'YES', NULL::integer, 'none'),
        ('created_by', 'integer', 'int4', 'YES', NULL::integer, 'none')
    ),
    invalid_column AS (
      SELECT required_column.name
      FROM required_column
      LEFT JOIN information_schema.columns AS column_catalog
        ON column_catalog.table_schema = 'public'
        AND column_catalog.table_name = 'current_forecast_recompute_commands'
        AND column_catalog.column_name = required_column.name
      WHERE column_catalog.column_name IS NULL
        OR column_catalog.data_type IS DISTINCT FROM required_column.data_type
        OR column_catalog.udt_name IS DISTINCT FROM required_column.udt_name
        OR column_catalog.is_nullable IS DISTINCT FROM required_column.is_nullable
        OR column_catalog.character_maximum_length
          IS DISTINCT FROM required_column.character_maximum_length
        OR column_catalog.is_identity IS DISTINCT FROM 'NO'
        OR column_catalog.is_generated IS DISTINCT FROM 'NEVER'
        OR (
          required_column.default_kind = 'serial'
          AND (
            column_catalog.column_default IS DISTINCT FROM
              'nextval(''current_forecast_recompute_commands_id_seq''::regclass)'
            OR pg_get_serial_sequence(
              'public.current_forecast_recompute_commands',
              required_column.name
            ) IS DISTINCT FROM
              'public.current_forecast_recompute_commands_id_seq'
          )
        )
        OR (
          required_column.default_kind = 'pending'
          AND column_catalog.column_default IS DISTINCT FROM
            '''pending''::character varying'
        )
        OR (
          required_column.default_kind = 'false'
          AND column_catalog.column_default IS DISTINCT FROM 'false'
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

      SELECT column_catalog.column_name
      FROM information_schema.columns AS column_catalog
      WHERE column_catalog.table_schema = 'public'
        AND column_catalog.table_name = 'current_forecast_recompute_commands'
        AND NOT EXISTS (
          SELECT 1
          FROM required_column
          WHERE required_column.name = column_catalog.column_name
        )
    )
    SELECT array_agg(name ORDER BY name)
    INTO invalid_columns
    FROM invalid_column;

 -- Session-scoped temp table keeps same-session replay safe without DROP DDL.
 CREATE TEMP TABLE IF NOT EXISTS __current_forecast_recompute_commands_expected_checks (
      status varchar(16),
      request_hash varchar(64),
      failure_code varchar(64),
      shadow_reconciliation_id integer,
      created_reconciliation boolean,
      finalized_at timestamptz,
      CONSTRAINT __current_forecast_recompute_commands_status_check
        CHECK (status IN ('pending', 'completed', 'failed', 'skipped')),
      CONSTRAINT __current_forecast_recompute_commands_request_hash_check
        CHECK (request_hash ~ '^[a-f0-9]{64}$'),
      CONSTRAINT __current_forecast_recompute_commands_failure_code_check
        CHECK (
          failure_code IS NULL
          OR failure_code IN (
            'execution_timeout',
            'execution_error',
            'mode_ineligible',
            'stale_pending'
          )
        ),
      CONSTRAINT __current_forecast_recompute_commands_terminal_coupling_check
        CHECK (
          (
            status = 'completed'
            AND shadow_reconciliation_id IS NOT NULL
            AND failure_code IS NULL
          )
          OR (
            status = 'failed'
            AND failure_code IS NOT NULL
            AND shadow_reconciliation_id IS NULL
          )
          OR (
            status IN ('pending', 'skipped')
            AND shadow_reconciliation_id IS NULL
            AND failure_code IS NULL
          )
        ),
      CONSTRAINT __current_forecast_recompute_commands_finalized_at_check
        CHECK (
          (status = 'pending' AND finalized_at IS NULL)
          OR (status <> 'pending' AND finalized_at IS NOT NULL)
        ),
      CONSTRAINT __current_forecast_recompute_commands_created_recon_check
        CHECK (
          NOT created_reconciliation
          OR (
            status = 'completed'
            AND shadow_reconciliation_id IS NOT NULL
          )
        )
 );

    SELECT pg_get_constraintdef(oid)
    INTO expected_status_check
    FROM pg_constraint
    WHERE conrelid =
      'pg_temp.__current_forecast_recompute_commands_expected_checks'::regclass
      AND conname = '__current_forecast_recompute_commands_status_check';

    SELECT pg_get_constraintdef(oid)
    INTO expected_request_hash_check
    FROM pg_constraint
    WHERE conrelid =
      'pg_temp.__current_forecast_recompute_commands_expected_checks'::regclass
      AND conname = '__current_forecast_recompute_commands_request_hash_check';

    SELECT pg_get_constraintdef(oid)
    INTO expected_failure_code_check
    FROM pg_constraint
    WHERE conrelid =
      'pg_temp.__current_forecast_recompute_commands_expected_checks'::regclass
      AND conname = '__current_forecast_recompute_commands_failure_code_check';

    SELECT pg_get_constraintdef(oid)
    INTO expected_terminal_coupling_check
    FROM pg_constraint
    WHERE conrelid =
      'pg_temp.__current_forecast_recompute_commands_expected_checks'::regclass
      AND conname = '__current_forecast_recompute_commands_terminal_coupling_check';

    SELECT pg_get_constraintdef(oid)
    INTO expected_finalized_at_check
    FROM pg_constraint
    WHERE conrelid =
      'pg_temp.__current_forecast_recompute_commands_expected_checks'::regclass
      AND conname = '__current_forecast_recompute_commands_finalized_at_check';

    SELECT pg_get_constraintdef(oid)
    INTO expected_created_reconciliation_check
    FROM pg_constraint
    WHERE conrelid =
      'pg_temp.__current_forecast_recompute_commands_expected_checks'::regclass
      AND conname = '__current_forecast_recompute_commands_created_recon_check';

    WITH expected(constraint_name, definition) AS (
      VALUES
        (
          'current_forecast_recompute_commands_pkey',
          'PRIMARY KEY (id)'
        ),
        (
          'current_forecast_recompute_commands_fund_fk',
          'FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE CASCADE'
        ),
        (
          'current_forecast_recompute_commands_reconciliation_fk',
          'FOREIGN KEY (shadow_reconciliation_id) REFERENCES substrate_shadow_reconciliations(id)'
        ),
        (
          'current_forecast_recompute_commands_created_by_fk',
          'FOREIGN KEY (created_by) REFERENCES users(id)'
        ),
        (
          'current_forecast_recompute_commands_fund_idempotency_unique',
          'UNIQUE (fund_id, idempotency_key)'
        ),
        (
          'current_forecast_recompute_commands_status_check',
          expected_status_check
        ),
        (
          'current_forecast_recompute_commands_request_hash_check',
          expected_request_hash_check
        ),
        (
          'current_forecast_recompute_commands_failure_code_check',
          expected_failure_code_check
        ),
        (
          'current_forecast_recompute_commands_terminal_coupling_check',
          expected_terminal_coupling_check
        ),
        (
          'current_forecast_recompute_commands_finalized_at_check',
          expected_finalized_at_check
        ),
        (
          'current_forecast_recompute_commands_created_recon_check',
          expected_created_reconciliation_check
        )
    ),
    invalid_constraint AS (
      SELECT expected.constraint_name
      FROM expected
      LEFT JOIN pg_constraint AS actual
        ON actual.conrelid =
          'public.current_forecast_recompute_commands'::regclass
        AND actual.conname = expected.constraint_name
      WHERE actual.oid IS NULL
        OR pg_get_constraintdef(actual.oid) IS DISTINCT FROM expected.definition

      UNION ALL

      SELECT actual.conname
      FROM pg_constraint AS actual
      WHERE actual.conrelid =
        'public.current_forecast_recompute_commands'::regclass
        AND NOT EXISTS (
          SELECT 1
          FROM expected
          WHERE expected.constraint_name = actual.conname
        )
    )
 SELECT array_agg(constraint_name ORDER BY constraint_name)
 INTO invalid_constraints
 FROM invalid_constraint;

 WITH expected(index_name, definition) AS (
  VALUES
   (
    'current_forecast_recompute_commands_pkey',
    'CREATE UNIQUE INDEX current_forecast_recompute_commands_pkey ON public.current_forecast_recompute_commands USING btree (id)'
   ),
   (
    'current_forecast_recompute_commands_fund_idempotency_unique',
    'CREATE UNIQUE INDEX current_forecast_recompute_commands_fund_idempotency_unique ON public.current_forecast_recompute_commands USING btree (fund_id, idempotency_key)'
   )
 ),
 actual AS (
  SELECT
   index_class.relname AS index_name,
   pg_get_indexdef(index_catalog.indexrelid) AS definition,
   index_catalog.indisvalid
    AND index_catalog.indisready
    AND index_catalog.indislive AS usable
  FROM pg_index AS index_catalog
  JOIN pg_class AS index_class ON index_class.oid = index_catalog.indexrelid
  WHERE index_catalog.indrelid =
   'public.current_forecast_recompute_commands'::regclass
 ),
 invalid_index AS (
  SELECT expected.index_name
  FROM expected
  LEFT JOIN actual ON actual.index_name = expected.index_name
  WHERE actual.index_name IS NULL
   OR actual.definition IS DISTINCT FROM expected.definition
   OR actual.usable IS DISTINCT FROM true

  UNION ALL

  SELECT actual.index_name
  FROM actual
  WHERE NOT EXISTS (
   SELECT 1
   FROM expected
   WHERE expected.index_name = actual.index_name
  )
 )
 SELECT array_agg(index_name ORDER BY index_name)
 INTO invalid_indexes
 FROM invalid_index;

 IF invalid_columns IS NOT NULL
  OR invalid_constraints IS NOT NULL
  OR invalid_indexes IS NOT NULL THEN
  RAISE EXCEPTION
   'current_forecast_recompute_commands_catalog_drift: columns %, constraints %, indexes %',
   invalid_columns,
   invalid_constraints,
   invalid_indexes;
 END IF;
  END IF;
END
$migration$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "current_forecast_recompute_commands" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "idempotency_key" varchar(128) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  "failure_code" varchar(64),
  "shadow_reconciliation_id" integer,
  "created_reconciliation" boolean DEFAULT false NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finalized_at" timestamp with time zone,
  "created_by" integer,
  CONSTRAINT "current_forecast_recompute_commands_fund_idempotency_unique"
    UNIQUE ("fund_id", "idempotency_key"),
  CONSTRAINT "current_forecast_recompute_commands_status_check"
    CHECK ("status" IN ('pending', 'completed', 'failed', 'skipped')),
  CONSTRAINT "current_forecast_recompute_commands_request_hash_check"
    CHECK ("request_hash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "current_forecast_recompute_commands_failure_code_check"
    CHECK (
      "failure_code" IS NULL
      OR "failure_code" IN (
        'execution_timeout',
        'execution_error',
        'mode_ineligible',
        'stale_pending'
      )
    ),
  CONSTRAINT "current_forecast_recompute_commands_terminal_coupling_check"
    CHECK (
      (
        "status" = 'completed'
        AND "shadow_reconciliation_id" IS NOT NULL
        AND "failure_code" IS NULL
      )
      OR (
        "status" = 'failed'
        AND "failure_code" IS NOT NULL
        AND "shadow_reconciliation_id" IS NULL
      )
      OR (
        "status" IN ('pending', 'skipped')
        AND "shadow_reconciliation_id" IS NULL
        AND "failure_code" IS NULL
      )
    ),
  CONSTRAINT "current_forecast_recompute_commands_finalized_at_check"
    CHECK (
      ("status" = 'pending' AND "finalized_at" IS NULL)
      OR ("status" <> 'pending' AND "finalized_at" IS NOT NULL)
    ),
  CONSTRAINT "current_forecast_recompute_commands_created_recon_check"
    CHECK (
      NOT "created_reconciliation"
      OR (
        "status" = 'completed'
        AND "shadow_reconciliation_id" IS NOT NULL
      )
    ),
  CONSTRAINT "current_forecast_recompute_commands_fund_fk"
    FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade,
  CONSTRAINT "current_forecast_recompute_commands_reconciliation_fk"
    FOREIGN KEY ("shadow_reconciliation_id")
      REFERENCES "public"."substrate_shadow_reconciliations"("id"),
  CONSTRAINT "current_forecast_recompute_commands_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
);
