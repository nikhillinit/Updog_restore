-- Migration: 0018_h9_actionability_snapshot_columns
-- Purpose: Add H9 financial actionability fingerprint columns to tables whose
-- Drizzle schemas read them in clean test and deployment databases.
-- Replay safety: guarded ALTERs and guarded check constraints.

ALTER TABLE IF EXISTS "fund_snapshots"
  ADD COLUMN IF NOT EXISTS "h9_moic_source_input_hash" text,
  ADD COLUMN IF NOT EXISTS "h9_round_evidence_input_hash" text,
  ADD COLUMN IF NOT EXISTS "h9_round_evidence_assumptions_hash" text,
  ADD COLUMN IF NOT EXISTS "h9_fingerprint_hash" text,
  ADD COLUMN IF NOT EXISTS "h9_policy_version" text,
  ADD COLUMN IF NOT EXISTS "h9_actionability_status" varchar(24);
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.fund_snapshots') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.fund_snapshots'::regclass
         AND conname = 'fund_snapshots_h9_actionability_status_check'
     ) THEN
    ALTER TABLE "fund_snapshots"
      ADD CONSTRAINT "fund_snapshots_h9_actionability_status_check"
      CHECK (
        "h9_actionability_status" IS NULL
        OR "h9_actionability_status" IN (
          'actionable',
          'input_only',
          'non_actionable',
          'quarantined',
          'unknown_legacy'
        )
      );
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.fund_snapshots') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.fund_snapshots'::regclass
         AND conname = 'fund_snapshots_h9_actionable_fingerprint_check'
     ) THEN
    ALTER TABLE "fund_snapshots"
      ADD CONSTRAINT "fund_snapshots_h9_actionable_fingerprint_check"
      CHECK (
        "h9_actionability_status" IS NULL
        OR "h9_actionability_status" <> 'actionable'
        OR (
          "h9_moic_source_input_hash" IS NOT NULL
          AND "h9_round_evidence_input_hash" IS NOT NULL
          AND "h9_round_evidence_assumptions_hash" IS NOT NULL
          AND "h9_fingerprint_hash" IS NOT NULL
          AND "h9_policy_version" IS NOT NULL
        )
      );
  END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE IF EXISTS "fund_calculation_modes"
  ADD COLUMN IF NOT EXISTS "h9_moic_source_input_hash" text,
  ADD COLUMN IF NOT EXISTS "h9_round_evidence_input_hash" text,
  ADD COLUMN IF NOT EXISTS "h9_round_evidence_assumptions_hash" text,
  ADD COLUMN IF NOT EXISTS "h9_fingerprint_hash" text,
  ADD COLUMN IF NOT EXISTS "h9_policy_version" text,
  ADD COLUMN IF NOT EXISTS "h9_actionability_status" varchar(24);
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.fund_calculation_modes') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.fund_calculation_modes'::regclass
         AND conname = 'fund_calculation_modes_h9_actionability_status_check'
     ) THEN
    ALTER TABLE "fund_calculation_modes"
      ADD CONSTRAINT "fund_calculation_modes_h9_actionability_status_check"
      CHECK (
        "h9_actionability_status" IS NULL
        OR "h9_actionability_status" IN (
          'actionable',
          'input_only',
          'non_actionable',
          'quarantined',
          'unknown_legacy'
        )
      );
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.fund_calculation_modes') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.fund_calculation_modes'::regclass
         AND conname = 'fund_calculation_modes_h9_actionable_fingerprint_check'
     ) THEN
    ALTER TABLE "fund_calculation_modes"
      ADD CONSTRAINT "fund_calculation_modes_h9_actionable_fingerprint_check"
      CHECK (
        "h9_actionability_status" IS NULL
        OR "h9_actionability_status" <> 'actionable'
        OR (
          "h9_moic_source_input_hash" IS NOT NULL
          AND "h9_round_evidence_input_hash" IS NOT NULL
          AND "h9_round_evidence_assumptions_hash" IS NOT NULL
          AND "h9_fingerprint_hash" IS NOT NULL
          AND "h9_policy_version" IS NOT NULL
        )
      );
  END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE IF EXISTS "lp_report_packages"
  ADD COLUMN IF NOT EXISTS "h9_moic_source_input_hash" text,
  ADD COLUMN IF NOT EXISTS "h9_round_evidence_input_hash" text,
  ADD COLUMN IF NOT EXISTS "h9_round_evidence_assumptions_hash" text,
  ADD COLUMN IF NOT EXISTS "h9_fingerprint_hash" text,
  ADD COLUMN IF NOT EXISTS "h9_policy_version" text,
  ADD COLUMN IF NOT EXISTS "h9_actionability_status" varchar(24);
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lp_report_packages') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.lp_report_packages'::regclass
         AND conname = 'lp_report_packages_h9_actionability_status_check'
     ) THEN
    ALTER TABLE "lp_report_packages"
      ADD CONSTRAINT "lp_report_packages_h9_actionability_status_check"
      CHECK (
        "h9_actionability_status" IS NULL
        OR "h9_actionability_status" IN (
          'actionable',
          'input_only',
          'non_actionable',
          'quarantined',
          'unknown_legacy'
        )
      );
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
         AND conname = 'lp_report_packages_h9_actionable_fingerprint_check'
     ) THEN
    ALTER TABLE "lp_report_packages"
      ADD CONSTRAINT "lp_report_packages_h9_actionable_fingerprint_check"
      CHECK (
        "h9_actionability_status" IS NULL
        OR "h9_actionability_status" <> 'actionable'
        OR (
          "h9_moic_source_input_hash" IS NOT NULL
          AND "h9_round_evidence_input_hash" IS NOT NULL
          AND "h9_round_evidence_assumptions_hash" IS NOT NULL
          AND "h9_fingerprint_hash" IS NOT NULL
          AND "h9_policy_version" IS NOT NULL
        )
      );
  END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE IF EXISTS "pacing_history"
  ADD COLUMN IF NOT EXISTS "h9_moic_source_input_hash" text,
  ADD COLUMN IF NOT EXISTS "h9_round_evidence_input_hash" text,
  ADD COLUMN IF NOT EXISTS "h9_round_evidence_assumptions_hash" text,
  ADD COLUMN IF NOT EXISTS "h9_fingerprint_hash" text,
  ADD COLUMN IF NOT EXISTS "h9_policy_version" text,
  ADD COLUMN IF NOT EXISTS "h9_actionability_status" varchar(24);
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.pacing_history') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.pacing_history'::regclass
         AND conname = 'pacing_history_h9_actionability_status_check'
     ) THEN
    ALTER TABLE "pacing_history"
      ADD CONSTRAINT "pacing_history_h9_actionability_status_check"
      CHECK (
        "h9_actionability_status" IS NULL
        OR "h9_actionability_status" IN (
          'actionable',
          'input_only',
          'non_actionable',
          'quarantined',
          'unknown_legacy'
        )
      );
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.pacing_history') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.pacing_history'::regclass
         AND conname = 'pacing_history_h9_actionable_fingerprint_check'
     ) THEN
    ALTER TABLE "pacing_history"
      ADD CONSTRAINT "pacing_history_h9_actionable_fingerprint_check"
      CHECK (
        "h9_actionability_status" IS NULL
        OR "h9_actionability_status" <> 'actionable'
        OR (
          "h9_moic_source_input_hash" IS NOT NULL
          AND "h9_round_evidence_input_hash" IS NOT NULL
          AND "h9_round_evidence_assumptions_hash" IS NOT NULL
          AND "h9_fingerprint_hash" IS NOT NULL
          AND "h9_policy_version" IS NOT NULL
        )
      );
  END IF;
END
$$;
