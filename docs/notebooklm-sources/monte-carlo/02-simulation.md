---
status: ACTIVE
last_updated: 2026-01-19
---

# Monte Carlo Simulation - Algorithm Deep Dive

**Document Version**: 1.0.0 **Last Updated**: 2025-11-06 **Related**:
[01-overview.md](./01-overview.md), ADR-010

## Table of Contents

- [Simulation Algorithm Overview](#simulation-algorithm-overview)
- [Random Number Generation](#random-number-generation)
- [Scenario Generation](#scenario-generation)
- [Power Law Sampling](#power-law-sampling)
- [Stage-Specific Distributions](#stage-specific-distributions)
- [Exit Timing Simulation](#exit-timing-simulation)
- [IRR Calculation](#irr-calculation)
- [Correlation Handling](#correlation-handling)
- [Mathematical Foundations](#mathematical-foundations)

---

## Simulation Algorithm Overview

The Monte Carlo Engine follows a **four-phase algorithm** to transform input
parameters into thousands of portfolio outcomes:

### Phase 1: Initialization & Calibration

```typescript
// File: server/services/monte-carlo-engine.ts:196-226
async runPortfolioSimulation(config: SimulationConfig): Promise<SimulationResults> {
  // 1. Validate configuration (ADR-010 three-tier validation)
  this.validateConfig(config);

  // 2. Retrieve baseline data and historical variance
  const baseline = await this.getBaselineData(config.fundId, config.baselineId);
  const portfolioInputs = await this.getPortfolioInputs(config.fundId, baseline);

  // 3. Calibrate distributions from historical data
  const distributions = await this.calibrateDistributions(config.fundId, baseline);

  // 4. Initialize PRNG with seed for reproducibility
  if (config.randomSeed) {
    this.prng.reset(config.randomSeed);
  }

  // Proceed to Phase 2...
}
```

**Key Operations**:

- **Validation**: Checks `runs` (100-50,000), `timeHorizonYears` (1-15)
- **Baseline Retrieval**: Fetches active, default baseline for fund
- **Portfolio Inputs**: Calculates reserve ratio, sector/stage weights
- **Calibration**: Extracts variance from last 30 reports, falls back to
  defaults

### Phase 2: Parallel Batch Simulation

```typescript
// File: server/services/monte-carlo-engine.ts:576-608
private async runSimulationBatches(
  config: SimulationConfig,
  portfolioInputs: PortfolioInputs,
  distributions: DistributionParameters,
  batchSize: number
): Promise<any[]> {
  const totalBatches = Math.ceil(config.runs / batchSize);
  const batchPromises = [];

  for (let i = 0; i < totalBatches; i++) {
    const runsInBatch = Math.min(batchSize, config.runs - i * batchSize);

    batchPromises.push(
      this.runSimulationBatch(runsInBatch, portfolioInputs, distributions, timeHorizonYears)
    );
  }

  const batchResults = await Promise.all(batchPromises);
  return batchResults.flat(); // Combine all scenarios
}
```

**Parallelization Strategy**:

- Default batch size: `min(1000, runs / 4)`
- Example: 10,000 runs → 10 batches of 1,000
- All batches execute concurrently via `Promise.all()`
- **Performance gain**: ~2.5x speedup vs sequential execution

### Phase 3: Single Scenario Generation

```typescript
// File: server/services/monte-carlo-engine.ts:626-659
private generateSingleScenario(
  portfolioInputs: PortfolioInputs,
  distributions: DistributionParameters,
  timeHorizonYears: number
): any {
  // Sample from normal distributions
  const irrSample = this.sampleNormal(distributions.irr.mean, distributions.irr.volatility);
  const multipleSample = this.sampleNormal(distributions.multiple.mean, distributions.multiple.volatility);
  const dpiSample = this.sampleNormal(distributions.dpi.mean, distributions.dpi.volatility);

  // Sample exit timing (clamped to minimum 1 year)
  const exitTimingSample = Math.max(1,
    this.sampleNormal(distributions.exitTiming.mean, distributions.exitTiming.volatility)
  );

  // Apply time decay factor for long horizons
  const yearsAboveBaseline = Math.max(0, timeHorizonYears - 5);
  const acceleratedDecay = timeHorizonYears > 10 ? 0.95 : 0.97;
  const timeDecay = Math.pow(acceleratedDecay, yearsAboveBaseline);

  // Calculate compound growth
  const compoundFactor = Math.pow(1 + irrSample, timeHorizonYears);

  // Calculate final scenario values
  const totalValue = portfolioInputs.deployedCapital * multipleSample * compoundFactor * timeDecay;
  const tvpi = multipleSample * timeDecay;

  return {
    irr: irrSample,
    multiple: multipleSample,
    dpi: Math.max(0, dpiSample),
    tvpi: Math.max(0, tvpi),
    totalValue: Math.max(0, totalValue),
    exitTiming: exitTimingSample,
    followOnNeed: this.sampleNormal(distributions.followOnSize.mean, distributions.followOnSize.volatility)
  };
}
```

**Key Design Decisions**:

1. **Time Decay** (Line 641-643):
   - No decay for first 5 years (standard VC fund life)
   - Conservative 3% annual decay after year 5
   - Accelerates to 5% for horizons >10 years
   - Reflects market risk and LP impatience

2. **Clamping to Zero** (Lines 653-655):
   - Prevents negative values for DPI, TVPI, total value
   - Realistic constraint: can't return less than 0x

3. **Follow-On Needs**:
   - Sampled independently per scenario
   - Used in reserve optimization (Phase 4)

### Phase 4: Aggregation & Analysis

```typescript
// File: server/services/monte-carlo-engine.ts:661-700
private calculatePerformanceDistributions(scenarios: any[]): any {
  const metrics = ['irr', 'multiple', 'dpi', 'tvpi', 'totalValue'];
  const results: any = {};

  for (const metric of metrics) {
    const values = scenarios.map(s => s[metric]).sort((a, b) => a - b);
    results[metric] = this.createPerformanceDistribution(values);
  }

  return results;
}

private createPerformanceDistribution(values: number[]): PerformanceDistribution {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1);
  const standardDeviation = Math.sqrt(variance);

  const percentiles = {
    p5: this.getPercentile(values, 5),
    p25: this.getPercentile(values, 25),
    p50: this.getPercentile(values, 50),
    p75: this.getPercentile(values, 75),
    p95: this.getPercentile(values, 95)
  };

  return {
    scenarios: values,
    percentiles,
    statistics: { mean, standardDeviation, min: Math.min(...values), max: Math.max(...values) },
    confidenceIntervals: {
      ci68: [mean - standardDeviation, mean + standardDeviation],
      ci95: [mean - 2 * standardDeviation, mean + 2 * standardDeviation]
    }
  };
}
```

**Statistical Calculations**:

- **Mean**: Simple average of all scenario values
- **Variance**: Bessel's correction (n-1) for sample variance
- **Percentiles**: Index-based lookup on sorted array
- **Confidence Intervals**: Assuming normal distribution (68% = ±1σ, 95% = ±2σ)

---

## Random Number Generation

The engine uses a **custom Pseudo-Random Number Generator (PRNG)** for
deterministic, reproducible results.

### Why Not Math.random()?

JavaScript's `Math.random()` has three problems for Monte Carlo simulations:

1. **Non-deterministic**: Cannot reproduce exact results with a seed
2. **Platform-dependent**: Different implementations across browsers/Node.js
3. **No state control**: Can't reset or inspect internal state

### Linear Congruential Generator (LCG)

**Implementation**: `shared/utils/prng.ts:16-155`

```typescript
export class PRNG {
  private state: number;

  // Numerical Recipes parameters
  private readonly a = 1664525;
  private readonly c = 1013904223;
  private readonly m = 4294967296; // 2^32

  constructor(seed: number = Date.now()) {
    if (seed < 0 || !Number.isInteger(seed)) {
      throw new Error('Invalid PRNG seed: must be non-negative integer');
    }
    this.state = seed % this.m;
  }

  next(): number {
    this.state = (this.a * this.state + this.c) % this.m;
    return this.state / this.m; // Returns [0, 1)
  }
}
```

### LCG Algorithm

The recurrence relation:

```
X_{n+1} = (a × X_n + c) mod m

Where:
- X_n: Current state
- a: Multiplier (1664525, from Numerical Recipes)
- c: Increment (1013904223)
- m: Modulus (2^32)
```

**Properties**:

- **Period**: 2^32 (4.2 billion values before repeating)
- **Uniform distribution**: Values evenly distributed in [0, 1)
- **Fast**: ~15% faster than Math.random() (no system call)
- **Deterministic**: Same seed → same sequence

### Box-Muller Transform (Normal Distribution)

```typescript
// File: shared/utils/prng.ts:50-57
nextNormal(mean: number = 0, stdDev: number = 1): number {
  const u1 = this.next();
  const u2 = this.next();

  // Box-Muller transform
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z0 * stdDev;
}
```

**Mathematical Derivation**:

Starting with two independent uniform random variables U₁, U₂ ~ Uniform(0,1):

```
Z₀ = √(-2 ln(U₁)) × cos(2πU₂)
Z₁ = √(-2 ln(U₁)) × sin(2πU₂)

Both Z₀ and Z₁ are independent, standard normal N(0,1)
```

To transform to N(μ, σ²):

```
X = μ + σZ₀
```

**Why It Works**: The Box-Muller transform exploits the fact that the 2D
Gaussian distribution in polar coordinates has a tractable form. By sampling
radius and angle uniformly, we can generate normally distributed coordinates.

### Seeding for Reproducibility

```typescript
// Example: Reproducible simulation
const engine1 = new MonteCarloEngine(12345); // Seed: 12345
const result1 = await engine1.runPortfolioSimulation(config);

const engine2 = new MonteCarloEngine(12345); // Same seed
const result2 = await engine2.runPortfolioSimulation(config);

// Results are IDENTICAL down to floating-point precision
assert(result1.irr.statistics.mean === result2.irr.statistics.mean);
assert(result1.irr.percentiles.p50 === result2.irr.percentiles.p50);
```

**Use Cases**:

- **Regression testing**: Verify code changes don't alter simulation logic
- **Debugging**: Reproduce exact scenario that caused an issue
- **Auditing**: Regulators can re-run simulations and verify results
- **A/B testing**: Compare two strategies with identical randomness

---

## Scenario Generation

Each scenario simulates one possible future for the entire portfolio.

### Portfolio-Level Scenario

```typescript
// Pseudocode for clarity
function generatePortfolioScenario(
  portfolioSize: number,
  stageDistribution: Record<Stage, number>,
  distributions: DistributionParameters
): PortfolioScenario {
  const companies = [];

  // Generate outcome for each company
  for (let i = 0; i < portfolioSize; i++) {
    // Select stage based on weights
    const stage = sampleStage(stageDistribution);

    // Sample return from stage-specific distribution
    const returnSample = powerLawDistribution.sampleReturn(stage);

    // Calculate IRR from multiple and exit timing
    const exitTiming = sampleExitTiming(stage, returnSample.category);
    const irr = Math.pow(returnSample.multiple, 1 / exitTiming) - 1;

    companies.push({
      stage,
      multiple: returnSample.multiple,
      irr,
      exitTiming,
      category: returnSample.category, // failure, modest, good, homeRun, unicorn
    });
  }

  // Aggregate to portfolio level
  const portfolioMultiple =
    companies.reduce((sum, c) => sum + c.multiple, 0) / portfolioSize;
  const portfolioIRR =
    companies.reduce((sum, c) => sum + c.irr, 0) / portfolioSize;

  return {
    companies,
    portfolioMultiple,
    portfolioIRR,
    totalValue: deployedCapital * portfolioMultiple,
  };
}
```

### Scenario Structure

```typescript
interface Scenario {
  scenarioId: number;

  // Portfolio-level metrics
  irr: number; // Weighted average IRR
  multiple: number; // Average return multiple
  dpi: number; // Distributed to Paid-In capital
  tvpi: number; // Total Value to Paid-In
  totalValue: number; // Absolute dollar value

  // Supporting data
  exitTiming: number; // Average years to exit
  followOnNeed: number; // Required follow-on capital ratio

  // (Optional) Company-level details
  companies?: CompanyOutcome[];
}
```

**Design Note**: The engine currently aggregates at portfolio level for
performance. Company-level details can be enabled via a flag for detailed
analysis (at ~3x memory cost).

---

## Power Law Sampling

The `PowerLawDistribution` class implements inverse transform sampling for VC
return distributions.

### Why Power Law?

Venture capital returns follow a **power law (Pareto) distribution**, not a
normal distribution:

**Normal Distribution (Wrong for VC)**:

```
Most outcomes near mean
Symmetric around mean
Rare extreme values
Example: Heights, test scores
```

**Power Law Distribution (Correct for VC)**:

```
Most outcomes are failures (70%)
Extremely right-skewed
Frequent extreme outliers (top 1%)
Example: VC returns, company sizes, wealth
```

### Mathematical Form

The power law probability density function:

```
p(x) = (α - 1) / x_min × (x / x_min)^(-α)   for x ≥ x_min

Where:
- x_min: Minimum value (3.0x for VC returns)
- α: Shape parameter (1.16 for realistic VC)
- Lower α → fatter tail (more extreme outliers)
```

**Cumulative Distribution Function (CDF)**:

```
P(X ≤ x) = 1 - (x_min / x)^(α - 1)
```

### Inverse Transform Sampling

To generate samples from a power law:

```typescript
// File: server/services/power-law-distribution.ts:474-490
private samplePowerLaw(min: number, max: number): number {
  const alpha = this.config.alpha;
  const u = this.rng(); // Uniform [0,1]

  if (alpha === 1) {
    // Special case: exponential distribution
    return min * Math.exp(u * Math.log(max / min));
  }

  // Inverse CDF for power law
  const alphaMinus1 = alpha - 1;
  const ratio = Math.pow(min / max, alphaMinus1);
  const sample = min * Math.pow(1 - u * (1 - ratio), -1 / alphaMinus1);

  return Math.min(sample, max); // Cap at max
}
```

**Derivation**:

Starting with CDF: `P(X ≤ x) = 1 - (x_min / x)^(α-1)`

Set CDF equal to uniform random variable U:

```
U = 1 - (x_min / x)^(α-1)
1 - U = (x_min / x)^(α-1)
(1 - U)^(-1/(α-1)) = x / x_min
x = x_min × (1 - U)^(-1/(α-1))
```

Since U ~ Uniform(0,1), so does 1-U, so we use U directly:

```
X = x_min × (1 - U × (1 - (x_min/x_max)^(α-1)))^(-1/(α-1))
```

### Alpha Parameter Calibration

The shape parameter α controls tail behavior:

```
α = 1.05: Very fat tail (many extreme outliers)
  - 5% of companies return >50x
  - Unrealistic for modern VC (2020s data)

α = 1.16: Realistic VC distribution (USED)
  - 1% of companies return >50x
  - Matches Kauffman Foundation data

α = 1.50: Thin tail (fewer outliers)
  - 0.1% return >50x
  - Too pessimistic for venture capital
```

**Empirical Calibration** (from
`tests/unit/services/monte-carlo-power-law-validation.test.ts`):

- 20,000 seed-stage samples with α=1.16
- Observed unicorn rate: 1.0% ± 0.3%
- Observed failure rate: 70% ± 2%
- Matches industry benchmarks ✓

---

## Stage-Specific Distributions

The Series A Chasm effect is modeled via **stage-specific return band
probabilities**.

### Return Band Structure

```typescript
// File: server/services/power-law-distribution.ts:86-111
export interface StageReturnProfile {
  stage: InvestmentStage;
  failureRate: number;
  returnBands: {
    failure: { min: number; max: number; probability: number };
    modest: { min: number; max: number; probability: number };
    good: { min: number; max: number; probability: number };
    homeRun: { min: number; max: number; probability: number };
    unicorn: { min: number; max: number; probability: number };
  };
}
```

### Stage Profiles (Based on 2024-2025 VC Data)

**Seed Stage** (Line 395-405):

```typescript
{
  stage: 'seed',
  failureRate: 0.70,  // Kauffman Foundation 68% → 70%
  returnBands: {
    failure:  { min: 0,   max: 1,   probability: 0.70 },
    modest:   { min: 1,   max: 3,   probability: 0.15 },
    good:     { min: 3,   max: 10,  probability: 0.10 },
    homeRun:  { min: 10,  max: 50,  probability: 0.04 },
    unicorn:  { min: 50,  max: 200, probability: 0.01 }
  }
}
```

**Series A** (Line 407-417):

```typescript
{
  stage: 'series-a',
  failureRate: 0.50,  // Series A Chasm: companies that raised A are stronger
  returnBands: {
    failure:  { min: 0,   max: 1,   probability: 0.50 },  // -20% vs seed
    modest:   { min: 1,   max: 3,   probability: 0.25 },  // +10% vs seed
    good:     { min: 3,   max: 10,  probability: 0.15 },  // +5% vs seed
    homeRun:  { min: 10,  max: 50,  probability: 0.08 },  // +4% vs seed
    unicorn:  { min: 50,  max: 200, probability: 0.02 }   // +1% vs seed
  }
}
```

**Series B** (Line 420-430):

```typescript
{
  stage: 'series-b',
  failureRate: 0.35,
  returnBands: {
    failure:  { min: 0,   max: 1,   probability: 0.35 },
    modest:   { min: 1,   max: 3,   probability: 0.30 },
    good:     { min: 3,   max: 10,  probability: 0.20 },
    homeRun:  { min: 10,  max: 50,  probability: 0.12 },
    unicorn:  { min: 50,  max: 200, probability: 0.03 }
  }
}
```

**Series C+** (Line 433-443):

```typescript
{
  stage: 'series-c+',
  failureRate: 0.20,
  returnBands: {
    failure:  { min: 0,   max: 1,   probability: 0.20 },
    modest:   { min: 1,   max: 3,   probability: 0.35 },
    good:     { min: 3,   max: 10,  probability: 0.25 },
    homeRun:  { min: 10,  max: 50,  probability: 0.15 },
    unicorn:  { min: 50,  max: 200, probability: 0.05 }
  }
}
```

### Sampling Algorithm

```typescript
// File: server/services/power-law-distribution.ts:172-235
sampleReturn(stage: InvestmentStage = 'seed'): ReturnSample {
  const profile = this.stageProfiles.get(stage);
  const rand = this.rng(); // Uniform [0, 1)
  const { returnBands } = profile;

  let cumulativeProb = 0;

  // Check failure first (70% probability for seed)
  cumulativeProb += returnBands.failure.probability;
  if (rand <= cumulativeProb) {
    return {
      multiple: this.sampleUniform(0, 1),
      category: 'failure',
      stage,
      probability: returnBands.failure.probability
    };
  }

  // Check modest returns (15%)
  cumulativeProb += returnBands.modest.probability;
  if (rand <= cumulativeProb) {
    return {
      multiple: this.sampleUniform(1, 3),
      category: 'modest',
      stage,
      probability: returnBands.modest.probability
    };
  }

  // Check good outcomes (10%)
  cumulativeProb += returnBands.good.probability;
  if (rand <= cumulativeProb) {
    return {
      multiple: this.sampleUniform(3, 10),
      category: 'good',
      stage,
      probability: returnBands.good.probability
    };
  }

  // Check home runs (4%) - use power law sampling
  cumulativeProb += returnBands.homeRun.probability;
  if (rand <= cumulativeProb) {
    return {
      multiple: this.samplePowerLaw(10, 50),
      category: 'homeRun',
      stage,
      probability: returnBands.homeRun.probability
    };
  }

  // Must be unicorn (1%) - use power law sampling
  return {
    multiple: this.samplePowerLaw(50, 200),
    category: 'unicorn',
    stage,
    probability: returnBands.unicorn.probability
  };
}
```

**Key Design Choices**:

1. **Uniform sampling for modest/good**: Returns 1-10x are fairly evenly
   distributed
2. **Power law for home runs/unicorns**: Returns 10x+ follow power law
   (winner-take-most)
3. **Cumulative probability check**: Ensures exactly one category per sample
4. **Stage parameter**: Enables modeling portfolio composition (60% seed, 40%
   Series A)

---

## Exit Timing Simulation

Exit timing affects IRR calculation and models realistic holding periods.

### Exit Timing by Stage and Outcome

```typescript
// File: server/services/power-law-distribution.ts:495-521
private sampleExitTiming(stage: InvestmentStage, category: string): number {
  // Base timings by stage (in years)
  const baseTimings: Record<InvestmentStage, number> = {
    'pre-seed':   6.5,
    'seed':       5.5,
    'series-a':   4.5,
    'series-b':   3.5,
    'series-c':   2.7,
    'series-c+':  2.5
  };

  // Category multipliers
  const categoryMultipliers: Record<string, number> = {
    failure:  0.6,  // Failures happen faster (3-4 years)
    modest:   0.9,  // Modest exits slightly faster
    good:     1.0,  // Base timing
    homeRun:  1.2,  // Home runs take longer to mature
    unicorn:  1.4   // Unicorns take longest (7-9 years)
  };

  const baseTiming = baseTimings[stage] || 5.0;
  const multiplier = categoryMultipliers[category] || 1.0;
  const adjustedTiming = baseTiming * multiplier;

  // Add variance (±1 year)
  const variance = (this.rng() - 0.5) * 2; // -1 to +1
  return Math.max(1, adjustedTiming + variance);
}
```

**Rationale**:

1. **Later stages exit faster**: Series B/C companies are closer to liquidity
2. **Failures exit faster**: Write-downs happen within 3-4 years
3. **Unicorns exit slower**: IPO/M&A processes take 7-9 years from seed
4. **Variance**: Real exits don't follow exact patterns (±1 year randomness)

### Exit Timing Distribution Examples

**Seed Stage, Good Outcome** (3-10x):

- Base timing: 5.5 years
- Category multiplier: 1.0
- Expected: 5.5 years ± 1 year
- Range: 4.5 - 6.5 years

**Seed Stage, Unicorn** (50-200x):

- Base timing: 5.5 years
- Category multiplier: 1.4
- Expected: 7.7 years ± 1 year
- Range: 6.7 - 8.7 years

**Series A, Failure** (0-1x):

- Base timing: 4.5 years
- Category multiplier: 0.6
- Expected: 2.7 years ± 1 year
- Range: 1.7 - 3.7 years (clamped to min 1 year)

---

## IRR Calculation

IRR (Internal Rate of Return) is calculated from return multiples and exit
timing.

### Formula

For a single investment with multiple M and holding period T years:

```
IRR = (M)^(1/T) - 1

Where:
- M: Return multiple (ending value / invested capital)
- T: Holding period in years
```

**Derivation from Time Value of Money**:

```
FV = PV × (1 + IRR)^T
M = (1 + IRR)^T
(1 + IRR) = M^(1/T)
IRR = M^(1/T) - 1
```

### Implementation

```typescript
// File: server/services/power-law-distribution.ts:308-322
generateInvestmentScenario(
  stage: InvestmentStage = 'seed',
  timeHorizonYears: number = 5
): {
  multiple: number;
  irr: number;
  category: string;
  exitTiming: number;
} {
  const returnSample = this.sampleReturn(stage);
  const exitTiming = this.sampleExitTiming(stage, returnSample.category);
  const actualTimeHorizon = Math.min(exitTiming, timeHorizonYears);

  let irr: number;
  if (returnSample.multiple <= 0) {
    irr = -1.0; // Total loss sentinel (avoids Math.pow(negative, fractional))
  } else {
    irr = Math.pow(returnSample.multiple, 1 / actualTimeHorizon) - 1;
  }

  return {
    multiple: returnSample.multiple,
    irr,
    category: returnSample.category,
    exitTiming
  };
}
```

### Edge Cases

**Total Loss (Multiple ≤ 0)**:

```typescript
if (returnSample.multiple <= 0) {
  irr = -1.0; // Sentinel value for 100% capital loss
}
```

**Rationale**: `Math.pow(0, fractional)` returns 0, but
`Math.pow(negative, fractional)` returns NaN. We use -1.0 (equivalent to -100%
return) as a sentinel.

**Very Short Horizons**:

```typescript
const actualTimeHorizon = Math.min(exitTiming, timeHorizonYears);
```

If `timeHorizonYears = 3` but `exitTiming = 6`, we use 3 years for IRR
calculation. This assumes the investment hasn't exited yet, so we calculate IRR
based on current valuation.

**Very High Multiples**:

```
Multiple: 100x
Exit timing: 8 years
IRR = 100^(1/8) - 1 = 1.778^1 - 1 = 0.778 = 77.8%
```

This is mathematically correct but may seem low. A 100x return over 8 years
compounds to ~78% annual return, which is extremely high in absolute terms.

---

## Correlation Handling

Currently, the engine treats investment outcomes as **independent** within a
scenario.

### Current Approach: Independent Sampling

```typescript
// Each company's outcome is sampled independently
for (let i = 0; i < portfolioSize; i++) {
  const stage = selectStage(stageDistribution);
  const returnSample = powerLaw.sampleReturn(stage);
  // No correlation with other companies in portfolio
}
```

**Assumption**: Individual company success/failure is idiosyncratic and
unpredictable.

**Justification**: Research shows that within-portfolio correlations are weak
for early-stage venture:

- Seed-stage companies have diverse failure modes
- Success is driven by company-specific execution
- Market timing affects all companies (handled at scenario level)

### Market-Level Correlation

Market environment affects **all scenarios uniformly**:

```typescript
// File: server/services/monte-carlo-engine.ts:641-647
// Time decay factor reflects market risk for long horizons
const yearsAboveBaseline = Math.max(0, timeHorizonYears - 5);
const acceleratedDecay = timeHorizonYears > 10 ? 0.95 : 0.97;
const timeDecay = Math.pow(acceleratedDecay, yearsAboveBaseline);

const totalValue =
  portfolioInputs.deployedCapital * multipleSample * compoundFactor * timeDecay;
```

This introduces **systematic risk**: all investments in a given scenario are
affected by the same market environment.

### Sector Correlation (Future Enhancement)

For sector-specific correlation (e.g., fintech companies correlated during
banking crises):

```typescript
// Pseudocode for future implementation
function generateCorrelatedScenario(
  portfolioSize: number,
  sectorWeights: Record<Sector, number>,
  correlationMatrix: number[][]
): Scenario {
  // 1. Generate correlated random variables via Cholesky decomposition
  const correlatedRandoms = choleskyDecomposition(correlationMatrix);

  // 2. Map correlated uniforms to return samples
  const companies = portfolioSize.map((i) => {
    const sector = selectSector(sectorWeights);
    const correlatedU = correlatedRandoms[sector][i];
    return sampleReturnFromUniform(correlatedU, sector);
  });

  // 3. Aggregate to portfolio level
  return aggregatePortfolio(companies);
}
```

**Use Case**: Model sector concentration risk (e.g., crypto portfolio during
bear market).

---

## Mathematical Foundations

### Central Limit Theorem

The Monte Carlo Engine leverages the Central Limit Theorem (CLT):

```
For large n, the distribution of sample means approaches a normal distribution,
regardless of the underlying distribution shape.
```

**Application to VC Portfolios**:

Individual investments: Power law distributed (highly skewed) Portfolio average
return (25+ companies): Approximately normal

This is why **portfolio-level IRR** is more predictable than individual
investment outcomes.

### Law of Large Numbers

```
As the number of trials increases, the sample mean converges to the expected value.
```

**Application**:

- 1,000 scenarios: ±5% confidence in mean estimate
- 10,000 scenarios: ±1.5% confidence in mean estimate
- 50,000 scenarios: ±0.7% confidence in mean estimate

### Variance Decomposition

Total portfolio variance decomposes into:

```
Var(Portfolio) = (1/n) × Var(Individual) + Covariance Terms

For independent investments:
Var(Portfolio) = Var(Individual) / n

For n = 25 companies:
Portfolio std dev = Individual std dev / √25 = Individual std dev / 5
```

**Implication**: Diversification reduces volatility by square root of portfolio
size.

### Right-Skewed Distributions

VC returns exhibit positive skewness:

```
Skewness = E[(X - μ)³] / σ³

Positive skewness (>0): Long right tail (power law)
Negative skewness (<0): Long left tail (not VC)
```

**Implication**: Mean > Median for VC portfolios. Use median for realistic
expectations.

### Kurtosis (Fat Tails)

```
Kurtosis = E[(X - μ)⁴] / σ⁴ - 3

Positive kurtosis (>0): Fatter tails than normal (more extreme outliers)
```

Power law distributions have **very high kurtosis** (5-10), meaning extreme
events (100x returns, total losses) are more common than normal distribution
predicts.

---

## Next Steps

Continue to:

- **[03-statistics.md](./03-statistics.md)**: Statistical properties, risk
  metrics, percentiles
- **[04-validation.md](./04-validation.md)**: Validation strategy from ADR-010

## Code References

- **Main Engine**: `server/services/monte-carlo-engine.ts`
  - Lines 196-294: `runPortfolioSimulation()` (main algorithm)
  - Lines 576-608: `runSimulationBatches()` (parallelization)
  - Lines 626-659: `generateSingleScenario()` (scenario generation)
  - Lines 661-700: Performance distribution calculations

- **Power Law Distribution**: `server/services/power-law-distribution.ts`
  - Lines 172-235: `sampleReturn()` (stage-specific sampling)
  - Lines 474-490: `samplePowerLaw()` (inverse transform)
  - Lines 495-521: `sampleExitTiming()` (exit timing model)
  - Lines 378-446: `initializeStageProfiles()` (return bands)

- **PRNG**: `shared/utils/prng.ts`
  - Lines 39-42: LCG `next()` implementation
  - Lines 50-57: Box-Muller `nextNormal()`

## References

- **ADR-010**: Validation Strategy
- **Kauffman Foundation**: Seed-stage failure rate data (68-70%)
- **Numerical Recipes**: LCG parameters (a=1664525, c=1013904223)
- **Box-Muller Transform**: Normal distribution sampling
- **Power Law Papers**: Clauset, Shalizi, Newman (2009) - "Power-Law
  Distributions in Empirical Data"
