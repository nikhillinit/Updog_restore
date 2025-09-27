-- Portfolio Construction Modeling Migration
-- Created: 2025-09-26
-- Description: Add comprehensive portfolio construction modeling infrastructure for scenario planning and optimization

BEGIN;

-- ============================================================================
-- FUND STRATEGY MODELS
-- Forward-looking fund construction with allocation strategies
-- ============================================================================

CREATE TABLE IF NOT EXISTS fund_strategy_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id INTEGER NOT NULL REFERENCES funds(id),

  -- Model identification
  name TEXT NOT NULL,
  description TEXT,
  model_type TEXT NOT NULL CHECK (model_type IN ('strategic', 'tactical', 'opportunistic', 'defensive', 'balanced')),

  -- Strategy parameters
  target_portfolio_size INTEGER NOT NULL DEFAULT 25,
  max_portfolio_size INTEGER NOT NULL DEFAULT 30,
  target_deployment_period_months INTEGER NOT NULL DEFAULT 36,

  -- Investment allocation strategy
  check_size_range JSONB NOT NULL, -- {min: 500000, max: 2000000, target: 1000000}
  sector_allocation JSONB NOT NULL, -- {fintech: 0.3, healthtech: 0.2, ...}
  stage_allocation JSONB NOT NULL, -- {seed: 0.4, seriesA: 0.6}
  geographic_allocation JSONB, -- {us: 0.8, europe: 0.2}

  -- Reserve strategy
  initial_reserve_percentage DECIMAL(5,4) NOT NULL DEFAULT 0.50, -- 50% for follow-ons
  follow_on_strategy JSONB NOT NULL, -- Complex follow-on rules
  reserve_deployment_timeline JSONB, -- Planned reserve deployment over time

  -- Risk parameters
  concentration_limits JSONB NOT NULL, -- Max % per company, sector, etc.
  diversification_rules JSONB, -- Minimum diversification requirements
  risk_tolerance TEXT NOT NULL DEFAULT 'moderate' CHECK (risk_tolerance IN ('conservative', 'moderate', 'aggressive')),

  -- Performance targets
  target_irr DECIMAL(5,4), -- Target IRR %
  target_multiple DECIMAL(5,2), -- Target multiple of invested capital
  target_dpi DECIMAL(5,2), -- Target DPI
  target_portfolio_beta DECIMAL(5,2), -- Portfolio risk relative to market

  -- Model metadata
  model_version TEXT NOT NULL DEFAULT '1.0.0',
  is_active BOOLEAN DEFAULT true,
  is_template BOOLEAN DEFAULT false, -- Can be used as template for other funds
  confidence_level DECIMAL(3,2) DEFAULT 0.75, -- 0.00-1.00

  -- Scenario planning
  market_assumptions JSONB, -- Economic/market assumptions
  validation_criteria JSONB, -- Criteria for model validation
  stress_test_scenarios JSONB, -- Stress testing parameters

  -- User context
  created_by INTEGER NOT NULL REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  tags TEXT[] DEFAULT '{}',

  -- Timestamps
  effective_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_portfolio_sizes CHECK (max_portfolio_size >= target_portfolio_size),
  CONSTRAINT valid_deployment_period CHECK (target_deployment_period_months > 0),
  CONSTRAINT valid_reserve_percentage CHECK (initial_reserve_percentage >= 0.0 AND initial_reserve_percentage <= 1.0),
  CONSTRAINT valid_confidence CHECK (confidence_level >= 0.00 AND confidence_level <= 1.00)
);

-- ============================================================================
-- PORTFOLIO CONSTRUCTION SCENARIOS
-- Multiple "what-if" scenarios for fund building
-- ============================================================================

CREATE TABLE IF NOT EXISTS portfolio_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id INTEGER NOT NULL REFERENCES funds(id),
  strategy_model_id UUID NOT NULL REFERENCES fund_strategy_models(id),

  -- Scenario identification
  name TEXT NOT NULL,
  description TEXT,
  scenario_type TEXT NOT NULL CHECK (scenario_type IN ('base_case', 'optimistic', 'pessimistic', 'stress_test', 'custom')),

  -- Scenario parameters
  market_environment TEXT NOT NULL DEFAULT 'normal' CHECK (market_environment IN ('bull', 'normal', 'bear', 'recession')),
  deal_flow_assumption DECIMAL(5,2) NOT NULL DEFAULT 1.00, -- Multiplier vs normal deal flow
  valuation_environment DECIMAL(5,2) NOT NULL DEFAULT 1.00, -- Valuation multiplier vs normal
  exit_environment DECIMAL(5,2) NOT NULL DEFAULT 1.00, -- Exit opportunity multiplier

  -- Portfolio construction parameters
  planned_investments JSONB NOT NULL, -- Array of planned investment details
  deployment_schedule JSONB NOT NULL, -- Timeline of when investments are made
  follow_on_assumptions JSONB, -- Follow-on investment assumptions

  -- Performance projections
  projected_fund_metrics JSONB NOT NULL, -- Expected fund-level metrics
  projected_portfolio_outcomes JSONB, -- Company-level outcome projections
  monte_carlo_results JSONB, -- Statistical simulation results

  -- Risk analysis
  risk_factors JSONB, -- Identified risk factors and mitigations
  sensitivity_analysis JSONB, -- Sensitivity to key variables
  correlation_assumptions JSONB, -- Cross-portfolio correlations

  -- Comparison and benchmarking
  baseline_scenario_id UUID REFERENCES portfolio_scenarios(id), -- What this is compared against
  variance_from_baseline JSONB, -- Key differences from baseline
  benchmark_comparison JSONB, -- Comparison to industry benchmarks

  -- Simulation metadata
  simulation_engine TEXT NOT NULL DEFAULT 'monte-carlo-v1',
  simulation_runs INTEGER DEFAULT 10000,
  simulation_duration_ms INTEGER,
  last_simulation_at TIMESTAMPTZ,

  -- Status and workflow
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'modeling', 'complete', 'approved', 'archived')),
  confidence_score DECIMAL(5,2), -- Overall confidence in scenario
  validation_results JSONB, -- Validation check results

  -- User context
  created_by INTEGER NOT NULL REFERENCES users(id),
  reviewed_by INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),

  -- Sharing and collaboration
  is_shared BOOLEAN DEFAULT false,
  shared_with TEXT[] DEFAULT '{}', -- User IDs with access

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_multipliers CHECK (
    deal_flow_assumption > 0 AND
    valuation_environment > 0 AND
    exit_environment > 0
  ),
  CONSTRAINT valid_simulation_runs CHECK (simulation_runs >= 1000),
  CONSTRAINT valid_confidence_score CHECK (confidence_score IS NULL OR (confidence_score >= 0.00 AND confidence_score <= 10.00))
);

-- ============================================================================
-- RESERVE ALLOCATION STRATEGIES
-- Dynamic reserve deployment strategies with optimization data
-- ============================================================================

CREATE TABLE IF NOT EXISTS reserve_allocation_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id INTEGER NOT NULL REFERENCES funds(id),
  scenario_id UUID REFERENCES portfolio_scenarios(id),

  -- Strategy identification
  name TEXT NOT NULL,
  description TEXT,
  strategy_type TEXT NOT NULL CHECK (strategy_type IN ('proportional', 'milestone_based', 'performance_based', 'opportunistic', 'hybrid')),

  -- Allocation rules
  allocation_rules JSONB NOT NULL, -- Complex rules for reserve allocation
  trigger_conditions JSONB NOT NULL, -- When to deploy reserves
  company_scoring_criteria JSONB, -- How to score companies for reserves

  -- Reserve pools and tranches
  total_reserve_amount DECIMAL(15,2) NOT NULL,
  reserve_tranches JSONB NOT NULL, -- {tranche1: {amount: 5000000, criteria: {...}}}
  emergency_reserve_pct DECIMAL(5,4) DEFAULT 0.10, -- Emergency reserve %

  -- Deployment parameters
  max_per_company_pct DECIMAL(5,4) NOT NULL DEFAULT 0.20, -- Max % of reserves per company
  min_deployment_amount DECIMAL(15,2) DEFAULT 100000,
  max_deployment_amount DECIMAL(15,2),

  -- Performance tracking
  performance_thresholds JSONB, -- Performance gates for reserve deployment
  milestone_tracking JSONB, -- Milestone-based deployment tracking
  risk_adjusted_scoring JSONB, -- Risk-adjusted allocation criteria

  -- Optimization parameters
  optimization_objective TEXT NOT NULL DEFAULT 'risk_adjusted_return' CHECK (
    optimization_objective IN ('irr_maximization', 'risk_minimization', 'risk_adjusted_return', 'portfolio_balance')
  ),
  optimization_constraints JSONB, -- Mathematical constraints for optimization
  rebalancing_frequency TEXT DEFAULT 'quarterly' CHECK (rebalancing_frequency IN ('monthly', 'quarterly', 'semi_annual', 'annual')),

  -- Simulation and modeling
  monte_carlo_iterations INTEGER DEFAULT 5000,
  scenario_weights JSONB, -- Probability weights for different scenarios
  sensitivity_parameters JSONB, -- Variables for sensitivity analysis

  -- Strategy effectiveness
  backtest_results JSONB, -- Historical backtesting results
  performance_attribution JSONB, -- Performance attribution analysis
  benchmark_comparison JSONB, -- Comparison to benchmark strategies

  -- Decision support
  recommendation_engine JSONB, -- AI/ML recommendations
  decision_history JSONB, -- History of reserve allocation decisions
  override_reasons JSONB, -- Reasons for manual overrides

  -- Status and metadata
  is_active BOOLEAN DEFAULT true,
  last_optimized_at TIMESTAMPTZ,
  optimization_frequency_days INTEGER DEFAULT 30,

  -- User context
  created_by INTEGER NOT NULL REFERENCES users(id),
  last_modified_by INTEGER REFERENCES users(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_reserve_amount CHECK (total_reserve_amount > 0),
  CONSTRAINT valid_emergency_reserve CHECK (emergency_reserve_pct >= 0.00 AND emergency_reserve_pct <= 0.50),
  CONSTRAINT valid_company_allocation CHECK (max_per_company_pct > 0.00 AND max_per_company_pct <= 1.00),
  CONSTRAINT valid_deployment_amounts CHECK (max_deployment_amount IS NULL OR max_deployment_amount >= min_deployment_amount),
  CONSTRAINT valid_monte_carlo CHECK (monte_carlo_iterations >= 1000)
);

-- ============================================================================
-- PERFORMANCE FORECASTS
-- Predictive models linking to variance tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS performance_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id INTEGER NOT NULL REFERENCES funds(id),
  scenario_id UUID REFERENCES portfolio_scenarios(id),
  baseline_id UUID REFERENCES fund_baselines(id), -- Link to variance tracking

  -- Forecast identification
  forecast_name TEXT NOT NULL,
  forecast_type TEXT NOT NULL CHECK (forecast_type IN ('fund_level', 'portfolio_level', 'company_level', 'sector_level')),
  forecast_horizon_years INTEGER NOT NULL DEFAULT 10,

  -- Time series forecasting
  forecast_periods JSONB NOT NULL, -- Quarterly/annual forecast data
  confidence_intervals JSONB, -- Statistical confidence intervals
  prediction_variance JSONB, -- Variance estimates for predictions

  -- Fund-level forecasts
  irr_forecast JSONB, -- IRR projections over time
  multiple_forecast JSONB, -- Multiple projections
  tvpi_forecast JSONB, -- TVPI progression
  dpi_forecast JSONB, -- DPI progression
  nav_forecast JSONB, -- NAV evolution

  -- Portfolio forecasts
  company_level_forecasts JSONB, -- Individual company projections
  sector_performance_forecasts JSONB, -- Sector-level performance
  stage_performance_forecasts JSONB, -- Stage-level performance
  correlation_matrix JSONB, -- Portfolio correlation assumptions

  -- Economic scenario modeling
  base_case_forecast JSONB, -- Base case economic scenario
  stress_scenarios JSONB, -- Economic stress test scenarios
  macro_sensitivity JSONB, -- Sensitivity to macro factors

  -- Forecast methodology
  methodology TEXT NOT NULL CHECK (methodology IN ('historical_extrapolation', 'monte_carlo', 'machine_learning', 'hybrid', 'expert_judgment')),
  model_parameters JSONB, -- Parameters used in forecasting model
  data_sources JSONB, -- Sources of data for forecasting
  assumptions JSONB, -- Key assumptions underlying forecast

  -- Model performance
  accuracy_metrics JSONB, -- Historical accuracy of model
  calibration_results JSONB, -- Model calibration statistics
  validation_results JSONB, -- Out-of-sample validation
  model_version TEXT NOT NULL DEFAULT '1.0.0',

  -- Comparison to actuals (for learning)
  actual_vs_forecast JSONB, -- Comparison when actuals become available
  forecast_errors JSONB, -- Systematic forecast errors
  model_drift_metrics JSONB, -- Model performance drift over time

  -- Risk and uncertainty
  uncertainty_quantification JSONB, -- Model uncertainty estimates
  risk_factors JSONB, -- Key risk factors affecting forecast
  scenario_probabilities JSONB, -- Probability weights for scenarios

  -- Forecast updates and versioning
  parent_forecast_id UUID REFERENCES performance_forecasts(id),
  update_reason TEXT, -- Why forecast was updated
  update_frequency_days INTEGER DEFAULT 90,
  last_updated_at TIMESTAMPTZ,

  -- User context and workflow
  created_by INTEGER NOT NULL REFERENCES users(id),
  reviewed_by INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'modeling', 'review', 'approved', 'archived')),

  -- Quality and governance
  quality_score DECIMAL(3,2), -- Overall forecast quality score
  peer_review_scores JSONB, -- Peer review feedback
  governance_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_forecast_horizon CHECK (forecast_horizon_years >= 1 AND forecast_horizon_years <= 15),
  CONSTRAINT valid_quality_score CHECK (quality_score IS NULL OR (quality_score >= 0.00 AND quality_score <= 1.00)),
  CONSTRAINT valid_update_frequency CHECK (update_frequency_days >= 1)
);

-- ============================================================================
-- SCENARIO COMPARISONS
-- Comparing different portfolio construction approaches
-- ============================================================================

CREATE TABLE IF NOT EXISTS scenario_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id INTEGER NOT NULL REFERENCES funds(id),

  -- Comparison identification
  comparison_name TEXT NOT NULL,
  description TEXT,
  comparison_type TEXT NOT NULL CHECK (comparison_type IN ('strategy_comparison', 'scenario_analysis', 'sensitivity_test', 'optimization_study')),

  -- Scenarios being compared
  base_scenario_id UUID NOT NULL REFERENCES portfolio_scenarios(id),
  comparison_scenarios JSONB NOT NULL, -- Array of scenario IDs with metadata

  -- Comparison dimensions
  comparison_metrics JSONB NOT NULL, -- Which metrics to compare
  weight_scheme JSONB, -- Relative importance of different metrics
  normalization_method TEXT DEFAULT 'z_score' CHECK (normalization_method IN ('raw', 'percentage', 'z_score', 'ranking')),

  -- Comparison results
  metric_comparisons JSONB NOT NULL, -- Detailed metric-by-metric comparison
  ranking_results JSONB, -- Scenario rankings by different criteria
  pareto_analysis JSONB, -- Pareto frontier analysis
  trade_off_analysis JSONB, -- Risk-return trade-off analysis

  -- Statistical analysis
  significance_tests JSONB, -- Statistical significance of differences
  confidence_intervals JSONB, -- Confidence intervals for differences
  correlation_analysis JSONB, -- Correlation between scenarios
  variance_decomposition JSONB, -- Sources of variance between scenarios

  -- Decision support
  recommendation_summary TEXT, -- Summary recommendations
  key_insights JSONB, -- Key insights from comparison
  decision_criteria JSONB, -- Criteria for choosing between scenarios
  risk_considerations JSONB, -- Risk factors to consider

  -- Sensitivity analysis
  sensitivity_results JSONB, -- How robust are the comparisons
  parameter_importance JSONB, -- Which parameters drive differences
  threshold_analysis JSONB, -- At what thresholds do preferences change

  -- Visualization data
  chart_configurations JSONB, -- Chart configs for visualization
  dashboard_layout JSONB, -- Dashboard layout preferences
  export_formats JSONB, -- Preferred export formats

  -- Comparison metadata
  comparison_engine TEXT NOT NULL DEFAULT 'scenario-compare-v1',
  computation_time_ms INTEGER,
  data_freshness_hours INTEGER, -- How old is the underlying data

  -- User interaction
  user_preferences JSONB, -- User-specific comparison preferences
  bookmark_settings JSONB, -- User bookmarks and favorites
  sharing_settings JSONB, -- How comparison is shared

  -- Status and workflow
  status TEXT NOT NULL DEFAULT 'computing' CHECK (status IN ('computing', 'ready', 'stale', 'error')),
  error_details JSONB, -- Error information if status is error
  cache_expires_at TIMESTAMPTZ, -- When cached results expire

  -- User context
  created_by INTEGER NOT NULL REFERENCES users(id),
  shared_with TEXT[] DEFAULT '{}',
  is_public BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_data_freshness CHECK (data_freshness_hours >= 0)
);

-- ============================================================================
-- MONTE CARLO SIMULATION RESULTS
-- Detailed simulation results for scenario modeling
-- ============================================================================

CREATE TABLE IF NOT EXISTS monte_carlo_simulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id INTEGER NOT NULL REFERENCES funds(id),
  scenario_id UUID REFERENCES portfolio_scenarios(id),
  forecast_id UUID REFERENCES performance_forecasts(id),

  -- Simulation identification
  simulation_name TEXT NOT NULL,
  simulation_type TEXT NOT NULL CHECK (simulation_type IN ('portfolio_construction', 'performance_forecast', 'risk_analysis', 'optimization')),

  -- Simulation parameters
  number_of_runs INTEGER NOT NULL DEFAULT 10000,
  random_seed INTEGER, -- For reproducibility
  simulation_engine TEXT NOT NULL DEFAULT 'monte-carlo-v2',

  -- Input parameters
  input_distributions JSONB NOT NULL, -- Probability distributions for inputs
  correlation_matrix JSONB, -- Input correlations
  scenario_weights JSONB, -- Probability weights for scenarios
  constraints JSONB, -- Simulation constraints

  -- Output results
  summary_statistics JSONB NOT NULL, -- Mean, std, percentiles, etc.
  percentile_results JSONB NOT NULL, -- Key percentiles (5th, 25th, 50th, 75th, 95th)
  distribution_data JSONB, -- Full distribution data (if stored)
  confidence_intervals JSONB, -- Confidence intervals for key metrics

  -- Risk metrics
  var_calculations JSONB, -- Value at Risk calculations
  cvar_calculations JSONB, -- Conditional VaR calculations
  downside_risk JSONB, -- Downside risk metrics
  tail_risk_analysis JSONB, -- Tail risk analysis

  -- Convergence and quality
  convergence_metrics JSONB, -- Simulation convergence statistics
  quality_metrics JSONB, -- Quality of simulation results
  stability_analysis JSONB, -- Result stability across runs

  -- Performance attribution
  factor_contributions JSONB, -- Contribution of different factors
  sensitivity_indices JSONB, -- Sobol indices or similar
  interaction_effects JSONB, -- Factor interaction effects

  -- Simulation metadata
  computation_time_ms INTEGER,
  memory_usage_mb INTEGER,
  cpu_cores_used INTEGER,
  simulation_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Results storage
  detailed_results_path TEXT, -- Path to detailed results file
  results_compressed BOOLEAN DEFAULT false,
  results_format TEXT DEFAULT 'json' CHECK (results_format IN ('json', 'parquet', 'csv')),

  -- Validation
  validation_tests JSONB, -- Statistical validation tests
  benchmark_comparison JSONB, -- Comparison to benchmark results
  historical_validation JSONB, -- Validation against historical data

  -- User context
  created_by INTEGER NOT NULL REFERENCES users(id),
  tags TEXT[] DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- When to cleanup detailed results

  -- Constraints
  CONSTRAINT valid_runs CHECK (number_of_runs >= 1000),
  CONSTRAINT valid_computation_time CHECK (computation_time_ms > 0)
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Fund Strategy Models indexes
CREATE INDEX IF NOT EXISTS fund_strategy_models_fund_idx ON fund_strategy_models(fund_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fund_strategy_models_type_idx ON fund_strategy_models(model_type, is_active);
CREATE INDEX IF NOT EXISTS fund_strategy_models_active_idx ON fund_strategy_models(is_active, effective_date DESC);
CREATE INDEX IF NOT EXISTS fund_strategy_models_template_idx ON fund_strategy_models(is_template, is_active);
CREATE INDEX IF NOT EXISTS fund_strategy_models_tags_gin_idx ON fund_strategy_models USING gin(tags);

-- Portfolio Scenarios indexes
CREATE INDEX IF NOT EXISTS portfolio_scenarios_fund_idx ON portfolio_scenarios(fund_id, created_at DESC);
CREATE INDEX IF NOT EXISTS portfolio_scenarios_strategy_idx ON portfolio_scenarios(strategy_model_id, status);
CREATE INDEX IF NOT EXISTS portfolio_scenarios_type_idx ON portfolio_scenarios(scenario_type, status);
CREATE INDEX IF NOT EXISTS portfolio_scenarios_status_idx ON portfolio_scenarios(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS portfolio_scenarios_shared_idx ON portfolio_scenarios(is_shared, created_at DESC);
CREATE INDEX IF NOT EXISTS portfolio_scenarios_baseline_idx ON portfolio_scenarios(baseline_scenario_id);

-- Reserve Allocation Strategies indexes
CREATE INDEX IF NOT EXISTS reserve_allocation_strategies_fund_idx ON reserve_allocation_strategies(fund_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reserve_allocation_strategies_scenario_idx ON reserve_allocation_strategies(scenario_id, is_active);
CREATE INDEX IF NOT EXISTS reserve_allocation_strategies_type_idx ON reserve_allocation_strategies(strategy_type, is_active);
CREATE INDEX IF NOT EXISTS reserve_allocation_strategies_active_idx ON reserve_allocation_strategies(is_active, last_optimized_at DESC);
CREATE INDEX IF NOT EXISTS reserve_allocation_strategies_optimization_idx ON reserve_allocation_strategies(optimization_objective, is_active);

-- Performance Forecasts indexes
CREATE INDEX IF NOT EXISTS performance_forecasts_fund_idx ON performance_forecasts(fund_id, created_at DESC);
CREATE INDEX IF NOT EXISTS performance_forecasts_scenario_idx ON performance_forecasts(scenario_id, status);
CREATE INDEX IF NOT EXISTS performance_forecasts_baseline_idx ON performance_forecasts(baseline_id, created_at DESC);
CREATE INDEX IF NOT EXISTS performance_forecasts_type_idx ON performance_forecasts(forecast_type, status);
CREATE INDEX IF NOT EXISTS performance_forecasts_methodology_idx ON performance_forecasts(methodology, model_version);
CREATE INDEX IF NOT EXISTS performance_forecasts_horizon_idx ON performance_forecasts(forecast_horizon_years, status);

-- Scenario Comparisons indexes
CREATE INDEX IF NOT EXISTS scenario_comparisons_fund_idx ON scenario_comparisons(fund_id, created_at DESC);
CREATE INDEX IF NOT EXISTS scenario_comparisons_base_idx ON scenario_comparisons(base_scenario_id, status);
CREATE INDEX IF NOT EXISTS scenario_comparisons_type_idx ON scenario_comparisons(comparison_type, status);
CREATE INDEX IF NOT EXISTS scenario_comparisons_status_idx ON scenario_comparisons(status, last_accessed DESC);
CREATE INDEX IF NOT EXISTS scenario_comparisons_public_idx ON scenario_comparisons(is_public, created_at DESC);

-- Monte Carlo Simulations indexes
CREATE INDEX IF NOT EXISTS monte_carlo_simulations_fund_idx ON monte_carlo_simulations(fund_id, simulation_date DESC);
CREATE INDEX IF NOT EXISTS monte_carlo_simulations_scenario_idx ON monte_carlo_simulations(scenario_id, simulation_date DESC);
CREATE INDEX IF NOT EXISTS monte_carlo_simulations_forecast_idx ON monte_carlo_simulations(forecast_id, simulation_date DESC);
CREATE INDEX IF NOT EXISTS monte_carlo_simulations_type_idx ON monte_carlo_simulations(simulation_type, simulation_date DESC);
CREATE INDEX IF NOT EXISTS monte_carlo_simulations_expiry_idx ON monte_carlo_simulations(expires_at);
CREATE INDEX IF NOT EXISTS monte_carlo_simulations_tags_gin_idx ON monte_carlo_simulations USING gin(tags);

-- ============================================================================
-- CONSTRAINTS AND TRIGGERS
-- ============================================================================

-- Ensure only one active strategy model per fund at a time (optional business rule)
CREATE UNIQUE INDEX IF NOT EXISTS fund_strategy_models_active_unique
ON fund_strategy_models(fund_id)
WHERE is_active = true AND is_template = false;

-- Add updated_at triggers for all new tables
CREATE TRIGGER update_fund_strategy_models_updated_at
  BEFORE UPDATE ON fund_strategy_models
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_portfolio_scenarios_updated_at
  BEFORE UPDATE ON portfolio_scenarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reserve_allocation_strategies_updated_at
  BEFORE UPDATE ON reserve_allocation_strategies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_performance_forecasts_updated_at
  BEFORE UPDATE ON performance_forecasts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scenario_comparisons_updated_at
  BEFORE UPDATE ON scenario_comparisons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- UTILITY VIEWS
-- ============================================================================

-- Active Strategy Models with Fund Information
CREATE OR REPLACE VIEW active_strategy_models AS
SELECT
  sm.*,
  f.name as fund_name,
  f.size as fund_size,
  u.username as created_by_name
FROM fund_strategy_models sm
JOIN funds f ON sm.fund_id = f.id
JOIN users u ON sm.created_by = u.id
WHERE sm.is_active = true
ORDER BY sm.fund_id, sm.created_at DESC;

-- Portfolio Scenarios Summary
CREATE OR REPLACE VIEW portfolio_scenarios_summary AS
SELECT
  ps.*,
  f.name as fund_name,
  sm.name as strategy_name,
  sm.model_type as strategy_type,
  (SELECT COUNT(*) FROM performance_forecasts pf WHERE pf.scenario_id = ps.id) as forecast_count,
  (SELECT COUNT(*) FROM monte_carlo_simulations mcs WHERE mcs.scenario_id = ps.id) as simulation_count
FROM portfolio_scenarios ps
JOIN funds f ON ps.fund_id = f.id
JOIN fund_strategy_models sm ON ps.strategy_model_id = sm.id
ORDER BY ps.fund_id, ps.created_at DESC;

-- Performance Forecasts with Accuracy Tracking
CREATE OR REPLACE VIEW forecast_performance AS
SELECT
  pf.*,
  f.name as fund_name,
  ps.name as scenario_name,
  ps.scenario_type,
  CASE
    WHEN pf.actual_vs_forecast IS NOT NULL THEN
      (pf.actual_vs_forecast->>'accuracy_score')::decimal
    ELSE NULL
  END as accuracy_score,
  CASE
    WHEN pf.last_updated_at IS NOT NULL THEN
      EXTRACT(days FROM NOW() - pf.last_updated_at)
    ELSE NULL
  END as days_since_update
FROM performance_forecasts pf
JOIN funds f ON pf.fund_id = f.id
LEFT JOIN portfolio_scenarios ps ON pf.scenario_id = ps.id
ORDER BY pf.fund_id, pf.created_at DESC;

-- Scenario Comparison Dashboard
CREATE OR REPLACE VIEW scenario_comparison_dashboard AS
SELECT
  sc.*,
  f.name as fund_name,
  ps.name as base_scenario_name,
  ps.scenario_type as base_scenario_type,
  CASE sc.status
    WHEN 'ready' THEN 'Ready for Review'
    WHEN 'computing' THEN 'Computing Results'
    WHEN 'stale' THEN 'Needs Update'
    WHEN 'error' THEN 'Error - Check Details'
  END as status_display,
  EXTRACT(hours FROM NOW() - sc.updated_at) as hours_since_update
FROM scenario_comparisons sc
JOIN funds f ON sc.fund_id = f.id
JOIN portfolio_scenarios ps ON sc.base_scenario_id = ps.id
ORDER BY sc.fund_id, sc.created_at DESC;

COMMIT;

-- ============================================================================
-- TABLE COMMENTS
-- ============================================================================

COMMENT ON TABLE fund_strategy_models IS 'Forward-looking fund construction models with allocation strategies and target parameters';
COMMENT ON TABLE portfolio_scenarios IS 'Multiple "what-if" scenarios for portfolio construction with different market assumptions';
COMMENT ON TABLE reserve_allocation_strategies IS 'Dynamic reserve deployment strategies with optimization and decision support';
COMMENT ON TABLE performance_forecasts IS 'Predictive models for fund and portfolio performance with variance tracking integration';
COMMENT ON TABLE scenario_comparisons IS 'Comparative analysis of different portfolio construction scenarios with decision support';
COMMENT ON TABLE monte_carlo_simulations IS 'Monte Carlo simulation results for risk analysis and scenario modeling';

-- Migration completed successfully
-- Tables created: 6 new tables for portfolio construction modeling
-- Indexes created: 30+ indexes for optimal query performance
-- Views created: 4 analytical views for common queries
-- Integration: Full integration with existing variance tracking and time-travel analytics