-- @drift-patch
-- Reason: Issue #1300 / ruling GR2-4a adds the internal KPI collection table.
-- The catalog guards below are hand-written rather than Drizzle-generated so a
-- raw replay refuses a partial or drifted table instead of silently accepting it.
--
-- Issue #1300 / ruling GR2-4a: the internal KPI collection table that turns the
-- KPI manager from an MSW-only client surface into a real product surface.
--
-- Purely additive: one new table, one new index. No existing table, column,
-- constraint, trigger, or row is touched, so this migration is safe to apply
-- ahead of or behind any other in-flight side-trail.
--
-- Drizzle's PostgreSQL migrator owns the transaction that includes this SQL and
-- its migration-ledger insert. Do not add BEGIN/COMMIT here: an inner COMMIT
-- would prematurely persist catalog changes before that ledger write.

-- CREATE TABLE IF NOT EXISTS cannot repair a pre-existing partial or
-- semantically drifted table. Refuse before any DDL so a journaled migration
-- never records a catalog that lacks the exact 26-column shape, its four
-- required foreign keys, and its exact set of 15 non-foreign-key constraints.
-- The list index is validated separately because its guarded DDL below remains
-- repairable on a structurally complete table during raw replay.
DO $$
DECLARE
  invalid_columns text[];
  invalid_constraints text[];
  observations_present boolean;
BEGIN
  observations_present := to_regclass('public.kpi_observations') IS NOT NULL;

  IF NOT observations_present THEN
    RETURN;
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
      ('portfolio_company_id', 'integer', 'int4', 'NO', NULL::integer, 'none'),
      ('metric', 'character varying', 'varchar', 'NO', 32, 'none'),
      ('period_start', 'date', 'date', 'NO', NULL::integer, 'none'),
      ('period_end', 'date', 'date', 'NO', NULL::integer, 'none'),
      ('basis', 'character varying', 'varchar', 'NO', 16, 'none'),
      ('value_kind', 'character varying', 'varchar', 'NO', 8, 'none'),
      ('value_amount', 'numeric', 'numeric', 'YES', NULL::integer, 'none'),
      ('value_date', 'date', 'date', 'YES', NULL::integer, 'none'),
      ('value_text', 'text', 'text', 'YES', NULL::integer, 'none'),
      ('company_kpi_label', 'character varying', 'varchar', 'YES', 120, 'none'),
      ('source', 'character varying', 'varchar', 'NO', 16, 'none'),
      ('source_label', 'character varying', 'varchar', 'YES', 200, 'none'),
      ('comment', 'text', 'text', 'YES', NULL::integer, 'none'),
      ('submitted_at', 'timestamp with time zone', 'timestamptz', 'NO', NULL::integer, 'none'),
      ('review_status', 'character varying', 'varchar', 'NO', 16, 'pending'),
      ('review_comment', 'text', 'text', 'YES', NULL::integer, 'none'),
      ('reviewed_by', 'integer', 'int4', 'YES', NULL::integer, 'none'),
      ('reviewed_at', 'timestamp with time zone', 'timestamptz', 'YES', NULL::integer, 'none'),
      ('version', 'integer', 'int4', 'NO', NULL::integer, 'one'),
      ('idempotency_key', 'character varying', 'varchar', 'NO', 128, 'none'),
      ('request_hash', 'character varying', 'varchar', 'NO', 64, 'none'),
      ('created_by', 'integer', 'int4', 'YES', NULL::integer, 'none'),
      ('created_at', 'timestamp with time zone', 'timestamptz', 'NO', NULL::integer, 'now'),
      ('updated_at', 'timestamp with time zone', 'timestamptz', 'NO', NULL::integer, 'now')
  )
  SELECT array_agg(invalid_column.name ORDER BY invalid_column.name)
  INTO invalid_columns
  FROM (
    SELECT required_column.name
    FROM required_column
    LEFT JOIN information_schema.columns AS column_catalog
      ON column_catalog.table_schema = 'public'
      AND column_catalog.table_name = 'kpi_observations'
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
          -- Exact information_schema.columns output for the serial declaration
          -- below: unqualified there, schema-qualified from pg_get_serial_sequence.
          column_catalog.column_default IS DISTINCT FROM
            'nextval(''kpi_observations_id_seq''::regclass)'
          OR pg_get_serial_sequence('public.kpi_observations', 'id')
            IS DISTINCT FROM 'public.kpi_observations_id_seq'
        )
      )
      OR (
        required_column.default_kind = 'now'
        AND column_catalog.column_default IS DISTINCT FROM 'now()'
      )
      OR (
        required_column.default_kind = 'one'
        AND column_catalog.column_default IS DISTINCT FROM '1'
      )
      OR (
        required_column.default_kind = 'pending'
        AND column_catalog.column_default IS DISTINCT FROM '''pending''::character varying'
      )
      OR (
        required_column.default_kind = 'none'
        AND column_catalog.column_default IS NOT NULL
      )
    UNION ALL
    SELECT column_catalog.column_name
    FROM information_schema.columns AS column_catalog
    WHERE column_catalog.table_schema = 'public'
      AND column_catalog.table_name = 'kpi_observations'
      AND NOT EXISTS (
        SELECT 1
        FROM required_column
        WHERE required_column.name = column_catalog.column_name
      )
  ) AS invalid_column;

  SELECT array_agg(missing_constraint.name ORDER BY missing_constraint.name)
  INTO invalid_constraints
  FROM (
    SELECT required_constraint.name
    FROM (
      VALUES
        ('kpi_observations_pkey'),
        ('kpi_observations_fund_id_funds_id_fk'),
        ('kpi_observations_portfolio_company_id_fk'),
        ('kpi_observations_reviewed_by_fk'),
        ('kpi_observations_created_by_fk'),
        ('kpi_observations_id_fund_unique'),
        ('kpi_observations_fund_idempotency_unique'),
        ('kpi_observations_metric_check'),
        ('kpi_observations_basis_check'),
        ('kpi_observations_source_check'),
        ('kpi_observations_review_status_check'),
        ('kpi_observations_value_kind_check'),
        ('kpi_observations_value_coupling_check'),
        ('kpi_observations_metric_value_kind_check'),
        ('kpi_observations_non_negative_value_check'),
        ('kpi_observations_company_kpi_label_check'),
        ('kpi_observations_period_order_check'),
        ('kpi_observations_version_check'),
        ('kpi_observations_review_coupling_check')
    ) AS required_constraint(name)
    LEFT JOIN pg_constraint AS constraint_catalog
      ON constraint_catalog.conrelid = 'public.kpi_observations'::regclass
      AND constraint_catalog.conname = required_constraint.name
    WHERE constraint_catalog.oid IS NULL
    UNION ALL
    SELECT constraint_catalog.conname
    FROM pg_constraint AS constraint_catalog
    WHERE constraint_catalog.conrelid = 'public.kpi_observations'::regclass
      AND constraint_catalog.contype <> 'f'
      AND constraint_catalog.conname NOT IN (
        'kpi_observations_pkey',
        'kpi_observations_id_fund_unique',
        'kpi_observations_fund_idempotency_unique',
        'kpi_observations_metric_check',
        'kpi_observations_basis_check',
        'kpi_observations_source_check',
        'kpi_observations_review_status_check',
        'kpi_observations_value_kind_check',
        'kpi_observations_value_coupling_check',
        'kpi_observations_metric_value_kind_check',
        'kpi_observations_non_negative_value_check',
        'kpi_observations_company_kpi_label_check',
        'kpi_observations_period_order_check',
        'kpi_observations_version_check',
        'kpi_observations_review_coupling_check'
      )
  ) AS missing_constraint;

  IF invalid_columns IS NOT NULL OR invalid_constraints IS NOT NULL THEN
    RAISE EXCEPTION
      'kpi_observations_partial_catalog_state: kpi_observations has missing, extra, or mismatched required columns [%] or constraints [%]',
      coalesce(array_to_string(invalid_columns, ', '), ''),
      coalesce(array_to_string(invalid_constraints, ', '), '');
  END IF;
END $$;
--> statement-breakpoint

-- Exact index equivalence closes the replay gap left by CREATE INDEX IF NOT
-- EXISTS. A same-named relation that is not this index, or an unexpected index
-- on the table, refuses rather than being silently accepted.
DO $$
DECLARE
  observations_relation regclass;
  list_index_kind "char";
  list_index_definition text;
  unexpected_index_names text[];
BEGIN
  observations_relation := to_regclass('public.kpi_observations');

  SELECT relation_catalog.relkind
  INTO list_index_kind
  FROM pg_class AS relation_catalog
  JOIN pg_namespace AS namespace_catalog
    ON namespace_catalog.oid = relation_catalog.relnamespace
  WHERE namespace_catalog.nspname = 'public'
    AND relation_catalog.relname = 'idx_kpi_observations_fund_company_period';

  IF observations_relation IS NULL THEN
    IF list_index_kind IS NOT NULL THEN
      RAISE EXCEPTION
        'kpi_observations_partial_catalog_state: the KPI observation index exists without its table';
    END IF;
    RETURN;
  END IF;

  SELECT pg_get_indexdef(index_catalog.indexrelid)
  INTO list_index_definition
  FROM pg_index AS index_catalog
  JOIN pg_class AS index_relation ON index_relation.oid = index_catalog.indexrelid
  WHERE index_relation.relnamespace = 'public'::regnamespace
    AND index_relation.relname = 'idx_kpi_observations_fund_company_period'
    AND index_catalog.indrelid = observations_relation;

  SELECT array_agg(index_relation.relname ORDER BY index_relation.relname)
  INTO unexpected_index_names
  FROM pg_index AS index_catalog
  JOIN pg_class AS index_relation ON index_relation.oid = index_catalog.indexrelid
  WHERE index_catalog.indrelid = observations_relation
    AND index_relation.relname NOT IN (
      'kpi_observations_pkey',
      'kpi_observations_id_fund_unique',
      'kpi_observations_fund_idempotency_unique',
      'idx_kpi_observations_fund_company_period'
    );

  IF list_index_kind IS NOT NULL AND (
    list_index_kind IS DISTINCT FROM 'i'
    OR list_index_definition IS DISTINCT FROM
      'CREATE INDEX idx_kpi_observations_fund_company_period ON public.kpi_observations USING btree (fund_id, portfolio_company_id, period_start, id)'
  ) THEN
    RAISE EXCEPTION
      'kpi_observations_partial_catalog_state: the KPI observation index is not replay-equivalent (kind %, definition %)',
      coalesce(list_index_kind::text, ''),
      coalesce(list_index_definition, '');
  END IF;

  IF unexpected_index_names IS NOT NULL THEN
    RAISE EXCEPTION
      'kpi_observations_partial_catalog_state: unexpected indexes on kpi_observations [%]',
      array_to_string(unexpected_index_names, ', ');
  END IF;
END $$;
--> statement-breakpoint

-- Every field the GR2-4a ruling requires is a dedicated column. The typed value
-- triple plus the metric/value-kind CHECK pair makes a wrong-typed KPI
-- unrepresentable rather than merely rejected at the API edge.
CREATE TABLE IF NOT EXISTS "kpi_observations" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "portfolio_company_id" integer NOT NULL,
  "metric" varchar(32) NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "basis" varchar(16) NOT NULL,
  "value_kind" varchar(8) NOT NULL,
  "value_amount" numeric(20, 6),
  "value_date" date,
  "value_text" text,
  "company_kpi_label" varchar(120),
  "source" varchar(16) NOT NULL,
  "source_label" varchar(200),
  "comment" text,
  "submitted_at" timestamp with time zone NOT NULL,
  "review_status" varchar(16) DEFAULT 'pending' NOT NULL,
  "review_comment" text,
  "reviewed_by" integer,
  "reviewed_at" timestamp with time zone,
  "version" integer DEFAULT 1 NOT NULL,
  "idempotency_key" varchar(128) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "created_by" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "kpi_observations_fund_id_funds_id_fk"
    FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade,
  CONSTRAINT "kpi_observations_portfolio_company_id_fk"
    FOREIGN KEY ("portfolio_company_id")
    REFERENCES "public"."portfoliocompanies"("id") ON DELETE restrict,
  CONSTRAINT "kpi_observations_reviewed_by_fk"
    FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id"),
  CONSTRAINT "kpi_observations_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id"),
  CONSTRAINT "kpi_observations_id_fund_unique" UNIQUE ("id", "fund_id"),
  CONSTRAINT "kpi_observations_fund_idempotency_unique" UNIQUE ("fund_id", "idempotency_key"),
  CONSTRAINT "kpi_observations_metric_check" CHECK ("metric" IN (
    'revenue_arr','cash_balance','monthly_burn','runway_months','headcount',
    'next_financing_target','next_financing_date','company_specific','qualitative_update'
  )),
  CONSTRAINT "kpi_observations_basis_check" CHECK ("basis" IN ('actual','projected')),
  CONSTRAINT "kpi_observations_source_check" CHECK ("source" IN ('manual','csv_import')),
  CONSTRAINT "kpi_observations_review_status_check"
    CHECK ("review_status" IN ('pending','accepted','rejected')),
  CONSTRAINT "kpi_observations_value_kind_check"
    CHECK ("value_kind" IN ('money','number','date','text')),
  CONSTRAINT "kpi_observations_value_coupling_check" CHECK (
    (
      "value_kind" IN ('money','number')
      AND "value_amount" IS NOT NULL
      AND "value_date" IS NULL
      AND "value_text" IS NULL
    )
    OR (
      "value_kind" = 'date'
      AND "value_date" IS NOT NULL
      AND "value_amount" IS NULL
      AND "value_text" IS NULL
    )
    OR (
      "value_kind" = 'text'
      AND "value_text" IS NOT NULL
      AND "value_amount" IS NULL
      AND "value_date" IS NULL
    )
  ),
  CONSTRAINT "kpi_observations_metric_value_kind_check" CHECK (
    "value_kind" = CASE "metric"
      WHEN 'revenue_arr' THEN 'money'
      WHEN 'cash_balance' THEN 'money'
      WHEN 'monthly_burn' THEN 'money'
      WHEN 'next_financing_target' THEN 'money'
      WHEN 'runway_months' THEN 'number'
      WHEN 'headcount' THEN 'number'
      WHEN 'company_specific' THEN 'number'
      WHEN 'next_financing_date' THEN 'date'
      WHEN 'qualitative_update' THEN 'text'
    END
  ),
  CONSTRAINT "kpi_observations_non_negative_value_check" CHECK (
    "metric" NOT IN (
      'revenue_arr','cash_balance','monthly_burn','runway_months','headcount','next_financing_target'
    )
    OR "value_amount" >= 0
  ),
  CONSTRAINT "kpi_observations_company_kpi_label_check"
    CHECK (("metric" = 'company_specific') = ("company_kpi_label" IS NOT NULL)),
  CONSTRAINT "kpi_observations_period_order_check" CHECK ("period_end" >= "period_start"),
  CONSTRAINT "kpi_observations_version_check" CHECK ("version" >= 1),
  CONSTRAINT "kpi_observations_review_coupling_check" CHECK (
    ("review_status" = 'pending') = ("reviewed_at" IS NULL AND "review_comment" IS NULL)
  )
);
--> statement-breakpoint

DO $$
BEGIN
  IF to_regclass('public.idx_kpi_observations_fund_company_period') IS NULL THEN
    CREATE INDEX "idx_kpi_observations_fund_company_period"
      ON "kpi_observations" ("fund_id", "portfolio_company_id", "period_start", "id");
  END IF;
END $$;
