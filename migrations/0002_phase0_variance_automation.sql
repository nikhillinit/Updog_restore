-- Phase 0 variance automation alignment
-- Brings the root Drizzle migration stream closer to the schema used by the
-- calc-run completion and variance-tracking services.

CREATE TABLE IF NOT EXISTS "calc_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"fund_id" integer NOT NULL,
	"config_id" integer NOT NULL,
	"config_version" integer NOT NULL,
	"correlation_id" varchar(36) NOT NULL,
	"engines" jsonb NOT NULL,
	"dispatch_state" varchar(20) NOT NULL,
	"requested_at" timestamp NOT NULL,
	"dispatched_at" timestamp,
	"completed_at" timestamp,
	"failed_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "calc_runs_correlation_id_unique" UNIQUE("correlation_id")
);
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'calc_runs_fund_id_funds_id_fk'
	) THEN
		ALTER TABLE "calc_runs" ADD CONSTRAINT "calc_runs_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;
	END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'calc_runs_config_id_fundconfigs_id_fk'
	) THEN
		ALTER TABLE "calc_runs" ADD CONSTRAINT "calc_runs_config_id_fundconfigs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."fundconfigs"("id") ON DELETE no action ON UPDATE no action;
	END IF;
END
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calc_runs_fund_id_idx" ON "calc_runs" USING btree ("fund_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calc_runs_config_id_idx" ON "calc_runs" USING btree ("config_id");
--> statement-breakpoint

ALTER TABLE "fund_snapshots" ADD COLUMN IF NOT EXISTS "run_id" integer;
--> statement-breakpoint
ALTER TABLE "fund_snapshots" ADD COLUMN IF NOT EXISTS "config_id" integer;
--> statement-breakpoint
ALTER TABLE "fund_snapshots" ADD COLUMN IF NOT EXISTS "config_version" integer;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'fund_snapshots_run_id_calc_runs_id_fk'
	) THEN
		ALTER TABLE "fund_snapshots" ADD CONSTRAINT "fund_snapshots_run_id_calc_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."calc_runs"("id") ON DELETE no action ON UPDATE no action;
	END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'fund_snapshots_config_id_fundconfigs_id_fk'
	) THEN
		ALTER TABLE "fund_snapshots" ADD CONSTRAINT "fund_snapshots_config_id_fundconfigs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."fundconfigs"("id") ON DELETE no action ON UPDATE no action;
	END IF;
END
$$;
--> statement-breakpoint

ALTER TABLE "fund_metrics" ADD COLUMN IF NOT EXISTS "run_id" integer;
--> statement-breakpoint
ALTER TABLE "fund_metrics" ADD COLUMN IF NOT EXISTS "config_id" integer;
--> statement-breakpoint
ALTER TABLE "fund_metrics" ADD COLUMN IF NOT EXISTS "config_version" integer;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'fund_metrics_run_id_calc_runs_id_fk'
	) THEN
		ALTER TABLE "fund_metrics" ADD CONSTRAINT "fund_metrics_run_id_calc_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."calc_runs"("id") ON DELETE no action ON UPDATE no action;
	END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'fund_metrics_config_id_fundconfigs_id_fk'
	) THEN
		ALTER TABLE "fund_metrics" ADD CONSTRAINT "fund_metrics_config_id_fundconfigs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."fundconfigs"("id") ON DELETE no action ON UPDATE no action;
	END IF;
END
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fund_metrics_fund_metric_date_idx" ON "fund_metrics" USING btree ("fund_id","metric_date" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fund_metrics_run_lookup_idx" ON "fund_metrics" USING btree ("fund_id","run_id","metric_date" DESC NULLS LAST);
--> statement-breakpoint
WITH ranked_run_metrics AS (
	SELECT
		"id",
		ROW_NUMBER() OVER (
			PARTITION BY "fund_id", "run_id"
			ORDER BY "metric_date" DESC NULLS LAST, "id" DESC
		) AS "row_num"
	FROM "fund_metrics"
	WHERE "run_id" IS NOT NULL
)
UPDATE "fund_metrics"
SET
	"run_id" = NULL,
	"config_id" = NULL,
	"config_version" = NULL
WHERE "id" IN (
	SELECT "id" FROM ranked_run_metrics WHERE "row_num" > 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fund_metrics_run_unique" ON "fund_metrics" USING btree ("fund_id","run_id") WHERE ("run_id" IS NOT NULL);
--> statement-breakpoint

ALTER TABLE "fund_baselines" ADD COLUMN IF NOT EXISTS "source_run_id" integer;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'fund_baselines_source_run_id_calc_runs_id_fk'
	) THEN
		ALTER TABLE "fund_baselines" ADD CONSTRAINT "fund_baselines_source_run_id_calc_runs_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."calc_runs"("id") ON DELETE no action ON UPDATE no action;
	END IF;
END
$$;
--> statement-breakpoint
WITH ranked_defaults AS (
	SELECT
		"id",
		ROW_NUMBER() OVER (
			PARTITION BY "fund_id"
			ORDER BY "created_at" DESC NULLS LAST, "id" DESC
		) AS "row_num"
	FROM "fund_baselines"
	WHERE "is_default" = true AND "is_active" = true
)
UPDATE "fund_baselines"
SET "is_default" = false
WHERE "id" IN (
	SELECT "id" FROM ranked_defaults WHERE "row_num" > 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fund_baselines_default_unique" ON "fund_baselines" USING btree ("fund_id") WHERE (("is_default" = true) AND ("is_active" = true));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fund_baselines_source_run_unique" ON "fund_baselines" USING btree ("fund_id","source_run_id") WHERE ("source_run_id" IS NOT NULL);
--> statement-breakpoint

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "users"
		WHERE "username" = 'system'
		  AND "id" <> 999999
	) THEN
		RAISE EXCEPTION 'Username "system" is already reserved by a different user id';
	END IF;
END
$$;
--> statement-breakpoint
INSERT INTO "users" ("id", "username", "password")
VALUES (999999, 'system', 'SYSTEM_ACTOR_NO_LOGIN_00000000')
ON CONFLICT ("id") DO UPDATE
SET
	"username" = EXCLUDED."username",
	"password" = EXCLUDED."password";
--> statement-breakpoint
SELECT setval(
	pg_get_serial_sequence('users', 'id'),
	GREATEST(COALESCE((SELECT MAX("id") FROM "users" WHERE "id" < 999999), 1), 1),
	true
);
