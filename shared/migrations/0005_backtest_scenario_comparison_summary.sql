-- Migration: 0005_backtest_scenario_comparison_summary.sql
-- Purpose: persist structured historical-scenario comparison outcome metadata
-- alongside backtest results so history/detail views can disclose partial
-- scenario failure without relying on recommendation text parsing.

ALTER TABLE backtest_results
ADD COLUMN IF NOT EXISTS scenario_comparison_summary JSONB;

