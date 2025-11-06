# Monte Carlo Simulation - Statistical Properties

**Document Version**: 1.0.0 **Last Updated**: 2025-11-06 **Related**:
[01-overview.md](./01-overview.md), [02-simulation.md](./02-simulation.md)

## Table of Contents

- [Statistical Measures Overview](#statistical-measures-overview)
- [Central Tendency](#central-tendency)
- [Dispersion and Variance](#dispersion-and-variance)
- [Percentiles and Quantiles](#percentiles-and-quantiles)
- [Distribution Shape](#distribution-shape)
- [Risk Metrics](#risk-metrics)
- [Confidence Intervals](#confidence-intervals)
- [Variance Scenarios](#variance-scenarios)
- [Edge Cases and Convergence](#edge-cases-and-convergence)

---

## Statistical Measures Overview

The Monte Carlo Engine calculates comprehensive statistical properties for each
performance metric (IRR, multiple, DPI, TVPI, total value). These statistics
transform thousands of raw scenarios into actionable insights.

### Complete Statistical Output

```typescript
interface PerformanceDistribution {
  scenarios: number[]; // All raw scenario values (sorted)

  percentiles: {
    p5: number; // 5th percentile (stress test)
    p25: number; // 25th percentile (lower quartile)
    p50: number; // Median (middle value)
    p75: number; // 75th percentile (upper quartile)
    p95: number; // 95th percentile (bull market)
  };

  statistics: {
    mean: number; // Average (expected value)
    standardDeviation: number; // Volatility (risk)
    min: number; // Worst-case outcome
    max: number; // Best-case outcome
  };

  confidenceIntervals: {
    ci68: [number, number]; // ±1 standard deviation
    ci95: [number, number]; // ±2 standard deviations
  };
}
```

### Example Output (10,000 Scenarios, 25-Company Portfolio)

```json
{
  "irr": {
    "percentiles": {
      "p5": -0.05, // 5% chance of worse than -5% IRR
      "p25": 0.08, // 25% chance of worse than 8% IRR
      "p50": 0.15, // Median: 15% IRR
      "p75": 0.22, // 75% chance of worse than 22% IRR
      "p95": 0.35 // 95% chance of worse than 35% IRR
    },
    "statistics": {
      "mean": 0.17, // Average: 17% IRR
      "standardDeviation": 0.12, // ±12% volatility
      "min": -0.15, // Worst: -15% IRR
      "max": 0.62 // Best: 62% IRR
    },
    "confidenceIntervals": {
      "ci68": [0.05, 0.29], // 68% outcomes fall in 5-29% IRR
      "ci95": [-0.07, 0.41] // 95% outcomes fall in -7% to 41% IRR
    }
  }
}
```

---

## Central Tendency

Central tendency measures describe the "typical" outcome from the distribution.

### Mean (Expected Value)

**Definition**: The arithmetic average of all scenario values.

```
μ = (Σ xᵢ) / n

Where:
- xᵢ: Individual scenario value
- n: Total number of scenarios
```

**Implementation**:

```typescript
// File: server/services/monte-carlo-engine.ts:674
const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
```

**Interpretation**:

- **Mean IRR = 17%**: On average, the fund returns 17% annually
- Represents long-run expected value over infinite simulations
- **Caveat**: Pulled up by rare extreme outliers in right-skewed distributions

**When to Use Mean**: ✅ Long-term expected value for decision-making ✅
Comparing average outcomes across strategies ✅ Financial modeling (discounted
cash flows)

**When NOT to Use Mean**: ❌ Setting realistic targets (median is better) ❌
Highly skewed distributions (outliers dominate) ❌ Communicating "typical"
outcome to non-technical audiences

### Median (50th Percentile)

**Definition**: The middle value when all scenarios are sorted. Half of outcomes
are above, half below.

```
For sorted array [x₁, x₂, ..., xₙ]:
- If n is odd:  median = x_{(n+1)/2}
- If n is even: median = (x_{n/2} + x_{(n/2)+1}) / 2
```

**Implementation**:

```typescript
// File: server/services/monte-carlo-engine.ts:679
p50: this.getPercentile(values, 50)

private getPercentile(sortedValues: number[], percentile: number): number {
  const index = Math.floor((percentile / 100) * (sortedValues.length - 1));
  return sortedValues[index];
}
```

**Interpretation**:

- **Median IRR = 15%**: Half of scenarios exceed 15% IRR
- Robust to outliers (not affected by extreme values)
- More realistic expectation than mean for skewed distributions

**Mean vs Median in VC**:

```
Scenario: 10,000 simulations of 25-company portfolio

Outcomes:
- 7,000 scenarios: 5-18% IRR (bulk of distribution)
- 2,500 scenarios: 18-25% IRR (above-average)
- 400 scenarios: 25-35% IRR (good outcomes)
- 90 scenarios: 35-50% IRR (exceptional)
- 10 scenarios: 50%+ IRR (extreme outliers)

Mean: 17.2% IRR (pulled up by extreme outliers)
Median: 15.0% IRR (typical outcome)

Interpretation: Set targets around median (15%), but expected
long-run return is mean (17%) due to occasional big wins.
```

### Mode (Not Calculated)

The mode (most frequent value) is not meaningful for continuous distributions
with 10,000+ unique values. For VC portfolios, every scenario is effectively
unique.

---

## Dispersion and Variance

Dispersion measures quantify how spread out the outcomes are (uncertainty/risk).

### Variance

**Definition**: The average squared deviation from the mean.

```
σ² = Σ(xᵢ - μ)² / (n - 1)

Where:
- xᵢ: Individual scenario value
- μ: Mean
- n: Number of scenarios
- (n-1): Bessel's correction for sample variance
```

**Why (n-1) instead of n?**

We're calculating **sample variance** (estimating population variance from a
sample). Dividing by n-1 instead of n corrects for bias in the estimate
(unbiased estimator).

**Implementation**:

```typescript
// File: server/services/monte-carlo-engine.ts:675
const variance =
  values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
  (values.length - 1);
```

### Standard Deviation (Volatility)

**Definition**: The square root of variance. Measures average distance from the
mean.

```
σ = √(σ²)
```

**Implementation**:

```typescript
// File: server/services/monte-carlo-engine.ts:676
const standardDeviation = Math.sqrt(variance);
```

**Interpretation**:

```
IRR Standard Deviation = 0.12 (12%)

Meaning:
- Typical deviation from mean (17%) is ±12%
- 68% of scenarios fall within 5-29% IRR (mean ± 1σ)
- 95% of scenarios fall within -7% to 41% IRR (mean ± 2σ)
```

**Standard Deviation Across Portfolio Sizes**:

```
Portfolio Size → Diversification Effect

Single Investment:
- Mean return: 2.5x
- Std dev: 15.0x (massive uncertainty)
- Range: 0x to 200x

10-Company Portfolio:
- Mean return: 2.5x
- Std dev: 4.7x (std dev / √10)
- Range: 0.5x to 12x

25-Company Portfolio:
- Mean return: 2.5x
- Std dev: 3.0x (std dev / √25)
- Range: 1.0x to 8x

50-Company Portfolio:
- Mean return: 2.5x
- Std dev: 2.1x (std dev / √50)
- Range: 1.5x to 6x
```

**Implication**: Larger portfolios reduce volatility, making outcomes more
predictable.

### Coefficient of Variation

**Definition**: Standard deviation as a percentage of the mean. Enables
comparing risk across different scales.

```
CV = σ / μ

Where:
- σ: Standard deviation
- μ: Mean
```

**Example**:

```
Fund A:
- Mean IRR: 15%
- Std dev: 12%
- CV = 0.12 / 0.15 = 0.80 (high relative risk)

Fund B:
- Mean IRR: 20%
- Std dev: 12%
- CV = 0.12 / 0.20 = 0.60 (lower relative risk)

Fund B has better risk-adjusted profile despite same absolute volatility.
```

---

## Percentiles and Quantiles

Percentiles divide the distribution into 100 equal parts, providing a complete
picture of outcome probabilities.

### Percentile Calculation

**Definition**: The value below which P% of observations fall.

```
P-th percentile = value at index floor(P/100 × (n-1))

For 10,000 scenarios, 50th percentile:
index = floor(0.50 × 9999) = 4999
P50 = sortedValues[4999]
```

**Implementation**:

```typescript
// File: server/services/monte-carlo-engine.ts:702-705
private getPercentile(sortedValues: number[], percentile: number): number {
  const index = Math.floor((percentile / 100) * (sortedValues.length - 1));
  return sortedValues[index];
}
```

### Key Percentiles

**P5 (5th Percentile) - Stress Test**:

```
Value: -5% IRR
Interpretation: Only 5% of scenarios are worse than -5% IRR
Use Case: Stress testing, worst-case planning
Audience: Risk committees, regulators
```

**P25 (25th Percentile) - Lower Quartile / Bear Market**:

```
Value: 8% IRR
Interpretation: 25% of scenarios are below 8% IRR
Use Case: Conservative forecasts, downside scenarios
Audience: Cautious LPs, internal planning
```

**P50 (Median) - Base Case**:

```
Value: 15% IRR
Interpretation: Half of scenarios exceed 15% IRR
Use Case: Realistic targets, LP guidance
Audience: Investment committees, fund marketing
```

**P75 (75th Percentile) - Upper Quartile / Bull Market**:

```
Value: 22% IRR
Interpretation: 25% of scenarios exceed 22% IRR
Use Case: Optimistic scenarios, stretch goals
Audience: Board presentations, fundraising
```

**P95 (95th Percentile) - Exceptional Outcome**:

```
Value: 35% IRR
Interpretation: Only 5% of scenarios exceed 35% IRR
Use Case: Best-case planning, home run scenarios
Audience: Aspirational targets, marketing materials
```

### Interquartile Range (IQR)

**Definition**: The range containing the middle 50% of outcomes.

```
IQR = P75 - P25

Example:
P75: 22% IRR
P25: 8% IRR
IQR: 14% IRR

Interpretation: The middle 50% of outcomes span a 14% IRR range.
```

**Use Case**: Robust measure of dispersion, not affected by extreme outliers.

### Percentile Visualizations

**Box Plot Representation**:

```
              95th percentile (35% IRR)
                      |
              ┌───────┴───────┐
              │               │  75th percentile (22% IRR)
              │   ┌───────┐   │
    ──────────┼───┤   │   ├───┼──────────
              │   │  15%  │   │  ← Median
              │   └───────┘   │
              │               │  25th percentile (8% IRR)
              └───────┬───────┘
                      |
               5th percentile (-5% IRR)
```

**Cumulative Distribution Function (CDF)**:

```
100% ┤                       ╭──────
     │                   ╭───╯
 75% ┤              ╭────╯
     │          ╭───╯
 50% ┤      ╭───╯
     │  ╭───╯
 25% ┤╭─╯
     │╯
  0% └──┬────┬────┬────┬────┬────┬──→ IRR
       -10%  0%  10%  20%  30%  40%

Read vertically: "What % of scenarios are below X% IRR?"
Read horizontally: "What IRR do Y% of scenarios exceed?"
```

---

## Distribution Shape

Shape statistics describe asymmetry and tail behavior of the distribution.

### Skewness

**Definition**: Measure of distribution asymmetry.

```
Skewness = E[(X - μ)³] / σ³

Simplified calculation:
Skewness = (Σ((xᵢ - μ) / σ)³) / n
```

**Implementation**:

```typescript
// File: server/services/power-law-distribution.ts:574-575
const skewness =
  values.reduce(
    (sum, val) => sum + Math.pow((val - mean) / standardDeviation, 3),
    0
  ) / n;
```

**Interpretation**:

```
Skewness = 0: Symmetric (normal distribution)
Skewness > 0: Right-skewed (long right tail)
Skewness < 0: Left-skewed (long left tail)
```

**VC Portfolio Skewness**:

```
Typical Seed Portfolio:
Skewness: +2.5 to +4.0 (highly right-skewed)

Visualization:
    Frequency
       │    ╭╮
       │  ╭─╯│
       │ ╭╯  │
       │╭╯   │        ╭╮
       ││    │    ╭───╯╰──────────
       └┴────┴────┴────────────────→ Multiple
        0x   1x   3x   10x   50x+

Most outcomes: 0-1x (failures)
Few outcomes: 10x+ (winners)
Rare outcomes: 50x+ (unicorns)
```

**Why Skewness Matters**:

- Positive skewness: Mean > Median (use median for targets)
- High skewness: Outliers dominate returns (diversification critical)
- Skewness validation: Should be 2-4 for realistic VC portfolios

### Kurtosis (Excess Kurtosis)

**Definition**: Measure of tail "fatness" (probability of extreme events).

```
Kurtosis = E[(X - μ)⁴] / σ⁴

Excess Kurtosis = Kurtosis - 3
(Normal distribution has kurtosis of 3, so we subtract 3)
```

**Implementation**:

```typescript
// File: server/services/power-law-distribution.ts:578-579
const kurtosis =
  values.reduce(
    (sum, val) => sum + Math.pow((val - mean) / standardDeviation, 4),
    0
  ) /
    n -
  3;
```

**Interpretation**:

```
Excess Kurtosis = 0: Normal tails (rare extremes)
Excess Kurtosis > 0: Fat tails (more extreme outliers than normal)
Excess Kurtosis < 0: Thin tails (fewer extremes)
```

**VC Portfolio Kurtosis**:

```
Typical Seed Portfolio:
Excess Kurtosis: +5 to +10 (very fat tails)

Implication: Extreme events (100x returns, total losses) are
much more common than a normal distribution would predict.
```

**Practical Impact**:

```
Normal Distribution (Kurtosis = 0):
- 99.7% of outcomes within ±3σ
- Extreme events (>3σ) very rare (0.3%)

Power Law Distribution (Kurtosis = 8):
- Significant mass beyond ±3σ
- Extreme events (>3σ) common (5-10%)
- Black swan events (>5σ) still possible
```

### Distribution Comparison

```
Normal Distribution vs Power Law (VC Returns)

Normal Distribution:
┌─────────────────────────────────┐
│          ╭───╮                  │
│        ╭─╯   ╰─╮                │
│      ╭─╯       ╰─╮              │
│    ╭─╯           ╰─╮            │
│  ╭─╯               ╰─╮          │
└──┴───────┴───────┴───┴──────────┘
  -3σ    -1σ  μ  +1σ    +3σ

- Symmetric
- Thin tails
- Rare extremes
- Mean ≈ Median

Power Law (VC):
┌─────────────────────────────────┐
│  ╭╮                             │
│ ╭╯│                          ╭─ │ (extends far right)
│╭╯ │                      ╭───╯  │
││  │              ╭───────╯      │
││  │      ╭───────╯              │
└┴──┴──────┴─────────────────────┘
 0  1x    3x    10x    50x+

- Right-skewed
- Fat tails
- Frequent outliers
- Mean > Median
```

---

## Risk Metrics

Beyond basic statistics, the engine calculates sophisticated risk measures used
in finance.

### Value at Risk (VaR)

**Definition**: The maximum loss expected at a given confidence level.

```
VaR_α = -Percentile(1 - α)

Example:
VaR_5% = -P5 percentile

If P5 = -5% IRR:
VaR_5% = 5% (maximum loss with 95% confidence)
```

**Implementation**:

```typescript
// File: server/services/monte-carlo-engine.ts:304-309
const var5Index = Math.floor(0.05 * irrScenarios.length);
const var10Index = Math.floor(0.1 * irrScenarios.length);

const var5 = irrScenarios[var5Index];
const var10 = irrScenarios[var10Index];
```

**Interpretation**:

```
VaR (5%) = 5% loss
VaR (10%) = 2% loss

Meaning:
- 95% confidence: Won't lose more than 5%
- 90% confidence: Won't lose more than 2%
- 5% chance: Could lose more than 5%
```

**Use Cases**:

- Risk reporting to investment committees
- Regulatory capital requirements (banks)
- Portfolio risk limits (e.g., "VaR cannot exceed 10%")

### Conditional Value at Risk (CVaR / Expected Shortfall)

**Definition**: The expected loss in scenarios worse than VaR.

```
CVaR_α = E[X | X ≤ VaR_α]

Average of worst α% of outcomes
```

**Implementation**:

```typescript
// File: server/services/monte-carlo-engine.ts:311-312
const cvar5 =
  irrScenarios.slice(0, var5Index).reduce((sum, val) => sum + val, 0) /
  var5Index;
const cvar10 =
  irrScenarios.slice(0, var10Index).reduce((sum, val) => sum + val, 0) /
  var10Index;
```

**Interpretation**:

```
VaR (5%) = -5% IRR
CVaR (5%) = -8% IRR

Meaning:
- Worst 5% of scenarios average -8% IRR
- If we hit the worst 5%, expect to lose 8% (not just 5%)
- CVaR is always worse than VaR
```

**Why CVaR Matters**: VaR only tells you the threshold, not how bad the tail
outcomes are. CVaR quantifies expected loss in disaster scenarios.

```
Example:

Fund A:
VaR (5%): -5% IRR
CVaR (5%): -6% IRR
(Tail losses are mild)

Fund B:
VaR (5%): -5% IRR
CVaR (5%): -15% IRR
(Tail losses are catastrophic)

Both have same VaR, but Fund B has much worse tail risk.
```

### Probability of Loss

**Definition**: Percentage of scenarios with negative returns.

```
P(IRR < 0) = Count(IRR < 0) / Total Scenarios
```

**Implementation**:

```typescript
// File: server/services/monte-carlo-engine.ts:315
const probabilityOfLoss =
  irrScenarios.filter((irr) => irr < 0).length / irrScenarios.length;
```

**Interpretation**:

```
Probability of Loss = 12%

Meaning:
- 12% of scenarios result in negative IRR
- 88% of scenarios return positive IRR
- 1 in 8 chance of losing money
```

**Threshold Warnings**:

```
P(Loss) < 10%: Acceptable risk for VC funds
P(Loss) 10-20%: Elevated risk, requires justification
P(Loss) 20-30%: High risk, aggressive strategy
P(Loss) > 30%: Unacceptable risk for institutional LPs
```

### Downside Risk (Downside Deviation)

**Definition**: Standard deviation of returns below the mean (only penalizes
downside volatility).

```
Downside Risk = √(Σ(min(xᵢ - μ, 0))² / n)

Only includes negative deviations from mean
```

**Implementation**:

```typescript
// File: server/services/monte-carlo-engine.ts:318-322
const negativeReturns = irrScenarios.filter(
  (irr) => irr < performanceResults.irr.statistics.mean
);
const downsideVariance =
  negativeReturns.reduce(
    (sum, ret) =>
      sum + Math.pow(ret - performanceResults.irr.statistics.mean, 2),
    0
  ) / negativeReturns.length;
const downsideRisk = Math.sqrt(downsideVariance);
```

**Standard Deviation vs Downside Risk**:

```
Standard Deviation:
- Penalizes both upside and downside volatility
- Treats +20% and -20% deviation equally
- Not ideal for asymmetric distributions

Downside Risk:
- Only penalizes downside volatility
- Ignores upside volatility (good for investors)
- Better for skewed distributions like VC
```

### Sharpe Ratio

**Definition**: Risk-adjusted return per unit of volatility.

```
Sharpe Ratio = (Mean Return - Risk-Free Rate) / Standard Deviation

Typically: Risk-Free Rate = 2% (10-year Treasury)
```

**Implementation**:

```typescript
// File: server/services/monte-carlo-engine.ts:325-327
const riskFreeRate = 0.02;
const excessReturn = performanceResults.irr.statistics.mean - riskFreeRate;
const sharpeRatio =
  excessReturn / performanceResults.irr.statistics.standardDeviation;
```

**Interpretation**:

```
Sharpe Ratio = 1.25

Meaning:
- For every 1% of volatility, fund earns 1.25% excess return over risk-free rate
- Higher is better (more return per unit of risk)

Benchmarks:
< 1.0: Below average risk-adjusted return
1.0-2.0: Good risk-adjusted return
> 2.0: Exceptional (rare for VC)
```

### Sortino Ratio

**Definition**: Risk-adjusted return per unit of downside risk (better than
Sharpe for skewed distributions).

```
Sortino Ratio = (Mean Return - Risk-Free Rate) / Downside Risk
```

**Implementation**:

```typescript
// File: server/services/monte-carlo-engine.ts:330
const sortinoRatio = excessReturn / downsideRisk;
```

**Sharpe vs Sortino**:

```
Fund with volatile upside, stable downside:

Sharpe Ratio: 1.0 (penalized for upside volatility)
Sortino Ratio: 1.8 (ignores upside volatility)

Sortino is higher because it only penalizes downside,
which is what investors actually care about.
```

### Maximum Drawdown

**Definition**: Largest peak-to-trough decline in portfolio value.

```
Max Drawdown = max((Peak - Trough) / Peak)

Simulated by modeling value evolution over time with quarterly shocks
```

**Implementation**:

```typescript
// File: server/services/monte-carlo-engine.ts:707-732
private calculateMaxDrawdown(scenarios: any[]): number {
  const timePoints = 20; // Quarterly over 5 years
  let maxDrawdown = 0;

  for (const scenario of scenarios.slice(0, 1000)) { // Sample for performance
    let peak = scenario.totalValue;
    let currentValue = scenario.totalValue;

    for (let t = 1; t <= timePoints; t++) {
      const volatility = 0.15;
      const randomShock = this.sampleNormal(0, volatility / Math.sqrt(4)); // Quarterly
      currentValue *= (1 + randomShock);

      if (currentValue > peak) peak = currentValue;

      const drawdown = (peak - currentValue) / peak;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }
  }

  return maxDrawdown;
}
```

**Interpretation**:

```
Max Drawdown = 35%

Meaning:
- At worst, portfolio value declined 35% from peak
- Measures short-term pain (important for LP psychology)
- Higher drawdowns → more LP redemption risk

Benchmarks:
< 20%: Low drawdown (conservative)
20-40%: Moderate drawdown (typical VC)
> 40%: High drawdown (aggressive/volatile)
```

---

## Confidence Intervals

Confidence intervals quantify uncertainty in the mean estimate.

### 68% Confidence Interval (±1σ)

```
CI_68% = [μ - σ, μ + σ]

Example:
Mean: 17% IRR
Std Dev: 12%
CI_68% = [5%, 29%]

Interpretation: 68% of scenarios fall within 5-29% IRR
```

**Implementation**:

```typescript
// File: server/services/monte-carlo-engine.ts:694-698
confidenceIntervals: {
  ci68: [mean - standardDeviation, mean + standardDeviation],
  ci95: [mean - 2 * standardDeviation, mean + 2 * standardDeviation]
}
```

### 95% Confidence Interval (±2σ)

```
CI_95% = [μ - 2σ, μ + 2σ]

Example:
Mean: 17% IRR
Std Dev: 12%
CI_95% = [-7%, 41%]

Interpretation: 95% of scenarios fall within -7% to 41% IRR
```

**Assumption**: Confidence intervals assume normal distribution. For highly
skewed VC returns, percentiles (P5-P95) are more accurate.

### Standard Error of the Mean

For estimating uncertainty in the mean itself (not individual outcomes):

```
SE_mean = σ / √n

Example:
Std Dev: 12%
Scenarios: 10,000
SE_mean = 0.12 / √10,000 = 0.0012 = 0.12%

95% CI for mean = Mean ± 1.96 × SE_mean
                = 17% ± 0.24%
                = [16.76%, 17.24%]
```

**Interpretation**: With 10,000 scenarios, we're 95% confident the true mean IRR
is between 16.76% and 17.24%. Very narrow!

**Implication**: 10,000 scenarios provide high confidence in mean estimate.
Increasing to 50,000 scenarios only improves precision from ±0.24% to ±0.11%
(diminishing returns).

---

## Variance Scenarios

The engine models different volatility regimes to stress-test assumptions.

### High Variance Scenario

```yaml
# From: scripts/validation/monte-carlo-validation.yaml:32-51
scenario: 'High-risk portfolio simulation'
simulation:
  iterations: 1000
  fundSize: 100000000
  companies: 15
  meanReturn: 0.25
  stdDeviation: 0.60 # 60% volatility (very high)

expected_characteristics:
  - stdDev > 0.50
  - p90 / p10 > 3.0 # Wide spread
  - some outcomes > 3.0x multiple
  - some outcomes < 0.5x multiple
```

**Characteristics**:

- **Standard deviation > 50%**: Extreme uncertainty
- **P90/P10 ratio > 3**: 90th percentile is 3x the 10th percentile
- **Wide outcome range**: Outcomes from 0.5x to 3.0x+
- **High skewness**: More extreme outliers

**When This Occurs**:

- Concentrated portfolios (15 companies vs 25)
- Early-stage focus (100% seed/pre-seed)
- Sector concentration (100% crypto, AI, biotech)
- Emerging markets with high failure rates

### Low Variance Scenario

```yaml
# From: scripts/validation/monte-carlo-validation.yaml:53-70
scenario: 'Low-risk, steady returns'
simulation:
  iterations: 1000
  fundSize: 50000000
  companies: 30
  meanReturn: 0.08
  stdDeviation: 0.15 # 15% volatility (conservative)

expected_characteristics:
  - stdDev < 0.20
  - p90 / p10 < 2.0 # Narrow spread
  - mean > 1.05 and mean < 1.15
```

**Characteristics**:

- **Standard deviation < 20%**: Low uncertainty
- **P90/P10 ratio < 2**: Narrow outcome range
- **Predictable returns**: Mean 1.05-1.15x (modest but stable)
- **Lower skewness**: Fewer extreme outliers

**When This Occurs**:

- Large portfolios (30+ companies)
- Later-stage focus (Series B/C)
- Diversified sectors (no >20% in any sector)
- Mature markets with lower failure rates

### Calibrating Variance from Historical Data

The engine adjusts variance based on fund's actual performance history:

```typescript
// File: server/services/monte-carlo-engine.ts:506-549
private async calibrateDistributions(fundId: number, baseline: FundBaseline): Promise<DistributionParameters> {
  // Get last 30 variance reports
  const reports = await db.query.varianceReports.findMany({
    where: and(eq(varianceReports.fundId, fundId), eq(varianceReports.baselineId, baseline.id)),
    orderBy: desc(varianceReports.asOfDate),
    limit: 30
  });

  if (reports.length < 3) {
    return this.getDefaultDistributions(); // Fall back to industry defaults
  }

  // Extract variance patterns
  const irrVariances = this.extractVariances(reports, 'irrVariance');
  const multipleVariances = this.extractVariances(reports, 'multipleVariance');

  return {
    irr: {
      mean: parseFloat(baseline.irr?.toString() || '0.15'),
      volatility: this.calculateVolatility(irrVariances) || 0.08  // Actual fund volatility
    },
    multiple: {
      mean: parseFloat(baseline.multiple?.toString() || '2.5'),
      volatility: this.calculateVolatility(multipleVariances) || 0.6
    }
    // ... other distributions
  };
}
```

**Adaptive Calibration**:

- **Low historical variance**: Use tighter distributions (fund is consistent)
- **High historical variance**: Use wider distributions (fund is volatile)
- **Insufficient data**: Fall back to industry defaults (conservative)

---

## Edge Cases and Convergence

### Convergence Testing

How many scenarios are needed for stable statistics?

```
Convergence Test (Seed: 12345, 25-company portfolio):

Scenarios | Mean IRR | Std Dev IRR | Std Error Mean | P50 | P95
----------|----------|-------------|----------------|-----|-----
100       | 0.165    | 0.127       | 0.0127         | 0.15| 0.37
500       | 0.172    | 0.119       | 0.0053         | 0.15| 0.34
1,000     | 0.169    | 0.121       | 0.0038         | 0.15| 0.35
5,000     | 0.170    | 0.120       | 0.0017         | 0.15| 0.35
10,000    | 0.170    | 0.120       | 0.0012         | 0.15| 0.35
50,000    | 0.170    | 0.120       | 0.0005         | 0.15| 0.35

Observation:
- Mean stabilizes by 5,000 scenarios
- Percentiles stabilize by 5,000-10,000 scenarios
- Diminishing returns beyond 10,000
- 50,000 provides only marginal improvement
```

**Recommendation**: Use 10,000 scenarios for production (balance of accuracy and
performance).

### Total Loss Edge Case

```typescript
// File: server/services/power-law-distribution.ts:316-318
if (returnSample.multiple <= 0) {
  irr = -1.0; // Total loss sentinel (avoids Math.pow(negative, fractional))
}
```

**Why -1.0?**

- Represents 100% capital loss (IRR of -100%)
- Avoids NaN from `Math.pow(0, 1/years)` or `Math.pow(negative, fractional)`
- Interpretable sentinel value

**Frequency**: Occurs in ~0.5-1% of individual investment outcomes (but almost
never at portfolio level for 25+ companies).

### Extreme Outlier Capping

```typescript
// File: server/services/power-law-distribution.ts:89-99
unicorn: { min: 50, max: 200, probability: 0.01 }

// Sampling caps at 200x
return Math.min(sample, max);
```

**Rationale**:

- Uncapped power law can generate 1000x+ returns (unrealistic)
- 200x cap reflects realistic maximum (Instagram: ~100x, WhatsApp: ~50x)
- Prevents single extreme outlier from dominating statistics

### Non-Convergent Scenarios

**When statistics don't converge**:

1. **Insufficient scenarios**: <1,000 scenarios show high variance
2. **Extreme configurations**: 100% pre-seed with 5 companies
3. **Implementation bugs**: NaN propagation, infinite loops

**Detection**:

```typescript
// Add convergence checks
if (!Number.isFinite(mean) || !Number.isFinite(standardDeviation)) {
  throw new Error('Non-convergent simulation (NaN or Infinity detected)');
}

if (standardDeviation / mean > 3.0) {
  console.warn(
    'High coefficient of variation (CV > 3.0): results may be unstable'
  );
}
```

---

## Next Steps

Continue to:

- **[04-validation.md](./04-validation.md)**: Complete validation strategy from
  ADR-010
- **[01-overview.md](./01-overview.md)**: Return to overview
- **[02-simulation.md](./02-simulation.md)**: Review simulation algorithm

## Code References

- **Risk Metrics**: `server/services/monte-carlo-engine.ts:299-344`
  - VaR/CVaR calculation
  - Sharpe/Sortino ratios
  - Probability of loss
  - Maximum drawdown simulation

- **Statistics**: `server/services/monte-carlo-engine.ts:673-700`
  - Mean, variance, standard deviation
  - Percentile calculation
  - Confidence intervals

- **Power Law Statistics**: `server/services/power-law-distribution.ts:548-628`
  - Skewness calculation
  - Kurtosis calculation
  - Percentile calculation

- **Calibration**: `server/services/monte-carlo-engine.ts:506-574`
  - Historical variance extraction
  - Volatility calculation from variance reports

## References

- **ADR-010**: Monte Carlo Validation Strategy
- **Tests**: `tests/unit/services/monte-carlo-engine.test.ts` (risk metrics
  tests)
- **Validation**: `scripts/validation/monte-carlo-validation.yaml` (variance
  scenarios)
- **Financial Mathematics**: Hull, "Options, Futures, and Other Derivatives"
  (VaR, CVaR)
- **Statistics**: Casella & Berger, "Statistical Inference" (convergence, CLT)
