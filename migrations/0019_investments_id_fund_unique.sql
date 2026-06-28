-- Migration: 0019_investments_id_fund_unique
-- Purpose: Add the (id, fund_id) UNIQUE constraint on investments so it can serve
-- as a composite-FK target for the investment-rounds tables. This syncs the
-- journaled ./migrations set with shared/schema (portfolio.ts:
-- unique('investments_id_fund_id_key')), which db:push already creates on a fresh
-- database.
--
-- Why this is needed: integration tests build the schema with migrate(./migrations)
-- and THEN reconcile with `drizzle-kit push`. Without this constraint, push must
-- ALTER the pre-existing investments table to add the unique key AND create the
-- investment_rounds composite FK in the same pass; drizzle-kit orders the FK before
-- the unique key, so PostgreSQL aborts with 42830 ("no unique constraint matching
-- given keys for referenced table investments"). Creating the constraint up front
-- lets push create the investment-rounds tables as a clean additive diff.
--
-- Replay safety: guarded ADD CONSTRAINT (skips if the table or constraint is absent
-- or already present), matching applyInvestmentRoundConstraints' existence check.

DO $$
BEGIN
  IF to_regclass('public.investments') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'investments_id_fund_id_key'
         AND conrelid = 'public.investments'::regclass
     ) THEN
    ALTER TABLE "investments"
      ADD CONSTRAINT "investments_id_fund_id_key" UNIQUE ("id", "fund_id");
  END IF;
END $$;
