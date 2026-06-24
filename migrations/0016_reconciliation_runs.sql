-- Migration: 0016_reconciliation_runs
-- Purpose: Persist MOIC reconciliation run metadata and evidence summaries.
-- Replay safety: CREATE TABLE/INDEX IF NOT EXISTS plus guarded constraints.

CREATE TABLE IF NOT EXISTS "reconciliation_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "fund_id" integer NOT NULL,
  "idempotency_key" text NOT NULL,
  "request_hash" text NOT NULL,
  "requested_by" integer,
  "requested_at" timestamptz DEFAULT now() NOT NULL,
  "status" varchar(16) DEFAULT 'completed' NOT NULL,
  "legacy_input_hash" text NOT NULL,
  "candidate_input_hash" text NOT NULL,
  "evidence_input_hash" text NOT NULL,
  "assumptions_hash" text NOT NULL,
  "legacy_output_hash" text NOT NULL,
  "candidate_output_hash" text NOT NULL,
  "candidate_material" boolean DEFAULT false NOT NULL,
  "materiality_epsilon" double precision NOT NULL,
  "diff_summary" jsonb NOT NULL,
  "round_evidence_summary" jsonb NOT NULL,
  CONSTRAINT "reconciliation_runs_idempotency_key_unique" UNIQUE ("idempotency_key"),
  CONSTRAINT "reconciliation_runs_status_check" CHECK ("status" IN ('pending','completed','failed'))
);
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.reconciliation_runs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.reconciliation_runs'::regclass
         AND conname = 'reconciliation_runs_fund_id_funds_id_fk'
     ) THEN
    ALTER TABLE "reconciliation_runs"
      ADD CONSTRAINT "reconciliation_runs_fund_id_funds_id_fk"
      FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.reconciliation_runs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.reconciliation_runs'::regclass
         AND conname = 'reconciliation_runs_requested_by_users_id_fk'
     ) THEN
    ALTER TABLE "reconciliation_runs"
      ADD CONSTRAINT "reconciliation_runs_requested_by_users_id_fk"
      FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.reconciliation_runs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.reconciliation_runs'::regclass
         AND conname = 'reconciliation_runs_idempotency_key_unique'
     ) THEN
    ALTER TABLE "reconciliation_runs"
      ADD CONSTRAINT "reconciliation_runs_idempotency_key_unique" UNIQUE ("idempotency_key");
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.reconciliation_runs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.reconciliation_runs'::regclass
         AND conname = 'reconciliation_runs_status_check'
     ) THEN
    ALTER TABLE "reconciliation_runs"
      ADD CONSTRAINT "reconciliation_runs_status_check" CHECK ("status" IN ('pending','completed','failed'));
  END IF;
END
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reconciliation_runs_fund_requested"
  ON "reconciliation_runs" USING btree ("fund_id", "requested_at" DESC);
