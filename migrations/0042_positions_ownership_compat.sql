-- @drift-patch
-- Reason: Task 11 Slice 11A - position event ownership store, lot reliefs, ownership snapshots, and compat schema guards.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'investment_lots_id_investment_unique'
  ) THEN
    ALTER TABLE "investment_lots"
      ADD CONSTRAINT "investment_lots_id_investment_unique" UNIQUE ("id", "investment_id");
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'investment_lots_lot_type_check'
      AND pg_get_constraintdef(oid) NOT LIKE '%conversion%'
  ) THEN
    ALTER TABLE "investment_lots"
      DROP CONSTRAINT "investment_lots_lot_type_check";
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'investment_lots_lot_type_check'
  ) THEN
    ALTER TABLE "investment_lots"
      ADD CONSTRAINT "investment_lots_lot_type_check"
      CHECK ("lot_type" IN ('initial', 'follow_on', 'secondary', 'conversion'));
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "vehicle_financing_participations"
  ADD COLUMN IF NOT EXISTS "economic_origin" varchar(32) DEFAULT 'cash_investment' NOT NULL;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vfp_economic_origin_check'
  ) THEN
    ALTER TABLE "vehicle_financing_participations"
      ADD CONSTRAINT "vfp_economic_origin_check"
      CHECK ("economic_origin" IN ('cash_investment', 'conversion_result'));
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "valuation_marks"
  ADD COLUMN IF NOT EXISTS "mark_purpose" varchar(32) DEFAULT 'planning_company_fmv' NOT NULL,
  ADD COLUMN IF NOT EXISTS "source_observation_id" integer;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valuation_marks_mark_purpose_check'
  ) THEN
    ALTER TABLE "valuation_marks"
      ADD CONSTRAINT "valuation_marks_mark_purpose_check"
      CHECK ("mark_purpose" IN ('planning_company_fmv', 'direct_position_fmv'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valuation_marks_direct_position_lineage_check'
  ) THEN
    ALTER TABLE "valuation_marks"
      ADD CONSTRAINT "valuation_marks_direct_position_lineage_check"
      CHECK (
        "mark_purpose" <> 'direct_position_fmv'
        OR ("vehicle_id" IS NOT NULL AND "source_observation_id" IS NOT NULL)
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valuation_marks_source_observation_fund_fk'
  ) THEN
    ALTER TABLE "valuation_marks"
      ADD CONSTRAINT "valuation_marks_source_observation_fund_fk"
      FOREIGN KEY ("source_observation_id", "fund_id")
      REFERENCES "public"."source_observations"("id", "fund_id");
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_valuation_marks_direct_position_mark_date"
  ON "valuation_marks" ("fund_id", "vehicle_id", "company_id", "mark_date" DESC, "id" DESC)
  WHERE "mark_purpose" = 'direct_position_fmv' AND "status" IN ('approved', 'locked');
--> statement-breakpoint

ALTER TABLE "financial_facts_snapshots"
  ADD COLUMN IF NOT EXISTS "supersedes_snapshot_id" integer;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'financial_facts_snapshots_id_fund_unique'
  ) THEN
    ALTER TABLE "financial_facts_snapshots"
      ADD CONSTRAINT "financial_facts_snapshots_id_fund_unique" UNIQUE ("id", "fund_id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'financial_facts_snapshots_supersedes_fund_fk'
  ) THEN
    ALTER TABLE "financial_facts_snapshots"
      ADD CONSTRAINT "financial_facts_snapshots_supersedes_fund_fk"
      FOREIGN KEY ("supersedes_snapshot_id", "fund_id")
      REFERENCES "public"."financial_facts_snapshots"("id", "fund_id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'financial_facts_snapshots_no_self_supersede_check'
  ) THEN
    ALTER TABLE "financial_facts_snapshots"
      ADD CONSTRAINT "financial_facts_snapshots_no_self_supersede_check"
      CHECK ("supersedes_snapshot_id" IS NULL OR "supersedes_snapshot_id" <> "id");
  END IF;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "financial_facts_snapshots_supersedes_unique"
  ON "financial_facts_snapshots" ("supersedes_snapshot_id")
  WHERE "supersedes_snapshot_id" IS NOT NULL;
--> statement-breakpoint

DO $$
DECLARE
  duplicate_main_funds text;
BEGIN
  SELECT string_agg(format('fund_id=%s count=%s', fund_id, main_count), ', ' ORDER BY fund_id)
  INTO duplicate_main_funds
  FROM (
    SELECT fund_id, count(*) AS main_count
    FROM "vehicles"
    WHERE "vehicle_type" = 'main_fund'
    GROUP BY fund_id
    HAVING count(*) > 1
  ) duplicates;

  IF duplicate_main_funds IS NOT NULL THEN
    RAISE EXCEPTION 'vehicles main_fund duplicate preflight failed: %', duplicate_main_funds;
  END IF;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "vehicles_main_fund_unique"
  ON "vehicles" ("fund_id")
  WHERE "vehicle_type" = 'main_fund';
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "position_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "vehicle_id" integer NOT NULL,
  "company_identity_id" integer NOT NULL,
  "event_type" varchar(32) NOT NULL,
  "effective_date" date NOT NULL,
  "recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
  "shares_delta" numeric(20,6) NOT NULL,
  "cost_basis_delta" numeric(20,6) NOT NULL,
  "proceeds" numeric(20,6) NOT NULL,
  "replaces_event_id" integer,
  "reverses_position_event_id" integer,
  "vehicle_participation_id" integer,
  "resulting_participation_id" integer,
  "source_participation_version" integer,
  "resulting_participation_version" integer,
  "source_tranche_version" integer,
  "resulting_tranche_version" integer,
  "source_observation_id" integer,
  "backfilled_from_investment_id" integer,
  "created_by" integer,
  "idempotency_key" varchar(128),
  "request_hash" varchar(64)
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'position_events_fund_fk') THEN
    ALTER TABLE "position_events"
      ADD CONSTRAINT "position_events_fund_fk"
      FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'position_events_id_fund_unique') THEN
    ALTER TABLE "position_events"
      ADD CONSTRAINT "position_events_id_fund_unique" UNIQUE ("id", "fund_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'position_events_vehicle_fund_fk') THEN
    ALTER TABLE "position_events"
      ADD CONSTRAINT "position_events_vehicle_fund_fk"
      FOREIGN KEY ("vehicle_id", "fund_id") REFERENCES "public"."vehicles"("id", "fund_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'position_events_identity_fund_fk') THEN
    ALTER TABLE "position_events"
      ADD CONSTRAINT "position_events_identity_fund_fk"
      FOREIGN KEY ("company_identity_id", "fund_id")
      REFERENCES "public"."company_identities"("id", "fund_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'position_events_replaces_fund_fk') THEN
    ALTER TABLE "position_events"
      ADD CONSTRAINT "position_events_replaces_fund_fk"
      FOREIGN KEY ("replaces_event_id", "fund_id")
      REFERENCES "public"."position_events"("id", "fund_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'position_events_reverses_fund_fk') THEN
    ALTER TABLE "position_events"
      ADD CONSTRAINT "position_events_reverses_fund_fk"
      FOREIGN KEY ("reverses_position_event_id", "fund_id")
      REFERENCES "public"."position_events"("id", "fund_id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'position_events_participation_fund_fk'
  ) THEN
    ALTER TABLE "position_events"
      ADD CONSTRAINT "position_events_participation_fund_fk"
      FOREIGN KEY ("vehicle_participation_id", "fund_id")
      REFERENCES "public"."vehicle_financing_participations"("id", "fund_id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'position_events_resulting_participation_fund_fk'
  ) THEN
    ALTER TABLE "position_events"
      ADD CONSTRAINT "position_events_resulting_participation_fund_fk"
      FOREIGN KEY ("resulting_participation_id", "fund_id")
      REFERENCES "public"."vehicle_financing_participations"("id", "fund_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'position_events_observation_fund_fk') THEN
    ALTER TABLE "position_events"
      ADD CONSTRAINT "position_events_observation_fund_fk"
      FOREIGN KEY ("source_observation_id", "fund_id")
      REFERENCES "public"."source_observations"("id", "fund_id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'position_events_backfill_investment_fund_fk'
  ) THEN
    ALTER TABLE "position_events"
      ADD CONSTRAINT "position_events_backfill_investment_fund_fk"
      FOREIGN KEY ("backfilled_from_investment_id", "fund_id")
      REFERENCES "public"."investments"("id", "fund_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'position_events_created_by_fk') THEN
    ALTER TABLE "position_events"
      ADD CONSTRAINT "position_events_created_by_fk"
      FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'position_events_event_type_check') THEN
    ALTER TABLE "position_events"
      ADD CONSTRAINT "position_events_event_type_check"
      CHECK (
        "event_type" IN (
          'acquisition',
          'conversion',
          'realization',
          'write_off',
          'adjustment',
          'reversal'
        )
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'position_events_conversion_links_check'
  ) THEN
    ALTER TABLE "position_events"
      ADD CONSTRAINT "position_events_conversion_links_check"
      CHECK (
        (
          "event_type" = 'conversion'
          AND "vehicle_participation_id" IS NOT NULL
          AND "resulting_participation_id" IS NOT NULL
          AND "source_participation_version" IS NOT NULL
          AND "resulting_participation_version" IS NOT NULL
          AND "source_tranche_version" IS NOT NULL
          AND "resulting_tranche_version" IS NOT NULL
        )
        OR (
          "event_type" <> 'conversion'
          AND "resulting_participation_id" IS NULL
          AND "source_participation_version" IS NULL
          AND "resulting_participation_version" IS NULL
          AND "source_tranche_version" IS NULL
          AND "resulting_tranche_version" IS NULL
        )
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'position_events_reversal_target_check'
  ) THEN
    ALTER TABLE "position_events"
      ADD CONSTRAINT "position_events_reversal_target_check"
      CHECK (
        ("event_type" = 'reversal' AND "reverses_position_event_id" IS NOT NULL)
        OR ("event_type" <> 'reversal' AND "reverses_position_event_id" IS NULL)
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'position_events_no_self_lineage_check'
  ) THEN
    ALTER TABLE "position_events"
      ADD CONSTRAINT "position_events_no_self_lineage_check"
      CHECK (
        ("replaces_event_id" IS NULL OR "replaces_event_id" <> "id")
        AND ("reverses_position_event_id" IS NULL OR "reverses_position_event_id" <> "id")
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'position_events_idempotency_pair_check'
  ) THEN
    ALTER TABLE "position_events"
      ADD CONSTRAINT "position_events_idempotency_pair_check"
      CHECK (("idempotency_key" IS NULL) = ("request_hash" IS NULL));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'position_events_backfill_investment_unique'
  ) THEN
    ALTER TABLE "position_events"
      ADD CONSTRAINT "position_events_backfill_investment_unique"
      UNIQUE ("backfilled_from_investment_id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'position_events_fund_idempotency_unique'
  ) THEN
    ALTER TABLE "position_events"
      ADD CONSTRAINT "position_events_fund_idempotency_unique"
      UNIQUE ("fund_id", "idempotency_key");
  END IF;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "position_events_acquisition_participation_unique"
  ON "position_events" ("vehicle_participation_id")
  WHERE "event_type" = 'acquisition';
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "position_events_reversal_target_unique"
  ON "position_events" ("reverses_position_event_id")
  WHERE "reverses_position_event_id" IS NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_position_events_scope_effective_recorded"
  ON "position_events" (
    "fund_id",
    "vehicle_id",
    "company_identity_id",
    "effective_date" DESC,
    "recorded_at" DESC
  );
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "position_event_lot_reliefs" (
  "fund_id" integer NOT NULL,
  "position_event_id" integer NOT NULL,
  "investment_id" integer NOT NULL,
  "investment_lot_id" uuid NOT NULL,
  "relieved_shares" numeric(20,6) NOT NULL,
  "relieved_cost_basis" numeric(20,6) NOT NULL,
  "allocated_proceeds" numeric(20,6) NOT NULL
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'position_event_lot_reliefs_event_fund_fk'
  ) THEN
    ALTER TABLE "position_event_lot_reliefs"
      ADD CONSTRAINT "position_event_lot_reliefs_event_fund_fk"
      FOREIGN KEY ("position_event_id", "fund_id")
      REFERENCES "public"."position_events"("id", "fund_id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'position_event_lot_reliefs_investment_fund_fk'
  ) THEN
    ALTER TABLE "position_event_lot_reliefs"
      ADD CONSTRAINT "position_event_lot_reliefs_investment_fund_fk"
      FOREIGN KEY ("investment_id", "fund_id")
      REFERENCES "public"."investments"("id", "fund_id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'position_event_lot_reliefs_lot_investment_fk'
  ) THEN
    ALTER TABLE "position_event_lot_reliefs"
      ADD CONSTRAINT "position_event_lot_reliefs_lot_investment_fk"
      FOREIGN KEY ("investment_lot_id", "investment_id")
      REFERENCES "public"."investment_lots"("id", "investment_id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'position_event_lot_reliefs_event_lot_unique'
  ) THEN
    ALTER TABLE "position_event_lot_reliefs"
      ADD CONSTRAINT "position_event_lot_reliefs_event_lot_unique"
      UNIQUE ("position_event_id", "investment_lot_id");
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_position_event_lot_reliefs_investment"
  ON "position_event_lot_reliefs" ("investment_id", "investment_lot_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ownership_snapshots" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "vehicle_id" integer NOT NULL,
  "company_identity_id" integer NOT NULL,
  "effective_date" date NOT NULL,
  "recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ownership_pct" numeric(12,8) NOT NULL,
  "fd_numerator" numeric(20,6),
  "fd_denominator" numeric(20,6),
  "currency" varchar(3) DEFAULT 'USD' NOT NULL,
  "supersedes_snapshot_id" integer,
  "source_observation_id" integer NOT NULL,
  "created_by" integer,
  "idempotency_key" varchar(128) NOT NULL,
  "request_hash" varchar(64) NOT NULL
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ownership_snapshots_fund_fk') THEN
    ALTER TABLE "ownership_snapshots"
      ADD CONSTRAINT "ownership_snapshots_fund_fk"
      FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ownership_snapshots_id_fund_unique') THEN
    ALTER TABLE "ownership_snapshots"
      ADD CONSTRAINT "ownership_snapshots_id_fund_unique" UNIQUE ("id", "fund_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ownership_snapshots_vehicle_fund_fk') THEN
    ALTER TABLE "ownership_snapshots"
      ADD CONSTRAINT "ownership_snapshots_vehicle_fund_fk"
      FOREIGN KEY ("vehicle_id", "fund_id") REFERENCES "public"."vehicles"("id", "fund_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ownership_snapshots_identity_fund_fk') THEN
    ALTER TABLE "ownership_snapshots"
      ADD CONSTRAINT "ownership_snapshots_identity_fund_fk"
      FOREIGN KEY ("company_identity_id", "fund_id")
      REFERENCES "public"."company_identities"("id", "fund_id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ownership_snapshots_supersedes_fund_fk'
  ) THEN
    ALTER TABLE "ownership_snapshots"
      ADD CONSTRAINT "ownership_snapshots_supersedes_fund_fk"
      FOREIGN KEY ("supersedes_snapshot_id", "fund_id")
      REFERENCES "public"."ownership_snapshots"("id", "fund_id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ownership_snapshots_observation_fund_fk'
  ) THEN
    ALTER TABLE "ownership_snapshots"
      ADD CONSTRAINT "ownership_snapshots_observation_fund_fk"
      FOREIGN KEY ("source_observation_id", "fund_id")
      REFERENCES "public"."source_observations"("id", "fund_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ownership_snapshots_created_by_fk') THEN
    ALTER TABLE "ownership_snapshots"
      ADD CONSTRAINT "ownership_snapshots_created_by_fk"
      FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ownership_snapshots_pct_range_check'
  ) THEN
    ALTER TABLE "ownership_snapshots"
      ADD CONSTRAINT "ownership_snapshots_pct_range_check"
      CHECK ("ownership_pct" >= 0 AND "ownership_pct" <= 100);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ownership_snapshots_fd_pair_check'
  ) THEN
    ALTER TABLE "ownership_snapshots"
      ADD CONSTRAINT "ownership_snapshots_fd_pair_check"
      CHECK (("fd_numerator" IS NULL) = ("fd_denominator" IS NULL));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ownership_snapshots_no_self_supersede_check'
  ) THEN
    ALTER TABLE "ownership_snapshots"
      ADD CONSTRAINT "ownership_snapshots_no_self_supersede_check"
      CHECK ("supersedes_snapshot_id" IS NULL OR "supersedes_snapshot_id" <> "id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ownership_snapshots_fund_idempotency_unique'
  ) THEN
    ALTER TABLE "ownership_snapshots"
      ADD CONSTRAINT "ownership_snapshots_fund_idempotency_unique"
      UNIQUE ("fund_id", "idempotency_key");
  END IF;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "ownership_snapshots_supersedes_unique"
  ON "ownership_snapshots" ("supersedes_snapshot_id")
  WHERE "supersedes_snapshot_id" IS NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_ownership_snapshots_scope_effective_recorded"
  ON "ownership_snapshots" (
    "fund_id",
    "vehicle_id",
    "company_identity_id",
    "effective_date" DESC,
    "recorded_at" DESC
  );
