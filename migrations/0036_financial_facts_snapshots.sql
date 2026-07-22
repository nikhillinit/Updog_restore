-- @drift-patch
-- Reason: canonical immutable financial-facts snapshots (policy 1.0.0) per PLAN_61 Task 7.

CREATE TABLE IF NOT EXISTS "financial_facts_snapshots" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "policy_version" text NOT NULL,
  "payload_schema_id" text NOT NULL,
  "as_of_date" date NOT NULL,
  "knowledge_cutoff" timestamp with time zone NOT NULL,
  "vehicle_scope" varchar(16) NOT NULL,
  "vehicle_ids" jsonb NOT NULL,
  "selection_set_hash" text NOT NULL,
  "source_facts_input_hash" text NOT NULL,
  "snapshot_input_hash" text NOT NULL,
  "payload" jsonb NOT NULL,
  "consumer_evaluations" jsonb NOT NULL,
  "actor_id" integer,
  "idempotency_key" varchar(128) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "financial_facts_snapshots_fund_idempotency_unique"
    UNIQUE ("fund_id", "idempotency_key"),
  CONSTRAINT "financial_facts_snapshots_fund_identity_unique"
    UNIQUE ("fund_id", "snapshot_input_hash"),
  CONSTRAINT "financial_facts_snapshots_vehicle_scope_check"
    CHECK ("vehicle_scope" IN ('fund_all')),
  CONSTRAINT "financial_facts_snapshots_fund_id_funds_id_fk"
    FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_financial_facts_snapshots_fund_created"
  ON "financial_facts_snapshots" ("fund_id", "created_at" DESC);
