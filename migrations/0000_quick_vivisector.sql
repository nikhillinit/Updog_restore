CREATE TYPE "public"."reserve_engine_type" AS ENUM('rules', 'ml', 'hybrid');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"fund_id" integer,
	"company_id" integer,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"amount" numeric(15, 2),
	"activity_date" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer,
	"action" varchar(50) NOT NULL,
	"entity_type" varchar(50),
	"entity_id" uuid,
	"changes" jsonb,
	"ip_address" text,
	"user_agent" text,
	"correlation_id" varchar(36),
	"session_id" varchar(64),
	"request_path" text,
	"http_method" varchar(10),
	"status_code" integer,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "custom_fieldvalues" (
	"id" serial PRIMARY KEY NOT NULL,
	"field_id" integer,
	"investment_id" integer,
	"value" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "custom_fields" (
	"id" serial PRIMARY KEY NOT NULL,
	"fund_id" integer,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"required" boolean DEFAULT false,
	"options" text[],
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "deal_opportunities" (
	"id" serial PRIMARY KEY NOT NULL,
	"fund_id" integer,
	"company_name" text NOT NULL,
	"sector" text NOT NULL,
	"stage" text NOT NULL,
	"source_type" text NOT NULL,
	"deal_size" numeric(15, 2),
	"valuation" numeric(15, 2),
	"status" text DEFAULT 'lead' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"founded_year" integer,
	"employee_count" integer,
	"revenue" numeric(15, 2),
	"description" text,
	"website" text,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"source_notes" text,
	"next_action" text,
	"next_action_date" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "due_diligence_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"opportunity_id" integer,
	"category" text NOT NULL,
	"item" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"assigned_to" text,
	"due_date" timestamp,
	"completed_date" timestamp,
	"notes" text,
	"documents" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "financial_projections" (
	"id" serial PRIMARY KEY NOT NULL,
	"opportunity_id" integer,
	"year" integer NOT NULL,
	"revenue" numeric(15, 2),
	"revenue_growth" numeric(5, 2),
	"gross_margin" numeric(5, 2),
	"burn_rate" numeric(15, 2),
	"runway_months" integer,
	"customer_count" integer,
	"arr" numeric(15, 2),
	"ltv" numeric(15, 2),
	"cac" numeric(15, 2),
	"projection_type" text DEFAULT 'management' NOT NULL,
	"assumptions" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "fundconfigs" (
	"id" serial PRIMARY KEY NOT NULL,
	"fund_id" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"config" jsonb NOT NULL,
	"is_draft" boolean DEFAULT true,
	"is_published" boolean DEFAULT false,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "fundconfigs_fund_id_version_unique" UNIQUE("fund_id","version")
);
--> statement-breakpoint
CREATE TABLE "fund_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"fund_id" integer NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"payload" jsonb,
	"user_id" integer,
	"correlation_id" varchar(36),
	"event_time" timestamp NOT NULL,
	"operation" varchar(50),
	"entity_type" varchar(50),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "fund_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"fund_id" integer,
	"metric_date" timestamp NOT NULL,
	"totalvalue" numeric(15, 2) NOT NULL,
	"irr" numeric(5, 4),
	"multiple" numeric(5, 2),
	"dpi" numeric(5, 2),
	"tvpi" numeric(5, 2),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "fund_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"fund_id" integer NOT NULL,
	"type" varchar(50) NOT NULL,
	"payload" jsonb NOT NULL,
	"calc_version" varchar(20) NOT NULL,
	"correlation_id" varchar(36) NOT NULL,
	"metadata" jsonb,
	"snapshot_time" timestamp NOT NULL,
	"event_count" integer DEFAULT 0,
	"state_hash" varchar(64),
	"state" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "fund_state_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fund_id" integer NOT NULL,
	"snapshot_name" text NOT NULL,
	"description" text,
	"snapshot_time" timestamp with time zone NOT NULL,
	"fund_state" jsonb NOT NULL,
	"portfolio_state" jsonb NOT NULL,
	"metrics_state" jsonb,
	"reserve_state" jsonb,
	"pacing_state" jsonb,
	"state_version" text DEFAULT '1.0.0' NOT NULL,
	"state_hash" text NOT NULL,
	"data_size" bigint,
	"compression_type" text DEFAULT 'gzip',
	"is_automatic" boolean DEFAULT false,
	"tags" text[] DEFAULT '{}',
	"is_bookmarked" boolean DEFAULT false,
	"expires_at" timestamp with time zone,
	"created_by" integer,
	"trigger_event" text,
	"correlation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "funds" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"size" numeric(15, 2) NOT NULL,
	"deployed_capital" numeric(15, 2) DEFAULT '0',
	"management_fee" numeric(5, 4) NOT NULL,
	"carry_percentage" numeric(5, 4) NOT NULL,
	"vintage_year" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "investments" (
	"id" serial PRIMARY KEY NOT NULL,
	"fund_id" integer,
	"company_id" integer,
	"investment_date" timestamp NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"round" text NOT NULL,
	"ownership_percentage" numeric(5, 4),
	"valuation_at_investment" numeric(15, 2),
	"deal_tags" text[],
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "market_research" (
	"id" serial PRIMARY KEY NOT NULL,
	"opportunity_id" integer,
	"sector" text NOT NULL,
	"market_size" numeric(15, 2),
	"growth_rate" numeric(5, 2),
	"competitor_analysis" jsonb,
	"market_trends" text,
	"risk_factors" text,
	"opportunities" text,
	"research_date" timestamp DEFAULT now(),
	"researched_by" text,
	"sources" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pacing_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"fund_id" integer NOT NULL,
	"quarter" varchar(8) NOT NULL,
	"deployment_amount" numeric(15, 2) NOT NULL,
	"market_condition" varchar(16),
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "unique_fund_quarter" UNIQUE("fund_id","quarter")
);
--> statement-breakpoint
CREATE TABLE "pipeline_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"opportunity_id" integer,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"outcome" text,
	"participants" jsonb,
	"scheduled_date" timestamp,
	"completed_date" timestamp,
	"follow_up_required" boolean DEFAULT false,
	"follow_up_date" timestamp,
	"created_by" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pipeline_stages" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"order_index" integer NOT NULL,
	"color" text DEFAULT '#6b7280',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "portfoliocompanies" (
	"id" serial PRIMARY KEY NOT NULL,
	"fund_id" integer,
	"name" text NOT NULL,
	"sector" text NOT NULL,
	"stage" text NOT NULL,
	"investment_amount" numeric(15, 2) NOT NULL,
	"current_valuation" numeric(15, 2),
	"founded_year" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"description" text,
	"deal_tags" text[],
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reserve_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fund_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"decision_ts" timestamp with time zone NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"engine_type" "reserve_engine_type" NOT NULL,
	"engine_version" text NOT NULL,
	"request_id" text,
	"feature_flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"inputs" jsonb NOT NULL,
	"prediction" jsonb NOT NULL,
	"explanation" jsonb,
	"latency_ms" integer,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reserve_strategies" (
	"id" serial PRIMARY KEY NOT NULL,
	"fund_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"allocation" numeric(15, 2) NOT NULL,
	"confidence" numeric(3, 2),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "restoration_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fund_id" integer NOT NULL,
	"source_snapshot_id" uuid NOT NULL,
	"target_snapshot_id" uuid,
	"restoration_type" text NOT NULL,
	"restored_entities" text[],
	"exclusions" text[],
	"operation_id" uuid NOT NULL,
	"batch_id" uuid,
	"pre_restore_state" jsonb,
	"post_restore_state" jsonb,
	"state_changes" jsonb,
	"validation_passed" boolean DEFAULT false,
	"validation_errors" jsonb,
	"verification_hash" text,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone,
	"duration_ms" integer,
	"records_processed" integer,
	"restored_by" integer NOT NULL,
	"reason" text,
	"approved_by" integer,
	"status" text DEFAULT 'initiated' NOT NULL,
	"error_message" text,
	"rollback_snapshot_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scoring_models" (
	"id" serial PRIMARY KEY NOT NULL,
	"opportunity_id" integer,
	"criteria_name" text NOT NULL,
	"score" integer NOT NULL,
	"weight" numeric(3, 2) NOT NULL,
	"notes" text,
	"scored_by" text,
	"scored_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "snapshot_comparisons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fund_id" integer NOT NULL,
	"base_snapshot_id" uuid NOT NULL,
	"compare_snapshot_id" uuid NOT NULL,
	"comparison_type" text NOT NULL,
	"include_fields" text[],
	"exclude_fields" text[],
	"differences" jsonb NOT NULL,
	"summary" jsonb NOT NULL,
	"metrics_comparison" jsonb,
	"portfolio_changes" jsonb,
	"total_changes" integer NOT NULL,
	"significant_changes" integer NOT NULL,
	"change_categories" text[],
	"comparison_duration_ms" integer,
	"cache_status" text DEFAULT 'fresh',
	"last_used" timestamp with time zone DEFAULT now(),
	"requested_by" integer,
	"shared" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "snapshot_comparisons_unique" UNIQUE("base_snapshot_id","compare_snapshot_id","comparison_type")
);
--> statement-breakpoint
CREATE TABLE "snapshot_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"schema_version" text DEFAULT '1.0.0' NOT NULL,
	"api_version" text NOT NULL,
	"migration_version" text,
	"parent_snapshot_id" uuid,
	"derived_from" text,
	"snapshot_duration_ms" integer,
	"verification_duration_ms" integer,
	"record_count" integer,
	"entity_counts" jsonb,
	"validation_results" jsonb,
	"diff_from_parent" jsonb,
	"changes_summary" text,
	"significant_changes" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_company_id_portfoliocompanies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."portfoliocompanies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_fieldvalues" ADD CONSTRAINT "custom_fieldvalues_field_id_custom_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."custom_fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_fieldvalues" ADD CONSTRAINT "custom_fieldvalues_investment_id_portfoliocompanies_id_fk" FOREIGN KEY ("investment_id") REFERENCES "public"."portfoliocompanies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_opportunities" ADD CONSTRAINT "deal_opportunities_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "due_diligence_items" ADD CONSTRAINT "due_diligence_items_opportunity_id_deal_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."deal_opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_projections" ADD CONSTRAINT "financial_projections_opportunity_id_deal_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."deal_opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fundconfigs" ADD CONSTRAINT "fundconfigs_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_events" ADD CONSTRAINT "fund_events_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_events" ADD CONSTRAINT "fund_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_metrics" ADD CONSTRAINT "fund_metrics_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_snapshots" ADD CONSTRAINT "fund_snapshots_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_state_snapshots" ADD CONSTRAINT "fund_state_snapshots_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_state_snapshots" ADD CONSTRAINT "fund_state_snapshots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investments" ADD CONSTRAINT "investments_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investments" ADD CONSTRAINT "investments_company_id_portfoliocompanies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."portfoliocompanies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_research" ADD CONSTRAINT "market_research_opportunity_id_deal_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."deal_opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pacing_history" ADD CONSTRAINT "pacing_history_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_activities" ADD CONSTRAINT "pipeline_activities_opportunity_id_deal_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."deal_opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfoliocompanies" ADD CONSTRAINT "portfoliocompanies_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve_strategies" ADD CONSTRAINT "reserve_strategies_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve_strategies" ADD CONSTRAINT "reserve_strategies_company_id_portfoliocompanies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."portfoliocompanies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restoration_history" ADD CONSTRAINT "restoration_history_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restoration_history" ADD CONSTRAINT "restoration_history_source_snapshot_id_fund_state_snapshots_id_fk" FOREIGN KEY ("source_snapshot_id") REFERENCES "public"."fund_state_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restoration_history" ADD CONSTRAINT "restoration_history_target_snapshot_id_fund_state_snapshots_id_fk" FOREIGN KEY ("target_snapshot_id") REFERENCES "public"."fund_state_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restoration_history" ADD CONSTRAINT "restoration_history_restored_by_users_id_fk" FOREIGN KEY ("restored_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restoration_history" ADD CONSTRAINT "restoration_history_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restoration_history" ADD CONSTRAINT "restoration_history_rollback_snapshot_id_fund_state_snapshots_id_fk" FOREIGN KEY ("rollback_snapshot_id") REFERENCES "public"."fund_state_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_models" ADD CONSTRAINT "scoring_models_opportunity_id_deal_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."deal_opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_comparisons" ADD CONSTRAINT "snapshot_comparisons_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_comparisons" ADD CONSTRAINT "snapshot_comparisons_base_snapshot_id_fund_state_snapshots_id_fk" FOREIGN KEY ("base_snapshot_id") REFERENCES "public"."fund_state_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_comparisons" ADD CONSTRAINT "snapshot_comparisons_compare_snapshot_id_fund_state_snapshots_id_fk" FOREIGN KEY ("compare_snapshot_id") REFERENCES "public"."fund_state_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_comparisons" ADD CONSTRAINT "snapshot_comparisons_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_metadata" ADD CONSTRAINT "snapshot_metadata_snapshot_id_fund_state_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."fund_state_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_metadata" ADD CONSTRAINT "snapshot_metadata_parent_snapshot_id_fund_state_snapshots_id_fk" FOREIGN KEY ("parent_snapshot_id") REFERENCES "public"."fund_state_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_retention" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_correlation" ON "audit_log" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "idx_audit_user_action" ON "audit_log" USING btree ("user_id","action","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "fundconfigs_fund_version_idx" ON "fundconfigs" USING btree ("fund_id","version");--> statement-breakpoint
CREATE INDEX "fund_events_fund_idx" ON "fund_events" USING btree ("fund_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "fund_snapshots_lookup_idx" ON "fund_snapshots" USING btree ("fund_id","type","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "fund_state_snapshots_fund_time_idx" ON "fund_state_snapshots" USING btree ("fund_id","snapshot_time" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "fund_state_snapshots_name_idx" ON "fund_state_snapshots" USING btree ("fund_id","snapshot_name");--> statement-breakpoint
CREATE INDEX "fund_state_snapshots_hash_idx" ON "fund_state_snapshots" USING btree ("state_hash");--> statement-breakpoint
CREATE INDEX "fund_state_snapshots_tags_gin_idx" ON "fund_state_snapshots" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "fund_state_snapshots_bookmarked_idx" ON "fund_state_snapshots" USING btree ("fund_id","is_bookmarked");--> statement-breakpoint
CREATE INDEX "fund_state_snapshots_expiration_idx" ON "fund_state_snapshots" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_reserve_unique" ON "reserve_decisions" USING btree ("company_id","period_start","period_end","engine_type","engine_version");--> statement-breakpoint
CREATE INDEX "idx_reserve_fund_company" ON "reserve_decisions" USING btree ("fund_id","company_id");--> statement-breakpoint
CREATE INDEX "idx_reserve_period" ON "reserve_decisions" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX "idx_reserve_engine" ON "reserve_decisions" USING btree ("engine_type","engine_version");--> statement-breakpoint
CREATE INDEX "idx_reserve_inputs_gin" ON "reserve_decisions" USING gin ("inputs");--> statement-breakpoint
CREATE INDEX "idx_reserve_prediction_gin" ON "reserve_decisions" USING gin ("prediction");--> statement-breakpoint
CREATE INDEX "idx_reserve_strategies_fund_company" ON "reserve_strategies" USING btree ("fund_id","company_id");--> statement-breakpoint
CREATE INDEX "restoration_history_fund_operation_idx" ON "restoration_history" USING btree ("fund_id","operation_id");--> statement-breakpoint
CREATE INDEX "restoration_history_source_idx" ON "restoration_history" USING btree ("source_snapshot_id");--> statement-breakpoint
CREATE INDEX "restoration_history_time_range_idx" ON "restoration_history" USING btree ("start_time","end_time");--> statement-breakpoint
CREATE INDEX "restoration_history_status_idx" ON "restoration_history" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "restoration_history_user_idx" ON "restoration_history" USING btree ("restored_by","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "snapshot_comparisons_fund_idx" ON "snapshot_comparisons" USING btree ("fund_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "snapshot_comparisons_snapshots_idx" ON "snapshot_comparisons" USING btree ("base_snapshot_id","compare_snapshot_id");--> statement-breakpoint
CREATE INDEX "snapshot_comparisons_cache_idx" ON "snapshot_comparisons" USING btree ("cache_status","last_used");--> statement-breakpoint
CREATE INDEX "snapshot_comparisons_user_idx" ON "snapshot_comparisons" USING btree ("requested_by","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "snapshot_metadata_snapshot_idx" ON "snapshot_metadata" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "snapshot_metadata_parent_idx" ON "snapshot_metadata" USING btree ("parent_snapshot_id");--> statement-breakpoint
CREATE INDEX "snapshot_metadata_schema_version_idx" ON "snapshot_metadata" USING btree ("schema_version");