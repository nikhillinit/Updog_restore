-- Migration: 0011_scenario_share_sensitivity_drift
-- Purpose: Scenario, share, and sensitivity schema drift; closes journal drift for issue #781.
-- Source of truth: drizzle-kit export from shared/schema.ts, shared/schema-lp-reporting.ts, and shared/schema-lp-sprint3.ts.
-- Replay safety: type guards, CREATE TABLE/INDEX IF NOT EXISTS, and FK constraint guards.

CREATE TABLE IF NOT EXISTS "fund_scenario_set_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scenario_set_id" uuid NOT NULL,
	"fund_id" integer NOT NULL,
	"event_type" varchar(32) NOT NULL,
	"actor_user_id" integer,
	"actor_label" text,
	"change_summary_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fund_scenario_calculation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fund_id" integer NOT NULL,
	"scenario_set_id" uuid NOT NULL,
	"source_config_id" integer NOT NULL,
	"source_config_version" integer NOT NULL,
	"calculation_mode" varchar(48) NOT NULL,
	"override_type" varchar(48) NOT NULL,
	"input_hash" varchar(64) NOT NULL,
	"job_id" text,
	"correlation_id" varchar(36) NOT NULL,
	"status" varchar(24) NOT NULL,
	"snapshot_id" integer,
	"failure_code" varchar(80),
	"failure_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fund_scenario_calculation_runs_status_check" CHECK ("fund_scenario_calculation_runs"."status" IN ('queued', 'running', 'completed', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scenario_matrices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matrix_key" text NOT NULL,
	"fund_id" text NOT NULL,
	"taxonomy_version" text NOT NULL,
	"matrix_type" varchar(50) NOT NULL,
	"moic_matrix" "bytea",
	"scenario_states" jsonb,
	"bucket_params" jsonb,
	"compression_codec" varchar(50),
	"matrix_layout" varchar(50),
	"bucket_count" integer,
	"s_opt" jsonb,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scenario_matrices_matrix_key_unique" UNIQUE("matrix_key"),
	CONSTRAINT "scenario_matrices_complete_payload" CHECK (
        ("scenario_matrices"."status" != 'complete') OR
        (
          "scenario_matrices"."moic_matrix" IS NOT NULL AND
          "scenario_matrices"."scenario_states" IS NOT NULL AND
          "scenario_matrices"."bucket_params" IS NOT NULL AND
          "scenario_matrices"."compression_codec" IS NOT NULL AND
          "scenario_matrices"."matrix_layout" IS NOT NULL AND
          "scenario_matrices"."bucket_count" IS NOT NULL AND
          "scenario_matrices"."s_opt" IS NOT NULL
        )
      )
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "optimization_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matrix_id" uuid NOT NULL,
	"optimization_config" jsonb NOT NULL,
	"pass1_e_star" double precision,
	"primary_lock_epsilon" double precision,
	"result_weights" jsonb,
	"result_metrics" jsonb,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"current_iteration" integer DEFAULT 0,
	"total_iterations" integer,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shares" (
	"id" text PRIMARY KEY NOT NULL,
	"fund_id" text NOT NULL,
	"created_by" text NOT NULL,
	"access_level" text DEFAULT 'view_only' NOT NULL,
	"require_passkey" boolean DEFAULT false NOT NULL,
	"passkey_hash" text,
	"expires_at" timestamp with time zone,
	"hidden_metrics" jsonb DEFAULT '[]'::jsonb,
	"custom_title" text,
	"custom_message" text,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"idempotency_key" text,
	"idempotency_request_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "share_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"share_id" text NOT NULL,
	"fund_id_internal" text NOT NULL,
	"payload_version" text DEFAULT 'public-share-snapshot.v1' NOT NULL,
	"as_of_date" timestamp with time zone NOT NULL,
	"source_calculation_run_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hidden_metric_policy" jsonb NOT NULL,
	"generated_by" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"payload_hash" text NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "share_analytics" (
	"id" text PRIMARY KEY NOT NULL,
	"share_id" text NOT NULL,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"viewer_ip" text,
	"user_agent" text,
	"duration" integer,
	"pages_viewed" jsonb DEFAULT '[]'::jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sensitivity_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"fund_id" integer NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"params" jsonb NOT NULL,
	"results" jsonb,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"error_code" text,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "snapshot_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"parent_version_id" uuid,
	"version_name" varchar(100),
	"is_current" boolean DEFAULT false NOT NULL,
	"state_snapshot" jsonb NOT NULL,
	"calculated_metrics" jsonb,
	"source_hash" varchar(64) NOT NULL,
	"description" text,
	"created_by" uuid,
	"tags" text[],
	"expires_at" timestamp with time zone DEFAULT NOW() + INTERVAL '90 days',
	"is_pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "snapshot_versions_snapshot_id_version_number_unique" UNIQUE("snapshot_id","version_number")
);
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.fund_scenario_set_events') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.fund_scenario_set_events'::regclass
         AND conname = 'fund_scenario_set_events_scenario_set_id_fund_scenario_sets_id_fk'
     ) THEN
    ALTER TABLE "fund_scenario_set_events" ADD CONSTRAINT "fund_scenario_set_events_scenario_set_id_fund_scenario_sets_id_fk" FOREIGN KEY ("scenario_set_id") REFERENCES "public"."fund_scenario_sets"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.fund_scenario_set_events') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.fund_scenario_set_events'::regclass
         AND conname = 'fund_scenario_set_events_fund_id_funds_id_fk'
     ) THEN
    ALTER TABLE "fund_scenario_set_events" ADD CONSTRAINT "fund_scenario_set_events_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.fund_scenario_set_events') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.fund_scenario_set_events'::regclass
         AND conname = 'fund_scenario_set_events_actor_user_id_users_id_fk'
     ) THEN
    ALTER TABLE "fund_scenario_set_events" ADD CONSTRAINT "fund_scenario_set_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.fund_scenario_calculation_runs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.fund_scenario_calculation_runs'::regclass
         AND conname = 'fund_scenario_calculation_runs_fund_id_funds_id_fk'
     ) THEN
    ALTER TABLE "fund_scenario_calculation_runs" ADD CONSTRAINT "fund_scenario_calculation_runs_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.fund_scenario_calculation_runs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.fund_scenario_calculation_runs'::regclass
         AND conname = 'fund_scenario_calculation_runs_scenario_set_id_fund_scenario_sets_id_fk'
     ) THEN
    ALTER TABLE "fund_scenario_calculation_runs" ADD CONSTRAINT "fund_scenario_calculation_runs_scenario_set_id_fund_scenario_sets_id_fk" FOREIGN KEY ("scenario_set_id") REFERENCES "public"."fund_scenario_sets"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.fund_scenario_calculation_runs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.fund_scenario_calculation_runs'::regclass
         AND conname = 'fund_scenario_calculation_runs_source_config_id_fundconfigs_id_fk'
     ) THEN
    ALTER TABLE "fund_scenario_calculation_runs" ADD CONSTRAINT "fund_scenario_calculation_runs_source_config_id_fundconfigs_id_fk" FOREIGN KEY ("source_config_id") REFERENCES "public"."fundconfigs"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.fund_scenario_calculation_runs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.fund_scenario_calculation_runs'::regclass
         AND conname = 'fund_scenario_calculation_runs_snapshot_id_fund_snapshots_id_fk'
     ) THEN
    ALTER TABLE "fund_scenario_calculation_runs" ADD CONSTRAINT "fund_scenario_calculation_runs_snapshot_id_fund_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."fund_snapshots"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.optimization_sessions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.optimization_sessions'::regclass
         AND conname = 'optimization_sessions_matrix_id_scenario_matrices_id_fk'
     ) THEN
    ALTER TABLE "optimization_sessions" ADD CONSTRAINT "optimization_sessions_matrix_id_scenario_matrices_id_fk" FOREIGN KEY ("matrix_id") REFERENCES "public"."scenario_matrices"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.share_snapshots') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.share_snapshots'::regclass
         AND conname = 'share_snapshots_share_id_shares_id_fk'
     ) THEN
    ALTER TABLE "share_snapshots" ADD CONSTRAINT "share_snapshots_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.share_analytics') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.share_analytics'::regclass
         AND conname = 'share_analytics_share_id_shares_id_fk'
     ) THEN
    ALTER TABLE "share_analytics" ADD CONSTRAINT "share_analytics_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.sensitivity_runs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.sensitivity_runs'::regclass
         AND conname = 'sensitivity_runs_fund_id_funds_id_fk'
     ) THEN
    ALTER TABLE "sensitivity_runs" ADD CONSTRAINT "sensitivity_runs_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.snapshot_versions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.snapshot_versions'::regclass
         AND conname = 'snapshot_versions_snapshot_id_forecast_snapshots_id_fk'
     ) THEN
    ALTER TABLE "snapshot_versions" ADD CONSTRAINT "snapshot_versions_snapshot_id_forecast_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."forecast_snapshots"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.snapshot_versions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.snapshot_versions'::regclass
         AND conname = 'snapshot_versions_parent_version_id_snapshot_versions_id_fk'
     ) THEN
    ALTER TABLE "snapshot_versions" ADD CONSTRAINT "snapshot_versions_parent_version_id_snapshot_versions_id_fk" FOREIGN KEY ("parent_version_id") REFERENCES "public"."snapshot_versions"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fund_scenario_set_events_scenario_created_idx" ON "fund_scenario_set_events" USING btree ("scenario_set_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fund_scenario_set_events_fund_created_idx" ON "fund_scenario_set_events" USING btree ("fund_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fund_scenario_calc_runs_lookup_idx" ON "fund_scenario_calculation_runs" USING btree ("fund_id","scenario_set_id","created_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fund_scenario_calc_runs_active_dedup_idx" ON "fund_scenario_calculation_runs" USING btree ("scenario_set_id","source_config_id","source_config_version","input_hash") WHERE "fund_scenario_calculation_runs"."status" IN ('queued', 'running', 'completed');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scenario_matrices_fund_tax_status" ON "scenario_matrices" USING btree ("fund_id","taxonomy_version","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scenario_matrices_matrix_key" ON "scenario_matrices" USING btree ("matrix_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scenario_matrices_status" ON "scenario_matrices" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_optimization_sessions_matrix" ON "optimization_sessions" USING btree ("matrix_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_optimization_sessions_status" ON "optimization_sessions" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_optimization_sessions_created" ON "optimization_sessions" USING btree ("created_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shares_fund_id_idx" ON "shares" USING btree ("fund_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shares_created_by_idx" ON "shares" USING btree ("created_by");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shares_active_idx" ON "shares" USING btree ("is_active");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shares_creator_idempotency_key_idx" ON "shares" USING btree ("created_by","idempotency_key") WHERE "shares"."idempotency_key" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "share_snapshots_share_generated_idx" ON "share_snapshots" USING btree ("share_id","generated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "share_snapshots_payload_hash_idx" ON "share_snapshots" USING btree ("payload_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "share_analytics_share_id_idx" ON "share_analytics" USING btree ("share_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "share_analytics_viewed_at_idx" ON "share_analytics" USING btree ("viewed_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sensitivity_runs_fund_created_idx" ON "sensitivity_runs" USING btree ("fund_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sensitivity_runs_fund_kind_created_idx" ON "sensitivity_runs" USING btree ("fund_id","kind","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_snapshot_versions_snapshot_id" ON "snapshot_versions" USING btree ("snapshot_id","version_number" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_snapshot_versions_current" ON "snapshot_versions" USING btree ("snapshot_id") WHERE "snapshot_versions"."is_current" = true;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_snapshot_versions_parent" ON "snapshot_versions" USING btree ("parent_version_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_snapshot_versions_source_hash" ON "snapshot_versions" USING btree ("source_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_snapshot_versions_expires" ON "snapshot_versions" USING btree ("expires_at") WHERE "snapshot_versions"."is_pinned" = false;
