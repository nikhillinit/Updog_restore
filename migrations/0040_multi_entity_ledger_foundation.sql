-- @drift-patch
-- Reason: Task 9 (D10/D24/D25) — canonical financing events, immutable
-- versioned tranches, and manual-observation lineage.

CREATE TABLE IF NOT EXISTS "financing_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "company_identity_id" integer NOT NULL,
  "event_key" text NOT NULL,
  "round_name" text NOT NULL,
  "security_type" text NOT NULL,
  "event_date" date NOT NULL,
  "currency" varchar(3) DEFAULT 'USD' NOT NULL,
  "round_size" numeric(20,6),
  "pre_money_valuation" numeric(20,6),
  "post_money_valuation" numeric(20,6),
  "price_per_share" numeric(20,6),
  "created_by" integer,
  "idempotency_key" varchar(128) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "financing_events_fund_id_funds_id_fk"
    FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade,
  CONSTRAINT "financing_events_identity_fund_fk"
    FOREIGN KEY ("company_identity_id", "fund_id")
    REFERENCES "public"."company_identities"("id", "fund_id"),
  CONSTRAINT "financing_events_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id"),
  CONSTRAINT "financing_events_security_type_check"
    CHECK ("security_type" IN ('equity','safe','convertible_note','other')),
  CONSTRAINT "financing_events_id_fund_unique"
    UNIQUE ("id", "fund_id"),
  CONSTRAINT "financing_events_fund_idempotency_unique"
    UNIQUE ("fund_id", "idempotency_key"),
  CONSTRAINT "financing_events_identity_event_key_unique"
    UNIQUE ("fund_id", "company_identity_id", "event_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_financing_events_fund_event_date"
  ON "financing_events" ("fund_id", "event_date" DESC);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "financing_tranches" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "financing_event_id" integer NOT NULL,
  "tranche_key" text NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "superseded_by_tranche_id" integer,
  "closing_date" date NOT NULL,
  "security_type" text NOT NULL,
  "investment_amount" numeric(20,6) NOT NULL,
  "original_amount" numeric(20,6) NOT NULL,
  "currency" varchar(3) DEFAULT 'USD' NOT NULL,
  "fx_rate_to_usd" numeric(20,10) NOT NULL,
  "fx_rate_date" date NOT NULL,
  "price_per_share" numeric(20,6),
  "post_money_valuation" numeric(20,6),
  "valuation_cap" numeric(20,6),
  "conversion_discount_rate" numeric(12,8),
  "interest_rate" numeric(12,8),
  "maturity_date" date,
  "liquidation_preference_multiple" numeric(12,8),
  "participating_preferred" boolean,
  "participation_cap_multiple" numeric(12,8),
  "pro_rata_rights_pct" numeric(12,8),
  "descriptive_terms" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "calculation_eligible" boolean DEFAULT true NOT NULL,
  "source_observation_id" integer,
  "created_by" integer,
  "idempotency_key" varchar(128) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "financing_tranches_fund_id_funds_id_fk"
    FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade,
  CONSTRAINT "financing_tranches_event_fund_fk"
    FOREIGN KEY ("financing_event_id", "fund_id")
    REFERENCES "public"."financing_events"("id", "fund_id"),
  CONSTRAINT "financing_tranches_superseded_fund_fk"
    FOREIGN KEY ("superseded_by_tranche_id", "fund_id")
    REFERENCES "public"."financing_tranches"("id", "fund_id"),
  CONSTRAINT "financing_tranches_observation_fund_fk"
    FOREIGN KEY ("source_observation_id", "fund_id")
    REFERENCES "public"."source_observations"("id", "fund_id"),
  CONSTRAINT "financing_tranches_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id"),
  CONSTRAINT "financing_tranches_security_type_check"
    CHECK ("security_type" IN ('equity','safe','convertible_note','other')),
  CONSTRAINT "financing_tranches_version_positive_check"
    CHECK ("version" >= 1),
  CONSTRAINT "financing_tranches_amount_positive_check"
    CHECK ("investment_amount" > 0 AND "original_amount" > 0),
  CONSTRAINT "financing_tranches_fx_rate_positive_check"
    CHECK ("fx_rate_to_usd" > 0),
  CONSTRAINT "financing_tranches_no_self_supersede_check"
    CHECK ("superseded_by_tranche_id" IS NULL OR "superseded_by_tranche_id" <> "id"),
  CONSTRAINT "financing_tranches_usd_fx_check"
    CHECK ("currency" <> 'USD' OR "fx_rate_to_usd" = 1),
  CONSTRAINT "financing_tranches_equity_terms_check"
    CHECK ("security_type" <> 'equity'
      OR "price_per_share" IS NOT NULL
      OR "post_money_valuation" IS NOT NULL),
  CONSTRAINT "financing_tranches_safe_terms_check"
    CHECK ("security_type" <> 'safe'
      OR (("valuation_cap" IS NOT NULL OR "conversion_discount_rate" IS NOT NULL)
        AND "liquidation_preference_multiple" IS NULL
        AND "participating_preferred" IS NULL)),
  CONSTRAINT "financing_tranches_note_terms_check"
    CHECK ("security_type" <> 'convertible_note'
      OR ("interest_rate" IS NOT NULL AND "maturity_date" IS NOT NULL)),
  CONSTRAINT "financing_tranches_id_fund_unique"
    UNIQUE ("id", "fund_id"),
  CONSTRAINT "financing_tranches_fund_idempotency_unique"
    UNIQUE ("fund_id", "idempotency_key"),
  CONSTRAINT "financing_tranches_event_key_version_unique"
    UNIQUE ("fund_id", "financing_event_id", "tranche_key", "version")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "financing_tranches_head_unique"
  ON "financing_tranches" ("fund_id", "financing_event_id", "tranche_key")
  WHERE "superseded_by_tranche_id" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_financing_tranches_fund_event"
  ON "financing_tranches" ("fund_id", "financing_event_id");
