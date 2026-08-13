-- @drift-patch
-- Reason: G3 release-gate precursor adds the durable calculation command ledger,
-- exactly-once queued-event marker, workflow execution identity, and complete
-- canary residue accounting. Additive and replay-safe; Drizzle owns transaction.

CREATE TABLE IF NOT EXISTS "fund_scenario_calculation_commands" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "fund_id" integer NOT NULL,
  "scenario_set_id" uuid NOT NULL,
  "idempotency_key" varchar(128) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  "run_id" uuid,
  "correlation_id" varchar(36),
  "response_status" integer,
  "response_body" jsonb,
  "attempt_count" integer DEFAULT 1 NOT NULL,
  "lease_token" uuid,
  "lease_expires_at" timestamp with time zone,
  "failure_code" varchar(80),
  "created_by_user_id" integer,
  "created_by_label" text NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "fund_scenario_calculation_commands_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fund_scenario_calculation_commands_fund_id_funds_id_fk"
    FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE cascade,
  CONSTRAINT "fund_scenario_calculation_commands_scenario_set_id_fund_scenario_sets_id_fk"
    FOREIGN KEY ("scenario_set_id") REFERENCES "fund_scenario_sets"("id") ON DELETE cascade,
  CONSTRAINT "fund_scenario_calculation_commands_run_id_fund_scenario_calculation_runs_id_fk"
    FOREIGN KEY ("run_id") REFERENCES "fund_scenario_calculation_runs"("id") ON DELETE cascade,
  CONSTRAINT "fund_scenario_calculation_commands_created_by_user_id_users_id_fk"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE restrict,
  CONSTRAINT "fund_scenario_calc_commands_scope_unique"
    UNIQUE ("fund_id", "scenario_set_id", "idempotency_key"),
  CONSTRAINT "fund_scenario_calc_commands_status_check"
    CHECK ("status" IN ('pending', 'completed', 'failed')),
  CONSTRAINT "fund_scenario_calc_commands_hash_check"
    CHECK ("request_hash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "fund_scenario_calc_commands_response_check"
    CHECK (
      (
        "status" = 'completed'
        AND "run_id" IS NOT NULL
        AND "correlation_id" IS NOT NULL
        AND "response_status" IS NOT DISTINCT FROM 202
        AND "response_body" IS NOT NULL
        AND jsonb_typeof("response_body") = 'object'
        AND "response_body" ?& ARRAY[
          'fundId', 'scenarioSetId', 'calculationMode', 'status', 'jobId', 'correlationId'
        ]
        AND "response_body"->>'calculationMode' IS NOT DISTINCT FROM 'async_reserve_allocation'
        AND "response_body"->>'status' IS NOT DISTINCT FROM 'queued'
        AND "failure_code" IS NULL
        AND "lease_token" IS NULL
        AND "lease_expires_at" IS NULL
      )
      OR (
        "status" = 'pending'
        AND "response_status" IS NULL
        AND "response_body" IS NULL
        AND "failure_code" IS NULL
        AND (
          ("run_id" IS NULL AND "correlation_id" IS NULL)
          OR ("run_id" IS NOT NULL AND "correlation_id" IS NOT NULL)
        )
      )
      OR (
        "status" = 'failed'
        AND "response_status" IS NULL
        AND "response_body" IS NULL
        AND "failure_code" IS NOT NULL
        AND (
          ("run_id" IS NULL AND "correlation_id" IS NULL)
          OR ("run_id" IS NOT NULL AND "correlation_id" IS NOT NULL)
        )
        AND "lease_token" IS NULL
        AND "lease_expires_at" IS NULL
      )
    ),
  CONSTRAINT "fund_scenario_calc_commands_lease_check"
    CHECK (
      ("lease_token" IS NULL AND "lease_expires_at" IS NULL)
      OR ("lease_token" IS NOT NULL AND "lease_expires_at" IS NOT NULL)
    ),
  CONSTRAINT "fund_scenario_calc_commands_attempt_check"
    CHECK ("attempt_count" >= 1),
  CONSTRAINT "fund_scenario_calc_commands_version_check"
    CHECK ("version" >= 1)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "fund_scenario_calc_commands_status_idx"
  ON "fund_scenario_calculation_commands" ("status", "lease_expires_at");
--> statement-breakpoint

ALTER TABLE "fund_scenario_calculation_runs"
  ADD COLUMN IF NOT EXISTS "queued_event_recorded_at" timestamp with time zone;
--> statement-breakpoint

UPDATE "fund_scenario_calculation_runs" AS run
SET "queued_event_recorded_at" = (
  SELECT event."created_at"
  FROM "fund_scenario_set_events" AS event
  WHERE event."fund_id" = run."fund_id"
    AND event."scenario_set_id" = run."scenario_set_id"
    AND event."event_type" = 'calculation_queued'
    AND event."change_summary_json"->>'correlation_id' = run."correlation_id"
  ORDER BY event."created_at" ASC, event."id" ASC
  LIMIT 1
)
WHERE run."queued_event_recorded_at" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "fund_scenario_set_events" AS event
    WHERE event."fund_id" = run."fund_id"
      AND event."scenario_set_id" = run."scenario_set_id"
      AND event."event_type" = 'calculation_queued'
      AND event."change_summary_json"->>'correlation_id' = run."correlation_id"
  );
--> statement-breakpoint

ALTER TABLE "release_canary_runs"
  ADD COLUMN IF NOT EXISTS "workflow_run_id" varchar(32);
--> statement-breakpoint
ALTER TABLE "release_canary_runs"
  ADD COLUMN IF NOT EXISTS "workflow_run_attempt" integer;
--> statement-breakpoint
ALTER TABLE "release_canary_runs"
  ADD COLUMN IF NOT EXISTS "grant_residue_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "release_canary_runs"
  ADD COLUMN IF NOT EXISTS "calculation_residue_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "release_canary_runs"
  ADD COLUMN IF NOT EXISTS "mutation_receipt_residue_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "release_canary_runs"
  ADD COLUMN IF NOT EXISTS "scenario_residue_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "release_canary_runs"
  ADD COLUMN IF NOT EXISTS "reporting_residue_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.release_canary_runs'::regclass
      AND conname = 'release_canary_runs_workflow_identity_check'
  ) THEN
    ALTER TABLE "release_canary_runs"
      ADD CONSTRAINT "release_canary_runs_workflow_identity_check"
      CHECK (
        (
          "workflow_run_id" IS NULL
          AND "workflow_run_attempt" IS NULL
        )
        OR (
          "workflow_run_id" IS NOT NULL
          AND "workflow_run_attempt" IS NOT NULL
          AND "workflow_run_id" ~ '^[1-9][0-9]{0,31}$'
          AND "workflow_run_attempt" >= 1
        )
      );
  END IF;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "release_canary_runs_workflow_identity_unique"
  ON "release_canary_runs" ("workflow_run_id", "workflow_run_attempt")
  WHERE "workflow_run_id" IS NOT NULL;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.release_canary_runs'::regclass
      AND conname = 'release_canary_runs_residue_count_check'
  ) THEN
    ALTER TABLE "release_canary_runs"
      DROP CONSTRAINT "release_canary_runs_residue_count_check";
  END IF;

  ALTER TABLE "release_canary_runs"
    ADD CONSTRAINT "release_canary_runs_residue_count_check"
    CHECK (
      "portfolio_company_residue_count" >= 0
      AND "fund_residue_count" >= 0
      AND "fund_config_residue_count" >= 0
      AND "fund_event_residue_count" >= 0
      AND "notification_residue_count" >= 0
      AND "grant_residue_count" >= 0
      AND "calculation_residue_count" >= 0
      AND "mutation_receipt_residue_count" >= 0
      AND "scenario_residue_count" >= 0
      AND "reporting_residue_count" >= 0
      AND "total_residue_count" = (
        "portfolio_company_residue_count"
        + "fund_residue_count"
        + "fund_config_residue_count"
        + "fund_event_residue_count"
        + "notification_residue_count"
        + "grant_residue_count"
        + "calculation_residue_count"
        + "mutation_receipt_residue_count"
        + "scenario_residue_count"
        + "reporting_residue_count"
      )
    );
END $$;
