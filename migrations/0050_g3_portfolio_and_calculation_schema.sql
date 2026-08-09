-- @drift-patch
-- Reason: F_1.2.5 Phase 2 schema layer adds portfolio optimistic concurrency,
-- durable portfolio update receipts, and the nullable async calculation deadline.
-- Additive and replay-safe. Drizzle owns the surrounding transaction.

ALTER TABLE "portfoliocompanies"
  ADD COLUMN IF NOT EXISTS "row_version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "portfoliocompanies"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "fund_scenario_calculation_runs"
  ADD COLUMN IF NOT EXISTS "deadline_at" timestamp with time zone;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "portfolio_company_update_receipts" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "company_id" integer NOT NULL,
  "actor_id" integer NOT NULL,
  "idempotency_key" varchar(128) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "response_name" varchar(255) NOT NULL,
  "response_sector" varchar(255) NOT NULL,
  "response_founded_year" integer,
  "response_description" varchar(2000),
  "response_deal_tags" jsonb,
  "response_status" integer NOT NULL,
  "response_row_version" integer NOT NULL,
  "response_updated_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "portfolio_company_update_receipts_fund_id_funds_id_fk"
    FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE cascade,
  CONSTRAINT "portfolio_company_update_receipts_company_fund_fk"
    FOREIGN KEY ("company_id", "fund_id")
    REFERENCES "portfoliocompanies"("id", "fund_id") ON DELETE cascade,
  CONSTRAINT "portfolio_company_update_receipts_actor_id_users_id_fk"
    FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE restrict,
  CONSTRAINT "portfolio_company_update_receipts_scope_unique"
    UNIQUE ("fund_id", "company_id", "actor_id", "idempotency_key")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "portfolio_company_update_receipts_fund_company_created_idx"
  ON "portfolio_company_update_receipts" ("fund_id", "company_id", "created_at" DESC);
