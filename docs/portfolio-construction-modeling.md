---
status: ACTIVE
last_updated: 2026-01-19
---

# Portfolio Construction Modeling

This document describes the comprehensive portfolio construction modeling system that extends our existing variance tracking and time-travel analytics foundation.

## Overview

The portfolio construction modeling system enables sophisticated "what-if" scenario planning for venture capital funds, with capabilities for:

- **Forward-looking fund strategy modeling** with allocation rules and constraints
- **Multiple scenario planning** with different market assumptions
- **Dynamic reserve allocation strategies** with optimization
- **Performance forecasting** with Monte Carlo simulations
- **Scenario comparison and analysis** for decision support

## Architecture

The system consists of 6 main tables that work together:

```
Fund Strategy Models → Portfolio Scenarios → Performance Forecasts
                    ↓                     ↓
Reserve Allocation Strategies ← Monte Carlo Simulations
                    ↓
             Scenario Comparisons
```

### Integration with Existing Systems

- **Variance Tracking**: Performance forecasts link to fund baselines for comparison
- **Time-Travel Analytics**: Scenarios can reference historical snapshots for validation
- **Core Fund Data**: All models tie back to the main funds and investments tables

## Core Tables

### 1. Fund Strategy Models (`fund_strategy_models`)

Defines the overarching investment strategy for a fund.

**Key Features:**
- Target portfolio size and deployment timeline
- Sector, stage, and geographic allocation rules
- Reserve strategy and follow-on criteria
- Risk parameters and concentration limits
- Performance targets (IRR, multiple, DPI)

**Example Use Cases:**
- Create a "Series A Growth Strategy" for a $100M fund
- Define sector allocation: 30% enterprise software, 20% fintech, etc.
- Set concentration limits: max 15% per company, 35% per sector

### 2. Portfolio Scenarios (`portfolio_scenarios`)

Multiple "what-if" scenarios based on different market assumptions.

**Key Features:**
- Scenario types: base case, optimistic, pessimistic, stress test
- Market environment assumptions (bull, normal, bear, recession)
- Planned investment schedule and company details
- Performance projections and risk analysis
- Monte Carlo simulation integration

**Example Use Cases:**
- Model portfolio construction under different market conditions
- Plan investment timing and check sizes
- Analyze sensitivity to market changes

### 3. Reserve Allocation Strategies (`reserve_allocation_strategies`)

Dynamic strategies for deploying follow-on capital.

**Key Features:**
- Strategy types: proportional, milestone-based, performance-based, opportunistic
- Company scoring and ranking criteria
- Reserve tranches with deployment triggers
- Optimization objectives and constraints
- Performance attribution and backtesting

**Example Use Cases:**
- Allocate reserves based on company performance scores
- Deploy tranches based on milestone achievements
- Optimize allocation for risk-adjusted returns

### 4. Performance Forecasts (`performance_forecasts`)

Predictive models for fund and portfolio performance.

**Key Features:**
- Multiple forecast types: fund-level, portfolio-level, company-level
- Time series projections with confidence intervals
- Multiple methodologies: Monte Carlo, machine learning, expert judgment
- Accuracy tracking and model drift detection
- Integration with variance tracking baselines

**Example Use Cases:**
- Project IRR and multiple progression over 10 years
- Forecast NAV evolution and DPI realization
- Track forecast accuracy against actual results

### 5. Scenario Comparisons (`scenario_comparisons`)

Comparative analysis of different scenarios and strategies.

**Key Features:**
- Compare multiple scenarios across key metrics
- Statistical significance testing
- Pareto frontier and trade-off analysis
- Decision support and recommendations
- Visualization configurations

**Example Use Cases:**
- Compare base case vs optimistic scenarios
- Analyze risk-return trade-offs
- Generate recommendation reports

### 6. Monte Carlo Simulations (`monte_carlo_simulations`)

Detailed simulation results for risk analysis.

**Key Features:**
- Configurable number of simulation runs
- Input distributions and correlation matrices
- Risk metrics: VaR, CVaR, downside risk
- Performance attribution and sensitivity analysis
- Result storage and validation

**Example Use Cases:**
- Run 10,000 simulations of portfolio outcomes
- Calculate Value at Risk at 95% confidence
- Analyze factor contributions to returns

## Usage Examples

### Creating a Fund Strategy

```sql
-- Create a Series A focused strategy
INSERT INTO fund_strategy_models (
  fund_id, name, model_type,
  target_portfolio_size, target_irr, target_multiple,
  sector_allocation, stage_allocation,
  initial_reserve_percentage, follow_on_strategy,
  created_by
) VALUES (
  1, 'Series A Growth Strategy 2025', 'strategic',
  20, 0.25, 3.5,
  '{"enterprise_software": 0.3, "fintech": 0.2, "healthtech": 0.15}',
  '{"late_seed": 0.25, "series_a": 0.65, "series_a_extension": 0.1}',
  0.5, '{"pro_rata_participation": true, "max_follow_on_multiple": 3.0}',
  1
);
```

### Building Scenarios

```sql
-- Create base case scenario
INSERT INTO portfolio_scenarios (
  fund_id, strategy_model_id, name, scenario_type,
  market_environment, planned_investments,
  projected_fund_metrics, created_by
) VALUES (
  1, 'strategy-uuid', 'Base Case 2025-2028', 'base_case',
  'normal',
  '[{"company": "AI Startup", "sector": "enterprise_software", "check_size": 5000000}]',
  '{"net_irr": 0.22, "net_multiple": 3.1, "dpi": 1.8}',
  1
);
```

### Reserve Strategy

```sql
-- Performance-based reserve allocation
INSERT INTO reserve_allocation_strategies (
  fund_id, name, strategy_type,
  total_reserve_amount, allocation_rules,
  company_scoring_criteria, optimization_objective,
  created_by
) VALUES (
  1, 'Performance-Based Reserves', 'performance_based',
  25000000,
  '{"primary_criteria": "performance_score", "minimum_threshold": 7.0}',
  '{"financial_metrics": {"weight": 0.4}, "product_metrics": {"weight": 0.25}}',
  'risk_adjusted_return',
  1
);
```

## Key Workflows

### 1. Strategy Development

1. **Create Fund Strategy Model** - Define investment thesis and constraints
2. **Build Multiple Scenarios** - Model different market conditions
3. **Design Reserve Strategy** - Plan follow-on capital deployment
4. **Run Simulations** - Generate Monte Carlo analysis
5. **Compare Scenarios** - Analyze trade-offs and make decisions

### 2. Performance Monitoring

1. **Generate Forecasts** - Create performance projections
2. **Track Accuracy** - Compare forecasts to actual results
3. **Update Models** - Refine based on new data
4. **Alert on Variance** - Integrate with variance tracking system

### 3. Decision Support

1. **Scenario Analysis** - Compare investment strategies
2. **Risk Assessment** - Evaluate downside scenarios
3. **Optimization** - Find optimal allocation strategies
4. **Reporting** - Generate investment committee materials

## Integration Points

### With Variance Tracking
- Performance forecasts link to fund baselines
- Scenario outcomes feed into variance reports
- Alert rules can trigger on scenario deviations

### With Time-Travel Analytics
- Scenarios can reference historical fund snapshots
- Restoration can include scenario data
- Comparisons across time periods

### With Existing Fund Data
- All models reference core funds table
- Planned investments link to portfolio companies
- Actual vs projected analysis uses investment data

## Analytics and Reporting

### Key Metrics Dashboard
- Scenario comparison matrix
- Performance forecast accuracy
- Reserve allocation effectiveness
- Monte Carlo risk metrics

### Standard Reports
- Investment committee scenario analysis
- Quarterly performance forecasts
- Annual strategy review
- Risk assessment reports

## Best Practices

### Model Design
- Start with simple scenarios and add complexity
- Use historical data for model validation
- Include stress test scenarios
- Regular model recalibration

### Data Quality
- Maintain consistent assumptions across scenarios
- Document all model parameters
- Track data lineage and versioning
- Validate simulation convergence

### Governance
- Approval workflows for strategy changes
- Peer review of forecast models
- Regular accuracy assessment
- Change management processes

## Performance Considerations

### Query Optimization
- Indexes on fund_id, scenario_id, and created_at
- JSONB GIN indexes for complex queries
- Partitioning for large simulation datasets
- Connection pooling for simulation workloads

### Storage Management
- Automatic cleanup of expired simulations
- Compression for large result sets
- Archive old scenarios and forecasts
- Monitor disk usage growth

## Future Enhancements

### Planned Features
- Machine learning model integration
- Real-time scenario updates
- Advanced visualization components
- API for external tools

### Potential Integrations
- Market data feeds for assumptions
- Company data APIs for scoring
- Benchmarking databases
- Risk management systems

---

This portfolio construction modeling system provides a comprehensive foundation for sophisticated venture capital fund planning and analysis, building on the existing variance tracking and time-travel analytics capabilities.