-- @drift-patch
-- Reason: Trust-Spine PR4 / issue #1272 adds the manually reconciled
-- economics-linkage catalog surface after 0044-0046 landed without it.
-- Trust-Spine PR4 / issue #1272: attach existing analysis economics pins to
-- fund-owned completed runs, then add immutable typed task-evidence links.
-- Drizzle's PostgreSQL migrator owns the transaction that includes this SQL
-- and its migration-ledger insert. Do not add BEGIN/COMMIT here: an inner
-- COMMIT would prematurely persist catalog changes before that ledger write.

-- The preflight and subsequent FK DDL must observe one stable ownership
-- surface. SHARE ROW EXCLUSIVE blocks concurrent INSERT/UPDATE/DELETE writes
-- to draft/reference pins and economics runs while preserving ordinary reads.
-- `tasks` is included because its composite sibling unique becomes the target
-- of the new task-evidence FK in the same migration transaction.
LOCK TABLE
  "internal_analysis_drafts",
  "internal_analysis_references",
  "internal_lp_economics_runs",
  "tasks"
IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint

-- Existing economics_reference_id columns landed intentionally unconstrained
-- in 0044. On first apply (neither linkage FK exists), do not repair or
-- rewrite history: only completed, same-fund runs are eligible. On raw replay
-- (both exact linkage FKs exist), the catalog has already accepted ownership-
-- only pins, including later same-fund failed runs, so skip historical
-- validation. A partial or semantically drifted FK state refuses before DDL.
DO $$
DECLARE
  draft_linkage_fk_present boolean;
  reference_linkage_fk_present boolean;
  draft_linkage_fk_definition text;
  reference_linkage_fk_definition text;
  tasks_id_fund_unique_definition text;
BEGIN
  SELECT pg_get_constraintdef(oid)
  INTO draft_linkage_fk_definition
  FROM pg_constraint
  WHERE conname = 'internal_analysis_drafts_economics_reference_fund_fk'
    AND conrelid = 'public.internal_analysis_drafts'::regclass;

  SELECT pg_get_constraintdef(oid)
  INTO reference_linkage_fk_definition
  FROM pg_constraint
  WHERE conname = 'internal_analysis_references_economics_reference_fund_fk'
    AND conrelid = 'public.internal_analysis_references'::regclass;

  draft_linkage_fk_present := draft_linkage_fk_definition IS NOT NULL;
  reference_linkage_fk_present := reference_linkage_fk_definition IS NOT NULL;

  IF draft_linkage_fk_present IS DISTINCT FROM reference_linkage_fk_present THEN
    RAISE EXCEPTION
      'internal_economics_linkage_partial_catalog_state: expected both analysis economics linkage FKs to be present or absent before replay';
  END IF;

  IF draft_linkage_fk_present AND (
    -- pg_get_constraintdef output from the 0047 FK DDL, not a hand-normalized
    -- approximation: replay must not silently accept same-named drift.
    draft_linkage_fk_definition <> 'FOREIGN KEY (economics_reference_id, fund_id) REFERENCES internal_lp_economics_runs(id, fund_id) ON DELETE RESTRICT'
    OR reference_linkage_fk_definition <> 'FOREIGN KEY (economics_reference_id, fund_id) REFERENCES internal_lp_economics_runs(id, fund_id) ON DELETE RESTRICT'
  ) THEN
    RAISE EXCEPTION
      'internal_economics_linkage_partial_catalog_state: existing analysis economics linkage FKs must exactly match the 0047 ownership definition before replay';
  END IF;

  IF NOT draft_linkage_fk_present THEN
    IF EXISTS (
      SELECT 1
      FROM "internal_analysis_drafts" AS draft
      LEFT JOIN "internal_lp_economics_runs" AS economics_run
        ON economics_run."id" = draft."economics_reference_id"
        AND economics_run."fund_id" = draft."fund_id"
      WHERE draft."economics_reference_id" IS NOT NULL
        AND (economics_run."id" IS NULL OR economics_run."run_state" <> 'completed')
    ) THEN
      RAISE EXCEPTION
        'internal_economics_linkage_preflight_failed: internal_analysis_drafts.economics_reference_id must reference a completed run in the same fund';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM "internal_analysis_references" AS analysis_reference
      LEFT JOIN "internal_lp_economics_runs" AS economics_run
        ON economics_run."id" = analysis_reference."economics_reference_id"
        AND economics_run."fund_id" = analysis_reference."fund_id"
      WHERE analysis_reference."economics_reference_id" IS NOT NULL
        AND (economics_run."id" IS NULL OR economics_run."run_state" <> 'completed')
    ) THEN
      RAISE EXCEPTION
        'internal_economics_linkage_preflight_failed: internal_analysis_references.economics_reference_id must reference a completed run in the same fund';
    END IF;
  END IF;

  SELECT pg_get_constraintdef(oid)
  INTO tasks_id_fund_unique_definition
  FROM pg_constraint
  WHERE conname = 'tasks_id_fund_unique'
    AND conrelid = 'public.tasks'::regclass;

  IF tasks_id_fund_unique_definition IS NOT NULL
    AND tasks_id_fund_unique_definition <> 'UNIQUE (id, fund_id)' THEN
    RAISE EXCEPTION
      'internal_economics_linkage_partial_catalog_state: existing tasks_id_fund_unique must exactly equal UNIQUE (id, fund_id) before replay';
  END IF;
END $$;
--> statement-breakpoint

-- CREATE TABLE IF NOT EXISTS cannot repair a pre-existing partial or semantically
-- drifted table. Refuse before any task-evidence DDL so a journaled migration
-- never records a catalog that lacks the exact ten-column, nine-constraint
-- shape. The ordered list index and update trigger are intentionally excluded:
-- their guarded DDL remains repairable on a structurally complete table during
-- raw replay.
DO $$
DECLARE
  invalid_columns text[];
  invalid_constraints text[];
  linkage_fk_count integer;
  tasks_id_fund_unique_present boolean;
  task_evidence_present boolean;
BEGIN
  task_evidence_present := to_regclass('public.task_evidence_links') IS NOT NULL;

  IF task_evidence_present THEN
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
        ('task_id', 'integer', 'int4', 'NO', NULL::integer, 'none'),
        ('target_kind', 'character varying', 'varchar', 'NO', NULL::integer, 'none'),
        ('analysis_reference_id', 'integer', 'int4', 'YES', NULL::integer, 'none'),
        ('economics_run_id', 'integer', 'int4', 'YES', NULL::integer, 'none'),
        ('idempotency_key', 'character varying', 'varchar', 'NO', 128, 'none'),
        ('request_hash', 'character varying', 'varchar', 'NO', 64, 'none'),
        ('created_by', 'integer', 'int4', 'YES', NULL::integer, 'none'),
        ('created_at', 'timestamp with time zone', 'timestamptz', 'NO', NULL::integer, 'now')
    )
    SELECT array_agg(invalid_column.name ORDER BY invalid_column.name)
    INTO invalid_columns
    FROM (
      SELECT required_column.name
      FROM required_column
      LEFT JOIN information_schema.columns AS column_catalog
        ON column_catalog.table_schema = 'public'
        AND column_catalog.table_name = 'task_evidence_links'
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
            -- Exact PostgreSQL information_schema.columns output for the serial
            -- declaration below: the default expression is intentionally
            -- unqualified, while pg_get_serial_sequence returns schema-qualified.
            column_catalog.column_default IS DISTINCT FROM
              'nextval(''task_evidence_links_id_seq''::regclass)'
            OR pg_get_serial_sequence('public.task_evidence_links', 'id')
              IS DISTINCT FROM 'public.task_evidence_links_id_seq'
          )
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
        AND column_catalog.table_name = 'task_evidence_links'
        AND NOT EXISTS (
          SELECT 1
          FROM required_column
          WHERE required_column.name = column_catalog.column_name
        )
    ) AS invalid_column;

    WITH required_constraint(name, definition) AS (
      -- These canonical strings are the PostgreSQL pg_get_constraintdef output
      -- for the 0047 CREATE TABLE DDL; semantic same-name drift must fail closed.
      VALUES
        ('task_evidence_links_pkey', 'PRIMARY KEY (id)'),
        ('task_evidence_links_fund_id_funds_id_fk', 'FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE CASCADE'),
        ('task_evidence_links_task_fund_fk', 'FOREIGN KEY (task_id, fund_id) REFERENCES tasks(id, fund_id) ON DELETE CASCADE'),
        ('task_evidence_links_analysis_reference_fund_fk', 'FOREIGN KEY (analysis_reference_id, fund_id) REFERENCES internal_analysis_references(id, fund_id) ON DELETE RESTRICT'),
        ('task_evidence_links_economics_run_fund_fk', 'FOREIGN KEY (economics_run_id, fund_id) REFERENCES internal_lp_economics_runs(id, fund_id) ON DELETE RESTRICT'),
        ('task_evidence_links_created_by_fk', 'FOREIGN KEY (created_by) REFERENCES users(id)'),
        ('task_evidence_links_fund_task_idempotency_unique', 'UNIQUE (fund_id, task_id, idempotency_key)'),
        ('task_evidence_links_target_kind_check', 'CHECK (((target_kind)::text = ANY ((ARRAY[''analysis_reference''::character varying, ''internal_economics_run''::character varying])::text[])))'),
        ('task_evidence_links_target_coupling_check', 'CHECK (((((target_kind)::text = ''analysis_reference''::text) AND (analysis_reference_id IS NOT NULL) AND (economics_run_id IS NULL)) OR (((target_kind)::text = ''internal_economics_run''::text) AND (economics_run_id IS NOT NULL) AND (analysis_reference_id IS NULL))))')
    )
    SELECT array_agg(invalid_constraint.name ORDER BY invalid_constraint.name)
    INTO invalid_constraints
    FROM (
      SELECT required_constraint.name
      FROM required_constraint
      LEFT JOIN pg_constraint AS constraint_catalog
        ON constraint_catalog.conrelid = 'public.task_evidence_links'::regclass
        AND constraint_catalog.conname = required_constraint.name
      WHERE constraint_catalog.oid IS NULL
        OR pg_get_constraintdef(constraint_catalog.oid)
          IS DISTINCT FROM required_constraint.definition
      UNION ALL
      SELECT constraint_catalog.conname
      FROM pg_constraint AS constraint_catalog
      WHERE constraint_catalog.conrelid = 'public.task_evidence_links'::regclass
        AND NOT EXISTS (
          SELECT 1
          FROM required_constraint
          WHERE required_constraint.name = constraint_catalog.conname
        )
    ) AS invalid_constraint;

    IF invalid_columns IS NOT NULL OR invalid_constraints IS NOT NULL THEN
      RAISE EXCEPTION
        'internal_economics_linkage_partial_task_evidence_state: task_evidence_links has missing, extra, or mismatched required columns [%] or constraints [%]',
        coalesce(array_to_string(invalid_columns, ', '), ''),
        coalesce(array_to_string(invalid_constraints, ', '), '');
    END IF;
  END IF;

  SELECT count(*)
  INTO linkage_fk_count
  FROM pg_constraint AS constraint_catalog
  WHERE (
    constraint_catalog.conrelid = 'public.internal_analysis_drafts'::regclass
    AND constraint_catalog.conname = 'internal_analysis_drafts_economics_reference_fund_fk'
  ) OR (
    constraint_catalog.conrelid = 'public.internal_analysis_references'::regclass
    AND constraint_catalog.conname = 'internal_analysis_references_economics_reference_fund_fk'
  );

  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_catalog
    WHERE constraint_catalog.conrelid = 'public.tasks'::regclass
      AND constraint_catalog.conname = 'tasks_id_fund_unique'
  )
  INTO tasks_id_fund_unique_present;

  -- The core 0047 structural surface is transactional: first apply starts
  -- with all three components absent; raw replay requires all three to be
  -- exact. The ordered index is validated separately because it is also an
  -- owned replay object. The named update trigger has an explicit replacement
  -- policy after its relation and namespace are proven safe.
  IF NOT (
    (linkage_fk_count = 0 AND NOT tasks_id_fund_unique_present AND NOT task_evidence_present)
    OR (linkage_fk_count = 2 AND tasks_id_fund_unique_present AND task_evidence_present)
  ) THEN
    RAISE EXCEPTION
      'internal_economics_linkage_partial_catalog_state: core 0047 structural objects must be all absent or all present before replay';
  END IF;
END $$;
--> statement-breakpoint

-- Exact index equivalence closes the replay gap left by CREATE INDEX IF NOT
-- EXISTS. A named trigger may be replaced on its canonical table, but a
-- same-named trigger elsewhere and every unexpected user trigger refuse.
DO $$
DECLARE
  task_evidence_relation regclass;
  task_evidence_present boolean;
  list_index_kind "char";
  list_index_definition text;
  unexpected_index_names text[];
  misplaced_named_trigger boolean;
  unexpected_trigger_names text[];
BEGIN
  task_evidence_relation := to_regclass('public.task_evidence_links');
  task_evidence_present := task_evidence_relation IS NOT NULL;

  SELECT relation_catalog.relkind
  INTO list_index_kind
  FROM pg_class AS relation_catalog
  JOIN pg_namespace AS namespace_catalog
    ON namespace_catalog.oid = relation_catalog.relnamespace
  WHERE namespace_catalog.nspname = 'public'
    AND relation_catalog.relname = 'idx_task_evidence_links_fund_task_id';

  SELECT EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_catalog
    JOIN pg_class AS trigger_relation ON trigger_relation.oid = trigger_catalog.tgrelid
    JOIN pg_namespace AS trigger_namespace ON trigger_namespace.oid = trigger_relation.relnamespace
    WHERE NOT trigger_catalog.tgisinternal
      AND trigger_catalog.tgname = 'task_evidence_links_forbid_update_trigger'
      AND (
        trigger_namespace.nspname <> 'public'
        OR trigger_relation.relname <> 'task_evidence_links'
      )
  )
  INTO misplaced_named_trigger;

  IF task_evidence_present THEN
    SELECT pg_get_indexdef(index_catalog.indexrelid)
    INTO list_index_definition
    FROM pg_index AS index_catalog
    JOIN pg_class AS index_relation
      ON index_relation.oid = index_catalog.indexrelid
    WHERE index_relation.relnamespace = 'public'::regnamespace
      AND index_relation.relname = 'idx_task_evidence_links_fund_task_id'
      AND index_catalog.indrelid = task_evidence_relation;

    SELECT array_agg(index_relation.relname ORDER BY index_relation.relname)
    INTO unexpected_index_names
    FROM pg_index AS index_catalog
    JOIN pg_class AS index_relation ON index_relation.oid = index_catalog.indexrelid
    WHERE index_catalog.indrelid = task_evidence_relation
      AND index_relation.relname NOT IN (
        'task_evidence_links_pkey',
        'task_evidence_links_fund_task_idempotency_unique',
        'idx_task_evidence_links_fund_task_id'
      );

    SELECT array_agg(trigger_catalog.tgname ORDER BY trigger_catalog.tgname)
    INTO unexpected_trigger_names
    FROM pg_trigger AS trigger_catalog
    WHERE trigger_catalog.tgrelid = task_evidence_relation
      AND NOT trigger_catalog.tgisinternal
      AND trigger_catalog.tgname <> 'task_evidence_links_forbid_update_trigger';

    IF list_index_kind IS DISTINCT FROM 'i'
      OR list_index_definition IS DISTINCT FROM
        'CREATE INDEX idx_task_evidence_links_fund_task_id ON public.task_evidence_links USING btree (fund_id, task_id, id)'
      OR unexpected_index_names IS NOT NULL
      OR misplaced_named_trigger
      OR unexpected_trigger_names IS NOT NULL THEN
      RAISE EXCEPTION
        'internal_economics_linkage_partial_catalog_state: task evidence index or trigger catalog is not replay-equivalent (index kind %, definition %, unexpected indexes %, misplaced trigger %, unexpected triggers %)',
        coalesce(list_index_kind::text, ''),
        coalesce(list_index_definition, ''),
        coalesce(array_to_string(unexpected_index_names, ', '), ''),
        misplaced_named_trigger,
        coalesce(array_to_string(unexpected_trigger_names, ', '), '');
    END IF;
  ELSIF list_index_kind IS NOT NULL OR misplaced_named_trigger THEN
    RAISE EXCEPTION
      'internal_economics_linkage_partial_catalog_state: index or named trigger exists without the 0047 task evidence table';
  END IF;
END $$;
--> statement-breakpoint

-- Composite FK targets must be UNIQUE constraints, not unique indexes.
-- Guard every existing-table catalog addition for full raw-file replay safety.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tasks_id_fund_unique'
      AND conrelid = 'public.tasks'::regclass
  ) THEN
    ALTER TABLE "tasks"
      ADD CONSTRAINT "tasks_id_fund_unique" UNIQUE ("id", "fund_id");
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'internal_analysis_drafts_economics_reference_fund_fk'
      AND conrelid = 'public.internal_analysis_drafts'::regclass
  ) THEN
    ALTER TABLE "internal_analysis_drafts"
      ADD CONSTRAINT "internal_analysis_drafts_economics_reference_fund_fk"
      FOREIGN KEY ("economics_reference_id", "fund_id")
      REFERENCES "public"."internal_lp_economics_runs"("id", "fund_id")
      ON DELETE restrict;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'internal_analysis_references_economics_reference_fund_fk'
      AND conrelid = 'public.internal_analysis_references'::regclass
  ) THEN
    ALTER TABLE "internal_analysis_references"
      ADD CONSTRAINT "internal_analysis_references_economics_reference_fund_fk"
      FOREIGN KEY ("economics_reference_id", "fund_id")
      REFERENCES "public"."internal_lp_economics_runs"("id", "fund_id")
      ON DELETE restrict;
  END IF;
END $$;
--> statement-breakpoint

-- Immutable evidence links are intentionally a narrow relational bridge only:
-- they prove ownership and target shape, never economics completion or
-- certification. Failed, fund-owned runs remain valid evidence targets.
CREATE TABLE IF NOT EXISTS "task_evidence_links" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "task_id" integer NOT NULL,
  "target_kind" varchar NOT NULL,
  "analysis_reference_id" integer,
  "economics_run_id" integer,
  "idempotency_key" varchar(128) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "created_by" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "task_evidence_links_fund_id_funds_id_fk"
    FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade,
  CONSTRAINT "task_evidence_links_task_fund_fk"
    FOREIGN KEY ("task_id", "fund_id")
    REFERENCES "public"."tasks"("id", "fund_id") ON DELETE cascade,
  CONSTRAINT "task_evidence_links_analysis_reference_fund_fk"
    FOREIGN KEY ("analysis_reference_id", "fund_id")
    REFERENCES "public"."internal_analysis_references"("id", "fund_id") ON DELETE restrict,
  CONSTRAINT "task_evidence_links_economics_run_fund_fk"
    FOREIGN KEY ("economics_run_id", "fund_id")
    REFERENCES "public"."internal_lp_economics_runs"("id", "fund_id") ON DELETE restrict,
  CONSTRAINT "task_evidence_links_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id"),
  CONSTRAINT "task_evidence_links_fund_task_idempotency_unique"
    UNIQUE ("fund_id", "task_id", "idempotency_key"),
  CONSTRAINT "task_evidence_links_target_kind_check"
    CHECK ("target_kind" IN ('analysis_reference','internal_economics_run')),
  CONSTRAINT "task_evidence_links_target_coupling_check"
    CHECK (
      (
        "target_kind" = 'analysis_reference'
        AND "analysis_reference_id" IS NOT NULL
        AND "economics_run_id" IS NULL
      )
      OR (
        "target_kind" = 'internal_economics_run'
        AND "economics_run_id" IS NOT NULL
        AND "analysis_reference_id" IS NULL
      )
    )
);
--> statement-breakpoint

DO $$
BEGIN
  IF to_regclass('public.idx_task_evidence_links_fund_task_id') IS NULL THEN
    CREATE INDEX "idx_task_evidence_links_fund_task_id"
      ON "task_evidence_links" ("fund_id", "task_id", "id");
  END IF;
END $$;
--> statement-breakpoint

-- 0045 owns the shared whole-row immutable-update function. This table adds
-- only the update trigger; evidence deletion remains governed by its FK web.
DROP TRIGGER IF EXISTS "task_evidence_links_forbid_update_trigger"
  ON "task_evidence_links";
--> statement-breakpoint
CREATE TRIGGER "task_evidence_links_forbid_update_trigger"
  BEFORE UPDATE ON "task_evidence_links"
  FOR EACH ROW EXECUTE FUNCTION "internal_economics_forbid_update"();
