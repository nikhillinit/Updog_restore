-- Phase 2 backtesting result contract alignment
-- Persists structured scenario-comparison outcome metadata on backtest results.

ALTER TABLE "backtest_results"
ADD COLUMN IF NOT EXISTS "scenario_comparison_summary" JSONB;

