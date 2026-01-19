---
status: ACTIVE
last_updated: 2026-01-19
---

# Monte Carlo Simulation Engine - Overview

**Document Version**: 1.0.0 **Last Updated**: 2025-11-06 **Status**: Production
**Related ADRs**: ADR-010 (Validation Strategy)

## Table of Contents

- [Executive Summary](#executive-summary)
- [What is Monte Carlo Simulation](#what-is-monte-carlo-simulation)
- [Why Monte Carlo for VC Modeling](#why-monte-carlo-for-vc-modeling)
- [Key Concepts](#key-concepts)
- [High-Level Architecture](#high-level-architecture)
- [When to Use Monte Carlo](#when-to-use-monte-carlo)
- [Performance Characteristics](#performance-characteristics)
- [Integration Points](#integration-points)

---

## Executive Summary

The Monte Carlo Simulation Engine is a high-performance probabilistic modeling
system designed for venture capital portfolio analysis. It generates thousands
of potential portfolio outcomes to quantify risk, optimize reserve allocation,
and provide actionable insights for fund construction.

**Key Features:**

- **Power Law Distributions**: Models realistic VC returns with 70% failure
  rates and rare outlier outcomes
- **Fast Execution**: Processes 10,000 scenarios in under 5 seconds
- **Risk Quantification**: Calculates VaR, CVaR, Sharpe ratios, and downside
  risk
- **Reserve Optimization**: Identifies optimal reserve allocation strategies
- **Reproducible Results**: Deterministic seeding for auditable simulations

**Primary Use Cases:**

1. **Portfolio Construction**: Model different portfolio composition strategies
2. **Risk Assessment**: Quantify probability of loss and downside scenarios
3. **Reserve Planning**: Optimize follow-on capital allocation
4. **Scenario Analysis**: Compare bull/bear/stress test outcomes
5. **LP Reporting**: Generate statistically rigorous performance forecasts

---

## What is Monte Carlo Simulation

Monte Carlo simulation is a computational technique that uses repeated random
sampling to model the probability distribution of uncertain outcomes. Instead of
producing a single "best guess" estimate, it generates thousands of possible
scenarios to reveal the full range of potential results.

### Core Principle

The fundamental idea: **Run the same scenario thousands of times with different
random inputs to build a probability distribution of outcomes**.

```
Single Deterministic Model:
Input → Calculation → Single Output
Portfolio: 25 companies, $50M fund → Expected IRR: 15%

Monte Carlo Simulation:
Input → 10,000 Random Scenarios → Distribution of Outcomes
Portfolio: 25 companies, $50M fund →
  - P5: -5% IRR (5th percentile - worst case)
  - P50: 12% IRR (median outcome)
  - P95: 35% IRR (95th percentile - best case)
  - Probability of loss: 18%
  - Expected value: 15% IRR
```

### Why It Works

Monte Carlo leverages the **Law of Large Numbers**: as you run more simulations,
the distribution of results converges to the true probability distribution of
outcomes. With 10,000+ scenarios, you can confidently make statements like
"there's a 95% chance our fund will return between 8% and 25% IRR."

---

## Why Monte Carlo for VC Modeling

Venture capital returns exhibit three characteristics that make Monte Carlo
simulation essential:

### 1. Extreme Uncertainty

Unlike public equities or bonds, early-stage startups have:

- **70% failure rate**: Most investments return 0-1x (based on Kauffman
  Foundation data)
- **Power law distribution**: A tiny fraction (1-4%) generate 50x+ returns
- **Binary outcomes**: Companies either fail completely or succeed dramatically

**Traditional modeling fails here**: Normal distributions assume symmetric,
bell-curved outcomes. VC returns are heavily right-skewed with fat tails.

### 2. Portfolio Effects

Individual company outcomes are unpredictable, but **portfolio-level outcomes
are statistically predictable** with sufficient diversification:

```
Single Investment:
70% chance of 0x return
1% chance of 100x return
→ Impossible to predict outcome

30-Company Portfolio (10,000 scenarios):
95% confidence interval: 1.5x - 3.2x fund multiple
Expected median: 2.1x fund multiple
→ Statistically reliable forecast
```

### 3. Multiple Variables Interact

VC fund performance depends on correlated variables:

- Portfolio size (concentration vs diversification)
- Reserve allocation (follow-on strategy)
- Stage distribution (seed vs Series A risk profiles)
- Market timing (exit environment)
- Deployment pace (vintage diversification)

Monte Carlo simulates how these variables **interact across thousands of
scenarios**, revealing non-obvious relationships that deterministic models miss.

---

## Key Concepts

### Scenarios

A **scenario** represents one possible future outcome for the portfolio. Each
scenario generates random samples for every investment based on probability
distributions.

**Example Scenario:**

```typescript
{
  scenarioId: 1,
  companies: [
    { investment: 1, stage: 'seed', multiple: 0.2, irr: -0.85, category: 'failure' },
    { investment: 2, stage: 'seed', multiple: 5.5, irr: 0.42, category: 'good' },
    { investment: 3, stage: 'series-a', multiple: 120, irr: 0.68, category: 'unicorn' },
    // ... 22 more companies
  ],
  portfolioMultiple: 5.2,
  portfolioIRR: 0.28,
  totalValue: $260M (on $50M fund)
}
```

Running 10,000 scenarios produces 10,000 different portfolio outcomes, from
which we extract percentiles, means, and risk metrics.

### Distributions

A **distribution** defines the probability of different outcomes for a variable.
Our engine uses multiple distribution types:

**Power Law (Pareto) Distribution:** Used for modeling VC returns, which follow
a "winner-take-most" pattern.

```
P(X > x) = (x_min / x)^α

Where:
- x_min: Minimum value (typically 3x for power law tail)
- α: Shape parameter (1.16 for realistic VC returns)
- Higher α → steeper drop-off (fewer extreme outliers)
```

**Stage-Specific Return Bands:**

```
Seed Stage:
- 70% chance: 0-1x return (failure)
- 15% chance: 1-3x return (modest)
- 10% chance: 3-10x return (good)
- 4% chance: 10-50x return (home run)
- 1% chance: 50-200x return (unicorn)

Series A Stage (Series A Chasm):
- 50% chance: 0-1x return (lower failure rate)
- 25% chance: 1-3x return
- 15% chance: 3-10x return
- 8% chance: 10-50x return
- 2% chance: 50-200x return (higher unicorn rate)
```

**Normal Distribution (Box-Muller Transform):** Used for IRR volatility and
secondary variables like exit timing variance.

```
Z = √(-2 ln(U₁)) × cos(2πU₂)
X = μ + σZ

Where:
- U₁, U₂: Uniform random variables [0,1]
- μ: Mean
- σ: Standard deviation
- X: Normally distributed random variable
```

### Percentiles

**Percentiles** indicate the probability that an outcome falls below a certain
value:

- **P5 (5th percentile)**: 5% of scenarios are worse than this value (stress
  test)
- **P25 (25th percentile)**: Lower quartile (bear market scenario)
- **P50 (median)**: Half of outcomes are above, half below (base case)
- **P75 (75th percentile)**: Upper quartile (good market scenario)
- **P95 (95th percentile)**: Only 5% of outcomes are better (bull market)

**Why percentiles matter more than mean:** VC returns are right-skewed. The mean
(average) is pulled up by rare extreme outliers, making it misleading.

```
10,000 Scenario Example:
- Mean IRR: 18% (average across all scenarios)
- Median IRR: 12% (50% of scenarios exceed this)

Interpretation: Half of your outcomes will be below 12% IRR, but the
few extreme winners pull the average up to 18%. The median is a more
realistic expectation.
```

### Variance

**Variance** measures the spread of outcomes around the mean. Higher variance =
more uncertainty.

```
Variance (σ²) = Σ(xᵢ - μ)² / (n - 1)

Standard Deviation (σ) = √Variance
```

**Low Variance Portfolio (Conservative):**

```
P5: 8% IRR
P50: 12% IRR
P95: 18% IRR
σ: 0.08 (narrow spread)
→ Predictable but limited upside
```

**High Variance Portfolio (Aggressive):**

```
P5: -10% IRR
P50: 15% IRR
P95: 60% IRR
σ: 0.35 (wide spread)
→ High risk, high potential reward
```

---

## High-Level Architecture

The Monte Carlo Engine follows a **modular pipeline architecture** optimized for
performance and extensibility:

```
┌─────────────────────────────────────────────────────────────┐
│                     INPUT LAYER                              │
│  SimulationConfig: runs, fundId, timeHorizon, portfolioSize │
│  Baseline Data: historical returns, variance, distributions  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  CALIBRATION LAYER                           │
│  • Extract variance patterns from historical data            │
│  • Calibrate IRR, multiple, DPI distributions                │
│  • Fallback to industry defaults if insufficient data        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  SIMULATION LAYER                            │
│  Parallel Batch Processing (4-10 batches)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Batch 1     │  │  Batch 2     │  │  Batch N     │     │
│  │  1000 runs   │  │  1000 runs   │  │  1000 runs   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
│  Each batch generates scenarios:                            │
│  • Power law sampling for investment returns                │
│  • Normal distribution for IRR volatility                   │
│  • Stage-specific failure rates                             │
│  • Exit timing simulation                                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  AGGREGATION LAYER                           │
│  • Combine all batch results                                │
│  • Sort scenarios for percentile calculation                │
│  • Calculate statistics (mean, median, std dev)             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   ANALYSIS LAYER                             │
│  Risk Metrics:                   Reserve Optimization:      │
│  • VaR (5%, 10%)                • Test ratios 10%-50%       │
│  • CVaR (Expected Shortfall)    • Calculate coverage        │
│  • Sharpe/Sortino ratios        • Find optimal allocation   │
│  • Probability of loss                                       │
│  • Max drawdown                 Scenario Analysis:           │
│                                 • Bull market (P90)          │
│                                 • Bear market (P10)          │
│                                 • Stress test (P5)           │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    OUTPUT LAYER                              │
│  SimulationResults:                                          │
│  • Performance distributions (IRR, multiple, DPI, TVPI)     │
│  • Risk metrics (VaR, CVaR, Sharpe, downside risk)         │
│  • Reserve optimization (optimal ratio, improvement)         │
│  • Actionable insights (recommendations, warnings)           │
│  • Execution metadata (time, scenarios, seed)               │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

**1. Parallel Batch Processing**

- Splits simulation into 4-10 concurrent batches for performance
- Each batch processes 1,000 scenarios independently
- Promises await parallel execution, then aggregate results
- **Performance**: 10,000 scenarios complete in 2-5 seconds

**2. Power Law Distribution Service**

- Separate `PowerLawDistribution` class handles return sampling
- Stage-specific profiles model Series A Chasm effect
- Inverse transform sampling for power law tail
- Deterministic seeding via PRNG for reproducibility

**3. Input Validation (ADR-010)**

- Three-tier validation: type check → finite check → range check
- Fail-fast with descriptive errors (no silent coercion)
- Prevents NaN propagation through calculations
- See [04-validation.md](./04-validation.md) for complete strategy

**4. Historical Calibration**

- Extracts last 30 variance reports for distribution parameters
- Calculates actual volatility from variance history
- Falls back to industry defaults if <3 reports available
- Ensures simulations reflect fund's actual risk profile

---

## When to Use Monte Carlo

### Use Monte Carlo When:

✅ **Modeling uncertain outcomes with known probability distributions**

- VC portfolio construction (power law returns)
- Reserve allocation under uncertain follow-on needs
- Exit timing with market volatility

✅ **Quantifying risk and tail scenarios**

- "What's the probability we lose money?"
- "What's our worst-case 5th percentile outcome?"
- "How likely are we to return 3x or better?"

✅ **Comparing multiple strategies**

- 20 companies vs 30 companies
- 30% reserves vs 40% reserves
- Seed-focused vs Series A-focused

✅ **Communicating uncertainty to stakeholders**

- LP presentations: "95% confidence interval: 1.5x - 3.2x"
- Board updates: "18% probability of negative returns"
- Investment memos: "Expected P50: $125M, P5: $60M, P95: $280M"

### Don't Use Monte Carlo When:

❌ **You need exact predictions** Monte Carlo provides probability
distributions, not precise forecasts. If you need to know exact fund performance
(impossible in VC), use deterministic baseline projections instead.

❌ **Probability distributions are unknown** Monte Carlo requires input
distributions. If you don't know the probability distribution of returns for
your strategy, gather more data first or use scenario planning.

❌ **Computational cost outweighs benefits** Real-time UI interactions: use
cached simulations or deterministic approximations. Monte Carlo is for analysis,
not live calculations.

❌ **Explaining decisions to non-technical audiences** Monte Carlo outputs
(percentiles, distributions, standard deviations) require statistical literacy.
For pitches or simple internal discussions, use deterministic scenario analysis
with 3 cases (base, upside, downside).

### Monte Carlo vs Alternatives

| Approach                          | Best For                                           | Limitations                                              |
| --------------------------------- | -------------------------------------------------- | -------------------------------------------------------- |
| **Deterministic Model**           | Quick estimates, simple forecasts                  | Single point estimate, no uncertainty quantification     |
| **Scenario Analysis** (3-5 cases) | Board presentations, investment memos              | Arbitrary scenario selection, no probabilities           |
| **Monte Carlo Simulation**        | Risk analysis, strategy optimization, LP reporting | Requires statistical literacy, computationally intensive |
| **Historical Backtesting**        | Validating strategies against past data            | Past ≠ future, survivorship bias                         |

**Recommended Hybrid Approach:**

1. Use deterministic models for quick directional decisions
2. Use scenario analysis (3 cases) for stakeholder communication
3. Use Monte Carlo for rigorous risk analysis and optimization
4. Validate Monte Carlo assumptions with historical backtesting

---

## Performance Characteristics

### Throughput Benchmarks

**Hardware**: Standard AWS t3.large (2 vCPU, 8GB RAM)

| Scenarios | Portfolio Size | Execution Time | Throughput |
| --------- | -------------- | -------------- | ---------- |
| 1,000     | 25 companies   | 0.4s           | 2,500/sec  |
| 5,000     | 25 companies   | 1.8s           | 2,780/sec  |
| 10,000    | 25 companies   | 3.2s           | 3,125/sec  |
| 10,000    | 50 companies   | 4.8s           | 2,083/sec  |
| 50,000    | 25 companies   | 18.5s          | 2,700/sec  |

**Key Observations:**

- Near-linear scaling from 1K to 50K scenarios
- Batch parallelization provides ~2.5x speedup over sequential
- Portfolio size has linear impact on execution time

### Memory Usage

```
Peak Memory Consumption (10,000 scenarios, 25 companies):
- Input data: ~2MB (baseline, config, distributions)
- Scenario storage: ~40MB (10K scenarios × 25 companies × ~160 bytes)
- Aggregation: ~15MB (sorted arrays for percentiles)
- Risk calculations: ~8MB (temporary arrays for VaR, drawdown)
Total: ~65MB peak

Garbage Collection:
- Minor GCs: 3-5 during simulation
- Major GCs: 0-1 after aggregation
- No memory leaks observed in 100+ consecutive runs
```

### Optimization Strategies

**1. Batch Parallelization**

```typescript
// Split 10,000 runs into 10 batches of 1,000
const batchSize = Math.min(1000, Math.floor(config.runs / 4));
const batchPromises = Array.from({ length: totalBatches }, (_, i) =>
  this.runSimulationBatch(batchSize, portfolioInputs, distributions)
);
const results = await Promise.all(batchPromises);
// ~2.5x faster than sequential
```

**2. Early Validation** ADR-010 validation strategy prevents wasted computation
on invalid inputs (fails in <1ms vs running 5,000 invalid scenarios for 2
seconds).

**3. Streaming for Large Simulations** For 100K+ scenarios, use
`streaming-monte-carlo-engine.ts` which emits results incrementally to avoid
buffering entire result set in memory.

**4. PRNG Instead of Math.random()** Custom Linear Congruential Generator (LCG)
provides:

- 15% faster execution than Math.random()
- Deterministic seeding for reproducibility
- No global state pollution

### Scalability Limits

**Recommended Maximums:**

- **Scenarios**: 50,000 per simulation (beyond this, use streaming engine)
- **Portfolio size**: 100 companies (linear growth, manageable at 100)
- **Concurrent simulations**: 4-6 (limit to avoid memory pressure)
- **Reserve optimization iterations**: 9 ratios (10% to 50% in 5% steps)

**When You Hit Limits:**

- **Need 100K+ scenarios**: Use `streaming-monte-carlo-engine.ts`
- **Need >100 companies**: Consider clustered sampling (group similar companies)
- **Need real-time updates**: Pre-compute simulation, cache results, interpolate
- **Need multi-fund comparisons**: Run simulations sequentially, not
  concurrently

---

## Integration Points

### 1. ReserveEngine Integration

The Monte Carlo Engine **consumes** reserve calculations and **produces**
reserve optimization recommendations.

**Flow**:

```
ReserveEngine.calculateAvailableCapital()
  → Provides reserve ratio for current fund state
  → Monte Carlo simulates 9 reserve strategies (10%-50%)
  → Identifies optimal reserve ratio based on risk-adjusted return
  → Outputs: ReserveOptimization { optimalRatio, improvement, coverage }
```

**Code Reference**: `server/services/monte-carlo-engine.ts:349-400`
(optimizeReserveAllocation)

### 2. PacingEngine Integration

Deployment pace affects portfolio composition. Monte Carlo models different
pacing strategies.

**Flow**:

```
PacingEngine.generateDeploymentSchedule()
  → Produces deployment timeline over 24-60 months
  → Monte Carlo samples stage distribution based on vintage timing
  → Earlier vintages: more seed exposure
  → Later vintages: more Series A+ exposure
  → Outputs: Stage-weighted portfolio scenarios
```

**Code Reference**: `server/services/monte-carlo-engine.ts:576-608`
(runSimulationBatches)

### 3. CohortEngine Integration

Cohort analysis validates Monte Carlo assumptions against actual fund
performance.

**Flow**:

```
CohortEngine.calculateMetrics()
  → Provides actual TVPI, DPI, IRR by vintage
  → Monte Carlo calibrates distributions from variance reports
  → Variance reports track deviation from baseline over time
  → Ensures simulations match fund's actual risk profile
```

**Code Reference**: `server/services/monte-carlo-engine.ts:506-549`
(calibrateDistributions)

### 4. Database Integration

Monte Carlo reads historical data and writes simulation results.

**Read Operations**:

- `fundBaselines`: Portfolio composition, average metrics
- `varianceReports`: Historical deviations for calibration (last 30 reports)
- `funds`: Fund size, creation date

**Write Operations**:

- `monteCarloSimulations`: Complete simulation results
- Includes: config, percentiles, risk metrics, recommendations

**Code Reference**: `server/services/monte-carlo-engine.ts:435-461`
(getBaselineData)

### 5. API Endpoints

**Primary Endpoint**: `POST /api/v1/monte-carlo/simulate`

**Request**:

```json
{
  "fundId": 1,
  "runs": 10000,
  "timeHorizonYears": 8,
  "portfolioSize": 25,
  "deploymentScheduleMonths": 36,
  "randomSeed": 12345
}
```

**Response**:

```json
{
  "simulationId": "uuid",
  "executionTimeMs": 3200,
  "irr": {
    "percentiles": { "p5": 0.02, "p50": 0.15, "p95": 0.32 },
    "statistics": { "mean": 0.17, "standardDeviation": 0.12 }
  },
  "riskMetrics": {
    "probabilityOfLoss": 0.12,
    "sharpeRatio": 1.25
  },
  "reserveOptimization": {
    "currentReserveRatio": 0.35,
    "optimalReserveRatio": 0.4,
    "improvementPotential": 0.02
  }
}
```

**Code Reference**: `server/routes/monte-carlo.ts` (API route handler)

### 6. Frontend Integration

React components consume simulation results for dashboards.

**Components**:

- `SimulationDashboard`: Displays percentile charts, scenario analysis
- `RiskMetricsCard`: Shows VaR, probability of loss, Sharpe ratio
- `ReserveOptimizerChart`: Visualizes reserve ratio impact on returns
- `ScenarioComparisonTable`: Bull/bear/stress test side-by-side

**Data Flow**:

```
TanStack Query → Fetch simulation results from API
  → Cache results (5-minute stale time)
  → Pass to Recharts/Nivo for visualization
  → Update on fund baseline changes
```

**Code Reference**: `client/src/pages/MonteCarloSimulation.tsx`

---

## Next Steps

Continue to:

- **[02-simulation.md](./02-simulation.md)**: Detailed simulation algorithm
  walkthrough
- **[03-statistics.md](./03-statistics.md)**: Statistical properties and
  distributions
- **[04-validation.md](./04-validation.md)**: Validation strategy and testing

## References

- **ADR-010**: Monte Carlo Validation Strategy
  (`docs/adr/ADR-010-monte-carlo-validation-strategy.md`)
- **Implementation**: `server/services/monte-carlo-engine.ts`
- **Power Law Distribution**: `server/services/power-law-distribution.ts`
- **Tests**: `tests/unit/services/monte-carlo-engine.test.ts`
- **Validation Config**: `scripts/validation/monte-carlo-validation.yaml`
- **DECISIONS.md**: PowerLawDistribution API Design
