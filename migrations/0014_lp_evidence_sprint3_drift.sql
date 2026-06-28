-- @drift-patch
-- Migration: 0014_lp_evidence_sprint3_drift
-- Purpose: LP evidence and Sprint 3 schema drift; closes journal drift for issue #781.
-- Source of truth: drizzle-kit export from shared/schema.ts, shared/schema-lp-reporting.ts, and shared/schema-lp-sprint3.ts.
-- Replay safety: type guards, CREATE TABLE/INDEX IF NOT EXISTS, and FK constraint guards.

CREATE TABLE IF NOT EXISTS "vehicles" (
	"id" serial PRIMARY KEY NOT NULL,
	"fund_id" integer NOT NULL,
	"vehicle_slug" varchar(64) NOT NULL,
	"vehicle_type" varchar(16) NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text,
	"committed_capital" numeric(20, 6),
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"inception_date" date,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"spv_economics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"admin_burden_score" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_fund_slug_unique" UNIQUE("fund_id","vehicle_slug"),
	CONSTRAINT "vehicles_type_check" CHECK ("vehicles"."vehicle_type" IN ('main_fund', 'spv', 'co_invest')),
	CONSTRAINT "vehicles_status_check" CHECK ("vehicles"."status" IN ('active', 'winding_down', 'closed')),
	CONSTRAINT "vehicles_admin_score_check" CHECK ("vehicles"."admin_burden_score" IS NULL OR ("vehicles"."admin_burden_score" >= 0 AND "vehicles"."admin_burden_score" <= 100))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cash_flow_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"fund_id" integer NOT NULL,
	"vehicle_id" integer,
	"company_id" integer,
	"lp_id" integer,
	"event_type" varchar(32) NOT NULL,
	"amount" numeric(20, 6) NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"event_date" timestamp with time zone NOT NULL,
	"perspective" varchar(16) NOT NULL,
	"description" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" integer,
	"supersedes_event_id" integer,
	"reversal_of_event_id" integer,
	"imported_from" varchar(32),
	"import_batch_id" uuid,
	"source_hash" varchar(128),
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "cash_flow_event_type_check" CHECK ("cash_flow_events"."event_type" IN ('lp_capital_call', 'lp_distribution', 'fund_expense', 'portfolio_investment', 'realized_proceeds', 'recallable_distribution', 'reversal')),
	CONSTRAINT "cash_flow_perspective_check" CHECK ("cash_flow_events"."perspective" IN ('lp_net', 'fund_gross', 'vehicle', 'company')),
	CONSTRAINT "cash_flow_status_check" CHECK ("cash_flow_events"."status" IN ('draft', 'approved', 'locked', 'reversed')),
	CONSTRAINT "cash_flow_locked_not_mutable" CHECK ("cash_flow_events"."status" <> 'locked' OR "cash_flow_events"."locked_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "valuation_marks" (
	"id" serial PRIMARY KEY NOT NULL,
	"fund_id" integer NOT NULL,
	"vehicle_id" integer,
	"company_id" integer NOT NULL,
	"mark_date" date NOT NULL,
	"as_of_date" date NOT NULL,
	"fair_value" numeric(20, 6) NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"cost_basis" numeric(20, 6),
	"mark_source" varchar(64) NOT NULL,
	"confidence_level" varchar(16) NOT NULL,
	"valuation_method" varchar(64) NOT NULL,
	"methodology_notes" text,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"prior_mark_id" integer,
	"approved_by" integer,
	"approved_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"imported_from" varchar(32),
	"import_batch_id" uuid,
	"source_hash" varchar(128),
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "valuation_mark_source_check" CHECK ("valuation_marks"."mark_source" IN ('financing_round', 'signed_loi', 'revenue_milestone', 'strategic_partnership', 'audited_financials', 'board_update', 'gp_estimate', 'third_party_priced', 'secondary_transaction', 'impairment')),
	CONSTRAINT "valuation_confidence_check" CHECK ("valuation_marks"."confidence_level" IN ('high', 'medium', 'low')),
	CONSTRAINT "valuation_status_check" CHECK ("valuation_marks"."status" IN ('draft', 'approved', 'locked', 'superseded'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lp_metric_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"fund_id" integer NOT NULL,
	"vehicle_id" integer,
	"as_of_date" date NOT NULL,
	"run_type" varchar(32) NOT NULL,
	"perspective" varchar(16) NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"inputs_hash" varchar(128) NOT NULL,
	"source_event_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_mark_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"results_json" jsonb NOT NULL,
	"diagnostics_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"methodology_version" varchar(64) NOT NULL,
	"calculation_version" varchar(64) NOT NULL,
	"generated_by" integer,
	"approved_by" integer,
	"approved_at" timestamp with time zone,
	"locked_by" integer,
	"locked_at" timestamp with time zone,
	"exported_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "lp_metric_run_type_check" CHECK ("lp_metric_runs"."run_type" IN ('quarterly_report', 'fundraise_pack', 'internal_review', 'lp_update')),
	CONSTRAINT "lp_metric_run_perspective_check" CHECK ("lp_metric_runs"."perspective" IN ('lp_net', 'fund_gross', 'vehicle')),
	CONSTRAINT "lp_metric_run_status_check" CHECK ("lp_metric_runs"."status" IN ('draft', 'approved', 'locked', 'exported', 'superseded'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "narrative_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"fund_id" integer NOT NULL,
	"metric_run_id" integer NOT NULL,
	"as_of_date" date NOT NULL,
	"narrative_type" varchar(32) NOT NULL,
	"generated_text" text NOT NULL,
	"edited_text" text,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"generated_by" integer,
	"edited_by" integer,
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone,
	"approved_by" integer,
	"approved_at" timestamp with time zone,
	"exported_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "narrative_type_check" CHECK ("narrative_runs"."narrative_type" IN ('no_dpi', 'methodology', 'portfolio_update', 'risk_disclosure')),
	CONSTRAINT "narrative_status_check" CHECK ("narrative_runs"."status" IN ('draft', 'reviewed', 'approved', 'exported'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evidence_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"fund_id" integer NOT NULL,
	"valuation_mark_id" integer,
	"company_id" integer,
	"metric_run_id" integer,
	"narrative_run_id" integer,
	"idempotency_key" varchar(128),
	"evidence_source" varchar(64) NOT NULL,
	"source_date" date NOT NULL,
	"received_date" date,
	"expiration_date" date,
	"confidence_level" varchar(16) DEFAULT 'medium' NOT NULL,
	"materiality_level" varchar(16) DEFAULT 'medium' NOT NULL,
	"confidentiality" varchar(24) DEFAULT 'internal' NOT NULL,
	"redaction_required" boolean DEFAULT false NOT NULL,
	"document_hash" varchar(128),
	"valuation_policy_version" varchar(64),
	"description" text,
	"internal_notes" text,
	"lp_objection" text,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"uploaded_by" integer,
	"approved_by" integer,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "evidence_one_target_check" CHECK (num_nonnulls("evidence_records"."valuation_mark_id", "evidence_records"."company_id", "evidence_records"."metric_run_id", "evidence_records"."narrative_run_id") = 1),
	CONSTRAINT "evidence_source_check" CHECK ("evidence_records"."evidence_source" IN ('financing_round', 'signed_loi', 'revenue_milestone', 'strategic_partnership', 'audited_financials', 'board_update', 'gp_estimate', 'third_party_priced', 'secondary_transaction', 'customer_contract', 'management_report', 'auditor_confirmation')),
	CONSTRAINT "evidence_confidence_check" CHECK ("evidence_records"."confidence_level" IN ('high', 'medium', 'low')),
	CONSTRAINT "evidence_materiality_check" CHECK ("evidence_records"."materiality_level" IN ('high', 'medium', 'low')),
	CONSTRAINT "evidence_confidentiality_check" CHECK ("evidence_records"."confidentiality" IN ('internal', 'lp_shareable', 'restricted'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lp_report_packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"fund_id" integer NOT NULL,
	"metric_run_id" integer NOT NULL,
	"status" varchar(32) DEFAULT 'assembled' NOT NULL,
	"as_of_date" date NOT NULL,
	"metric_run_version" integer NOT NULL,
	"metric_run_locked_by" integer,
	"metric_run_locked_at" timestamp with time zone,
	"narrative_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"assembled_by" integer NOT NULL,
	"assembled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "lp_report_package_status_check" CHECK ("lp_report_packages"."status" IN ('assembled'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lp_report_package_exports" (
	"id" serial PRIMARY KEY NOT NULL,
	"fund_id" integer NOT NULL,
	"metric_run_id" integer NOT NULL,
	"report_package_id" integer NOT NULL,
	"format" varchar(16) DEFAULT 'json' NOT NULL,
	"export_version" integer DEFAULT 1 NOT NULL,
	"status" varchar(32) DEFAULT 'ready' NOT NULL,
	"content_hash_algorithm" varchar(16) DEFAULT 'sha256' NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"artifact_payload" jsonb NOT NULL,
	"artifact_size_bytes" integer NOT NULL,
	"created_by" integer NOT NULL,
	"ready_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "lp_report_package_export_format_check" CHECK ("lp_report_package_exports"."format" IN ('json','csv')),
	CONSTRAINT "lp_report_package_export_version_check" CHECK ("lp_report_package_exports"."export_version" = 1),
	CONSTRAINT "lp_report_package_export_status_check" CHECK ("lp_report_package_exports"."status" IN ('ready')),
	CONSTRAINT "lp_report_package_export_hash_algorithm_check" CHECK ("lp_report_package_exports"."content_hash_algorithm" IN ('sha256')),
	CONSTRAINT "lp_report_package_export_hash_check" CHECK ("lp_report_package_exports"."content_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "lp_report_package_export_artifact_size_check" CHECK ("lp_report_package_exports"."artifact_size_bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lp_vehicle_participation" (
	"id" serial PRIMARY KEY NOT NULL,
	"lp_id" integer NOT NULL,
	"vehicle_id" integer NOT NULL,
	"commitment_amount" numeric(20, 6) DEFAULT '0' NOT NULL,
	"status" varchar(32) DEFAULT 'exploratory' NOT NULL,
	"follow_on_interest" boolean DEFAULT false,
	"conversion_probability" numeric(5, 4),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "lp_participation_lp_vehicle_unique" UNIQUE("lp_id","vehicle_id"),
	CONSTRAINT "lp_participation_status_check" CHECK ("lp_vehicle_participation"."status" IN ('main_fund_aligned', 'spv_only', 'exploratory', 'high_conversion_prospect', 'low_conversion_prospect', 'committed_to_fund_ii', 'declined'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lp_vehicle_participation_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"lp_vehicle_participation_id" integer NOT NULL,
	"from_status" varchar(32),
	"to_status" varchar(32) NOT NULL,
	"changed_by" integer,
	"changed_at" timestamp with time zone DEFAULT now(),
	"reason" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lp_capital_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lp_id" integer NOT NULL,
	"fund_id" integer NOT NULL,
	"commitment_id" integer NOT NULL,
	"call_number" integer NOT NULL,
	"call_amount_cents" bigint NOT NULL,
	"due_date" date NOT NULL,
	"call_date" date NOT NULL,
	"purpose" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"paid_amount_cents" bigint DEFAULT 0,
	"paid_date" date,
	"wire_instructions" jsonb NOT NULL,
	"idempotency_key" varchar(128),
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lp_capital_calls_lp_id_fund_id_call_number_unique" UNIQUE("lp_id","fund_id","call_number"),
	CONSTRAINT "lp_capital_calls_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "lp_capital_calls_status_check" CHECK ("lp_capital_calls"."status" IN ('pending', 'due', 'overdue', 'paid', 'partial')),
	CONSTRAINT "lp_capital_calls_amount_check" CHECK ("lp_capital_calls"."call_amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lp_payment_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"payment_date" date NOT NULL,
	"reference_number" varchar(100) NOT NULL,
	"receipt_url" varchar(500),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"submitted_by" integer,
	"confirmed_by" integer,
	"confirmed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lp_payment_submissions_status_check" CHECK ("lp_payment_submissions"."status" IN ('pending', 'confirmed', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lp_distribution_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lp_id" integer NOT NULL,
	"fund_id" integer NOT NULL,
	"commitment_id" integer NOT NULL,
	"distribution_number" integer NOT NULL,
	"total_amount_cents" bigint NOT NULL,
	"distribution_date" date NOT NULL,
	"distribution_type" varchar(30) NOT NULL,
	"return_of_capital_cents" bigint DEFAULT 0 NOT NULL,
	"preferred_return_cents" bigint DEFAULT 0 NOT NULL,
	"carried_interest_cents" bigint DEFAULT 0 NOT NULL,
	"catch_up_cents" bigint DEFAULT 0 NOT NULL,
	"non_taxable_cents" bigint DEFAULT 0 NOT NULL,
	"ordinary_income_cents" bigint DEFAULT 0 NOT NULL,
	"long_term_gains_cents" bigint DEFAULT 0 NOT NULL,
	"qualified_dividends_cents" bigint DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"wire_date" date,
	"wire_reference" varchar(100),
	"notes" text,
	"idempotency_key" varchar(128),
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lp_distribution_details_lp_id_fund_id_distribution_number_unique" UNIQUE("lp_id","fund_id","distribution_number"),
	CONSTRAINT "lp_distribution_details_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "lp_distribution_details_status_check" CHECK ("lp_distribution_details"."status" IN ('pending', 'processing', 'completed')),
	CONSTRAINT "lp_distribution_details_type_check" CHECK ("lp_distribution_details"."distribution_type" IN ('return_of_capital', 'capital_gains', 'dividend', 'mixed'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lp_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lp_id" integer NOT NULL,
	"fund_id" integer,
	"document_type" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"file_name" varchar(255) NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"storage_key" varchar(500) NOT NULL,
	"document_date" date,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"access_level" varchar(20) DEFAULT 'standard' NOT NULL,
	"status" varchar(20) DEFAULT 'available' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lp_documents_type_check" CHECK ("lp_documents"."document_type" IN ('quarterly_report', 'annual_report', 'k1', 'lpa', 'side_letter', 'fund_overview', 'other')),
	CONSTRAINT "lp_documents_access_level_check" CHECK ("lp_documents"."access_level" IN ('standard', 'sensitive')),
	CONSTRAINT "lp_documents_status_check" CHECK ("lp_documents"."status" IN ('available', 'archived'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lp_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lp_id" integer NOT NULL,
	"type" varchar(30) NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"related_entity_type" varchar(30),
	"related_entity_id" uuid,
	"action_url" varchar(500),
	"read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lp_notifications_type_check" CHECK ("lp_notifications"."type" IN ('capital_call', 'distribution', 'report_ready', 'document', 'system')),
	CONSTRAINT "lp_notifications_entity_type_check" CHECK ("lp_notifications"."related_entity_type" IS NULL OR "lp_notifications"."related_entity_type" IN ('capital_call', 'distribution', 'report', 'document'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lp_notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lp_id" integer NOT NULL,
	"email_capital_calls" boolean DEFAULT true NOT NULL,
	"email_distributions" boolean DEFAULT true NOT NULL,
	"email_quarterly_reports" boolean DEFAULT true NOT NULL,
	"email_annual_reports" boolean DEFAULT true NOT NULL,
	"email_market_updates" boolean DEFAULT false NOT NULL,
	"in_app_capital_calls" boolean DEFAULT true NOT NULL,
	"in_app_distributions" boolean DEFAULT true NOT NULL,
	"in_app_reports" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lp_notification_preferences_lp_id_unique" UNIQUE("lp_id")
);
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.vehicles') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.vehicles'::regclass
         AND conname = 'vehicles_fund_id_funds_id_fk'
     ) THEN
    ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.cash_flow_events') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.cash_flow_events'::regclass
         AND conname = 'cash_flow_events_fund_id_funds_id_fk'
     ) THEN
    ALTER TABLE "cash_flow_events" ADD CONSTRAINT "cash_flow_events_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.cash_flow_events') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.cash_flow_events'::regclass
         AND conname = 'cash_flow_events_vehicle_id_vehicles_id_fk'
     ) THEN
    ALTER TABLE "cash_flow_events" ADD CONSTRAINT "cash_flow_events_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.cash_flow_events') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.cash_flow_events'::regclass
         AND conname = 'cash_flow_events_company_id_portfoliocompanies_id_fk'
     ) THEN
    ALTER TABLE "cash_flow_events" ADD CONSTRAINT "cash_flow_events_company_id_portfoliocompanies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."portfoliocompanies"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.cash_flow_events') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.cash_flow_events'::regclass
         AND conname = 'cash_flow_events_lp_id_limited_partners_id_fk'
     ) THEN
    ALTER TABLE "cash_flow_events" ADD CONSTRAINT "cash_flow_events_lp_id_limited_partners_id_fk" FOREIGN KEY ("lp_id") REFERENCES "public"."limited_partners"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.cash_flow_events') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.cash_flow_events'::regclass
         AND conname = 'cash_flow_events_locked_by_users_id_fk'
     ) THEN
    ALTER TABLE "cash_flow_events" ADD CONSTRAINT "cash_flow_events_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.cash_flow_events') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.cash_flow_events'::regclass
         AND conname = 'cash_flow_events_supersedes_event_id_cash_flow_events_id_fk'
     ) THEN
    ALTER TABLE "cash_flow_events" ADD CONSTRAINT "cash_flow_events_supersedes_event_id_cash_flow_events_id_fk" FOREIGN KEY ("supersedes_event_id") REFERENCES "public"."cash_flow_events"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.cash_flow_events') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.cash_flow_events'::regclass
         AND conname = 'cash_flow_events_reversal_of_event_id_cash_flow_events_id_fk'
     ) THEN
    ALTER TABLE "cash_flow_events" ADD CONSTRAINT "cash_flow_events_reversal_of_event_id_cash_flow_events_id_fk" FOREIGN KEY ("reversal_of_event_id") REFERENCES "public"."cash_flow_events"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.cash_flow_events') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.cash_flow_events'::regclass
         AND conname = 'cash_flow_events_created_by_users_id_fk'
     ) THEN
    ALTER TABLE "cash_flow_events" ADD CONSTRAINT "cash_flow_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.valuation_marks') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.valuation_marks'::regclass
         AND conname = 'valuation_marks_fund_id_funds_id_fk'
     ) THEN
    ALTER TABLE "valuation_marks" ADD CONSTRAINT "valuation_marks_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.valuation_marks') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.valuation_marks'::regclass
         AND conname = 'valuation_marks_vehicle_id_vehicles_id_fk'
     ) THEN
    ALTER TABLE "valuation_marks" ADD CONSTRAINT "valuation_marks_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.valuation_marks') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.valuation_marks'::regclass
         AND conname = 'valuation_marks_company_id_portfoliocompanies_id_fk'
     ) THEN
    ALTER TABLE "valuation_marks" ADD CONSTRAINT "valuation_marks_company_id_portfoliocompanies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."portfoliocompanies"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.valuation_marks') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.valuation_marks'::regclass
         AND conname = 'valuation_marks_prior_mark_id_valuation_marks_id_fk'
     ) THEN
    ALTER TABLE "valuation_marks" ADD CONSTRAINT "valuation_marks_prior_mark_id_valuation_marks_id_fk" FOREIGN KEY ("prior_mark_id") REFERENCES "public"."valuation_marks"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.valuation_marks') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.valuation_marks'::regclass
         AND conname = 'valuation_marks_approved_by_users_id_fk'
     ) THEN
    ALTER TABLE "valuation_marks" ADD CONSTRAINT "valuation_marks_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.valuation_marks') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.valuation_marks'::regclass
         AND conname = 'valuation_marks_created_by_users_id_fk'
     ) THEN
    ALTER TABLE "valuation_marks" ADD CONSTRAINT "valuation_marks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_metric_runs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_metric_runs'::regclass
         AND conname = 'lp_metric_runs_fund_id_funds_id_fk'
     ) THEN
    ALTER TABLE "lp_metric_runs" ADD CONSTRAINT "lp_metric_runs_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_metric_runs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_metric_runs'::regclass
         AND conname = 'lp_metric_runs_vehicle_id_vehicles_id_fk'
     ) THEN
    ALTER TABLE "lp_metric_runs" ADD CONSTRAINT "lp_metric_runs_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_metric_runs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_metric_runs'::regclass
         AND conname = 'lp_metric_runs_generated_by_users_id_fk'
     ) THEN
    ALTER TABLE "lp_metric_runs" ADD CONSTRAINT "lp_metric_runs_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_metric_runs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_metric_runs'::regclass
         AND conname = 'lp_metric_runs_approved_by_users_id_fk'
     ) THEN
    ALTER TABLE "lp_metric_runs" ADD CONSTRAINT "lp_metric_runs_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_metric_runs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_metric_runs'::regclass
         AND conname = 'lp_metric_runs_locked_by_users_id_fk'
     ) THEN
    ALTER TABLE "lp_metric_runs" ADD CONSTRAINT "lp_metric_runs_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.narrative_runs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.narrative_runs'::regclass
         AND conname = 'narrative_runs_fund_id_funds_id_fk'
     ) THEN
    ALTER TABLE "narrative_runs" ADD CONSTRAINT "narrative_runs_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.narrative_runs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.narrative_runs'::regclass
         AND conname = 'narrative_runs_metric_run_id_lp_metric_runs_id_fk'
     ) THEN
    ALTER TABLE "narrative_runs" ADD CONSTRAINT "narrative_runs_metric_run_id_lp_metric_runs_id_fk" FOREIGN KEY ("metric_run_id") REFERENCES "public"."lp_metric_runs"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.narrative_runs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.narrative_runs'::regclass
         AND conname = 'narrative_runs_generated_by_users_id_fk'
     ) THEN
    ALTER TABLE "narrative_runs" ADD CONSTRAINT "narrative_runs_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.narrative_runs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.narrative_runs'::regclass
         AND conname = 'narrative_runs_edited_by_users_id_fk'
     ) THEN
    ALTER TABLE "narrative_runs" ADD CONSTRAINT "narrative_runs_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.narrative_runs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.narrative_runs'::regclass
         AND conname = 'narrative_runs_reviewed_by_users_id_fk'
     ) THEN
    ALTER TABLE "narrative_runs" ADD CONSTRAINT "narrative_runs_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.narrative_runs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.narrative_runs'::regclass
         AND conname = 'narrative_runs_approved_by_users_id_fk'
     ) THEN
    ALTER TABLE "narrative_runs" ADD CONSTRAINT "narrative_runs_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.evidence_records') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.evidence_records'::regclass
         AND conname = 'evidence_records_fund_id_funds_id_fk'
     ) THEN
    ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.evidence_records') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.evidence_records'::regclass
         AND conname = 'evidence_records_valuation_mark_id_valuation_marks_id_fk'
     ) THEN
    ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_valuation_mark_id_valuation_marks_id_fk" FOREIGN KEY ("valuation_mark_id") REFERENCES "public"."valuation_marks"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.evidence_records') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.evidence_records'::regclass
         AND conname = 'evidence_records_company_id_portfoliocompanies_id_fk'
     ) THEN
    ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_company_id_portfoliocompanies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."portfoliocompanies"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.evidence_records') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.evidence_records'::regclass
         AND conname = 'evidence_records_metric_run_id_lp_metric_runs_id_fk'
     ) THEN
    ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_metric_run_id_lp_metric_runs_id_fk" FOREIGN KEY ("metric_run_id") REFERENCES "public"."lp_metric_runs"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.evidence_records') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.evidence_records'::regclass
         AND conname = 'evidence_records_narrative_run_id_narrative_runs_id_fk'
     ) THEN
    ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_narrative_run_id_narrative_runs_id_fk" FOREIGN KEY ("narrative_run_id") REFERENCES "public"."narrative_runs"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.evidence_records') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.evidence_records'::regclass
         AND conname = 'evidence_records_uploaded_by_users_id_fk'
     ) THEN
    ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.evidence_records') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.evidence_records'::regclass
         AND conname = 'evidence_records_approved_by_users_id_fk'
     ) THEN
    ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_report_packages') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_report_packages'::regclass
         AND conname = 'lp_report_packages_fund_id_funds_id_fk'
     ) THEN
    ALTER TABLE "lp_report_packages" ADD CONSTRAINT "lp_report_packages_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_report_packages') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_report_packages'::regclass
         AND conname = 'lp_report_packages_metric_run_id_lp_metric_runs_id_fk'
     ) THEN
    ALTER TABLE "lp_report_packages" ADD CONSTRAINT "lp_report_packages_metric_run_id_lp_metric_runs_id_fk" FOREIGN KEY ("metric_run_id") REFERENCES "public"."lp_metric_runs"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_report_packages') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_report_packages'::regclass
         AND conname = 'lp_report_packages_metric_run_locked_by_users_id_fk'
     ) THEN
    ALTER TABLE "lp_report_packages" ADD CONSTRAINT "lp_report_packages_metric_run_locked_by_users_id_fk" FOREIGN KEY ("metric_run_locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_report_packages') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_report_packages'::regclass
         AND conname = 'lp_report_packages_assembled_by_users_id_fk'
     ) THEN
    ALTER TABLE "lp_report_packages" ADD CONSTRAINT "lp_report_packages_assembled_by_users_id_fk" FOREIGN KEY ("assembled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_report_package_exports') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_report_package_exports'::regclass
         AND conname = 'lp_report_package_exports_fund_id_funds_id_fk'
     ) THEN
    ALTER TABLE "lp_report_package_exports" ADD CONSTRAINT "lp_report_package_exports_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_report_package_exports') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_report_package_exports'::regclass
         AND conname = 'lp_report_package_exports_metric_run_id_lp_metric_runs_id_fk'
     ) THEN
    ALTER TABLE "lp_report_package_exports" ADD CONSTRAINT "lp_report_package_exports_metric_run_id_lp_metric_runs_id_fk" FOREIGN KEY ("metric_run_id") REFERENCES "public"."lp_metric_runs"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_report_package_exports') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_report_package_exports'::regclass
         AND conname = 'lp_report_package_exports_report_package_id_lp_report_packages_id_fk'
     ) THEN
    ALTER TABLE "lp_report_package_exports" ADD CONSTRAINT "lp_report_package_exports_report_package_id_lp_report_packages_id_fk" FOREIGN KEY ("report_package_id") REFERENCES "public"."lp_report_packages"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_report_package_exports') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_report_package_exports'::regclass
         AND conname = 'lp_report_package_exports_created_by_users_id_fk'
     ) THEN
    ALTER TABLE "lp_report_package_exports" ADD CONSTRAINT "lp_report_package_exports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_vehicle_participation') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_vehicle_participation'::regclass
         AND conname = 'lp_vehicle_participation_lp_id_limited_partners_id_fk'
     ) THEN
    ALTER TABLE "lp_vehicle_participation" ADD CONSTRAINT "lp_vehicle_participation_lp_id_limited_partners_id_fk" FOREIGN KEY ("lp_id") REFERENCES "public"."limited_partners"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_vehicle_participation') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_vehicle_participation'::regclass
         AND conname = 'lp_vehicle_participation_vehicle_id_vehicles_id_fk'
     ) THEN
    ALTER TABLE "lp_vehicle_participation" ADD CONSTRAINT "lp_vehicle_participation_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_vehicle_participation_history') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_vehicle_participation_history'::regclass
         AND conname = 'lp_vehicle_participation_history_lp_vehicle_participation_id_lp_vehicle_participation_id_fk'
     ) THEN
    ALTER TABLE "lp_vehicle_participation_history" ADD CONSTRAINT "lp_vehicle_participation_history_lp_vehicle_participation_id_lp_vehicle_participation_id_fk" FOREIGN KEY ("lp_vehicle_participation_id") REFERENCES "public"."lp_vehicle_participation"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_vehicle_participation_history') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_vehicle_participation_history'::regclass
         AND conname = 'lp_vehicle_participation_history_changed_by_users_id_fk'
     ) THEN
    ALTER TABLE "lp_vehicle_participation_history" ADD CONSTRAINT "lp_vehicle_participation_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_capital_calls') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_capital_calls'::regclass
         AND conname = 'lp_capital_calls_lp_id_limited_partners_id_fk'
     ) THEN
    ALTER TABLE "lp_capital_calls" ADD CONSTRAINT "lp_capital_calls_lp_id_limited_partners_id_fk" FOREIGN KEY ("lp_id") REFERENCES "public"."limited_partners"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_capital_calls') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_capital_calls'::regclass
         AND conname = 'lp_capital_calls_fund_id_funds_id_fk'
     ) THEN
    ALTER TABLE "lp_capital_calls" ADD CONSTRAINT "lp_capital_calls_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_capital_calls') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_capital_calls'::regclass
         AND conname = 'lp_capital_calls_commitment_id_lp_fund_commitments_id_fk'
     ) THEN
    ALTER TABLE "lp_capital_calls" ADD CONSTRAINT "lp_capital_calls_commitment_id_lp_fund_commitments_id_fk" FOREIGN KEY ("commitment_id") REFERENCES "public"."lp_fund_commitments"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_payment_submissions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_payment_submissions'::regclass
         AND conname = 'lp_payment_submissions_call_id_lp_capital_calls_id_fk'
     ) THEN
    ALTER TABLE "lp_payment_submissions" ADD CONSTRAINT "lp_payment_submissions_call_id_lp_capital_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."lp_capital_calls"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_distribution_details') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_distribution_details'::regclass
         AND conname = 'lp_distribution_details_lp_id_limited_partners_id_fk'
     ) THEN
    ALTER TABLE "lp_distribution_details" ADD CONSTRAINT "lp_distribution_details_lp_id_limited_partners_id_fk" FOREIGN KEY ("lp_id") REFERENCES "public"."limited_partners"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_distribution_details') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_distribution_details'::regclass
         AND conname = 'lp_distribution_details_fund_id_funds_id_fk'
     ) THEN
    ALTER TABLE "lp_distribution_details" ADD CONSTRAINT "lp_distribution_details_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_distribution_details') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_distribution_details'::regclass
         AND conname = 'lp_distribution_details_commitment_id_lp_fund_commitments_id_fk'
     ) THEN
    ALTER TABLE "lp_distribution_details" ADD CONSTRAINT "lp_distribution_details_commitment_id_lp_fund_commitments_id_fk" FOREIGN KEY ("commitment_id") REFERENCES "public"."lp_fund_commitments"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_documents') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_documents'::regclass
         AND conname = 'lp_documents_lp_id_limited_partners_id_fk'
     ) THEN
    ALTER TABLE "lp_documents" ADD CONSTRAINT "lp_documents_lp_id_limited_partners_id_fk" FOREIGN KEY ("lp_id") REFERENCES "public"."limited_partners"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_documents') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_documents'::regclass
         AND conname = 'lp_documents_fund_id_funds_id_fk'
     ) THEN
    ALTER TABLE "lp_documents" ADD CONSTRAINT "lp_documents_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_notifications') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_notifications'::regclass
         AND conname = 'lp_notifications_lp_id_limited_partners_id_fk'
     ) THEN
    ALTER TABLE "lp_notifications" ADD CONSTRAINT "lp_notifications_lp_id_limited_partners_id_fk" FOREIGN KEY ("lp_id") REFERENCES "public"."limited_partners"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_notification_preferences') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_notification_preferences'::regclass
         AND conname = 'lp_notification_preferences_lp_id_limited_partners_id_fk'
     ) THEN
    ALTER TABLE "lp_notification_preferences" ADD CONSTRAINT "lp_notification_preferences_lp_id_limited_partners_id_fk" FOREIGN KEY ("lp_id") REFERENCES "public"."limited_partners"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vehicles_fund_type" ON "vehicles" USING btree ("fund_id","vehicle_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cash_flow_fund_date" ON "cash_flow_events" USING btree ("fund_id","event_date" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cash_flow_vehicle_date" ON "cash_flow_events" USING btree ("vehicle_id","event_date" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cash_flow_company_date" ON "cash_flow_events" USING btree ("company_id","event_date" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cash_flow_event_type" ON "cash_flow_events" USING btree ("event_type","event_date" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cash_flow_import_batch" ON "cash_flow_events" USING btree ("import_batch_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cash_flow_events_fund_source_hash_unique" ON "cash_flow_events" USING btree ("fund_id","source_hash") WHERE "cash_flow_events"."source_hash" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_valuation_marks_fund_asof" ON "valuation_marks" USING btree ("fund_id","as_of_date" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_valuation_marks_company_asof" ON "valuation_marks" USING btree ("company_id","as_of_date" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_valuation_marks_vehicle_asof" ON "valuation_marks" USING btree ("vehicle_id","as_of_date" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_valuation_marks_import_batch" ON "valuation_marks" USING btree ("import_batch_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "valuation_marks_fund_source_hash_unique" ON "valuation_marks" USING btree ("fund_id","source_hash") WHERE "valuation_marks"."source_hash" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lp_metric_runs_fund_asof" ON "lp_metric_runs" USING btree ("fund_id","as_of_date" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lp_metric_runs_vehicle_asof" ON "lp_metric_runs" USING btree ("vehicle_id","as_of_date" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lp_metric_runs_status" ON "lp_metric_runs" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lp_metric_runs_fund_run_inputs_unique" ON "lp_metric_runs" USING btree ("fund_id","run_type","perspective","as_of_date","inputs_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_narrative_runs_metric_run" ON "narrative_runs" USING btree ("metric_run_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "narrative_runs_metric_run_type_unique" ON "narrative_runs" USING btree ("metric_run_id","narrative_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_evidence_fund" ON "evidence_records" USING btree ("fund_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_evidence_valuation_mark" ON "evidence_records" USING btree ("valuation_mark_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_evidence_company" ON "evidence_records" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_evidence_metric_run" ON "evidence_records" USING btree ("metric_run_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "evidence_records_metric_run_idempotency_unique" ON "evidence_records" USING btree ("fund_id","metric_run_id","idempotency_key") WHERE "evidence_records"."idempotency_key" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_evidence_narrative_run" ON "evidence_records" USING btree ("narrative_run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_evidence_expiration_date" ON "evidence_records" USING btree ("expiration_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_evidence_confidence" ON "evidence_records" USING btree ("confidence_level");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_evidence_confidentiality" ON "evidence_records" USING btree ("confidentiality");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lp_report_packages_metric_run_unique" ON "lp_report_packages" USING btree ("metric_run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lp_report_packages_fund_metric" ON "lp_report_packages" USING btree ("fund_id","metric_run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lp_report_packages_fund_assembled_at" ON "lp_report_packages" USING btree ("fund_id","assembled_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lp_report_package_exports_package_format_version_unique" ON "lp_report_package_exports" USING btree ("report_package_id","format","export_version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lp_report_package_exports_fund_metric" ON "lp_report_package_exports" USING btree ("fund_id","metric_run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lp_report_package_exports_fund_metric_package" ON "lp_report_package_exports" USING btree ("fund_id","metric_run_id","report_package_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lp_report_package_exports_fund_ready_at" ON "lp_report_package_exports" USING btree ("fund_id","ready_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lp_vehicle_participation_vehicle" ON "lp_vehicle_participation" USING btree ("vehicle_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lp_vehicle_participation_history_parent_changed_at" ON "lp_vehicle_participation_history" USING btree ("lp_vehicle_participation_id","changed_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_capital_calls_lp_status_idx" ON "lp_capital_calls" USING btree ("lp_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_capital_calls_due_date_idx" ON "lp_capital_calls" USING btree ("due_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_capital_calls_cursor_idx" ON "lp_capital_calls" USING btree ("lp_id","call_date" DESC NULLS LAST,"id" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_payment_submissions_call_id_idx" ON "lp_payment_submissions" USING btree ("call_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_payment_submissions_status_idx" ON "lp_payment_submissions" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_distribution_details_lp_date_idx" ON "lp_distribution_details" USING btree ("lp_id","distribution_date" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_distribution_details_year_idx" ON "lp_distribution_details" USING btree (EXTRACT(YEAR FROM "distribution_date"));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_distribution_details_cursor_idx" ON "lp_distribution_details" USING btree ("lp_id","distribution_date" DESC NULLS LAST,"id" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_documents_lp_id_idx" ON "lp_documents" USING btree ("lp_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_documents_type_idx" ON "lp_documents" USING btree ("document_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_documents_fund_id_idx" ON "lp_documents" USING btree ("fund_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_documents_published_idx" ON "lp_documents" USING btree ("published_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_notifications_lp_unread_idx" ON "lp_notifications" USING btree ("lp_id","read") WHERE "lp_notifications"."read" = FALSE;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_notifications_created_idx" ON "lp_notifications" USING btree ("created_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_notifications_expires_idx" ON "lp_notifications" USING btree ("expires_at");
