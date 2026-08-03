-- @drift-patch
-- Reason: issue #1301 adds durable quarterly-review basis and receipt tables.
-- Quarterly review workflow (#1301). Drizzle migrator owns transaction.
-- Existing drafts are deliberately not backfilled; refresh creates first roster.
LOCK TABLE "internal_analysis_drafts", "financial_facts_snapshots", "portfoliocompanies", "tasks" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.portfoliocompanies'::regclass
      AND conname = 'portfoliocompanies_id_fund_unique'
  ) THEN
    ALTER TABLE "portfoliocompanies"
      ADD CONSTRAINT "portfoliocompanies_id_fund_unique" UNIQUE("id", "fund_id");
  ELSIF (
    SELECT pg_get_constraintdef(oid) FROM pg_constraint
    WHERE conrelid = 'public.portfoliocompanies'::regclass
      AND conname = 'portfoliocompanies_id_fund_unique'
  ) <> 'UNIQUE (id, fund_id)' THEN
    RAISE EXCEPTION 'quarterly_review_partial_catalog: portfoliocompanies_id_fund_unique drift';
  END IF;
END $$;
--> statement-breakpoint

DO $$
DECLARE
  quarterly_review_table_bundle_count integer;
BEGIN
  SELECT count(*)
  INTO quarterly_review_table_bundle_count
  FROM unnest(ARRAY[
    'public.quarterly_review_rosters',
    'public.quarterly_review_companies',
    'public.quarterly_review_items',
    'public.quarterly_review_command_receipts'
  ]) AS expected_table(name)
  WHERE to_regclass(expected_table.name) IS NOT NULL;

  IF quarterly_review_table_bundle_count NOT IN (0, 4) THEN
    RAISE EXCEPTION 'quarterly_review_partial_catalog: expected all four tables absent or present, found %',
      quarterly_review_table_bundle_count;
  END IF;
END $$;
--> statement-breakpoint

-- CREATE TABLE IF NOT EXISTS cannot repair an all-present but semantically
-- drifted bundle. On raw replay, compare every column and constraint against
-- the canonical 0048 catalog before allowing idempotent DDL to continue.
DO $$
DECLARE
  quarterly_review_table_bundle_count integer;
  quarterly_review_invalid_columns text[];
  quarterly_review_invalid_constraints text[];
BEGIN
  SELECT count(*) INTO quarterly_review_table_bundle_count
  FROM unnest(ARRAY[
    'public.quarterly_review_rosters',
    'public.quarterly_review_companies',
    'public.quarterly_review_items',
    'public.quarterly_review_command_receipts'
  ]) AS expected_table(name)
  WHERE to_regclass(expected_table.name) IS NOT NULL;

  IF quarterly_review_table_bundle_count = 4 THEN
    WITH required_column(table_name, name, data_type, is_nullable, max_length, default_kind) AS (
      VALUES
        ('quarterly_review_rosters','id','integer','NO',NULL::integer,'serial'),
        ('quarterly_review_rosters','fund_id','integer','NO',NULL::integer,'none'),
        ('quarterly_review_rosters','analysis_draft_id','integer','NO',NULL::integer,'none'),
        ('quarterly_review_rosters','draft_version','integer','NO',NULL::integer,'none'),
        ('quarterly_review_rosters','financial_facts_snapshot_id','integer','NO',NULL::integer,'none'),
        ('quarterly_review_rosters','company_count','integer','NO',NULL::integer,'none'),
        ('quarterly_review_rosters','created_by','integer','YES',NULL::integer,'none'),
        ('quarterly_review_rosters','created_at','timestamp with time zone','NO',NULL::integer,'now'),
        ('quarterly_review_companies','id','integer','NO',NULL::integer,'serial'),
        ('quarterly_review_companies','fund_id','integer','NO',NULL::integer,'none'),
        ('quarterly_review_companies','quarterly_review_roster_id','integer','NO',NULL::integer,'none'),
        ('quarterly_review_companies','portfolio_company_id','integer','NO',NULL::integer,'none'),
        ('quarterly_review_companies','waived_at','timestamp with time zone','YES',NULL::integer,'none'),
        ('quarterly_review_companies','waived_by','integer','YES',NULL::integer,'none'),
        ('quarterly_review_companies','waiver_reason','text','YES',NULL::integer,'none'),
        ('quarterly_review_companies','version','integer','NO',NULL::integer,'one'),
        ('quarterly_review_companies','created_at','timestamp with time zone','NO',NULL::integer,'now'),
        ('quarterly_review_companies','updated_at','timestamp with time zone','NO',NULL::integer,'now'),
        ('quarterly_review_items','id','integer','NO',NULL::integer,'serial'),
        ('quarterly_review_items','fund_id','integer','NO',NULL::integer,'none'),
        ('quarterly_review_items','quarterly_review_company_id','integer','NO',NULL::integer,'none'),
        ('quarterly_review_items','category','character varying','NO',32,'none'),
        ('quarterly_review_items','state','character varying','NO',24,'pending'),
        ('quarterly_review_items','note','text','YES',NULL::integer,'none'),
        ('quarterly_review_items','reviewed_by','integer','YES',NULL::integer,'none'),
        ('quarterly_review_items','reviewed_at','timestamp with time zone','YES',NULL::integer,'none'),
        ('quarterly_review_items','change_ref_kind','character varying','YES',32,'none'),
        ('quarterly_review_items','change_ref_path','character varying','YES',512,'none'),
        ('quarterly_review_items','change_ref_label','character varying','YES',120,'none'),
        ('quarterly_review_items','follow_up_task_id','integer','YES',NULL::integer,'none'),
        ('quarterly_review_items','version','integer','NO',NULL::integer,'one'),
        ('quarterly_review_items','created_at','timestamp with time zone','NO',NULL::integer,'now'),
        ('quarterly_review_items','updated_at','timestamp with time zone','NO',NULL::integer,'now'),
        ('quarterly_review_command_receipts','id','integer','NO',NULL::integer,'serial'),
        ('quarterly_review_command_receipts','fund_id','integer','NO',NULL::integer,'none'),
        ('quarterly_review_command_receipts','analysis_draft_id','integer','NO',NULL::integer,'none'),
        ('quarterly_review_command_receipts','roster_id','integer','NO',NULL::integer,'none'),
        ('quarterly_review_command_receipts','operation','character varying','NO',40,'none'),
        ('quarterly_review_command_receipts','idempotency_key','character varying','NO',128,'none'),
        ('quarterly_review_command_receipts','request_hash','character varying','NO',64,'none'),
        ('quarterly_review_command_receipts','response_status','integer','NO',NULL::integer,'none'),
        ('quarterly_review_command_receipts','result_kind','character varying','NO',16,'none'),
        ('quarterly_review_command_receipts','result_item_id','integer','YES',NULL::integer,'none'),
        ('quarterly_review_command_receipts','result_company_id','integer','YES',NULL::integer,'none'),
        ('quarterly_review_command_receipts','result_reference_id','integer','YES',NULL::integer,'none'),
        ('quarterly_review_command_receipts','result_draft_version','integer','YES',NULL::integer,'none'),
        ('quarterly_review_command_receipts','result_row_version','integer','YES',NULL::integer,'none'),
        ('quarterly_review_command_receipts','actor_id','integer','NO',NULL::integer,'none'),
        ('quarterly_review_command_receipts','created_at','timestamp with time zone','NO',NULL::integer,'now')
    ), invalid_column AS (
      SELECT required_column.table_name || '.' || required_column.name AS name
      FROM required_column
      LEFT JOIN information_schema.columns AS actual
        ON actual.table_schema = 'public'
        AND actual.table_name = required_column.table_name
        AND actual.column_name = required_column.name
      WHERE actual.column_name IS NULL
        OR actual.data_type IS DISTINCT FROM required_column.data_type
        OR actual.is_nullable IS DISTINCT FROM required_column.is_nullable
        OR actual.character_maximum_length IS DISTINCT FROM required_column.max_length
        OR actual.is_identity IS DISTINCT FROM 'NO'
        OR actual.is_generated IS DISTINCT FROM 'NEVER'
        OR (required_column.default_kind = 'none' AND actual.column_default IS NOT NULL)
        OR (required_column.default_kind = 'now' AND actual.column_default IS DISTINCT FROM 'now()')
        OR (required_column.default_kind = 'one' AND actual.column_default IS DISTINCT FROM '1')
        OR (required_column.default_kind = 'pending' AND actual.column_default IS DISTINCT FROM '''pending''::character varying')
        OR (required_column.default_kind = 'serial' AND (
          actual.column_default IS DISTINCT FROM
            ('nextval(''' || required_column.table_name || '_id_seq''::regclass)')
          OR pg_get_serial_sequence('public.' || required_column.table_name, required_column.name)
            IS DISTINCT FROM ('public.' || required_column.table_name || '_id_seq')
        ))
      UNION ALL
      SELECT actual.table_name || '.' || actual.column_name
      FROM information_schema.columns AS actual
      WHERE actual.table_schema = 'public'
        AND actual.table_name = ANY(ARRAY[
          'quarterly_review_rosters','quarterly_review_companies',
          'quarterly_review_items','quarterly_review_command_receipts'
        ])
        AND NOT EXISTS (
          SELECT 1 FROM required_column
          WHERE required_column.table_name = actual.table_name
            AND required_column.name = actual.column_name
        )
    )
    SELECT array_agg(name ORDER BY name) INTO quarterly_review_invalid_columns FROM invalid_column;

    WITH required_constraint(table_name, name, definition) AS (
      VALUES
        ('quarterly_review_rosters', 'quarterly_review_rosters_pkey', 'PRIMARY KEY (id)'),
        ('quarterly_review_rosters', 'quarterly_review_rosters_fund_id_funds_id_fk', 'FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE CASCADE'),
        ('quarterly_review_rosters', 'quarterly_review_rosters_draft_fund_fk', 'FOREIGN KEY (analysis_draft_id, fund_id) REFERENCES internal_analysis_drafts(id, fund_id) ON DELETE CASCADE'),
        ('quarterly_review_rosters', 'quarterly_review_rosters_facts_fund_fk', 'FOREIGN KEY (financial_facts_snapshot_id, fund_id) REFERENCES financial_facts_snapshots(id, fund_id) ON DELETE RESTRICT'),
        ('quarterly_review_rosters', 'quarterly_review_rosters_created_by_fk', 'FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT'),
        ('quarterly_review_rosters', 'quarterly_review_rosters_id_fund_unique', 'UNIQUE (id, fund_id)'),
        ('quarterly_review_rosters', 'quarterly_review_rosters_exact_basis_unique', 'UNIQUE (analysis_draft_id, draft_version, financial_facts_snapshot_id)'),
        ('quarterly_review_rosters', 'quarterly_review_rosters_company_count_check', 'CHECK ((company_count >= 0))'),
        ('quarterly_review_companies', 'quarterly_review_companies_pkey', 'PRIMARY KEY (id)'),
        ('quarterly_review_companies', 'quarterly_review_companies_fund_id_funds_id_fk', 'FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE CASCADE'),
        ('quarterly_review_companies', 'quarterly_review_companies_roster_fund_fk', 'FOREIGN KEY (quarterly_review_roster_id, fund_id) REFERENCES quarterly_review_rosters(id, fund_id) ON DELETE CASCADE'),
        ('quarterly_review_companies', 'quarterly_review_companies_portfolio_company_fund_fk', 'FOREIGN KEY (portfolio_company_id, fund_id) REFERENCES portfoliocompanies(id, fund_id) ON DELETE RESTRICT'),
        ('quarterly_review_companies', 'quarterly_review_companies_waived_by_fk', 'FOREIGN KEY (waived_by) REFERENCES users(id) ON DELETE RESTRICT'),
        ('quarterly_review_companies', 'quarterly_review_companies_id_fund_unique', 'UNIQUE (id, fund_id)'),
        ('quarterly_review_companies', 'quarterly_review_companies_roster_company_unique', 'UNIQUE (quarterly_review_roster_id, portfolio_company_id)'),
        ('quarterly_review_companies', 'quarterly_review_companies_waiver_coupling_check', 'CHECK (((num_nonnulls(waived_at, waived_by, waiver_reason) = 0) OR ((num_nonnulls(waived_at, waived_by, waiver_reason) = 3) AND (length(btrim(waiver_reason)) > 0))))'),
        ('quarterly_review_companies', 'quarterly_review_companies_version_check', 'CHECK ((version >= 1))'),
        ('quarterly_review_items', 'quarterly_review_items_pkey', 'PRIMARY KEY (id)'),
        ('quarterly_review_items', 'quarterly_review_items_fund_id_funds_id_fk', 'FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE CASCADE'),
        ('quarterly_review_items', 'quarterly_review_items_company_fund_fk', 'FOREIGN KEY (quarterly_review_company_id, fund_id) REFERENCES quarterly_review_companies(id, fund_id) ON DELETE CASCADE'),
        ('quarterly_review_items', 'quarterly_review_items_reviewed_by_fk', 'FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE RESTRICT'),
        ('quarterly_review_items', 'quarterly_review_items_follow_up_task_fund_fk', 'FOREIGN KEY (follow_up_task_id, fund_id) REFERENCES tasks(id, fund_id) ON DELETE RESTRICT'),
        ('quarterly_review_items', 'quarterly_review_items_company_category_unique', 'UNIQUE (quarterly_review_company_id, category)'),
        ('quarterly_review_items', 'quarterly_review_items_category_check', 'CHECK (((category)::text = ANY ((ARRAY[''cases_probabilities''::character varying, ''kpis''::character varying, ''valuation_fmv''::character varying, ''reserve_plan''::character varying, ''qualitative_risks''::character varying])::text[])))'),
        ('quarterly_review_items', 'quarterly_review_items_state_check', 'CHECK (((state)::text = ANY ((ARRAY[''pending''::character varying, ''changed''::character varying, ''reviewed_no_change''::character varying])::text[])))'),
        ('quarterly_review_items', 'quarterly_review_items_state_coupling_check', 'CHECK (((((state)::text = ''pending''::text) AND (num_nonnulls(note, reviewed_by, reviewed_at, change_ref_kind, change_ref_path, change_ref_label, follow_up_task_id) = 0)) OR (((state)::text = ''reviewed_no_change''::text) AND (note IS NOT NULL) AND (length(btrim(note)) > 0) AND (reviewed_by IS NOT NULL) AND (reviewed_at IS NOT NULL) AND (num_nonnulls(change_ref_kind, change_ref_path, change_ref_label, follow_up_task_id) = 0)) OR (((state)::text = ''changed''::text) AND (note IS NOT NULL) AND (length(btrim(note)) > 0) AND (reviewed_by IS NOT NULL) AND (reviewed_at IS NOT NULL) AND (change_ref_kind IS NOT NULL) AND ((change_ref_kind)::text = ''internal_route''::text) AND (change_ref_path IS NOT NULL) AND (change_ref_label IS NOT NULL))))'),
        ('quarterly_review_items', 'quarterly_review_items_version_check', 'CHECK ((version >= 1))'),
        ('quarterly_review_command_receipts', 'quarterly_review_command_receipts_pkey', 'PRIMARY KEY (id)'),
        ('quarterly_review_command_receipts', 'quarterly_review_command_receipts_draft_fund_fk', 'FOREIGN KEY (analysis_draft_id, fund_id) REFERENCES internal_analysis_drafts(id, fund_id) ON DELETE CASCADE'),
        ('quarterly_review_command_receipts', 'quarterly_review_command_receipts_roster_fund_fk', 'FOREIGN KEY (roster_id, fund_id) REFERENCES quarterly_review_rosters(id, fund_id) ON DELETE CASCADE'),
        ('quarterly_review_command_receipts', 'quarterly_review_command_receipts_actor_fk', 'FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT'),
        ('quarterly_review_command_receipts', 'quarterly_review_command_receipts_fund_idempotency_unique', 'UNIQUE (fund_id, idempotency_key)'),
        ('quarterly_review_command_receipts', 'quarterly_review_command_receipts_operation_check', 'CHECK (((operation)::text = ANY ((ARRAY[''draft_refresh''::character varying, ''economics_reference_replace''::character varying, ''review_item_update''::character varying, ''company_waive''::character varying, ''draft_save''::character varying])::text[])))'),
        ('quarterly_review_command_receipts', 'quarterly_review_command_receipts_result_coupling_check', 'CHECK (((((operation)::text = ANY ((ARRAY[''draft_refresh''::character varying, ''economics_reference_replace''::character varying])::text[])) AND ((result_kind)::text = ''draft''::text) AND (response_status = 200) AND (result_draft_version IS NOT NULL) AND (num_nonnulls(result_item_id, result_company_id, result_reference_id, result_row_version) = 0)) OR (((operation)::text = ''review_item_update''::text) AND ((result_kind)::text = ''item''::text) AND (response_status = 200) AND (result_item_id IS NOT NULL) AND (result_row_version IS NOT NULL) AND (num_nonnulls(result_company_id, result_reference_id, result_draft_version) = 0)) OR (((operation)::text = ''company_waive''::text) AND ((result_kind)::text = ''company''::text) AND (response_status = 200) AND (result_company_id IS NOT NULL) AND (result_row_version IS NOT NULL) AND (num_nonnulls(result_item_id, result_reference_id, result_draft_version) = 0)) OR (((operation)::text = ''draft_save''::text) AND ((result_kind)::text = ''reference''::text) AND (response_status = 201) AND (result_reference_id IS NOT NULL) AND (num_nonnulls(result_item_id, result_company_id, result_draft_version, result_row_version) = 0))))')
    ), invalid_constraint AS (
      SELECT required_constraint.table_name || '.' || required_constraint.name AS name
      FROM required_constraint
      LEFT JOIN pg_constraint AS actual
        ON actual.conrelid = ('public.' || required_constraint.table_name)::regclass
        AND actual.conname = required_constraint.name
      WHERE actual.oid IS NULL
        OR pg_get_constraintdef(actual.oid) IS DISTINCT FROM required_constraint.definition
      UNION ALL
      SELECT relation.relname || '.' || actual.conname
      FROM pg_constraint AS actual
      JOIN pg_class AS relation ON relation.oid = actual.conrelid
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = ANY(ARRAY[
          'quarterly_review_rosters','quarterly_review_companies',
          'quarterly_review_items','quarterly_review_command_receipts'
        ])
        AND NOT EXISTS (
          SELECT 1 FROM required_constraint
          WHERE required_constraint.table_name = relation.relname
            AND required_constraint.name = actual.conname
        )
    )
    SELECT array_agg(name ORDER BY name)
    INTO quarterly_review_invalid_constraints
    FROM invalid_constraint;

    IF quarterly_review_invalid_columns IS NOT NULL
      OR quarterly_review_invalid_constraints IS NOT NULL THEN
      RAISE EXCEPTION
        'quarterly_review_all_present_catalog_drift: invalid columns %, invalid constraints %',
        quarterly_review_invalid_columns,
        quarterly_review_invalid_constraints;
    END IF;
  END IF;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "quarterly_review_rosters" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "analysis_draft_id" integer NOT NULL,
  "draft_version" integer NOT NULL,
  "financial_facts_snapshot_id" integer NOT NULL,
  "company_count" integer NOT NULL,
  "created_by" integer,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "quarterly_review_rosters_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE CASCADE,
  CONSTRAINT "quarterly_review_rosters_draft_fund_fk" FOREIGN KEY ("analysis_draft_id", "fund_id") REFERENCES "internal_analysis_drafts"("id", "fund_id") ON DELETE CASCADE,
  CONSTRAINT "quarterly_review_rosters_facts_fund_fk" FOREIGN KEY ("financial_facts_snapshot_id", "fund_id") REFERENCES "financial_facts_snapshots"("id", "fund_id") ON DELETE RESTRICT,
  CONSTRAINT "quarterly_review_rosters_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "quarterly_review_rosters_id_fund_unique" UNIQUE("id", "fund_id"),
  CONSTRAINT "quarterly_review_rosters_exact_basis_unique" UNIQUE("analysis_draft_id", "draft_version", "financial_facts_snapshot_id"),
  CONSTRAINT "quarterly_review_rosters_company_count_check" CHECK ("company_count" >= 0)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "quarterly_review_companies" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "quarterly_review_roster_id" integer NOT NULL,
  "portfolio_company_id" integer NOT NULL,
  "waived_at" timestamptz,
  "waived_by" integer,
  "waiver_reason" text,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "quarterly_review_companies_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE CASCADE,
  CONSTRAINT "quarterly_review_companies_roster_fund_fk" FOREIGN KEY ("quarterly_review_roster_id", "fund_id") REFERENCES "quarterly_review_rosters"("id", "fund_id") ON DELETE CASCADE,
  CONSTRAINT "quarterly_review_companies_portfolio_company_fund_fk" FOREIGN KEY ("portfolio_company_id", "fund_id") REFERENCES "portfoliocompanies"("id", "fund_id") ON DELETE RESTRICT,
  CONSTRAINT "quarterly_review_companies_waived_by_fk" FOREIGN KEY ("waived_by") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "quarterly_review_companies_id_fund_unique" UNIQUE("id", "fund_id"),
  CONSTRAINT "quarterly_review_companies_roster_company_unique" UNIQUE("quarterly_review_roster_id", "portfolio_company_id"),
  CONSTRAINT "quarterly_review_companies_waiver_coupling_check" CHECK ((num_nonnulls("waived_at", "waived_by", "waiver_reason") = 0) OR (num_nonnulls("waived_at", "waived_by", "waiver_reason") = 3 AND length(btrim("waiver_reason")) > 0)),
  CONSTRAINT "quarterly_review_companies_version_check" CHECK ("version" >= 1)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "quarterly_review_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "quarterly_review_company_id" integer NOT NULL,
  "category" varchar(32) NOT NULL,
  "state" varchar(24) DEFAULT 'pending' NOT NULL,
  "note" text,
  "reviewed_by" integer,
  "reviewed_at" timestamptz,
  "change_ref_kind" varchar(32),
  "change_ref_path" varchar(512),
  "change_ref_label" varchar(120),
  "follow_up_task_id" integer,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "quarterly_review_items_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE CASCADE,
  CONSTRAINT "quarterly_review_items_company_fund_fk" FOREIGN KEY ("quarterly_review_company_id", "fund_id") REFERENCES "quarterly_review_companies"("id", "fund_id") ON DELETE CASCADE,
  CONSTRAINT "quarterly_review_items_reviewed_by_fk" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "quarterly_review_items_follow_up_task_fund_fk" FOREIGN KEY ("follow_up_task_id", "fund_id") REFERENCES "tasks"("id", "fund_id") ON DELETE RESTRICT,
  CONSTRAINT "quarterly_review_items_company_category_unique" UNIQUE("quarterly_review_company_id", "category"),
  CONSTRAINT "quarterly_review_items_category_check" CHECK ("category" IN ('cases_probabilities','kpis','valuation_fmv','reserve_plan','qualitative_risks')),
  CONSTRAINT "quarterly_review_items_state_check" CHECK ("state" IN ('pending','changed','reviewed_no_change')),
  CONSTRAINT "quarterly_review_items_state_coupling_check" CHECK (("state" = 'pending' AND num_nonnulls("note", "reviewed_by", "reviewed_at", "change_ref_kind", "change_ref_path", "change_ref_label", "follow_up_task_id") = 0) OR ("state" = 'reviewed_no_change' AND "note" IS NOT NULL AND length(btrim("note")) > 0 AND "reviewed_by" IS NOT NULL AND "reviewed_at" IS NOT NULL AND num_nonnulls("change_ref_kind", "change_ref_path", "change_ref_label", "follow_up_task_id") = 0) OR ("state" = 'changed' AND "note" IS NOT NULL AND length(btrim("note")) > 0 AND "reviewed_by" IS NOT NULL AND "reviewed_at" IS NOT NULL AND "change_ref_kind" IS NOT NULL AND "change_ref_kind" = 'internal_route' AND "change_ref_path" IS NOT NULL AND "change_ref_label" IS NOT NULL)),
  CONSTRAINT "quarterly_review_items_version_check" CHECK ("version" >= 1)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "quarterly_review_command_receipts" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "analysis_draft_id" integer NOT NULL,
  "roster_id" integer NOT NULL,
  "operation" varchar(40) NOT NULL,
  "idempotency_key" varchar(128) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "response_status" integer NOT NULL,
  "result_kind" varchar(16) NOT NULL,
  "result_item_id" integer,
  "result_company_id" integer,
  "result_reference_id" integer,
  "result_draft_version" integer,
  "result_row_version" integer,
  "actor_id" integer NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "quarterly_review_command_receipts_draft_fund_fk" FOREIGN KEY ("analysis_draft_id", "fund_id") REFERENCES "internal_analysis_drafts"("id", "fund_id") ON DELETE CASCADE,
  CONSTRAINT "quarterly_review_command_receipts_roster_fund_fk" FOREIGN KEY ("roster_id", "fund_id") REFERENCES "quarterly_review_rosters"("id", "fund_id") ON DELETE CASCADE,
  CONSTRAINT "quarterly_review_command_receipts_actor_fk" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "quarterly_review_command_receipts_fund_idempotency_unique" UNIQUE("fund_id", "idempotency_key"),
  CONSTRAINT "quarterly_review_command_receipts_operation_check" CHECK ("operation" IN ('draft_refresh','economics_reference_replace','review_item_update','company_waive','draft_save')),
  CONSTRAINT "quarterly_review_command_receipts_result_coupling_check" CHECK (("operation" IN ('draft_refresh','economics_reference_replace') AND "result_kind" = 'draft' AND "response_status" = 200 AND "result_draft_version" IS NOT NULL AND num_nonnulls("result_item_id", "result_company_id", "result_reference_id", "result_row_version") = 0) OR ("operation" = 'review_item_update' AND "result_kind" = 'item' AND "response_status" = 200 AND "result_item_id" IS NOT NULL AND "result_row_version" IS NOT NULL AND num_nonnulls("result_company_id", "result_reference_id", "result_draft_version") = 0) OR ("operation" = 'company_waive' AND "result_kind" = 'company' AND "response_status" = 200 AND "result_company_id" IS NOT NULL AND "result_row_version" IS NOT NULL AND num_nonnulls("result_item_id", "result_reference_id", "result_draft_version") = 0) OR ("operation" = 'draft_save' AND "result_kind" = 'reference' AND "response_status" = 201 AND "result_reference_id" IS NOT NULL AND num_nonnulls("result_item_id", "result_company_id", "result_draft_version", "result_row_version") = 0))
);
--> statement-breakpoint

CREATE OR REPLACE FUNCTION quarterly_review_command_receipts_forbid_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'quarterly_review_command_receipts are immutable';
END $$;
--> statement-breakpoint

DO $$
DECLARE
  receipt_trigger_definition text;
  receipt_trigger_enabled "char";
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'quarterly_review_command_receipts_forbid_update'
      AND tgrelid <> 'public.quarterly_review_command_receipts'::regclass
  ) THEN
    RAISE EXCEPTION
      'quarterly_review_receipt_trigger_drift: same-named trigger exists on wrong relation';
  END IF;

  SELECT pg_get_triggerdef(oid), tgenabled
  INTO receipt_trigger_definition, receipt_trigger_enabled
  FROM pg_trigger
  WHERE tgname = 'quarterly_review_command_receipts_forbid_update'
    AND tgrelid = 'public.quarterly_review_command_receipts'::regclass
    AND NOT tgisinternal;

  IF receipt_trigger_definition IS NULL THEN
    CREATE TRIGGER quarterly_review_command_receipts_forbid_update
      BEFORE UPDATE ON quarterly_review_command_receipts
      FOR EACH ROW EXECUTE FUNCTION quarterly_review_command_receipts_forbid_update();
  ELSIF receipt_trigger_definition IS DISTINCT FROM
      'CREATE TRIGGER quarterly_review_command_receipts_forbid_update BEFORE UPDATE ON public.quarterly_review_command_receipts FOR EACH ROW EXECUTE FUNCTION quarterly_review_command_receipts_forbid_update()'
    OR receipt_trigger_enabled IS DISTINCT FROM 'O' THEN
    RAISE EXCEPTION
      'quarterly_review_receipt_trigger_drift: existing trigger definition or tgenabled is non-canonical';
  END IF;
END $$;
