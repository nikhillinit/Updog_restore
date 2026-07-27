-- @drift-patch
-- Reason: PLAN_61 Task 18 (Wave G, defects D5/D6/D29, R33-a/b/c, R34-d) — revisable
-- quarterly analysis drafts and immutable reference snapshots pinned to ONE coherent
-- facts basis, plus the Task 19 narrative/notes tables which land dormant here (no
-- reader, writer, or route until Task 19), mirroring how 0038 landed ahead of 13.1-svc.

-- Mutable working draft. periodStart/periodEnd never change; refresh advances
-- knowledge_cutoff, repins every component from one facts snapshot built at that
-- cutoff, and bumps "version" (which rotates the ETag).
CREATE TABLE IF NOT EXISTS "internal_analysis_drafts" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "period_kind" varchar(16) NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "knowledge_cutoff" timestamp with time zone NOT NULL,
  "financial_facts_snapshot_id" integer NOT NULL,
  "forecast_fund_snapshot_id" integer,
  -- Wave E/F attachments. Deliberately unconstrained integers: the reserve and
  -- economics reference tables do not exist yet. Add the composite FKs when those
  -- waves land. Periodic analysis does not hard-depend on Waves E/F.
  "reserve_reference_id" integer,
  "economics_reference_id" integer,
  -- Set when this draft is a late correction started from a saved reference. No FK:
  -- a mutual drafts <-> references FK pair is a dependency cycle, so integrity runs
  -- one way (references.source_draft_id) and this direction is enforced in code via
  -- assertOwnedByFund({ kind: 'analysis_reference' }) (defect D29).
  "source_reference_id" integer,
  -- Set once saved; a saved draft is closed to further refresh. The reference it
  -- produced is reachable via internal_analysis_references.source_draft_id.
  "saved_at" timestamp with time zone,
  "version" integer DEFAULT 1 NOT NULL,
  "created_by" integer,
  "idempotency_key" varchar(128) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "internal_analysis_drafts_fund_id_funds_id_fk"
    FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade,
  CONSTRAINT "internal_analysis_drafts_facts_snapshot_fund_fk"
    FOREIGN KEY ("financial_facts_snapshot_id", "fund_id")
    REFERENCES "public"."financial_facts_snapshots"("id", "fund_id"),
  -- fund_snapshots has no (id, fund_id) sibling key, so the forecast pin is a plain
  -- FK and cross-fund ownership is enforced in code via assertOwnedByFund (D29).
  CONSTRAINT "internal_analysis_drafts_forecast_snapshot_fk"
    FOREIGN KEY ("forecast_fund_snapshot_id") REFERENCES "public"."fund_snapshots"("id"),
  CONSTRAINT "internal_analysis_drafts_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id"),
  CONSTRAINT "internal_analysis_drafts_id_fund_unique" UNIQUE ("id", "fund_id"),
  CONSTRAINT "internal_analysis_drafts_fund_idempotency_unique"
    UNIQUE ("fund_id", "idempotency_key"),
  CONSTRAINT "internal_analysis_drafts_period_kind_check"
    CHECK ("period_kind" IN ('quarterly','manual')),
  CONSTRAINT "internal_analysis_drafts_period_order_check"
    CHECK ("period_end" >= "period_start"),
  CONSTRAINT "internal_analysis_drafts_version_check" CHECK ("version" >= 1)
);
--> statement-breakpoint

-- Immutable saved snapshot. References form a linear chain via
-- supersedes_reference_id; the terminal member of each chain is the default for
-- comparison.
CREATE TABLE IF NOT EXISTS "internal_analysis_references" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "period_kind" varchar(16) NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "knowledge_cutoff" timestamp with time zone NOT NULL,
  "financial_facts_snapshot_id" integer NOT NULL,
  "forecast_fund_snapshot_id" integer,
  "reserve_reference_id" integer,
  "economics_reference_id" integer,
  -- True when the operator knowingly saved components that did not all resolve to
  -- financial_facts_snapshot_id. Consumers MUST render the warning on every load,
  -- not only at save time (R34-d).
  "mixed_basis_at_save" boolean DEFAULT false NOT NULL,
  "supersedes_reference_id" integer,
  "source_draft_id" integer,
  "created_by" integer,
  "idempotency_key" varchar(128) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "internal_analysis_references_fund_id_funds_id_fk"
    FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade,
  CONSTRAINT "internal_analysis_references_facts_snapshot_fund_fk"
    FOREIGN KEY ("financial_facts_snapshot_id", "fund_id")
    REFERENCES "public"."financial_facts_snapshots"("id", "fund_id"),
  CONSTRAINT "internal_analysis_references_forecast_snapshot_fk"
    FOREIGN KEY ("forecast_fund_snapshot_id") REFERENCES "public"."fund_snapshots"("id"),
  CONSTRAINT "internal_analysis_references_supersedes_fund_fk"
    FOREIGN KEY ("supersedes_reference_id", "fund_id")
    REFERENCES "public"."internal_analysis_references"("id", "fund_id"),
  CONSTRAINT "internal_analysis_references_source_draft_fund_fk"
    FOREIGN KEY ("source_draft_id", "fund_id")
    REFERENCES "public"."internal_analysis_drafts"("id", "fund_id"),
  CONSTRAINT "internal_analysis_references_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id"),
  CONSTRAINT "internal_analysis_references_id_fund_unique" UNIQUE ("id", "fund_id"),
  CONSTRAINT "internal_analysis_references_fund_idempotency_unique"
    UNIQUE ("fund_id", "idempotency_key"),
  CONSTRAINT "internal_analysis_references_period_kind_check"
    CHECK ("period_kind" IN ('quarterly','manual')),
  CONSTRAINT "internal_analysis_references_period_order_check"
    CHECK ("period_end" >= "period_start"),
  CONSTRAINT "internal_analysis_references_no_self_supersede_check"
    CHECK ("supersedes_reference_id" IS NULL OR "supersedes_reference_id" <> "id")
);
--> statement-breakpoint

-- At most one OPEN draft per fund and period.
CREATE UNIQUE INDEX IF NOT EXISTS "internal_analysis_drafts_open_period_unique"
  ON "internal_analysis_drafts" ("fund_id", "period_start", "period_end")
  WHERE "saved_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_internal_analysis_drafts_fund_period"
  ON "internal_analysis_drafts" ("fund_id", "period_start" DESC, "created_at" DESC);
--> statement-breakpoint

-- Each reference has at most one successor, so a revision chain stays linear and
-- its terminal member is well defined.
CREATE UNIQUE INDEX IF NOT EXISTS "internal_analysis_references_supersedes_unique"
  ON "internal_analysis_references" ("supersedes_reference_id")
  WHERE "supersedes_reference_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_internal_analysis_references_fund_period"
  ON "internal_analysis_references" ("fund_id", "period_start" DESC, "created_at" DESC);
--> statement-breakpoint

-- Append-only revision history. An explicit mixed-basis save is logged here (R34-d).
CREATE TABLE IF NOT EXISTS "internal_analysis_revision_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "draft_id" integer,
  "reference_id" integer,
  "event_type" varchar(32) NOT NULL,
  "detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "actor_id" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "internal_analysis_revision_events_fund_id_funds_id_fk"
    FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade,
  CONSTRAINT "internal_analysis_revision_events_draft_fund_fk"
    FOREIGN KEY ("draft_id", "fund_id")
    REFERENCES "public"."internal_analysis_drafts"("id", "fund_id"),
  CONSTRAINT "internal_analysis_revision_events_reference_fund_fk"
    FOREIGN KEY ("reference_id", "fund_id")
    REFERENCES "public"."internal_analysis_references"("id", "fund_id"),
  CONSTRAINT "internal_analysis_revision_events_actor_fk"
    FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id"),
  CONSTRAINT "internal_analysis_revision_events_event_type_check"
    CHECK ("event_type" IN ('created','refreshed','saved','mixed_basis_acknowledged')),
  CONSTRAINT "internal_analysis_revision_events_target_check"
    CHECK ("draft_id" IS NOT NULL OR "reference_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_internal_analysis_revision_events_fund_created"
  ON "internal_analysis_revision_events" ("fund_id", "created_at" DESC);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Task 19 surface. DORMANT: created here so Wave G mints one migration, but no
-- reader, writer, or route touches these until Task 19 lands.
-- ---------------------------------------------------------------------------

-- Editing creates a new revision; regeneration never overwrites edits.
CREATE TABLE IF NOT EXISTS "internal_narrative_drafts" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "analysis_draft_id" integer,
  "analysis_reference_id" integer,
  "revision" integer DEFAULT 1 NOT NULL,
  "supersedes_draft_id" integer,
  "created_by" integer,
  "idempotency_key" varchar(128) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "internal_narrative_drafts_fund_id_funds_id_fk"
    FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade,
  CONSTRAINT "internal_narrative_drafts_analysis_draft_fund_fk"
    FOREIGN KEY ("analysis_draft_id", "fund_id")
    REFERENCES "public"."internal_analysis_drafts"("id", "fund_id"),
  CONSTRAINT "internal_narrative_drafts_analysis_reference_fund_fk"
    FOREIGN KEY ("analysis_reference_id", "fund_id")
    REFERENCES "public"."internal_analysis_references"("id", "fund_id"),
  CONSTRAINT "internal_narrative_drafts_supersedes_fund_fk"
    FOREIGN KEY ("supersedes_draft_id", "fund_id")
    REFERENCES "public"."internal_narrative_drafts"("id", "fund_id"),
  CONSTRAINT "internal_narrative_drafts_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id"),
  CONSTRAINT "internal_narrative_drafts_id_fund_unique" UNIQUE ("id", "fund_id"),
  CONSTRAINT "internal_narrative_drafts_fund_idempotency_unique"
    UNIQUE ("fund_id", "idempotency_key"),
  CONSTRAINT "internal_narrative_drafts_revision_check" CHECK ("revision" >= 1),
  CONSTRAINT "internal_narrative_drafts_anchor_check"
    CHECK (num_nonnulls("analysis_draft_id", "analysis_reference_id") = 1),
  CONSTRAINT "internal_narrative_drafts_no_self_supersede_check"
    CHECK ("supersedes_draft_id" IS NULL OR "supersedes_draft_id" <> "id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "internal_narrative_drafts_supersedes_unique"
  ON "internal_narrative_drafts" ("supersedes_draft_id")
  WHERE "supersedes_draft_id" IS NOT NULL;
--> statement-breakpoint

-- Generated output is a structured list of claims, never an untraceable text blob.
-- Each source is a typed nullable FK column with an exactly-one-target CHECK; the
-- separate claim-sources table is deliberately collapsed (defect D36). A claim
-- needing multiple sources is split into multiple claims.
CREATE TABLE IF NOT EXISTS "internal_narrative_claims" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "narrative_draft_id" integer NOT NULL,
  "ordinal" integer NOT NULL,
  "marker" text NOT NULL,
  "body" text NOT NULL,
  "authorship" varchar(32) NOT NULL,
  "source_facts_snapshot_id" integer,
  "source_fund_snapshot_id" integer,
  "source_observation_id" integer,
  "source_analysis_reference_id" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "internal_narrative_claims_fund_id_funds_id_fk"
    FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade,
  CONSTRAINT "internal_narrative_claims_draft_fund_fk"
    FOREIGN KEY ("narrative_draft_id", "fund_id")
    REFERENCES "public"."internal_narrative_drafts"("id", "fund_id") ON DELETE cascade,
  CONSTRAINT "internal_narrative_claims_source_facts_snapshot_fund_fk"
    FOREIGN KEY ("source_facts_snapshot_id", "fund_id")
    REFERENCES "public"."financial_facts_snapshots"("id", "fund_id"),
  CONSTRAINT "internal_narrative_claims_source_fund_snapshot_fk"
    FOREIGN KEY ("source_fund_snapshot_id") REFERENCES "public"."fund_snapshots"("id"),
  CONSTRAINT "internal_narrative_claims_source_observation_fund_fk"
    FOREIGN KEY ("source_observation_id", "fund_id")
    REFERENCES "public"."source_observations"("id", "fund_id"),
  CONSTRAINT "internal_narrative_claims_source_analysis_reference_fund_fk"
    FOREIGN KEY ("source_analysis_reference_id", "fund_id")
    REFERENCES "public"."internal_analysis_references"("id", "fund_id"),
  CONSTRAINT "internal_narrative_claims_draft_ordinal_unique"
    UNIQUE ("narrative_draft_id", "ordinal"),
  CONSTRAINT "internal_narrative_claims_authorship_check"
    CHECK ("authorship" IN ('generated','user_authored_commentary')),
  -- Exactly one typed source for a generated claim; user commentary may be
  -- uncited but never carries more than one source.
  CONSTRAINT "internal_narrative_claims_exactly_one_source_check"
    CHECK (
      num_nonnulls(
        "source_facts_snapshot_id",
        "source_fund_snapshot_id",
        "source_observation_id",
        "source_analysis_reference_id"
      ) <= 1
      AND (
        "authorship" <> 'generated'
        OR num_nonnulls(
          "source_facts_snapshot_id",
          "source_fund_snapshot_id",
          "source_observation_id",
          "source_analysis_reference_id"
        ) = 1
      )
    )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_internal_narrative_claims_draft_ordinal"
  ON "internal_narrative_claims" ("narrative_draft_id", "ordinal");
--> statement-breakpoint

-- Notes are append-only; a correction supersedes rather than mutates.
CREATE TABLE IF NOT EXISTS "internal_analysis_notes" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "analysis_draft_id" integer,
  "analysis_reference_id" integer,
  "body" text NOT NULL,
  "supersedes_note_id" integer,
  "created_by" integer,
  "idempotency_key" varchar(128) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "internal_analysis_notes_fund_id_funds_id_fk"
    FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade,
  CONSTRAINT "internal_analysis_notes_analysis_draft_fund_fk"
    FOREIGN KEY ("analysis_draft_id", "fund_id")
    REFERENCES "public"."internal_analysis_drafts"("id", "fund_id"),
  CONSTRAINT "internal_analysis_notes_analysis_reference_fund_fk"
    FOREIGN KEY ("analysis_reference_id", "fund_id")
    REFERENCES "public"."internal_analysis_references"("id", "fund_id"),
  CONSTRAINT "internal_analysis_notes_supersedes_fund_fk"
    FOREIGN KEY ("supersedes_note_id", "fund_id")
    REFERENCES "public"."internal_analysis_notes"("id", "fund_id"),
  CONSTRAINT "internal_analysis_notes_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id"),
  CONSTRAINT "internal_analysis_notes_id_fund_unique" UNIQUE ("id", "fund_id"),
  CONSTRAINT "internal_analysis_notes_fund_idempotency_unique"
    UNIQUE ("fund_id", "idempotency_key"),
  CONSTRAINT "internal_analysis_notes_anchor_check"
    CHECK (num_nonnulls("analysis_draft_id", "analysis_reference_id") = 1),
  CONSTRAINT "internal_analysis_notes_no_self_supersede_check"
    CHECK ("supersedes_note_id" IS NULL OR "supersedes_note_id" <> "id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "internal_analysis_notes_supersedes_unique"
  ON "internal_analysis_notes" ("supersedes_note_id")
  WHERE "supersedes_note_id" IS NOT NULL;
