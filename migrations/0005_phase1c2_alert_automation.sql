-- Phase 1C.2 alert automation alignment
-- Adds the durable scheduling and replay-safety tables/indexes required for
-- calc-run and periodic variance alert evaluation.

CREATE TABLE IF NOT EXISTS "job_outbox" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "job_type" VARCHAR(255) NOT NULL,
  "dedupe_key" TEXT,
  "payload" JSONB NOT NULL,
  "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 3,
  "scheduled_for" TIMESTAMPTZ,
  "processing_at" TIMESTAMPTZ,
  "next_run_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "error_message" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "job_outbox_status_check"
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_job_outbox_claim"
  ON "job_outbox" ("next_run_at" ASC, "created_at" ASC)
  WHERE "status" = 'pending';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_job_outbox_pending_priority"
  ON "job_outbox" ("status", "priority" DESC, "created_at" ASC)
  WHERE "status" = 'pending';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_job_outbox_processing"
  ON "job_outbox" ("processing_at" ASC)
  WHERE "status" = 'processing';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_job_outbox_job_type"
  ON "job_outbox" ("job_type");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_job_outbox_job_type_dedupe"
  ON "job_outbox" ("job_type", "dedupe_key");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "alert_evaluation_executions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "execution_key" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "fund_id" INTEGER NOT NULL,
  "baseline_id" UUID NOT NULL,
  "rule_id" UUID NOT NULL,
  "run_id" INTEGER,
  "frequency" TEXT,
  "window_start" TIMESTAMPTZ,
  "applied_alert_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'alert_evaluation_executions_fund_id_funds_id_fk'
  ) THEN
    ALTER TABLE "alert_evaluation_executions"
      ADD CONSTRAINT "alert_evaluation_executions_fund_id_funds_id_fk"
      FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'alert_evaluation_executions_baseline_id_fund_baselines_id_fk'
  ) THEN
    ALTER TABLE "alert_evaluation_executions"
      ADD CONSTRAINT "alert_evaluation_executions_baseline_id_fund_baselines_id_fk"
      FOREIGN KEY ("baseline_id") REFERENCES "public"."fund_baselines"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'alert_evaluation_executions_rule_id_alert_rules_id_fk'
  ) THEN
    ALTER TABLE "alert_evaluation_executions"
      ADD CONSTRAINT "alert_evaluation_executions_rule_id_alert_rules_id_fk"
      FOREIGN KEY ("rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'alert_evaluation_executions_run_id_calc_runs_id_fk'
  ) THEN
    ALTER TABLE "alert_evaluation_executions"
      ADD CONSTRAINT "alert_evaluation_executions_run_id_calc_runs_id_fk"
      FOREIGN KEY ("run_id") REFERENCES "public"."calc_runs"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'alert_evaluation_executions_applied_alert_id_performance_alerts_id_fk'
  ) THEN
    ALTER TABLE "alert_evaluation_executions"
      ADD CONSTRAINT "alert_evaluation_executions_applied_alert_id_performance_alerts_id_fk"
      FOREIGN KEY ("applied_alert_id") REFERENCES "public"."performance_alerts"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "alert_evaluation_executions_execution_key_unique"
  ON "alert_evaluation_executions" ("execution_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_evaluation_executions_fund_rule_idx"
  ON "alert_evaluation_executions" ("fund_id", "rule_id", "created_at" DESC);
--> statement-breakpoint

WITH ranked_open_incidents AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "fund_id", "baseline_id", "rule_id"
      ORDER BY "triggered_at" DESC NULLS LAST, "created_at" DESC NULLS LAST, "id" DESC
    ) AS "row_num"
  FROM "performance_alerts"
  WHERE "baseline_id" IS NOT NULL
    AND "rule_id" IS NOT NULL
    AND "status" IN ('active', 'acknowledged', 'investigating')
)
UPDATE "performance_alerts"
SET
  "status" = 'resolved',
  "resolution_notes" = COALESCE(
    "resolution_notes",
    'Resolved during migration cleanup before open incident uniqueness enforcement'
  ),
  "resolved_at" = COALESCE("resolved_at", NOW()),
  "updated_at" = NOW()
WHERE "id" IN (
  SELECT "id"
  FROM ranked_open_incidents
  WHERE "row_num" > 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "performance_alerts_open_incident_unique"
  ON "performance_alerts" ("fund_id", "baseline_id", "rule_id")
  WHERE "rule_id" IS NOT NULL
    AND "baseline_id" IS NOT NULL
    AND "status" IN ('active', 'acknowledged', 'investigating');
