-- @drift-patch
-- Reason: add a durable fund-scoped ledger for atomic company scenario creation and replay.

CREATE TABLE IF NOT EXISTS "company_scenario_create_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "company_id" integer NOT NULL,
  "scenario_id" uuid,
  "idempotency_key" varchar(128) NOT NULL,
  "request_hash" char(64) NOT NULL,
  "created_by" integer,
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  "response_status" integer,
  "response_body" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "company_scenario_create_requests_fund_idempotency_key_unique"
    UNIQUE ("fund_id", "idempotency_key"),
  CONSTRAINT "company_scenario_create_requests_status_check"
    CHECK ("status" IN ('pending', 'completed')),
  CONSTRAINT "company_scenario_create_requests_fund_id_funds_id_fk"
    FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade,
  CONSTRAINT "company_scenario_create_requests_company_id_portfoliocompanies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "public"."portfoliocompanies"("id") ON DELETE cascade,
  CONSTRAINT "company_scenario_create_requests_scenario_id_scenarios_id_fk"
    FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE set null,
  CONSTRAINT "company_scenario_create_requests_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_scenario_create_requests_company_idx"
  ON "company_scenario_create_requests" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_scenario_create_requests_scenario_idx"
  ON "company_scenario_create_requests" ("scenario_id");
