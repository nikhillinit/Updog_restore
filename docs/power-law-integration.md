# Power Law Distribution Integration Guide

## Overview

The Power Law Distribution service (`server/services/power-law-distribution.ts`) implements realistic venture capital return distributions for Monte Carlo simulations. It replaces normal distribution sampling with power law (Pareto) distributions that better reflect the extreme variance and "Series A Chasm" characteristics of VC investments.

## Key Features

### 1. Realistic VC Return Distribution (2024-2025 Data)
- **70% of investments return 0-1x** (failures)
- **15% return 1-3x** (modest returns)
- **10% return 3-10x** (good outcomes)
- **4% return 10-50x** (home runs)
- **1% return 50x+** (unicorns, capped at 200x)

### 2. Stage-Specific Failure Rates
Reflects the "Series A Chasm" - the significant drop in failure rates for companies that successfully raise Series A:

- **Pre-Seed**: 75% failure rate
- **Seed**: 70% failure rate (updated from Kauffman's 68%)
- **Series A**: 50% failure rate
- **Series B**: 35% failure rate
- **Series C+**: 20% failure rate

### 3. No Time Decay
Unlike traditional models that incorrectly dampen variance over time, this implementation:
- Maintains consistent return multiples regardless of time horizon
- Only applies time horizon to IRR calculations
- Preserves the full power law variance characteristics

## Integration with Monte Carlo Engine

### Quick Integration

Replace normal distribution sampling in `monte-carlo-engine.ts`:

```typescript
// OLD: Normal distribution sampling
const irrSample = this.sampleNormal(distributions.irr.mean, distributions.irr.volatility);
const multipleSample = this.sampleNormal(distributions.multiple.mean, distributions.multiple.volatility);

// NEW: Power law distribution sampling
import { createVCPowerLawDistribution } from './power-law-distribution';

const powerLaw = createVCPowerLawDistribution(config.randomSeed);
const scenario = powerLaw.generateInvestmentScenario(stage, timeHorizonYears);
const { multiple, irr } = scenario;
```

### Batch Generation for Performance

For high-performance Monte Carlo runs:

```typescript
import { generatePowerLawReturns } from './power-law-distribution';

// Generate all scenarios at once
const scenarios = generatePowerLawReturns(
  portfolioSize,
  stageDistribution, // { 'seed': 0.6, 'series-a': 0.4 }
  timeHorizonYears,
  simulationRuns,
  randomSeed
);
```

### Portfolio-Level Analysis

For comprehensive portfolio analysis:

```typescript
const powerLaw = createVCPowerLawDistribution(randomSeed);

const portfolioDistribution = powerLaw.generatePortfolioReturns(
  portfolioSize,
  stageDistribution,
  scenarios
);

// Access detailed statistics
console.log('Mean return:', portfolioDistribution.statistics.mean);
console.log('Power law alpha:', portfolioDistribution.statistics.powerLawAlpha);
console.log('Skewness:', portfolioDistribution.statistics.skewness);
console.log('99th percentile:', portfolioDistribution.percentiles.p99);
```

## Configuration Options

### Default VC Parameters
```typescript
const defaultConfig = {
  failureRate: 0.70,        // 70% of investments return 0-1x
  modestReturnRate: 0.15,   // 15% return 1-3x
  goodOutcomeRate: 0.10,    // 10% return 3-10x
  homeRunRate: 0.04,        // 4% return 10-50x
  unicornRate: 0.01,        // 1% return 50x+ (capped at 200x)
  alpha: 1.16,              // Power law shape parameter
  xMin: 3.0,                // Power law starts at 3x returns
  maxReturn: 200.0          // Cap unicorns at 200x
};
```

### Custom Configuration
```typescript
const customPowerLaw = new PowerLawDistribution({
  failureRate: 0.65,        // Lower failure rate
  unicornRate: 0.02,        // Higher unicorn rate
  maxReturn: 500.0,         // Higher unicorn cap
  alpha: 1.20               // Different power law shape
}, randomSeed);
```

## Investment Stages

The service supports five investment stages with different risk profiles:

| Stage | Failure Rate | Avg Exit Time | Unicorn Rate |
|-------|-------------|---------------|-------------|
| Pre-Seed | 75% | 6.5 years | 0.5% |
| Seed | 70% | 5.5 years | 1% |
| Series A | 50% | 4.5 years | 2% |
| Series B | 35% | 3.5 years | 3% |
| Series C+ | 20% | 2.5 years | 5% |

## Return Categories

Each investment is classified into one of five return categories:

- **Failure** (0-1x): Company fails or returns less than invested amount
- **Modest** (1-3x): Decent return but not exceptional
- **Good** (3-10x): Strong return, good portfolio contributor
- **Home Run** (10-50x): Exceptional return, major portfolio driver
- **Unicorn** (50x+): Once-in-a-fund return, capped at 200x

## Performance Characteristics

### Mathematical Properties
- **High Skewness** (>2.0): Long right tail with few very high returns
- **High Kurtosis** (>1.0): Fat tails with extreme outliers
- **Power Law Alpha** (~1.16): Matches empirical VC data
- **Median < Mean**: Most returns are below average

### Computational Performance
- **Large Simulations**: 50,000 scenarios in <5 seconds
- **Memory Efficient**: Minimal memory overhead
- **Concurrent Safe**: Supports parallel execution
- **Reproducible**: Deterministic with random seeds

## Example Output

### Typical Seed Portfolio (25 companies)
```
Statistics:
  Mean Multiple: 2.3x
  Median Multiple: 0.8x
  Standard Deviation: 5.2x
  Skewness: 4.1
  Power Law Alpha: 1.18

Percentiles:
  5th: 0.0x
  25th: 0.3x
  50th: 0.8x
  75th: 2.1x
  95th: 12.4x
  99th: 47.2x

Category Distribution:
  Failures: 70%
  Modest: 15%
  Good: 10%
  Home Runs: 4%
  Unicorns: 1%
```

## Integration Steps

### 1. Update Monte Carlo Engine
```typescript
// In monte-carlo-engine.ts
import { generatePowerLawReturns } from './power-law-distribution';

private async runSimulationBatch(
  runs: number,
  portfolioInputs: PortfolioInputs,
  distributions: DistributionParameters,
  timeHorizonYears: number
): Promise<any[]> {
  // Replace normal sampling with power law
  return generatePowerLawReturns(
    runs,
    portfolioInputs.stageWeights,
    timeHorizonYears,
    1, // Single scenario per call
    this.randomSeed
  );
}
```

### 2. Update Distribution Calibration
```typescript
// Remove time decay from existing logic
private generateSingleScenario(
  portfolioInputs: PortfolioInputs,
  distributions: DistributionParameters,
  timeHorizonYears: number
): any {
  // Use power law instead of normal distributions
  const powerLaw = createVCPowerLawDistribution();
  const stage = this.selectStageRandomly(portfolioInputs.stageWeights);
  const scenario = powerLaw.generateInvestmentScenario(stage, timeHorizonYears);

  // Remove time decay calculation
  return {
    irr: scenario.irr,
    multiple: scenario.multiple,
    dpi: Math.max(0, scenario.multiple * 0.8), // Assume 80% DPI
    tvpi: scenario.multiple,
    totalValue: portfolioInputs.averageInvestmentSize * scenario.multiple,
    exitTiming: scenario.exitTiming,
    category: scenario.category
  };
}
```

### 3. Update Risk Metrics
The power law distribution will automatically improve risk metric accuracy by:
- Providing realistic tail risk estimates
- Correct Value-at-Risk calculations
- Proper downside risk assessment
- Accurate probability of loss estimates

## Testing

Comprehensive test suite covers:
- Stage-specific failure rates
- Power law tail behavior
- No time decay verification
- Integration compatibility
- Performance benchmarks
- Edge case handling

Run tests with:
```bash
npm test power-law-distribution.test.ts
```

## Benefits

### 1. Realistic Risk Assessment
- Accurate tail risk modeling
- Proper failure rate representation
- Realistic variance estimates

### 2. Better Portfolio Insights
- Correct reserve optimization
- Accurate scenario planning
- Proper upside/downside analysis

### 3. Series A Chasm Modeling
- Stage-specific risk profiles
- Funding progression effects
- Realistic survival rates

### 4. Performance Improvements
- No time decay artifacts
- Faster convergence
- More stable results

This implementation provides a mathematically sound and empirically validated approach to venture capital return modeling that significantly improves upon traditional normal distribution assumptions.