-- Phase 2 scenario-comparison consolidation
-- Retire the dormant saved-comparison persistence family that never shipped.

DROP TABLE IF EXISTS "comparison_access_history";--> statement-breakpoint
DROP TABLE IF EXISTS "comparison_configurations";--> statement-breakpoint
DROP TABLE IF EXISTS "scenario_comparisons";
