-- Portfolio Construction Modeling Examples
-- Created: 2025-09-26
-- Description: Example data and use cases for portfolio construction modeling

-- This file demonstrates how to use the portfolio construction modeling schema
-- to create realistic scenarios for a venture capital fund.

BEGIN;

-- ============================================================================
-- EXAMPLE FUND STRATEGY MODEL
-- A strategic fund model for a Series A focused fund
-- ============================================================================

-- Example: Create a fund strategy model for a $100M Series A fund
INSERT INTO fund_strategy_models (
  fund_id,
  name,
  description,
  model_type,
  target_portfolio_size,
  max_portfolio_size,
  target_deployment_period_months,
  check_size_range,
  sector_allocation,
  stage_allocation,
  geographic_allocation,
  initial_reserve_percentage,
  follow_on_strategy,
  reserve_deployment_timeline,
  concentration_limits,
  diversification_rules,
  risk_tolerance,
  target_irr,
  target_multiple,
  target_dpi,
  market_assumptions,
  validation_criteria,
  stress_test_scenarios,
  created_by,
  tags
) VALUES (
  1, -- Assuming fund_id 1 exists
  'Series A Growth Strategy 2025',
  'Strategic allocation model for Series A focused fund with growth emphasis',
  'strategic',
  20,
  25,
  36,

  -- Check size range: $3-8M initial, $5M target
  '{"min": 3000000, "target": 5000000, "max": 8000000, "currency": "USD"}',

  -- Sector allocation: Tech-heavy with diversification
  '{
    "enterprise_software": 0.30,
    "fintech": 0.20,
    "healthcare_tech": 0.15,
    "developer_tools": 0.10,
    "marketplace": 0.10,
    "cybersecurity": 0.10,
    "other": 0.05
  }',

  -- Stage allocation: Primarily Series A with some late seed
  '{
    "late_seed": 0.25,
    "series_a": 0.65,
    "series_a_extension": 0.10
  }',

  -- Geographic allocation: US-focused with international exposure
  '{
    "north_america": 0.80,
    "europe": 0.15,
    "other": 0.05
  }',

  0.5000, -- 50% reserve for follow-ons

  -- Follow-on strategy: Pro-rata + opportunity
  '{
    "pro_rata_participation": true,
    "pro_rata_percentage": 1.0,
    "opportunity_follow_on": true,
    "max_follow_on_multiple": 3.0,
    "follow_on_criteria": {
      "revenue_growth": "> 100% YoY",
      "product_market_fit": "strong indicators",
      "team_performance": "meeting milestones"
    }
  }',

  -- Reserve deployment timeline: Staged over 3 years
  '{
    "year_1": 0.60,
    "year_2": 0.30,
    "year_3": 0.10,
    "deployment_triggers": ["series_b_rounds", "milestone_achievements", "market_opportunities"]
  }',

  -- Concentration limits
  '{
    "max_per_company": 0.15,
    "max_per_sector": 0.35,
    "max_per_geography": 0.85,
    "max_per_vintage": 0.40
  }',

  -- Diversification rules
  '{
    "min_companies": 15,
    "min_sectors": 4,
    "max_sector_concentration": 0.35,
    "min_vintage_spread": 2
  }',

  'moderate',
  0.2500, -- Target 25% IRR
  3.50,   -- Target 3.5x multiple
  1.20,   -- Target 1.2x DPI

  -- Market assumptions for 2025-2028
  '{
    "gdp_growth": 0.025,
    "interest_rates": 0.045,
    "venture_market_activity": "normalizing",
    "ipo_market": "recovering",
    "m_and_a_activity": "stable",
    "valuation_environment": "moderate_correction"
  }',

  -- Validation criteria
  '{
    "backtest_period": "2020-2024",
    "benchmark_comparison": "upper_quartile_funds",
    "stress_test_scenarios": 3,
    "monte_carlo_runs": 10000
  }',

  -- Stress test scenarios
  '{
    "recession_scenario": {
      "probability": 0.20,
      "impact": {"valuation_decline": 0.40, "exit_delay": 24, "follow_on_difficulty": 0.60}
    },
    "bubble_scenario": {
      "probability": 0.15,
      "impact": {"valuation_inflation": 0.80, "competition_increase": 0.50, "exit_timing": -12}
    },
    "normal_volatility": {
      "probability": 0.65,
      "impact": {"valuation_variance": 0.25, "exit_timing_variance": 6}
    }
  }',

  1, -- created_by user_id
  ARRAY['series_a', 'growth_strategy', '2025_vintage', 'tech_focused']
);

-- ============================================================================
-- EXAMPLE PORTFOLIO SCENARIOS
-- Multiple scenarios based on the strategy model
-- ============================================================================

-- Base Case Scenario
INSERT INTO portfolio_scenarios (
  fund_id,
  strategy_model_id,
  name,
  description,
  scenario_type,
  market_environment,
  deal_flow_assumption,
  valuation_environment,
  exit_environment,
  planned_investments,
  deployment_schedule,
  follow_on_assumptions,
  projected_fund_metrics,
  projected_portfolio_outcomes,
  risk_factors,
  sensitivity_analysis,
  created_by
) VALUES (
  1,
  (SELECT id FROM fund_strategy_models WHERE name = 'Series A Growth Strategy 2025'),
  'Base Case 2025-2028',
  'Conservative base case with normal market conditions',
  'base_case',
  'normal',
  1.00, -- Normal deal flow
  1.00, -- Normal valuations
  1.00, -- Normal exit environment

  -- Planned investments: 20 companies over 3 years
  '[
    {"company": "AI Platform Co", "sector": "enterprise_software", "check_size": 5000000, "quarter": "2025Q2"},
    {"company": "FinTech Startup", "sector": "fintech", "check_size": 4000000, "quarter": "2025Q3"},
    {"company": "HealthTech Co", "sector": "healthcare_tech", "check_size": 6000000, "quarter": "2025Q4"},
    {"company": "DevTools Inc", "sector": "developer_tools", "check_size": 3500000, "quarter": "2026Q1"}
  ]',

  -- Deployment schedule: Front-loaded with steady pace
  '{
    "2025": {"q1": 0, "q2": 3, "q3": 4, "q4": 3, "total": 10},
    "2026": {"q1": 3, "q2": 2, "q3": 2, "q4": 2, "total": 9},
    "2027": {"q1": 1, "q2": 0, "q3": 0, "q4": 0, "total": 1},
    "total_companies": 20,
    "total_initial_capital": 75000000,
    "reserve_capital": 25000000
  }',

  -- Follow-on assumptions
  '{
    "follow_on_rate": 0.70,
    "average_follow_on_multiple": 2.0,
    "follow_on_timing": "18_months_average",
    "success_rate": 0.80
  }',

  -- Projected fund metrics
  '{
    "gross_irr": 0.28,
    "net_irr": 0.22,
    "gross_multiple": 4.2,
    "net_multiple": 3.1,
    "dpi": 1.8,
    "tvpi": 3.1,
    "investment_period": 36,
    "realization_period": 84
  }',

  -- Portfolio outcome projections
  '{
    "home_runs": {"count": 2, "multiple_range": "10x-25x"},
    "strong_performers": {"count": 4, "multiple_range": "3x-8x"},
    "solid_returns": {"count": 8, "multiple_range": "1x-3x"},
    "break_even": {"count": 3, "multiple_range": "0.5x-1x"},
    "write_offs": {"count": 3, "multiple_range": "0x"}
  }',

  -- Risk factors
  '[
    {"factor": "market_downturn", "probability": 0.25, "impact": "high"},
    {"factor": "competition_increase", "probability": 0.40, "impact": "medium"},
    {"factor": "regulatory_changes", "probability": 0.15, "impact": "medium"},
    {"factor": "talent_shortage", "probability": 0.30, "impact": "low"}
  ]',

  -- Sensitivity analysis
  '{
    "valuation_sensitivity": {"range": "±30%", "irr_impact": "±5%"},
    "exit_timing_sensitivity": {"range": "±12_months", "irr_impact": "±3%"},
    "success_rate_sensitivity": {"range": "±20%", "irr_impact": "±8%"}
  }',

  1 -- created_by
);

-- Optimistic Scenario
INSERT INTO portfolio_scenarios (
  fund_id,
  strategy_model_id,
  name,
  description,
  scenario_type,
  market_environment,
  deal_flow_assumption,
  valuation_environment,
  exit_environment,
  planned_investments,
  deployment_schedule,
  follow_on_assumptions,
  projected_fund_metrics,
  created_by
) VALUES (
  1,
  (SELECT id FROM fund_strategy_models WHERE name = 'Series A Growth Strategy 2025'),
  'Optimistic Upside 2025-2028',
  'Bull market scenario with strong exit environment',
  'optimistic',
  'bull',
  1.20, -- 20% better deal flow
  0.85, -- 15% lower valuations (more attractive)
  1.40, -- 40% better exit environment

  -- More selective, higher quality investments
  '[
    {"company": "AI Unicorn", "sector": "enterprise_software", "check_size": 7000000, "quarter": "2025Q2"},
    {"company": "Next-Gen FinTech", "sector": "fintech", "check_size": 6000000, "quarter": "2025Q3"}
  ]',

  -- Faster deployment in good market
  '{
    "2025": {"q1": 0, "q2": 4, "q3": 5, "q4": 4, "total": 13},
    "2026": {"q1": 3, "q2": 2, "q3": 1, "q4": 1, "total": 7},
    "2027": {"q1": 0, "q2": 0, "q3": 0, "q4": 0, "total": 0},
    "total_companies": 20
  }',

  -- Higher follow-on success
  '{
    "follow_on_rate": 0.85,
    "average_follow_on_multiple": 2.5,
    "follow_on_timing": "15_months_average",
    "success_rate": 0.90
  }',

  -- Stronger projected metrics
  '{
    "gross_irr": 0.35,
    "net_irr": 0.28,
    "gross_multiple": 5.5,
    "net_multiple": 4.1,
    "dpi": 2.4,
    "tvpi": 4.1
  }',

  1
);

-- Pessimistic Scenario
INSERT INTO portfolio_scenarios (
  fund_id,
  strategy_model_id,
  name,
  description,
  scenario_type,
  market_environment,
  deal_flow_assumption,
  valuation_environment,
  exit_environment,
  planned_investments,
  deployment_schedule,
  follow_on_assumptions,
  projected_fund_metrics,
  created_by
) VALUES (
  1,
  (SELECT id FROM fund_strategy_models WHERE name = 'Series A Growth Strategy 2025'),
  'Defensive Downside 2025-2030',
  'Bear market scenario with challenging exit environment',
  'pessimistic',
  'bear',
  0.70, -- 30% reduced deal flow
  1.25, -- 25% higher valuations (less attractive)
  0.60, -- 40% worse exit environment

  -- Fewer, more defensive investments
  '[
    {"company": "Resilient SaaS Co", "sector": "enterprise_software", "check_size": 4000000, "quarter": "2025Q3"},
    {"company": "Essential FinTech", "sector": "fintech", "check_size": 3000000, "quarter": "2025Q4"}
  ]',

  -- Slower, more cautious deployment
  '{
    "2025": {"q1": 0, "q2": 2, "q3": 3, "q4": 2, "total": 7},
    "2026": {"q1": 2, "q2": 2, "q3": 2, "q4": 2, "total": 8},
    "2027": {"q1": 2, "q2": 2, "q3": 1, "q4": 0, "total": 5},
    "total_companies": 20
  }',

  -- Lower follow-on success
  '{
    "follow_on_rate": 0.50,
    "average_follow_on_multiple": 1.5,
    "follow_on_timing": "24_months_average",
    "success_rate": 0.60
  }',

  -- Conservative projected metrics
  '{
    "gross_irr": 0.15,
    "net_irr": 0.10,
    "gross_multiple": 2.8,
    "net_multiple": 2.1,
    "dpi": 1.2,
    "tvpi": 2.1
  }',

  1
);

-- ============================================================================
-- EXAMPLE RESERVE ALLOCATION STRATEGY
-- Dynamic reserve deployment based on company performance
-- ============================================================================

INSERT INTO reserve_allocation_strategies (
  fund_id,
  scenario_id,
  name,
  description,
  strategy_type,
  allocation_rules,
  trigger_conditions,
  company_scoring_criteria,
  total_reserve_amount,
  reserve_tranches,
  emergency_reserve_pct,
  max_per_company_pct,
  min_deployment_amount,
  max_deployment_amount,
  performance_thresholds,
  optimization_objective,
  rebalancing_frequency,
  monte_carlo_iterations,
  created_by
) VALUES (
  1,
  (SELECT id FROM portfolio_scenarios WHERE name = 'Base Case 2025-2028'),
  'Performance-Based Reserve Deployment',
  'Dynamic allocation based on company performance metrics and milestones',
  'performance_based',

  -- Allocation rules: Performance-driven with milestone gates
  '{
    "primary_criteria": "performance_score",
    "secondary_criteria": "strategic_value",
    "minimum_score_threshold": 7.0,
    "allocation_formula": "score_weighted_with_caps",
    "rebalancing_triggers": ["quarterly_review", "major_milestone", "market_change"]
  }',

  -- Trigger conditions: When to deploy reserves
  '{
    "automatic_triggers": [
      {"condition": "series_b_round", "allocation_pct": 0.15},
      {"condition": "revenue_milestone_hit", "allocation_pct": 0.10},
      {"condition": "product_launch", "allocation_pct": 0.08}
    ],
    "manual_triggers": [
      {"condition": "strategic_opportunity", "max_allocation": 0.20},
      {"condition": "defensive_round", "max_allocation": 0.12}
    ]
  }',

  -- Company scoring criteria
  '{
    "financial_metrics": {"weight": 0.40, "components": ["revenue_growth", "burn_efficiency", "unit_economics"]},
    "product_metrics": {"weight": 0.25, "components": ["user_growth", "engagement", "market_fit"]},
    "team_metrics": {"weight": 0.20, "components": ["execution", "hiring", "board_interaction"]},
    "market_metrics": {"weight": 0.15, "components": ["market_size", "competition", "timing"]},
    "scoring_scale": "1-10",
    "minimum_data_points": 3
  }',

  25000000.00, -- $25M total reserves

  -- Reserve tranches: Staged deployment
  '{
    "tranche_1": {"amount": 10000000, "criteria": "series_b_participation", "timeline": "months_12-24"},
    "tranche_2": {"amount": 8000000, "criteria": "milestone_achievements", "timeline": "months_18-36"},
    "tranche_3": {"amount": 5000000, "criteria": "opportunistic_investments", "timeline": "months_24-48"},
    "emergency_reserve": {"amount": 2000000, "criteria": "defensive_scenarios", "timeline": "as_needed"}
  }',

  0.08, -- 8% emergency reserve
  0.25, -- Max 25% of reserves per company
  250000.00,  -- Min $250K deployment
  5000000.00, -- Max $5M deployment

  -- Performance thresholds for reserve deployment
  '{
    "tier_1": {"score_range": "9-10", "allocation_multiple": 3.0, "max_follow_on": "5x"},
    "tier_2": {"score_range": "7-8.9", "allocation_multiple": 2.0, "max_follow_on": "3x"},
    "tier_3": {"score_range": "5-6.9", "allocation_multiple": 1.0, "max_follow_on": "1.5x"},
    "tier_4": {"score_range": "0-4.9", "allocation_multiple": 0.0, "max_follow_on": "0x"}
  }',

  'risk_adjusted_return',
  'quarterly',
  5000,
  1
);

-- ============================================================================
-- EXAMPLE PERFORMANCE FORECAST
-- Predictive model linked to base case scenario
-- ============================================================================

INSERT INTO performance_forecasts (
  fund_id,
  scenario_id,
  baseline_id,
  forecast_name,
  forecast_type,
  forecast_horizon_years,
  forecast_periods,
  confidence_intervals,
  irr_forecast,
  multiple_forecast,
  tvpi_forecast,
  dpi_forecast,
  methodology,
  model_parameters,
  assumptions,
  created_by
) VALUES (
  1,
  (SELECT id FROM portfolio_scenarios WHERE name = 'Base Case 2025-2028'),
  (SELECT id FROM fund_baselines WHERE fund_id = 1 AND is_default = true LIMIT 1),
  'Base Case Performance Forecast 2025-2035',
  'fund_level',
  10,

  -- Quarterly forecast data
  '{
    "2025": {"q1": {"irr": 0.00, "multiple": 1.0, "deployed": 0.15}, "q2": {"irr": -0.05, "multiple": 0.95, "deployed": 0.30}},
    "2026": {"q1": {"irr": 0.08, "multiple": 1.2, "deployed": 0.60}, "q4": {"irr": 0.15, "multiple": 1.8, "deployed": 0.85}},
    "2027": {"q4": {"irr": 0.20, "multiple": 2.1, "deployed": 1.00}},
    "2030": {"q4": {"irr": 0.25, "multiple": 3.2, "deployed": 1.00}},
    "2035": {"q4": {"irr": 0.22, "multiple": 3.1, "deployed": 1.00}}
  }',

  -- Confidence intervals
  '{
    "irr": {"p10": 0.05, "p25": 0.15, "p50": 0.22, "p75": 0.28, "p90": 0.35},
    "multiple": {"p10": 1.8, "p25": 2.5, "p50": 3.1, "p75": 3.8, "p90": 4.5},
    "methodology": "monte_carlo_10000_runs"
  }',

  -- IRR progression over time
  '{
    "year_1": -0.05, "year_2": 0.08, "year_3": 0.15, "year_4": 0.20, "year_5": 0.22,
    "year_6": 0.23, "year_7": 0.22, "year_8": 0.22, "year_9": 0.22, "year_10": 0.22,
    "peak_irr": 0.23, "peak_year": 6, "final_irr": 0.22
  }',

  -- Multiple progression
  '{
    "year_1": 0.95, "year_2": 1.2, "year_3": 1.8, "year_4": 2.1, "year_5": 2.6,
    "year_6": 2.9, "year_7": 3.0, "year_8": 3.1, "year_9": 3.1, "year_10": 3.1,
    "j_curve_bottom": {"multiple": 0.95, "year": 1},
    "inflection_point": {"multiple": 1.8, "year": 3}
  }',

  -- TVPI progression
  '{
    "year_1": 0.95, "year_2": 1.2, "year_3": 1.8, "year_4": 2.1, "year_5": 2.6,
    "year_6": 2.9, "year_7": 3.0, "year_8": 3.1, "year_9": 3.1, "year_10": 3.1
  }',

  -- DPI progression (realizations)
  '{
    "year_1": 0.0, "year_2": 0.0, "year_3": 0.1, "year_4": 0.3, "year_5": 0.8,
    "year_6": 1.2, "year_7": 1.5, "year_8": 1.7, "year_9": 1.8, "year_10": 1.8,
    "first_realization": {"year": 3, "amount": 0.1},
    "major_realization_period": {"start_year": 4, "end_year": 7}
  }',

  'monte_carlo',

  -- Model parameters
  '{
    "simulation_runs": 10000,
    "confidence_level": 0.95,
    "correlation_matrix": "portfolio_based",
    "random_seed": 42,
    "convergence_threshold": 0.001
  }',

  -- Key assumptions
  '{
    "market_conditions": "normal_with_volatility",
    "exit_multiples": {"median": 8.0, "top_quartile": 15.0},
    "time_to_exit": {"median": 5.5, "range": "4-8_years"},
    "follow_on_success": 0.70,
    "write_off_rate": 0.15
  }',

  1
);

-- ============================================================================
-- EXAMPLE SCENARIO COMPARISON
-- Comparing base case vs optimistic scenarios
-- ============================================================================

INSERT INTO scenario_comparisons (
  fund_id,
  comparison_name,
  description,
  comparison_type,
  base_scenario_id,
  comparison_scenarios,
  comparison_metrics,
  weight_scheme,
  metric_comparisons,
  ranking_results,
  trade_off_analysis,
  recommendation_summary,
  key_insights,
  created_by
) VALUES (
  1,
  'Base Case vs Optimistic Analysis',
  'Comparison of conservative base case against optimistic bull market scenario',
  'scenario_analysis',
  (SELECT id FROM portfolio_scenarios WHERE name = 'Base Case 2025-2028'),

  -- Scenarios being compared
  '[
    {"scenario_id": "' || (SELECT id FROM portfolio_scenarios WHERE name = 'Optimistic Upside 2025-2028') || '", "name": "Optimistic", "weight": 0.3},
    {"scenario_id": "' || (SELECT id FROM portfolio_scenarios WHERE name = 'Defensive Downside 2025-2030') || '", "name": "Pessimistic", "weight": 0.2}
  ]',

  -- Metrics to compare
  '["gross_irr", "net_irr", "gross_multiple", "net_multiple", "dpi", "tvpi", "risk_score", "time_to_realization"]',

  -- Relative importance weights
  '{
    "gross_irr": 0.25,
    "net_irr": 0.25,
    "gross_multiple": 0.20,
    "risk_score": 0.15,
    "dpi": 0.10,
    "time_to_realization": 0.05
  }',

  -- Detailed metric comparisons
  '{
    "gross_irr": {"base": 0.28, "optimistic": 0.35, "pessimistic": 0.15, "winner": "optimistic"},
    "net_irr": {"base": 0.22, "optimistic": 0.28, "pessimistic": 0.10, "winner": "optimistic"},
    "gross_multiple": {"base": 4.2, "optimistic": 5.5, "pessimistic": 2.8, "winner": "optimistic"},
    "risk_score": {"base": 6.5, "optimistic": 4.2, "pessimistic": 8.1, "winner": "base"},
    "sharpe_ratio": {"base": 1.8, "optimistic": 2.1, "pessimistic": 0.9, "winner": "optimistic"}
  }',

  -- Scenario rankings
  '{
    "by_returns": ["optimistic", "base", "pessimistic"],
    "by_risk_adjusted": ["optimistic", "base", "pessimistic"],
    "by_consistency": ["base", "pessimistic", "optimistic"],
    "overall": ["optimistic", "base", "pessimistic"]
  }',

  -- Risk-return trade-off analysis
  '{
    "efficient_frontier": true,
    "optimistic": {"return": 0.28, "risk": 0.35, "sharpe": 2.1, "position": "high_risk_high_return"},
    "base": {"return": 0.22, "risk": 0.28, "sharpe": 1.8, "position": "moderate_risk_return"},
    "pessimistic": {"return": 0.10, "risk": 0.32, "sharpe": 0.9, "position": "high_risk_low_return"},
    "recommendation": "optimistic_with_downside_protection"
  }',

  'Optimistic scenario offers best risk-adjusted returns with 28% net IRR. Base case provides solid middle ground. Consider hybrid approach with optimistic deployment but defensive reserve strategy.',

  -- Key insights
  '{
    "primary_driver": "Market environment has outsized impact on returns",
    "risk_mitigation": "Diversification across scenarios recommended",
    "timing_importance": "Entry timing more critical in optimistic scenario",
    "reserve_strategy": "Flexible reserve deployment key to capturing upside",
    "portfolio_construction": "Quality over quantity approach works across scenarios"
  }',

  1
);

COMMIT;

-- ============================================================================
-- EXAMPLE QUERIES FOR PORTFOLIO CONSTRUCTION ANALYSIS
-- ============================================================================

-- Query 1: Fund strategy models with performance targets
/*
SELECT
  fsm.name,
  fsm.model_type,
  fsm.target_irr,
  fsm.target_multiple,
  fsm.target_portfolio_size,
  f.name as fund_name,
  f.size as fund_size
FROM fund_strategy_models fsm
JOIN funds f ON fsm.fund_id = f.id
WHERE fsm.is_active = true
ORDER BY fsm.created_at DESC;
*/

-- Query 2: Scenario comparison with key metrics
/*
SELECT
  ps.name as scenario_name,
  ps.scenario_type,
  ps.market_environment,
  ps.projected_fund_metrics->>'net_irr' as projected_irr,
  ps.projected_fund_metrics->>'net_multiple' as projected_multiple,
  ps.status,
  fsm.name as strategy_name
FROM portfolio_scenarios ps
JOIN fund_strategy_models fsm ON ps.strategy_model_id = fsm.id
WHERE ps.fund_id = 1
ORDER BY ps.projected_fund_metrics->>'net_irr' DESC;
*/

-- Query 3: Reserve allocation strategy effectiveness
/*
SELECT
  ras.name,
  ras.strategy_type,
  ras.total_reserve_amount,
  ras.optimization_objective,
  ras.backtest_results->>'historical_irr' as backtest_irr,
  ras.performance_attribution->>'top_contributors' as key_drivers,
  ps.name as scenario_name
FROM reserve_allocation_strategies ras
LEFT JOIN portfolio_scenarios ps ON ras.scenario_id = ps.id
WHERE ras.is_active = true
ORDER BY ras.total_reserve_amount DESC;
*/

-- Query 4: Performance forecast accuracy tracking
/*
SELECT
  pf.forecast_name,
  pf.methodology,
  pf.forecast_horizon_years,
  pf.quality_score,
  pf.accuracy_metrics->>'historical_accuracy' as accuracy,
  pf.model_drift_metrics->>'drift_score' as model_drift,
  ps.name as scenario_name
FROM performance_forecasts pf
LEFT JOIN portfolio_scenarios ps ON pf.scenario_id = ps.id
WHERE pf.status = 'approved'
ORDER BY pf.quality_score DESC NULLS LAST;
*/

-- Query 5: Monte Carlo simulation results summary
/*
SELECT
  mcs.simulation_name,
  mcs.simulation_type,
  mcs.number_of_runs,
  mcs.summary_statistics->>'mean_irr' as mean_irr,
  mcs.percentile_results->>'p50_multiple' as median_multiple,
  mcs.var_calculations->>'var_95' as var_95,
  mcs.computation_time_ms / 1000.0 as computation_seconds,
  ps.name as scenario_name
FROM monte_carlo_simulations mcs
LEFT JOIN portfolio_scenarios ps ON mcs.scenario_id = ps.id
WHERE mcs.simulation_date >= NOW() - INTERVAL '30 days'
ORDER BY mcs.simulation_date DESC;
*/