CREATE TABLE "alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fund_id" integer,
	"name" text NOT NULL,
	"description" text,
	"rule_type" text NOT NULL,
	"metric_name" text NOT NULL,
	"operator" text NOT NULL,
	"threshold_value" numeric(15, 4),
	"secondary_threshold" numeric(15, 4),
	"severity" text DEFAULT 'warning' NOT NULL,
	"category" text DEFAULT 'performance' NOT NULL,
	"is_enabled" boolean DEFAULT true,
	"check_frequency" text DEFAULT 'daily' NOT NULL,
	"suppression_period_minutes" integer DEFAULT 60,
	"escalation_rules" jsonb,
	"notification_channels" text[] DEFAULT '{"email"}',
	"conditions" jsonb,
	"filters" jsonb,
	"created_by" integer NOT NULL,
	"last_modified_by" integer,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"last_triggered" timestamp with time zone,
	"trigger_count" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "forecast_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fund_id" integer NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source_hash" text,
	"calculated_metrics" jsonb,
	"fund_state" jsonb,
	"portfolio_state" jsonb,
	"metrics_state" jsonb,
	"snapshot_time" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forecast_snapshots_status_check" CHECK ("forecast_snapshots"."status" IN ('pending', 'calculating', 'complete', 'error'))
);
--> statement-breakpoint
CREATE TABLE "fund_baselines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fund_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"baseline_type" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"snapshot_date" timestamp with time zone NOT NULL,
	"total_value" numeric(15, 2) NOT NULL,
	"deployed_capital" numeric(15, 2) NOT NULL,
	"irr" numeric(5, 4),
	"multiple" numeric(5, 2),
	"dpi" numeric(5, 2),
	"tvpi" numeric(5, 2),
	"portfolio_count" integer DEFAULT 0 NOT NULL,
	"average_investment" numeric(15, 2),
	"top_performers" jsonb,
	"sector_distribution" jsonb,
	"stage_distribution" jsonb,
	"reserve_allocation" jsonb,
	"pacing_metrics" jsonb,
	"is_active" boolean DEFAULT true,
	"is_default" boolean DEFAULT false,
	"confidence" numeric(3, 2) DEFAULT '1.00',
	"version" text DEFAULT '1.0.0' NOT NULL,
	"parent_baseline_id" uuid,
	"source_snapshot_id" uuid,
	"created_by" integer NOT NULL,
	"approved_by" integer,
	"tags" text[] DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "fund_strategy_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fund_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"model_type" text NOT NULL,
	"target_portfolio_size" integer DEFAULT 25 NOT NULL,
	"max_portfolio_size" integer DEFAULT 30 NOT NULL,
	"target_deployment_period_months" integer DEFAULT 36 NOT NULL,
	"check_size_range" jsonb NOT NULL,
	"sector_allocation" jsonb NOT NULL,
	"stage_allocation" jsonb NOT NULL,
	"geographic_allocation" jsonb,
	"initial_reserve_percentage" numeric(5, 4) DEFAULT '0.50' NOT NULL,
	"follow_on_strategy" jsonb NOT NULL,
	"reserve_deployment_timeline" jsonb,
	"concentration_limits" jsonb NOT NULL,
	"diversification_rules" jsonb,
	"risk_tolerance" text DEFAULT 'moderate' NOT NULL,
	"target_irr" numeric(5, 4),
	"target_multiple" numeric(5, 2),
	"target_dpi" numeric(5, 2),
	"target_portfolio_beta" numeric(5, 2),
	"model_version" text DEFAULT '1.0.0' NOT NULL,
	"is_active" boolean DEFAULT true,
	"is_template" boolean DEFAULT false,
	"confidence_level" numeric(3, 2) DEFAULT '0.75',
	"market_assumptions" jsonb,
	"validation_criteria" jsonb,
	"stress_test_scenarios" jsonb,
	"created_by" integer NOT NULL,
	"approved_by" integer,
	"tags" text[] DEFAULT '{}',
	"effective_date" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "fund_strategy_models_active_unique" UNIQUE("fund_id")
);
--> statement-breakpoint
CREATE TABLE "investment_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investment_id" integer NOT NULL,
	"lot_type" text NOT NULL,
	"share_price_cents" bigint NOT NULL,
	"shares_acquired" numeric(18, 8) NOT NULL,
	"cost_basis_cents" bigint NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investment_lots_lot_type_check" CHECK ("investment_lots"."lot_type" IN ('initial', 'follow_on', 'secondary'))
);
--> statement-breakpoint
CREATE TABLE "monte_carlo_simulations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fund_id" integer NOT NULL,
	"scenario_id" uuid,
	"forecast_id" uuid,
	"simulation_name" text NOT NULL,
	"simulation_type" text NOT NULL,
	"number_of_runs" integer DEFAULT 10000 NOT NULL,
	"random_seed" integer,
	"simulation_engine" text DEFAULT 'monte-carlo-v2' NOT NULL,
	"input_distributions" jsonb NOT NULL,
	"correlation_matrix" jsonb,
	"scenario_weights" jsonb,
	"constraints" jsonb,
	"summary_statistics" jsonb NOT NULL,
	"percentile_results" jsonb NOT NULL,
	"distribution_data" jsonb,
	"confidence_intervals" jsonb,
	"var_calculations" jsonb,
	"cvar_calculations" jsonb,
	"downside_risk" jsonb,
	"tail_risk_analysis" jsonb,
	"convergence_metrics" jsonb,
	"quality_metrics" jsonb,
	"stability_analysis" jsonb,
	"factor_contributions" jsonb,
	"sensitivity_indices" jsonb,
	"interaction_effects" jsonb,
	"computation_time_ms" integer,
	"memory_usage_mb" integer,
	"cpu_cores_used" integer,
	"simulation_date" timestamp with time zone DEFAULT now() NOT NULL,
	"detailed_results_path" text,
	"results_compressed" boolean DEFAULT false,
	"results_format" text DEFAULT 'json',
	"validation_tests" jsonb,
	"benchmark_comparison" jsonb,
	"historical_validation" jsonb,
	"created_by" integer NOT NULL,
	"tags" text[] DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now(),
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "performance_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fund_id" integer NOT NULL,
	"baseline_id" uuid,
	"variance_report_id" uuid,
	"alert_type" text NOT NULL,
	"severity" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"recommendations" jsonb,
	"metric_name" text NOT NULL,
	"threshold_value" numeric(15, 4),
	"actual_value" numeric(15, 4),
	"variance_amount" numeric(15, 4),
	"variance_percentage" numeric(5, 4),
	"triggered_at" timestamp with time zone NOT NULL,
	"first_occurrence" timestamp with time zone,
	"last_occurrence" timestamp with time zone,
	"occurrence_count" integer DEFAULT 1,
	"status" text DEFAULT 'active' NOT NULL,
	"acknowledged_by" integer,
	"acknowledged_at" timestamp with time zone,
	"resolved_by" integer,
	"resolved_at" timestamp with time zone,
	"resolution_notes" text,
	"affected_entities" jsonb,
	"context_data" jsonb,
	"notifications_sent" jsonb,
	"escalation_level" integer DEFAULT 0,
	"escalated_at" timestamp with time zone,
	"escalated_to" text[],
	"rule_id" uuid,
	"rule_version" text,
	"detection_latency_ms" integer,
	"processing_time_ms" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "performance_forecasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fund_id" integer NOT NULL,
	"scenario_id" uuid,
	"baseline_id" uuid,
	"forecast_name" text NOT NULL,
	"forecast_type" text NOT NULL,
	"forecast_horizon_years" integer DEFAULT 10 NOT NULL,
	"forecast_periods" jsonb NOT NULL,
	"confidence_intervals" jsonb,
	"prediction_variance" jsonb,
	"irr_forecast" jsonb,
	"multiple_forecast" jsonb,
	"tvpi_forecast" jsonb,
	"dpi_forecast" jsonb,
	"nav_forecast" jsonb,
	"company_level_forecasts" jsonb,
	"sector_performance_forecasts" jsonb,
	"stage_performance_forecasts" jsonb,
	"correlation_matrix" jsonb,
	"base_case_forecast" jsonb,
	"stress_scenarios" jsonb,
	"macro_sensitivity" jsonb,
	"methodology" text NOT NULL,
	"model_parameters" jsonb,
	"data_sources" jsonb,
	"assumptions" jsonb,
	"accuracy_metrics" jsonb,
	"calibration_results" jsonb,
	"validation_results" jsonb,
	"model_version" text DEFAULT '1.0.0' NOT NULL,
	"actual_vs_forecast" jsonb,
	"forecast_errors" jsonb,
	"model_drift_metrics" jsonb,
	"uncertainty_quantification" jsonb,
	"risk_factors" jsonb,
	"scenario_probabilities" jsonb,
	"parent_forecast_id" uuid,
	"update_reason" text,
	"update_frequency_days" integer DEFAULT 90,
	"last_updated_at" timestamp with time zone,
	"created_by" integer NOT NULL,
	"reviewed_by" integer,
	"approved_by" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"quality_score" numeric(3, 2),
	"peer_review_scores" jsonb,
	"governance_notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "portfolio_scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fund_id" integer NOT NULL,
	"strategy_model_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"scenario_type" text NOT NULL,
	"market_environment" text DEFAULT 'normal' NOT NULL,
	"deal_flow_assumption" numeric(5, 2) DEFAULT '1.00' NOT NULL,
	"valuation_environment" numeric(5, 2) DEFAULT '1.00' NOT NULL,
	"exit_environment" numeric(5, 2) DEFAULT '1.00' NOT NULL,
	"planned_investments" jsonb NOT NULL,
	"deployment_schedule" jsonb NOT NULL,
	"follow_on_assumptions" jsonb,
	"projected_fund_metrics" jsonb NOT NULL,
	"projected_portfolio_outcomes" jsonb,
	"monte_carlo_results" jsonb,
	"risk_factors" jsonb,
	"sensitivity_analysis" jsonb,
	"correlation_assumptions" jsonb,
	"baseline_scenario_id" uuid,
	"variance_from_baseline" jsonb,
	"benchmark_comparison" jsonb,
	"simulation_engine" text DEFAULT 'monte-carlo-v1' NOT NULL,
	"simulation_runs" integer DEFAULT 10000,
	"simulation_duration_ms" integer,
	"last_simulation_at" timestamp with time zone,
	"status" text DEFAULT 'draft' NOT NULL,
	"confidence_score" numeric(5, 2),
	"validation_results" jsonb,
	"created_by" integer NOT NULL,
	"reviewed_by" integer,
	"approved_by" integer,
	"is_shared" boolean DEFAULT false,
	"shared_with" text[] DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reallocation_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fund_id" integer NOT NULL,
	"user_id" integer,
	"baseline_version" integer NOT NULL,
	"new_version" integer NOT NULL,
	"changes_json" jsonb NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reserve_allocation_strategies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fund_id" integer NOT NULL,
	"scenario_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"strategy_type" text NOT NULL,
	"allocation_rules" jsonb NOT NULL,
	"trigger_conditions" jsonb NOT NULL,
	"company_scoring_criteria" jsonb,
	"total_reserve_amount" numeric(15, 2) NOT NULL,
	"reserve_tranches" jsonb NOT NULL,
	"emergency_reserve_pct" numeric(5, 4) DEFAULT '0.10',
	"max_per_company_pct" numeric(5, 4) DEFAULT '0.20' NOT NULL,
	"min_deployment_amount" numeric(15, 2) DEFAULT '100000',
	"max_deployment_amount" numeric(15, 2),
	"performance_thresholds" jsonb,
	"milestone_tracking" jsonb,
	"risk_adjusted_scoring" jsonb,
	"optimization_objective" text DEFAULT 'risk_adjusted_return' NOT NULL,
	"optimization_constraints" jsonb,
	"rebalancing_frequency" text DEFAULT 'quarterly',
	"monte_carlo_iterations" integer DEFAULT 5000,
	"scenario_weights" jsonb,
	"sensitivity_parameters" jsonb,
	"backtest_results" jsonb,
	"performance_attribution" jsonb,
	"benchmark_comparison" jsonb,
	"recommendation_engine" jsonb,
	"decision_history" jsonb,
	"override_reasons" jsonb,
	"is_active" boolean DEFAULT true,
	"last_optimized_at" timestamp with time zone,
	"optimization_frequency_days" integer DEFAULT 30,
	"created_by" integer NOT NULL,
	"last_modified_by" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reserve_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"company_id" integer NOT NULL,
	"planned_reserve_cents" bigint NOT NULL,
	"allocation_score" numeric(10, 6),
	"priority" integer,
	"rationale" text,
	"version" integer DEFAULT 1 NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255),
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" varchar(20) NOT NULL,
	"diff" jsonb,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scenario_id" uuid NOT NULL,
	"case_name" varchar(255) NOT NULL,
	"description" text,
	"probability" numeric(10, 8) NOT NULL,
	"investment" numeric(15, 2) DEFAULT '0' NOT NULL,
	"follow_ons" numeric(15, 2) DEFAULT '0' NOT NULL,
	"exit_proceeds" numeric(15, 2) DEFAULT '0' NOT NULL,
	"exit_valuation" numeric(15, 2) DEFAULT '0' NOT NULL,
	"months_to_exit" integer,
	"ownership_at_exit" numeric(5, 4),
	"fmv" numeric(15, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_comparisons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fund_id" integer NOT NULL,
	"comparison_name" text NOT NULL,
	"description" text,
	"comparison_type" text NOT NULL,
	"base_scenario_id" uuid NOT NULL,
	"comparison_scenarios" jsonb NOT NULL,
	"comparison_metrics" jsonb NOT NULL,
	"weight_scheme" jsonb,
	"normalization_method" text DEFAULT 'z_score',
	"metric_comparisons" jsonb NOT NULL,
	"ranking_results" jsonb,
	"pareto_analysis" jsonb,
	"trade_off_analysis" jsonb,
	"significance_tests" jsonb,
	"confidence_intervals" jsonb,
	"correlation_analysis" jsonb,
	"variance_decomposition" jsonb,
	"recommendation_summary" text,
	"key_insights" jsonb,
	"decision_criteria" jsonb,
	"risk_considerations" jsonb,
	"sensitivity_results" jsonb,
	"parameter_importance" jsonb,
	"threshold_analysis" jsonb,
	"chart_configurations" jsonb,
	"dashboard_layout" jsonb,
	"export_formats" jsonb,
	"comparison_engine" text DEFAULT 'scenario-compare-v1' NOT NULL,
	"computation_time_ms" integer,
	"data_freshness_hours" integer,
	"user_preferences" jsonb,
	"bookmark_settings" jsonb,
	"sharing_settings" jsonb,
	"status" text DEFAULT 'computing' NOT NULL,
	"error_details" jsonb,
	"cache_expires_at" timestamp with time zone,
	"created_by" integer NOT NULL,
	"shared_with" text[] DEFAULT '{}',
	"is_public" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"last_accessed" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"version" integer DEFAULT 1 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"locked_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variance_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fund_id" integer NOT NULL,
	"baseline_id" uuid NOT NULL,
	"report_name" text NOT NULL,
	"report_type" text NOT NULL,
	"report_period" text,
	"analysis_start" timestamp with time zone NOT NULL,
	"analysis_end" timestamp with time zone NOT NULL,
	"as_of_date" timestamp with time zone NOT NULL,
	"current_metrics" jsonb NOT NULL,
	"baseline_metrics" jsonb NOT NULL,
	"total_value_variance" numeric(15, 2),
	"total_value_variance_pct" numeric(5, 4),
	"irr_variance" numeric(5, 4),
	"multiple_variance" numeric(5, 2),
	"dpi_variance" numeric(5, 2),
	"tvpi_variance" numeric(5, 2),
	"portfolio_variances" jsonb,
	"sector_variances" jsonb,
	"stage_variances" jsonb,
	"reserve_variances" jsonb,
	"pacing_variances" jsonb,
	"overall_variance_score" numeric(5, 2),
	"significant_variances" jsonb,
	"variance_factors" jsonb,
	"alerts_triggered" jsonb,
	"threshold_breaches" jsonb,
	"risk_level" text DEFAULT 'low',
	"calculation_engine" text DEFAULT 'variance-v1' NOT NULL,
	"calculation_duration_ms" integer,
	"data_quality_score" numeric(3, 2),
	"generated_by" integer,
	"reviewed_by" integer,
	"approved_by" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_public" boolean DEFAULT false,
	"shared_with" text[] DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "reserve_decisions" ALTER COLUMN "fund_id" SET DATA TYPE integer USING "fund_id"::integer;--> statement-breakpoint
ALTER TABLE "reserve_decisions" ALTER COLUMN "company_id" SET DATA TYPE integer USING "company_id"::integer;--> statement-breakpoint
ALTER TABLE "fund_metrics" ADD COLUMN "as_of_date" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "funds" ADD COLUMN "establishment_date" date;--> statement-breakpoint
ALTER TABLE "funds" ADD COLUMN "is_active" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "investments" ADD COLUMN "share_price_cents" bigint;--> statement-breakpoint
ALTER TABLE "investments" ADD COLUMN "shares_acquired" numeric(18, 8);--> statement-breakpoint
ALTER TABLE "investments" ADD COLUMN "cost_basis_cents" bigint;--> statement-breakpoint
ALTER TABLE "investments" ADD COLUMN "pricing_confidence" text DEFAULT 'calculated';--> statement-breakpoint
ALTER TABLE "investments" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "portfoliocompanies" ADD COLUMN "current_stage" text;--> statement-breakpoint
ALTER TABLE "portfoliocompanies" ADD COLUMN "investment_date" timestamp;--> statement-breakpoint
ALTER TABLE "portfoliocompanies" ADD COLUMN "deployed_reserves_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "portfoliocompanies" ADD COLUMN "planned_reserves_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "portfoliocompanies" ADD COLUMN "exit_moic_bps" integer;--> statement-breakpoint
ALTER TABLE "portfoliocompanies" ADD COLUMN "ownership_current_pct" numeric(7, 4);--> statement-breakpoint
ALTER TABLE "portfoliocompanies" ADD COLUMN "allocation_cap_cents" bigint;--> statement-breakpoint
ALTER TABLE "portfoliocompanies" ADD COLUMN "allocation_reason" text;--> statement-breakpoint
ALTER TABLE "portfoliocompanies" ADD COLUMN "allocation_iteration" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "portfoliocompanies" ADD COLUMN "last_allocation_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "portfoliocompanies" ADD COLUMN "allocation_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_last_modified_by_users_id_fk" FOREIGN KEY ("last_modified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_snapshots" ADD CONSTRAINT "forecast_snapshots_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_baselines" ADD CONSTRAINT "fund_baselines_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_baselines" ADD CONSTRAINT "fund_baselines_source_snapshot_id_fund_state_snapshots_id_fk" FOREIGN KEY ("source_snapshot_id") REFERENCES "public"."fund_state_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_baselines" ADD CONSTRAINT "fund_baselines_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_baselines" ADD CONSTRAINT "fund_baselines_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_strategy_models" ADD CONSTRAINT "fund_strategy_models_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_strategy_models" ADD CONSTRAINT "fund_strategy_models_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_strategy_models" ADD CONSTRAINT "fund_strategy_models_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_lots" ADD CONSTRAINT "investment_lots_investment_id_investments_id_fk" FOREIGN KEY ("investment_id") REFERENCES "public"."investments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monte_carlo_simulations" ADD CONSTRAINT "monte_carlo_simulations_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monte_carlo_simulations" ADD CONSTRAINT "monte_carlo_simulations_scenario_id_portfolio_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."portfolio_scenarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monte_carlo_simulations" ADD CONSTRAINT "monte_carlo_simulations_forecast_id_performance_forecasts_id_fk" FOREIGN KEY ("forecast_id") REFERENCES "public"."performance_forecasts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monte_carlo_simulations" ADD CONSTRAINT "monte_carlo_simulations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_alerts" ADD CONSTRAINT "performance_alerts_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_alerts" ADD CONSTRAINT "performance_alerts_baseline_id_fund_baselines_id_fk" FOREIGN KEY ("baseline_id") REFERENCES "public"."fund_baselines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_alerts" ADD CONSTRAINT "performance_alerts_variance_report_id_variance_reports_id_fk" FOREIGN KEY ("variance_report_id") REFERENCES "public"."variance_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_alerts" ADD CONSTRAINT "performance_alerts_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_alerts" ADD CONSTRAINT "performance_alerts_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_forecasts" ADD CONSTRAINT "performance_forecasts_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_forecasts" ADD CONSTRAINT "performance_forecasts_scenario_id_portfolio_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."portfolio_scenarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_forecasts" ADD CONSTRAINT "performance_forecasts_baseline_id_fund_baselines_id_fk" FOREIGN KEY ("baseline_id") REFERENCES "public"."fund_baselines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_forecasts" ADD CONSTRAINT "performance_forecasts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_forecasts" ADD CONSTRAINT "performance_forecasts_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_forecasts" ADD CONSTRAINT "performance_forecasts_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_scenarios" ADD CONSTRAINT "portfolio_scenarios_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_scenarios" ADD CONSTRAINT "portfolio_scenarios_strategy_model_id_fund_strategy_models_id_fk" FOREIGN KEY ("strategy_model_id") REFERENCES "public"."fund_strategy_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_scenarios" ADD CONSTRAINT "portfolio_scenarios_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_scenarios" ADD CONSTRAINT "portfolio_scenarios_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_scenarios" ADD CONSTRAINT "portfolio_scenarios_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reallocation_audit" ADD CONSTRAINT "reallocation_audit_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reallocation_audit" ADD CONSTRAINT "reallocation_audit_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve_allocation_strategies" ADD CONSTRAINT "reserve_allocation_strategies_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve_allocation_strategies" ADD CONSTRAINT "reserve_allocation_strategies_scenario_id_portfolio_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."portfolio_scenarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve_allocation_strategies" ADD CONSTRAINT "reserve_allocation_strategies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve_allocation_strategies" ADD CONSTRAINT "reserve_allocation_strategies_last_modified_by_users_id_fk" FOREIGN KEY ("last_modified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve_allocations" ADD CONSTRAINT "reserve_allocations_snapshot_id_forecast_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."forecast_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve_allocations" ADD CONSTRAINT "reserve_allocations_company_id_portfoliocompanies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."portfoliocompanies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_cases" ADD CONSTRAINT "scenario_cases_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_comparisons" ADD CONSTRAINT "scenario_comparisons_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_comparisons" ADD CONSTRAINT "scenario_comparisons_base_scenario_id_portfolio_scenarios_id_fk" FOREIGN KEY ("base_scenario_id") REFERENCES "public"."portfolio_scenarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_comparisons" ADD CONSTRAINT "scenario_comparisons_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_company_id_portfoliocompanies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."portfoliocompanies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variance_reports" ADD CONSTRAINT "variance_reports_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variance_reports" ADD CONSTRAINT "variance_reports_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variance_reports" ADD CONSTRAINT "variance_reports_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variance_reports" ADD CONSTRAINT "variance_reports_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alert_rules_fund_idx" ON "alert_rules" USING btree ("fund_id","is_enabled");--> statement-breakpoint
CREATE INDEX "alert_rules_metric_idx" ON "alert_rules" USING btree ("metric_name","is_enabled");--> statement-breakpoint
CREATE INDEX "alert_rules_enabled_idx" ON "alert_rules" USING btree ("is_enabled","check_frequency");--> statement-breakpoint
CREATE INDEX "alert_rules_last_triggered_idx" ON "alert_rules" USING btree ("last_triggered" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "forecast_snapshots_fund_time_idx" ON "forecast_snapshots" USING btree ("fund_id","snapshot_time" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "forecast_snapshots_source_hash_idx" ON "forecast_snapshots" USING btree ("source_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "forecast_snapshots_idempotency_unique_idx" ON "forecast_snapshots" USING btree ("idempotency_key") WHERE "forecast_snapshots"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "forecast_snapshots_source_hash_unique_idx" ON "forecast_snapshots" USING btree ("source_hash","fund_id") WHERE "forecast_snapshots"."source_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "fund_baselines_fund_idx" ON "fund_baselines" USING btree ("fund_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "fund_baselines_period_idx" ON "fund_baselines" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX "fund_baselines_type_idx" ON "fund_baselines" USING btree ("baseline_type","is_active");--> statement-breakpoint
CREATE INDEX "fund_baselines_default_idx" ON "fund_baselines" USING btree ("fund_id","is_default","is_active");--> statement-breakpoint
CREATE INDEX "fund_baselines_snapshot_idx" ON "fund_baselines" USING btree ("source_snapshot_id");--> statement-breakpoint
CREATE INDEX "fund_baselines_tags_gin_idx" ON "fund_baselines" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "fund_strategy_models_fund_idx" ON "fund_strategy_models" USING btree ("fund_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "fund_strategy_models_type_idx" ON "fund_strategy_models" USING btree ("model_type","is_active");--> statement-breakpoint
CREATE INDEX "fund_strategy_models_active_idx" ON "fund_strategy_models" USING btree ("is_active","effective_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "fund_strategy_models_template_idx" ON "fund_strategy_models" USING btree ("is_template","is_active");--> statement-breakpoint
CREATE INDEX "fund_strategy_models_tags_gin_idx" ON "fund_strategy_models" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "investment_lots_investment_lot_type_idx" ON "investment_lots" USING btree ("investment_id","lot_type");--> statement-breakpoint
CREATE UNIQUE INDEX "investment_lots_idempotency_unique_idx" ON "investment_lots" USING btree ("idempotency_key") WHERE "investment_lots"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "monte_carlo_simulations_fund_idx" ON "monte_carlo_simulations" USING btree ("fund_id","simulation_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "monte_carlo_simulations_scenario_idx" ON "monte_carlo_simulations" USING btree ("scenario_id","simulation_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "monte_carlo_simulations_forecast_idx" ON "monte_carlo_simulations" USING btree ("forecast_id","simulation_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "monte_carlo_simulations_type_idx" ON "monte_carlo_simulations" USING btree ("simulation_type","simulation_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "monte_carlo_simulations_expiry_idx" ON "monte_carlo_simulations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "monte_carlo_simulations_tags_gin_idx" ON "monte_carlo_simulations" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "performance_alerts_fund_idx" ON "performance_alerts" USING btree ("fund_id","triggered_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "performance_alerts_severity_idx" ON "performance_alerts" USING btree ("severity","status","triggered_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "performance_alerts_status_idx" ON "performance_alerts" USING btree ("status","triggered_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "performance_alerts_metric_idx" ON "performance_alerts" USING btree ("metric_name","triggered_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "performance_alerts_baseline_idx" ON "performance_alerts" USING btree ("baseline_id","triggered_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "performance_alerts_report_idx" ON "performance_alerts" USING btree ("variance_report_id");--> statement-breakpoint
CREATE INDEX "performance_alerts_escalation_idx" ON "performance_alerts" USING btree ("escalation_level","escalated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "performance_forecasts_fund_idx" ON "performance_forecasts" USING btree ("fund_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "performance_forecasts_scenario_idx" ON "performance_forecasts" USING btree ("scenario_id","status");--> statement-breakpoint
CREATE INDEX "performance_forecasts_baseline_idx" ON "performance_forecasts" USING btree ("baseline_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "performance_forecasts_type_idx" ON "performance_forecasts" USING btree ("forecast_type","status");--> statement-breakpoint
CREATE INDEX "performance_forecasts_methodology_idx" ON "performance_forecasts" USING btree ("methodology","model_version");--> statement-breakpoint
CREATE INDEX "performance_forecasts_horizon_idx" ON "performance_forecasts" USING btree ("forecast_horizon_years","status");--> statement-breakpoint
CREATE INDEX "portfolio_scenarios_fund_idx" ON "portfolio_scenarios" USING btree ("fund_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "portfolio_scenarios_strategy_idx" ON "portfolio_scenarios" USING btree ("strategy_model_id","status");--> statement-breakpoint
CREATE INDEX "portfolio_scenarios_type_idx" ON "portfolio_scenarios" USING btree ("scenario_type","status");--> statement-breakpoint
CREATE INDEX "portfolio_scenarios_status_idx" ON "portfolio_scenarios" USING btree ("status","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "portfolio_scenarios_shared_idx" ON "portfolio_scenarios" USING btree ("is_shared","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "portfolio_scenarios_baseline_idx" ON "portfolio_scenarios" USING btree ("baseline_scenario_id");--> statement-breakpoint
CREATE INDEX "idx_reallocation_audit_fund" ON "reallocation_audit" USING btree ("fund_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_reallocation_audit_user" ON "reallocation_audit" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_reallocation_audit_versions" ON "reallocation_audit" USING btree ("fund_id","baseline_version","new_version");--> statement-breakpoint
CREATE INDEX "idx_reallocation_audit_changes_gin" ON "reallocation_audit" USING gin ("changes_json");--> statement-breakpoint
CREATE INDEX "reserve_allocation_strategies_fund_idx" ON "reserve_allocation_strategies" USING btree ("fund_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "reserve_allocation_strategies_scenario_idx" ON "reserve_allocation_strategies" USING btree ("scenario_id","is_active");--> statement-breakpoint
CREATE INDEX "reserve_allocation_strategies_type_idx" ON "reserve_allocation_strategies" USING btree ("strategy_type","is_active");--> statement-breakpoint
CREATE INDEX "reserve_allocation_strategies_active_idx" ON "reserve_allocation_strategies" USING btree ("is_active","last_optimized_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "reserve_allocation_strategies_optimization_idx" ON "reserve_allocation_strategies" USING btree ("optimization_objective","is_active");--> statement-breakpoint
CREATE INDEX "reserve_allocations_snapshot_company_idx" ON "reserve_allocations" USING btree ("snapshot_id","company_id");--> statement-breakpoint
CREATE INDEX "reserve_allocations_company_idx" ON "reserve_allocations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "reserve_allocations_priority_idx" ON "reserve_allocations" USING btree ("snapshot_id","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "reserve_allocations_idempotency_unique_idx" ON "reserve_allocations" USING btree ("idempotency_key") WHERE "reserve_allocations"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_audit_logs_entity_id" ON "scenario_audit_logs" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_user_id" ON "scenario_audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_timestamp" ON "scenario_audit_logs" USING btree ("timestamp" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_audit_logs_entity_type" ON "scenario_audit_logs" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "idx_scenario_cases_scenario_id" ON "scenario_cases" USING btree ("scenario_id");--> statement-breakpoint
CREATE INDEX "idx_scenario_cases_created_at" ON "scenario_cases" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "scenario_comparisons_fund_idx" ON "scenario_comparisons" USING btree ("fund_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "scenario_comparisons_base_idx" ON "scenario_comparisons" USING btree ("base_scenario_id","status");--> statement-breakpoint
CREATE INDEX "scenario_comparisons_type_idx" ON "scenario_comparisons" USING btree ("comparison_type","status");--> statement-breakpoint
CREATE INDEX "scenario_comparisons_status_idx" ON "scenario_comparisons" USING btree ("status","last_accessed" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "scenario_comparisons_public_idx" ON "scenario_comparisons" USING btree ("is_public","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_scenarios_company_id" ON "scenarios" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_scenarios_created_by" ON "scenarios" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_scenarios_created_at" ON "scenarios" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "variance_reports_fund_idx" ON "variance_reports" USING btree ("fund_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "variance_reports_baseline_idx" ON "variance_reports" USING btree ("baseline_id","as_of_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "variance_reports_period_idx" ON "variance_reports" USING btree ("analysis_start","analysis_end");--> statement-breakpoint
CREATE INDEX "variance_reports_type_idx" ON "variance_reports" USING btree ("report_type","status");--> statement-breakpoint
CREATE INDEX "variance_reports_risk_idx" ON "variance_reports" USING btree ("risk_level","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "variance_reports_status_idx" ON "variance_reports" USING btree ("status","updated_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "reserve_decisions" ADD CONSTRAINT "reserve_decisions_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve_decisions" ADD CONSTRAINT "reserve_decisions_company_id_portfoliocompanies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."portfoliocompanies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investments" ADD CONSTRAINT "investments_pricing_confidence_check" CHECK ("investments"."pricing_confidence" IN ('calculated', 'verified'));