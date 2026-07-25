-- @drift-patch
-- Reason: Task 10 (#1174) — vehicle financing participations, compat
-- lineage pointers, and replay guards for ledger-derived rows.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_id_fund_unique'
  ) THEN
    ALTER TABLE "vehicles"
      ADD CONSTRAINT "vehicles_id_fund_unique" UNIQUE ("id", "fund_id");
  END IF;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "vehicle_financing_participations" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "vehicle_id" integer NOT NULL,
  "financing_event_id" integer NOT NULL,
  "tranche_key" text NOT NULL,
  "financing_tranche_id" integer NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "superseded_by_participation_id" integer,
  "participation_amount" numeric(20,6) NOT NULL,
  "original_amount" numeric(20,6),
  "currency" varchar(3) DEFAULT 'USD' NOT NULL,
  "fx_rate_to_usd" numeric(20,10),
  "fx_rate_date" date,
  "shares_acquired" numeric(18,8),
  "closing_date" date,
  "price_per_share" numeric(20,6),
  "post_money_valuation" numeric(20,6),
  "valuation_cap" numeric(20,6),
  "conversion_discount_rate" numeric(12,8),
  "interest_rate" numeric(12,8),
  "liquidation_preference_multiple" numeric(12,8),
  "participation_cap_multiple" numeric(12,8),
  "pro_rata_rights_pct" numeric(12,8),
  "participating_preferred" boolean,
  "maturity_date" date,
  "descriptive_terms" jsonb,
  "confirmed_duplicates" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "source_observation_id" integer,
  "created_by" integer,
  "idempotency_key" varchar(128) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vfp_fund_id_funds_id_fk"
    FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade,
  CONSTRAINT "vfp_version_positive_check"
    CHECK ("version" >= 1),
  CONSTRAINT "vfp_amount_positive_check"
    CHECK ("participation_amount" > 0),
  CONSTRAINT "vfp_fx_rate_positive_check"
    CHECK ("fx_rate_to_usd" IS NULL OR "fx_rate_to_usd" > 0),
  CONSTRAINT "vfp_no_self_supersede_check"
    CHECK ("superseded_by_participation_id" IS NULL OR "superseded_by_participation_id" <> "id"),
  CONSTRAINT "vfp_usd_fx_check"
    CHECK ("currency" <> 'USD' OR "fx_rate_to_usd" IS NULL OR "fx_rate_to_usd" = 1.0000000000),
  CONSTRAINT "vfp_id_fund_unique"
    UNIQUE ("id", "fund_id"),
  CONSTRAINT "vfp_fund_idem_unique"
    UNIQUE ("fund_id", "idempotency_key"),
  CONSTRAINT "vfp_key_version_unique"
    UNIQUE ("fund_id", "vehicle_id", "financing_event_id", "tranche_key", "version")
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vfp_vehicle_fund_fk') THEN
    ALTER TABLE "vehicle_financing_participations"
      ADD CONSTRAINT "vfp_vehicle_fund_fk"
      FOREIGN KEY ("vehicle_id", "fund_id")
      REFERENCES "public"."vehicles"("id", "fund_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vfp_tranche_fund_fk') THEN
    ALTER TABLE "vehicle_financing_participations"
      ADD CONSTRAINT "vfp_tranche_fund_fk"
      FOREIGN KEY ("financing_tranche_id", "fund_id")
      REFERENCES "public"."financing_tranches"("id", "fund_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vfp_superseded_fund_fk') THEN
    ALTER TABLE "vehicle_financing_participations"
      ADD CONSTRAINT "vfp_superseded_fund_fk"
      FOREIGN KEY ("superseded_by_participation_id", "fund_id")
      REFERENCES "public"."vehicle_financing_participations"("id", "fund_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vfp_observation_fund_fk') THEN
    ALTER TABLE "vehicle_financing_participations"
      ADD CONSTRAINT "vfp_observation_fund_fk"
      FOREIGN KEY ("source_observation_id", "fund_id")
      REFERENCES "public"."source_observations"("id", "fund_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vfp_created_by_fk') THEN
    ALTER TABLE "vehicle_financing_participations"
      ADD CONSTRAINT "vfp_created_by_fk"
      FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vfp_id_fund_unique') THEN
    ALTER TABLE "vehicle_financing_participations"
      ADD CONSTRAINT "vfp_id_fund_unique" UNIQUE ("id", "fund_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vfp_fund_idem_unique') THEN
    ALTER TABLE "vehicle_financing_participations"
      ADD CONSTRAINT "vfp_fund_idem_unique" UNIQUE ("fund_id", "idempotency_key");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vfp_key_version_unique') THEN
    ALTER TABLE "vehicle_financing_participations"
      ADD CONSTRAINT "vfp_key_version_unique"
      UNIQUE ("fund_id", "vehicle_id", "financing_event_id", "tranche_key", "version");
  END IF;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "vfp_head_unique"
  ON "vehicle_financing_participations"
    ("fund_id", "vehicle_id", "financing_event_id", "tranche_key")
  WHERE "superseded_by_participation_id" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vfp_fund_vehicle"
  ON "vehicle_financing_participations" ("fund_id", "vehicle_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vfp_fund_tranche"
  ON "vehicle_financing_participations" ("fund_id", "financing_tranche_id");
--> statement-breakpoint

ALTER TABLE "investments"
  ADD COLUMN IF NOT EXISTS "imported_from" text,
  ADD COLUMN IF NOT EXISTS "vehicle_participation_id" integer;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'investments_vfp_fund_fk') THEN
    ALTER TABLE "investments"
      ADD CONSTRAINT "investments_vfp_fund_fk"
      FOREIGN KEY ("vehicle_participation_id", "fund_id")
      REFERENCES "public"."vehicle_financing_participations"("id", "fund_id");
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "investments_vfp_unique"
  ON "investments" ("vehicle_participation_id")
  WHERE "vehicle_participation_id" IS NOT NULL;
--> statement-breakpoint

ALTER TABLE "investment_rounds"
  ADD COLUMN IF NOT EXISTS "imported_from" varchar(32),
  ADD COLUMN IF NOT EXISTS "vehicle_participation_id" integer,
  ADD COLUMN IF NOT EXISTS "financing_tranche_id" integer;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'investment_rounds_vfp_fund_fk') THEN
    ALTER TABLE "investment_rounds"
      ADD CONSTRAINT "investment_rounds_vfp_fund_fk"
      FOREIGN KEY ("vehicle_participation_id", "fund_id")
      REFERENCES "public"."vehicle_financing_participations"("id", "fund_id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'investment_rounds_financing_tranche_fund_fk'
  ) THEN
    ALTER TABLE "investment_rounds"
      ADD CONSTRAINT "investment_rounds_financing_tranche_fund_fk"
      FOREIGN KEY ("financing_tranche_id", "fund_id")
      REFERENCES "public"."financing_tranches"("id", "fund_id");
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "investment_lots"
  ADD COLUMN IF NOT EXISTS "imported_from" text,
  ADD COLUMN IF NOT EXISTS "vehicle_participation_id" integer;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'investment_lots_vfp_fk') THEN
    ALTER TABLE "investment_lots"
      ADD CONSTRAINT "investment_lots_vfp_fk"
      FOREIGN KEY ("vehicle_participation_id")
      REFERENCES "public"."vehicle_financing_participations"("id");
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "cash_flow_events"
  ADD COLUMN IF NOT EXISTS "vehicle_participation_id" integer;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_flow_events_vfp_fund_fk') THEN
    ALTER TABLE "cash_flow_events"
      ADD CONSTRAINT "cash_flow_events_vfp_fund_fk"
      FOREIGN KEY ("vehicle_participation_id", "fund_id")
      REFERENCES "public"."vehicle_financing_participations"("id", "fund_id");
  END IF;
END $$;
