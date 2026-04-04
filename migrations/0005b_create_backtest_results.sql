-- Create tables that were applied via db:push but never captured as migrations.
-- Must run before 0006_phase2_backtest_scenario_comparison_summary which ALTERs backtest_results.

-- fund_distributions: tracks exit proceeds and distributions back to LPs
CREATE TABLE IF NOT EXISTS "fund_distributions" (
	"id" serial PRIMARY KEY NOT NULL,
	"fund_id" integer NOT NULL REFERENCES "funds"("id"),
	"company_id" integer REFERENCES "portfoliocompanies"("id"),
	"distribution_date" timestamp NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"distribution_type" text DEFAULT 'exit' NOT NULL,
	"description" text,
	"is_recycled" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"created_by" integer REFERENCES "users"("id")
);

-- backtest_results: stores Monte Carlo simulation backtesting results

CREATE TABLE IF NOT EXISTS "backtest_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fund_id" integer NOT NULL REFERENCES "funds"("id") ON DELETE CASCADE,
	"config" jsonb NOT NULL,
	"simulation_summary" jsonb NOT NULL,
	"actual_performance" jsonb NOT NULL,
	"validation_metrics" jsonb NOT NULL,
	"data_quality" jsonb NOT NULL,
	"scenario_comparisons" jsonb,
	"recommendations" text[] DEFAULT '{}' NOT NULL,
	"execution_time_ms" integer NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"error_message" text,
	"baseline_id" uuid REFERENCES "fund_baselines"("id"),
	"snapshot_id" uuid REFERENCES "fund_state_snapshots"("id"),
	"created_by" integer REFERENCES "users"("id"),
	"tags" text[] DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "backtest_results_fund_idx" ON "backtest_results" ("fund_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "backtest_results_status_idx" ON "backtest_results" ("status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "backtest_results_baseline_idx" ON "backtest_results" ("baseline_id");
CREATE INDEX IF NOT EXISTS "backtest_results_snapshot_idx" ON "backtest_results" ("snapshot_id");
CREATE INDEX IF NOT EXISTS "backtest_results_expiry_idx" ON "backtest_results" ("expires_at");
CREATE INDEX IF NOT EXISTS "backtest_results_user_idx" ON "backtest_results" ("created_by", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "backtest_results_tags_gin_idx" ON "backtest_results" USING gin ("tags");
