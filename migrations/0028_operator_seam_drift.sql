-- @drift-patch
-- Migration: 0028_operator_seam_drift
-- Reason: s8.1 operator seam (ADR-023, D1 = lane B). Journal 0001_certain_miracleman
-- created GLOBAL UNIQUE(idempotency_key) indexes on forecast_snapshots,
-- investment_lots, and reserve_allocations; 0024 added the fund/investment/
-- snapshot-SCOPED replacements the shape declares. Nothing journaled dropped the
-- old globals, so journal-built databases enforce cross-scope idempotency-key
-- uniqueness the scoped design (#924 lineage) deliberately relaxed. This patch
-- retires the three stale globals. Entries 4-6 of the drift baseline
-- (fund_snapshots FKs, job_outbox_status_check) are intentionally NOT touched
-- here: prod audit 2026-07-02 (artifact sha256 62131f6a...cf72b86) showed prod
-- carries them validated, so the shape gains .references()/check() in the same
-- PR and the journal side (0002/0005) stays as-is.
-- Replay safety: DROP INDEX IF EXISTS only; idempotent, forward-only.

DROP INDEX IF EXISTS "forecast_snapshots_idempotency_unique_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "investment_lots_idempotency_unique_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "reserve_allocations_idempotency_unique_idx";
