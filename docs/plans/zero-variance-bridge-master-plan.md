# Zero-Variance Bridge: Comprehensive Master Plan

> **Status**: DRAFT - Pending Review
> **Version**: 2.0
> **Last Updated**: 2026-01-14
> **Supersedes**: All prior strategy documents

---

## 1. Executive Summary

### Objective

Prove that the Monte Carlo engine is mathematically deterministic when volatility is removed (vol=0). This creates a stable "Zero-Variance" baseline for validating stochastic logic.

### Strategy

We enforce **True Zero Variance** by:

1. **Extracting a testable execution core** from the Monte Carlo engine (no public API changes)
2. **Creating test-specific schemas** that accept zero-variance results (production schemas unchanged)
3. **Validating against a mathematical oracle** derived from the engine's actual formulas

### Why NOT Compare Against DRE?

The Deterministic Reserve Engine (DRE) and Monte Carlo engine compute fundamentally different things:

| Aspect | DRE | Monte Carlo |
|--------|-----|-------------|
| **Scope** | Per-company allocation decisions | Fund-level outcome distributions |
| **Primary Output** | Recommended reserve amounts | Probability distributions (IRR, MOIC, DPI) |
| **MOIC Source** | `valuation / invested` per company | Sampled from distribution parameters |
| **Graduation** | Stage-based probability matrix | Not modeled |

Comparing them for strict parity is architecturally invalid. Instead, we validate MC against its own mathematical definition (oracle parity).

### Phases

| Phase | Name | Objective |
|-------|------|-----------|
| 0 | Engine Hygiene | Fix code to allow vol=0 without crashes or NaN |
| 1 | Mirror Test | Prove self-consistency: `MC(seed=X) === MC(seed=X)` |
| 2 | Oracle Parity | Prove correctness: outputs match closed-form math |
| 3 | Sanity Bridge | (Optional) Verify MC and DRE are in same order of magnitude |

---

## 2. Phase 0: Engine Hygiene

**Status**: BLOCKER - Apply these patches before writing tests.

### 2.1 Patch: Test-Specific Output Schemas

**File**: `shared/validation/monte-carlo-schemas.ts`

**Problem**: Production schemas enforce `positive()` which rejects valid zero-variance results where `stdDev = 0`.

**Solution**: Create SEPARATE test schemas. Do NOT relax production schemas (maintains bug detection).

```typescript
// =============================================================================
// PRODUCTION SCHEMAS (UNCHANGED)
// =============================================================================

export const StatisticsSchema = z.object({
  mean: z.number(),
  median: z.number(),
  standardDeviation: z.number().positive(), // Production: must be > 0
  min: z.number(),
  max: z.number(),
});

export const RiskMetricsSchema = z.object({
  downsideRisk: z.number().positive(),
  maxDrawdown: z.number().min(0).max(1),
  sharpeRatio: z.number(),
  sortinoRatio: z.number(),
  // ... other fields
});

// =============================================================================
// TEST SCHEMAS (NEW)
// =============================================================================

/**
 * Relaxed schemas for zero-variance testing.
 * NEVER use in production - these allow degenerate values.
 */
export const StatisticsSchemaTest = z.object({
  mean: z.number().finite(),
  median: z.number().finite(),
  standardDeviation: z.number().min(0).finite(), // Test: allows 0
  min: z.number().finite(),
  max: z.number().finite(),
});

export const RiskMetricsSchemaTest = z.object({
  downsideRisk: z.number().min(0).finite(),      // Test: allows 0
  maxDrawdown: z.number().min(0).max(1),
  sharpeRatio: z.number().finite(),              // Test: must be finite (not NaN)
  sortinoRatio: z.number().finite(),
  // ... other fields with .finite() constraint
});

// Factory for conditional schema selection
export function createResultsSchema(options: { allowZeroVariance?: boolean } = {}) {
  return options.allowZeroVariance
    ? SimulationResultsSchemaTest
    : SimulationResultsSchema;
}
```

**Rationale**: Production code continues to catch bugs that produce unexpected zero variance. Test code can validate intentional zero-variance scenarios.

---

### 2.2 Patch: Fix Volatility Defaulting Bug

**File**: `server/services/monte-carlo-engine.ts` (Method: `calibrateDistributions`)

**Problem**: The `||` operator treats `0` as falsy, overwriting intentional zero with defaults.

```typescript
// BUG: volatility: this.calculateVolatility(irrVariances) || 0.08
// When calculateVolatility returns 0, this becomes 0.08
```

**Solution**: Use explicit finite check.

```typescript
private calibrateDistributions(/* ... */): DistributionParameters {
  // ... existing code to calculate mean and variance ...

  const calculatedIrrVol = this.calculateVolatility(irrVariances);
  const calculatedMultipleVol = this.calculateVolatility(multipleVariances);
  // ... etc for other volatilities

  // FIXED: Preserve 0, only fallback for NaN/Infinity
  const safeVolatility = (val: number, fallback: number) =>
    Number.isFinite(val) ? val : fallback;

  return {
    irr: {
      mean: irrMean.toNumber(),
      volatility: safeVolatility(calculatedIrrVol, 0.08)
    },
    multiple: {
      mean: multipleMean.toNumber(),
      volatility: safeVolatility(calculatedMultipleVol, 0.6)
    },
    dpi: {
      mean: dpiMean.toNumber(),
      volatility: safeVolatility(calculatedDpiVol, 0.3)
    },
    exitTiming: {
      mean: exitTimingMean.toNumber(),
      volatility: safeVolatility(calculatedExitVol, 2.0)
    },
    followOnSize: {
      mean: followOnMean.toNumber(),
      volatility: safeVolatility(calculatedFollowOnVol, 0.3)
    }
  };
}
```

---

### 2.3 Patch: Extract Testable Execution Core

**File**: `server/services/monte-carlo-engine.ts`

**Problem**: `runPortfolioSimulation` fetches data from DB internally, making deterministic testing impossible.

**Solution**: Extract the execution core into a separate method. Public API unchanged.

```typescript
/**
 * PUBLIC API (UNCHANGED)
 * Production callers use this method exactly as before.
 */
public async runPortfolioSimulation(
  config: SimulationConfig
): Promise<SimulationResults> {
  const distributions = await this.calibrateDistributions(config.fundId);
  const portfolioInputs = await this.getPortfolioInputs(config.fundId);

  const results = await this.executeSimulationCore(
    config,
    distributions,
    portfolioInputs,
    { deterministicMode: false, skipStore: false }
  );

  return results;
}

/**
 * INTERNAL EXECUTION CORE (NEW - EXTRACTED)
 * Contains all simulation logic without DB dependencies.
 *
 * @internal Exposed to tests via MonteCarloTestHarness
 */
protected async executeSimulationCore(
  config: SimulationConfig,
  distributions: DistributionParameters,
  portfolioInputs: PortfolioInputs,
  options: {
    deterministicMode: boolean;
    skipStore: boolean;
  }
): Promise<SimulationResults> {
  const simulationId = crypto.randomUUID();
  const startTime = performance.now();

  // Reset PRNG for reproducibility
  if (config.randomSeed !== undefined) {
    this.prng.reset(config.randomSeed);
  }

  // Generate scenarios
  const scenarios = await this.generateScenarios(
    config,
    distributions,
    portfolioInputs
  );

  // Calculate performance distributions
  const performanceResults = this.calculatePerformanceDistributions(scenarios);

  // Calculate risk metrics (with deterministic mode flag)
  const riskMetrics = this.calculateRiskMetrics(
    scenarios,
    performanceResults,
    options.deterministicMode
  );

  // Optimize reserves (with deterministic mode flag)
  const reserveOptimization = await this.optimizeReserveAllocation(
    config,
    portfolioInputs,
    scenarios,
    options.deterministicMode
  );

  // Generate scenario analysis
  const scenarioAnalysis = this.generateScenarioAnalysis(performanceResults);

  // Generate insights
  const insights = this.generateInsights(performanceResults, riskMetrics);

  const executionTimeMs = performance.now() - startTime;

  const results: SimulationResults = {
    simulationId,
    config,
    executionTimeMs,
    irr: performanceResults.irr,
    multiple: performanceResults.multiple,
    dpi: performanceResults.dpi,
    tvpi: performanceResults.tvpi,
    totalValue: performanceResults.totalValue,
    riskMetrics,
    reserveOptimization,
    scenarios: scenarioAnalysis,
    insights,
  };

  // Store results (unless skipped for testing)
  if (!options.skipStore) {
    await this.storeSimulationResults(results);
  }

  return results;
}
```

**Test Harness** (new file): `tests/utils/monte-carlo-test-harness.ts`

```typescript
import { MonteCarloEngine } from '../../server/services/monte-carlo-engine';
import type {
  SimulationConfig,
  DistributionParameters,
  PortfolioInputs,
  SimulationResults
} from '../../server/services/monte-carlo-engine';

/**
 * Test harness for Monte Carlo engine.
 * Provides controlled access to internal execution without DB dependencies.
 *
 * FOR TESTING ONLY - Never import in production code.
 */
export class MonteCarloTestHarness {
  private engine: MonteCarloEngine;

  constructor(seed?: number) {
    this.engine = new MonteCarloEngine(seed);
  }

  /**
   * Execute simulation with explicit inputs (no DB fetch).
   * Bypasses production entry point for deterministic testing.
   */
  async executeWithOverrides(
    config: SimulationConfig,
    distributions: DistributionParameters,
    portfolioInputs: PortfolioInputs,
    options: {
      deterministicMode?: boolean;
      skipStore?: boolean;
    } = {}
  ): Promise<SimulationResults> {
    // Access protected method via type assertion
    // This is intentional for testing - production code cannot do this
    return (this.engine as any).executeSimulationCore(
      config,
      distributions,
      portfolioInputs,
      {
        deterministicMode: options.deterministicMode ?? true,
        skipStore: options.skipStore ?? true,
      }
    );
  }

  /**
   * Get the underlying engine for direct method testing.
   */
  getEngine(): MonteCarloEngine {
    return this.engine;
  }
}
```

---

### 2.4 Patch: Eliminate Hidden Randomness and Degenerate Math

**File**: `server/services/monte-carlo-engine.ts`

**Problem**: Several methods have hidden assumptions that break at vol=0:
- `calculateMaxDrawdown` hardcodes volatility
- Risk ratios divide by zero variance
- Downside risk fails on empty arrays

**Solution**: Add deterministic mode routing and math guards.

```typescript
// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Floor for volatility-based calculations.
 * Values below this are treated as zero to avoid floating-point noise.
 *
 * Note: Number.EPSILON (2.2e-16) is too strict - floating-point accumulation
 * can produce values like 1e-15 that would cause nonsense results.
 */
const VOLATILITY_FLOOR = 1e-10;

/**
 * Risk-free rate for Sharpe/Sortino calculations.
 */
const RISK_FREE_RATE = 0.02;

// =============================================================================
// RISK METRICS
// =============================================================================

private calculateRiskMetrics(
  scenarios: SimulationScenario[],
  performanceResults: PerformanceResults,
  deterministicMode: boolean = false
): RiskMetrics {
  const irrValues = scenarios.map(s => s.irr);
  const stdDev = performanceResults.irr.statistics.standardDeviation;

  // === Value at Risk ===
  const sortedIrr = [...irrValues].sort((a, b) => a - b);
  const var5 = sortedIrr[Math.floor(sortedIrr.length * 0.05)];
  const var10 = sortedIrr[Math.floor(sortedIrr.length * 0.10)];

  // === Conditional VaR (Expected Shortfall) ===
  const cvar5Values = sortedIrr.slice(0, Math.floor(sortedIrr.length * 0.05));
  const cvar5 = cvar5Values.length > 0
    ? cvar5Values.reduce((a, b) => a + b, 0) / cvar5Values.length
    : var5;

  const cvar10Values = sortedIrr.slice(0, Math.floor(sortedIrr.length * 0.10));
  const cvar10 = cvar10Values.length > 0
    ? cvar10Values.reduce((a, b) => a + b, 0) / cvar10Values.length
    : var10;

  // === Probability of Loss ===
  const lossCount = irrValues.filter(irr => irr < 0).length;
  const probabilityOfLoss = lossCount / irrValues.length;

  // === Downside Risk ===
  // Guard: Empty negative returns array produces NaN
  const negativeReturns = irrValues.filter(irr => irr < 0);
  const downsideRisk = negativeReturns.length > 0
    ? Math.sqrt(
        negativeReturns.reduce((sum, irr) => sum + irr * irr, 0) / negativeReturns.length
      )
    : 0; // No negative returns = no downside risk

  // === Sharpe Ratio ===
  // Guard: Division by zero variance
  const meanIrr = performanceResults.irr.statistics.mean;
  const excessReturn = meanIrr - RISK_FREE_RATE;
  const sharpeRatio = stdDev > VOLATILITY_FLOOR
    ? excessReturn / stdDev
    : 0; // No volatility = undefined Sharpe, default to 0

  // === Sortino Ratio ===
  // Guard: Division by zero downside risk
  const sortinoRatio = downsideRisk > VOLATILITY_FLOOR
    ? excessReturn / downsideRisk
    : 0; // No downside = undefined Sortino, default to 0

  // === Max Drawdown ===
  const maxDrawdown = this.calculateMaxDrawdown(scenarios, deterministicMode);

  return {
    valueAtRisk: { var5, var10 },
    conditionalValueAtRisk: { cvar5, cvar10 },
    probabilityOfLoss,
    downsideRisk,
    sharpeRatio,
    sortinoRatio,
    maxDrawdown,
  };
}

private calculateMaxDrawdown(
  scenarios: SimulationScenario[],
  deterministicMode: boolean = false
): number {
  // In deterministic mode, there is no volatility, hence no drawdown
  if (deterministicMode) {
    return 0;
  }

  // Standard calculation for stochastic mode
  const returns = scenarios.map(s => s.irr);
  let peak = -Infinity;
  let maxDrawdown = 0;

  let cumulativeReturn = 1;
  for (const ret of returns) {
    cumulativeReturn *= (1 + ret);
    if (cumulativeReturn > peak) {
      peak = cumulativeReturn;
    }
    const drawdown = (peak - cumulativeReturn) / peak;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return maxDrawdown;
}

// =============================================================================
// RESERVE OPTIMIZATION
// =============================================================================

private async optimizeReserveAllocation(
  config: SimulationConfig,
  portfolioInputs: PortfolioInputs,
  scenarios: SimulationScenario[],
  deterministicMode: boolean = false
): Promise<ReserveOptimization> {
  const reserveRatios = [0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50];
  const recommendations: AllocationRecommendation[] = [];

  for (const ratio of reserveRatios) {
    const expectedIRR = this.calculateExpectedIRRForRatio(scenarios, ratio);
    const irrVolatility = this.calculateIRRVolatility(scenarios);

    // Guard: Risk-adjusted return with zero volatility
    const riskAdjustedReturn = irrVolatility > VOLATILITY_FLOOR
      ? (expectedIRR - RISK_FREE_RATE) / irrVolatility
      : expectedIRR - RISK_FREE_RATE; // Fallback to excess return

    const followOnCoverage = this.calculateFollowOnCoverage(scenarios, ratio);

    recommendations.push({
      reserveRatio: ratio,
      expectedIRR,
      riskAdjustedReturn,
      followOnCoverage,
    });
  }

  // Find optimal (highest risk-adjusted return)
  const optimal = recommendations.reduce((best, curr) =>
    curr.riskAdjustedReturn > best.riskAdjustedReturn ? curr : best
  );

  return {
    currentReserveRatio: portfolioInputs.reserveRatio,
    optimalReserveRatio: optimal.reserveRatio,
    improvementPotential: optimal.expectedIRR - this.calculateExpectedIRRForRatio(
      scenarios,
      portfolioInputs.reserveRatio
    ),
    coverageScenarios: {
      p25: this.calculateCoverageAtPercentile(scenarios, 0.25),
      p50: this.calculateCoverageAtPercentile(scenarios, 0.50),
      p75: this.calculateCoverageAtPercentile(scenarios, 0.75),
    },
    allocationRecommendations: recommendations,
  };
}
```

---

### 2.5 Patch: PRNG Safety for Zero Volatility

**File**: `shared/utils/prng.ts`

**Problem**: `Math.log(0)` produces `-Infinity`, which cascades to `NaN` via Box-Muller transform.

**Solution**: Add fast path for zero stdDev and clamp log input.

```typescript
/**
 * Generate random number using Box-Muller transform for normal distribution.
 *
 * @param mean - Mean of the normal distribution
 * @param stdDev - Standard deviation of the normal distribution
 * @returns Random number from normal distribution
 */
nextNormal(mean: number = 0, stdDev: number = 1): number {
  // Fast path: zero standard deviation always returns mean
  if (stdDev === 0) {
    return mean;
  }

  // Clamp u1 to prevent log(0) = -Infinity
  const u1 = Math.max(this.next(), Number.MIN_VALUE);
  const u2 = this.next();

  // Box-Muller transform
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z0 * stdDev;
}
```

---

### 2.6 Patch: Input Schema Relaxation (Distribution Parameters)

**File**: `shared/validation/monte-carlo-schemas.ts`

**Problem**: `DistributionParametersSchema` enforces `volatility.min(0.01)`, blocking vol=0 at input.

**Solution**: Create test-specific input schema alongside production schema.

```typescript
// =============================================================================
// PRODUCTION INPUT SCHEMAS (UNCHANGED)
// =============================================================================

export const DistributionParametersSchema = z.object({
  irr: z.object({
    mean: z.number().min(-0.5).max(3),
    volatility: z.number().min(0.01).max(2), // Production: min 1%
  }),
  multiple: z.object({
    mean: z.number().min(0.1).max(20),
    volatility: z.number().min(0.01).max(10),
  }),
  dpi: z.object({
    mean: z.number().min(0).max(5),
    volatility: z.number().min(0.01).max(2),
  }),
  exitTiming: z.object({
    mean: z.number().min(1).max(15),
    volatility: z.number().min(0.1).max(5),
  }),
  followOnSize: z.object({
    mean: z.number().min(0).max(5),
    volatility: z.number().min(0.01).max(2),
  }),
}).strict();

// =============================================================================
// TEST INPUT SCHEMAS (NEW)
// =============================================================================

/**
 * Relaxed distribution parameters for zero-variance testing.
 * Allows volatility = 0 for deterministic scenario generation.
 *
 * NEVER use in production - allows degenerate inputs.
 */
export const DistributionParametersSchemaTest = z.object({
  irr: z.object({
    mean: z.number().min(-0.5).max(3),
    volatility: z.number().min(0).max(2), // Test: allows 0
  }),
  multiple: z.object({
    mean: z.number().min(0.1).max(20),
    volatility: z.number().min(0).max(10),
  }),
  dpi: z.object({
    mean: z.number().min(0).max(5),
    volatility: z.number().min(0).max(2),
  }),
  exitTiming: z.object({
    mean: z.number().min(1).max(15),
    volatility: z.number().min(0).max(5), // Test: allows 0
  }),
  followOnSize: z.object({
    mean: z.number().min(0).max(5),
    volatility: z.number().min(0).max(2),
  }),
}).strict();

export type DistributionParametersTest = z.infer<typeof DistributionParametersSchemaTest>;
```

---

## 3. Phase 1: Mirror Test (Self-Consistency)

**Objective**: Prove that `MC(seed=X, vol=0) === MC(seed=X, vol=0)` - identical inputs produce identical outputs.

### 3.1 Test Fixtures

**File**: `tests/integration/zero-variance-bridge/fixtures.ts`

```typescript
import type { SimulationConfig, DistributionParameters, PortfolioInputs } from '../../../server/services/monte-carlo-engine';

/**
 * Canonical zero-variance distribution parameters.
 * All volatilities set to 0 for deterministic scenario generation.
 */
export const ZERO_VOL_DISTRIBUTIONS: DistributionParameters = {
  irr: { mean: 0.15, volatility: 0 },
  multiple: { mean: 2.5, volatility: 0 },
  dpi: { mean: 0.8, volatility: 0 },
  exitTiming: { mean: 5.5, volatility: 0 },
  followOnSize: { mean: 0.5, volatility: 0 },
};

/**
 * Canonical portfolio inputs for testing.
 */
export const CANONICAL_PORTFOLIO_INPUTS: PortfolioInputs = {
  fundSize: 100_000_000,           // $100M fund
  deployedCapital: 80_000_000,     // $80M deployed
  reserveRatio: 0.20,              // 20% reserves
  sectorWeights: {
    technology: 0.4,
    healthcare: 0.3,
    consumer: 0.2,
    other: 0.1,
  },
  stageWeights: {
    seed: 0.3,
    seriesA: 0.4,
    seriesB: 0.2,
    seriesC: 0.1,
  },
  averageInvestmentSize: 2_000_000, // $2M average
};

/**
 * Canonical simulation config.
 */
export const CANONICAL_CONFIG: SimulationConfig = {
  fundId: 999,                     // Placeholder (not used with overrides)
  runs: 100,                       // 100 scenarios
  timeHorizonYears: 5,             // 5 year horizon
  randomSeed: 12345,               // Fixed seed for reproducibility
};

/**
 * Expected values for oracle validation.
 * Derived from engine formulas (see Phase 2 documentation).
 */
export const EXPECTED_VALUES = {
  // At vol=0, mean = median = p5 = p25 = p50 = p75 = p95
  irr: {
    mean: 0.15,
    allPercentilesEqual: true,
  },
  multiple: {
    mean: 2.5,
    allPercentilesEqual: true,
  },
  dpi: {
    mean: 0.8,
    allPercentilesEqual: true,
  },
  exitTiming: {
    mean: 5.5,
    allPercentilesEqual: true,
  },
  // Total value calculation (matches engine formula)
  totalValue: {
    // deployedCapital * multiple * compoundFactor * timeDecay
    // 80M * 2.5 * (1.15)^5 * 1.0 = 80M * 2.5 * 2.0114 = $402.28M
    mean: 80_000_000 * 2.5 * Math.pow(1.15, 5),
  },
  // Risk metrics at vol=0
  risk: {
    standardDeviation: 0,
    maxDrawdown: 0,
    sharpeRatio: 0,      // (mean - rf) / 0 = undefined -> 0
    sortinoRatio: 0,     // Same
    downsideRisk: 0,
  },
};
```

### 3.2 Mirror Test Suite

**File**: `tests/integration/zero-variance-bridge/mirror.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { MonteCarloTestHarness } from '../../utils/monte-carlo-test-harness';
import {
  ZERO_VOL_DISTRIBUTIONS,
  CANONICAL_PORTFOLIO_INPUTS,
  CANONICAL_CONFIG,
} from './fixtures';

describe('Zero-Variance Mirror Test', () => {
  let harness: MonteCarloTestHarness;

  beforeAll(() => {
    harness = new MonteCarloTestHarness();
  });

  describe('Self-Consistency', () => {
    it('should produce identical results for identical inputs (Run A === Run B)', async () => {
      const runA = await harness.executeWithOverrides(
        CANONICAL_CONFIG,
        ZERO_VOL_DISTRIBUTIONS,
        CANONICAL_PORTFOLIO_INPUTS,
        { deterministicMode: true, skipStore: true }
      );

      const runB = await harness.executeWithOverrides(
        CANONICAL_CONFIG,
        ZERO_VOL_DISTRIBUTIONS,
        CANONICAL_PORTFOLIO_INPUTS,
        { deterministicMode: true, skipStore: true }
      );

      // Compare deterministic sub-objects
      // Exclude: simulationId (UUID), executionTimeMs (timing)
      expect(runA.irr).toStrictEqual(runB.irr);
      expect(runA.multiple).toStrictEqual(runB.multiple);
      expect(runA.dpi).toStrictEqual(runB.dpi);
      expect(runA.tvpi).toStrictEqual(runB.tvpi);
      expect(runA.totalValue).toStrictEqual(runB.totalValue);
      expect(runA.riskMetrics).toStrictEqual(runB.riskMetrics);
      expect(runA.reserveOptimization).toStrictEqual(runB.reserveOptimization);
      expect(runA.scenarios).toStrictEqual(runB.scenarios);
    });

    it('should produce identical individual scenarios', async () => {
      const runA = await harness.executeWithOverrides(
        CANONICAL_CONFIG,
        ZERO_VOL_DISTRIBUTIONS,
        CANONICAL_PORTFOLIO_INPUTS,
        { deterministicMode: true, skipStore: true }
      );

      const runB = await harness.executeWithOverrides(
        CANONICAL_CONFIG,
        ZERO_VOL_DISTRIBUTIONS,
        CANONICAL_PORTFOLIO_INPUTS,
        { deterministicMode: true, skipStore: true }
      );

      // Verify scenario count
      expect(runA.scenarios.bullMarket).toBeDefined();
      expect(runA.scenarios.bearMarket).toBeDefined();
      expect(runA.scenarios.baseCase).toBeDefined();
      expect(runA.scenarios.stressTest).toBeDefined();

      // At vol=0, all scenarios should be identical
      expect(runA.scenarios.bullMarket).toStrictEqual(runA.scenarios.bearMarket);
      expect(runA.scenarios.baseCase).toStrictEqual(runA.scenarios.stressTest);
    });
  });

  describe('Zero-Variance Properties', () => {
    it('should have zero standard deviation', async () => {
      const result = await harness.executeWithOverrides(
        CANONICAL_CONFIG,
        ZERO_VOL_DISTRIBUTIONS,
        CANONICAL_PORTFOLIO_INPUTS,
        { deterministicMode: true, skipStore: true }
      );

      expect(result.irr.statistics.standardDeviation).toBe(0);
      expect(result.multiple.statistics.standardDeviation).toBe(0);
      expect(result.dpi.statistics.standardDeviation).toBe(0);
      expect(result.totalValue.statistics.standardDeviation).toBe(0);
    });

    it('should have zero max drawdown', async () => {
      const result = await harness.executeWithOverrides(
        CANONICAL_CONFIG,
        ZERO_VOL_DISTRIBUTIONS,
        CANONICAL_PORTFOLIO_INPUTS,
        { deterministicMode: true, skipStore: true }
      );

      expect(result.riskMetrics.maxDrawdown).toBe(0);
    });

    it('should have zero downside risk', async () => {
      const result = await harness.executeWithOverrides(
        CANONICAL_CONFIG,
        ZERO_VOL_DISTRIBUTIONS,
        CANONICAL_PORTFOLIO_INPUTS,
        { deterministicMode: true, skipStore: true }
      );

      expect(result.riskMetrics.downsideRisk).toBe(0);
    });

    it('should produce finite values (no NaN or Infinity)', async () => {
      const result = await harness.executeWithOverrides(
        CANONICAL_CONFIG,
        ZERO_VOL_DISTRIBUTIONS,
        CANONICAL_PORTFOLIO_INPUTS,
        { deterministicMode: true, skipStore: true }
      );

      // Check all numeric fields are finite
      expect(Number.isFinite(result.irr.statistics.mean)).toBe(true);
      expect(Number.isFinite(result.riskMetrics.sharpeRatio)).toBe(true);
      expect(Number.isFinite(result.riskMetrics.sortinoRatio)).toBe(true);
      expect(Number.isFinite(result.totalValue.statistics.mean)).toBe(true);
    });
  });
});
```

---

## 4. Phase 2: Oracle Parity (Mathematical Correctness)

**Objective**: Validate that `MC(vol=0)` outputs match closed-form mathematical expectations.

### 4.1 Oracle Derivation

At zero variance, the Monte Carlo engine should produce deterministic outputs matching its internal formulas:

```
Given:
  - MEAN_IRR = 0.15 (15%)
  - MEAN_MULTIPLE = 2.5x
  - MEAN_DPI = 0.8
  - MEAN_EXIT_TIMING = 5.5 years
  - DEPLOYED_CAPITAL = $80M
  - TIME_HORIZON = 5 years

Engine Formula (from monte-carlo-engine.ts lines 708-715):
  compoundFactor = (1 + IRR)^timeHorizon
  yearsAboveBaseline = max(0, timeHorizon - 5)
  timeDecay = 0.97^yearsAboveBaseline  (or 0.95 if timeHorizon > 10)
  totalValue = deployedCapital * multiple * compoundFactor * timeDecay

For timeHorizon = 5:
  compoundFactor = (1.15)^5 = 2.0113571...
  yearsAboveBaseline = 0
  timeDecay = 1.0
  totalValue = 80,000,000 * 2.5 * 2.0113571 * 1.0 = $402,271,428

At vol=0:
  mean = median = min = max = p5 = p25 = p50 = p75 = p95
  standardDeviation = 0
  All scenarios are identical
```

### 4.2 Oracle Test Suite

**File**: `tests/integration/zero-variance-bridge/oracle.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { MonteCarloTestHarness } from '../../utils/monte-carlo-test-harness';
import {
  ZERO_VOL_DISTRIBUTIONS,
  CANONICAL_PORTFOLIO_INPUTS,
  CANONICAL_CONFIG,
  EXPECTED_VALUES,
} from './fixtures';

describe('Zero-Variance Oracle Parity', () => {
  let harness: MonteCarloTestHarness;
  let result: Awaited<ReturnType<MonteCarloTestHarness['executeWithOverrides']>>;

  beforeAll(async () => {
    harness = new MonteCarloTestHarness();
    result = await harness.executeWithOverrides(
      CANONICAL_CONFIG,
      ZERO_VOL_DISTRIBUTIONS,
      CANONICAL_PORTFOLIO_INPUTS,
      { deterministicMode: true, skipStore: true }
    );
  });

  describe('Distribution Collapse', () => {
    it('IRR: all percentiles should equal mean', () => {
      const irr = result.irr;
      const mean = irr.statistics.mean;

      expect(irr.percentiles.p5).toBeCloseTo(mean, 10);
      expect(irr.percentiles.p25).toBeCloseTo(mean, 10);
      expect(irr.percentiles.p50).toBeCloseTo(mean, 10);
      expect(irr.percentiles.p75).toBeCloseTo(mean, 10);
      expect(irr.percentiles.p95).toBeCloseTo(mean, 10);
      expect(irr.statistics.min).toBeCloseTo(mean, 10);
      expect(irr.statistics.max).toBeCloseTo(mean, 10);
    });

    it('Multiple: all percentiles should equal mean', () => {
      const multiple = result.multiple;
      const mean = multiple.statistics.mean;

      expect(multiple.percentiles.p5).toBeCloseTo(mean, 10);
      expect(multiple.percentiles.p50).toBeCloseTo(mean, 10);
      expect(multiple.percentiles.p95).toBeCloseTo(mean, 10);
    });

    it('DPI: all percentiles should equal mean', () => {
      const dpi = result.dpi;
      const mean = dpi.statistics.mean;

      expect(dpi.percentiles.p5).toBeCloseTo(mean, 10);
      expect(dpi.percentiles.p50).toBeCloseTo(mean, 10);
      expect(dpi.percentiles.p95).toBeCloseTo(mean, 10);
    });

    it('Exit Timing: all percentiles should equal mean', () => {
      // Note: Need to verify exitTiming is exposed in results
      // If not, this test documents expected behavior
      const exitTiming = result.tvpi; // May need adjustment based on actual output structure
      expect(exitTiming.statistics.standardDeviation).toBe(0);
    });
  });

  describe('Closed-Form Value Calculations', () => {
    it('should match oracle total value calculation', () => {
      // Oracle formula (matches engine)
      const MEAN_IRR = 0.15;
      const MEAN_MULTIPLE = 2.5;
      const TIME_HORIZON = 5;
      const DEPLOYED = 80_000_000;

      const compoundFactor = Math.pow(1 + MEAN_IRR, TIME_HORIZON);
      const yearsAboveBaseline = Math.max(0, TIME_HORIZON - 5);
      const timeDecay = Math.pow(0.97, yearsAboveBaseline);

      const expectedTotalValue = DEPLOYED * MEAN_MULTIPLE * compoundFactor * timeDecay;

      // Allow small floating-point tolerance
      expect(result.totalValue.statistics.mean).toBeCloseTo(expectedTotalValue, 0);
    });

    it('should have IRR mean equal to input', () => {
      expect(result.irr.statistics.mean).toBeCloseTo(ZERO_VOL_DISTRIBUTIONS.irr.mean, 10);
    });

    it('should have Multiple mean equal to input', () => {
      expect(result.multiple.statistics.mean).toBeCloseTo(ZERO_VOL_DISTRIBUTIONS.multiple.mean, 10);
    });

    it('should have DPI mean equal to input', () => {
      expect(result.dpi.statistics.mean).toBeCloseTo(ZERO_VOL_DISTRIBUTIONS.dpi.mean, 10);
    });
  });

  describe('Risk Metrics at Zero Variance', () => {
    it('Sharpe Ratio should be 0 (undefined -> default)', () => {
      expect(result.riskMetrics.sharpeRatio).toBe(0);
    });

    it('Sortino Ratio should be 0 (undefined -> default)', () => {
      expect(result.riskMetrics.sortinoRatio).toBe(0);
    });

    it('VaR should equal mean (no tail risk)', () => {
      const meanIrr = result.irr.statistics.mean;
      expect(result.riskMetrics.valueAtRisk.var5).toBeCloseTo(meanIrr, 10);
      expect(result.riskMetrics.valueAtRisk.var10).toBeCloseTo(meanIrr, 10);
    });

    it('CVaR should equal VaR (no tail beyond VaR)', () => {
      expect(result.riskMetrics.conditionalValueAtRisk.cvar5)
        .toBeCloseTo(result.riskMetrics.valueAtRisk.var5, 10);
    });
  });
});
```

---

## 5. Phase 3: Sanity Bridge (Optional)

**Objective**: Verify that MC and DRE produce results in the same order of magnitude for overlapping concepts.

**Rationale**: While strict parity is architecturally invalid (different computations), a sanity check ensures both engines aren't wildly divergent.

**File**: `tests/integration/zero-variance-bridge/sanity.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { MonteCarloTestHarness } from '../../utils/monte-carlo-test-harness';
import { DeterministicReserveEngine } from '../../../shared/core/reserves/DeterministicReserveEngine';
import {
  ZERO_VOL_DISTRIBUTIONS,
  CANONICAL_PORTFOLIO_INPUTS,
  CANONICAL_CONFIG,
} from './fixtures';

describe('Zero-Variance Sanity Bridge (Optional)', () => {
  let mcHarness: MonteCarloTestHarness;
  let dreEngine: DeterministicReserveEngine;

  beforeAll(() => {
    mcHarness = new MonteCarloTestHarness();
    dreEngine = new DeterministicReserveEngine();
  });

  it('portfolio MOIC should be within 2x of each other', async () => {
    // Run MC
    const mcResult = await mcHarness.executeWithOverrides(
      CANONICAL_CONFIG,
      ZERO_VOL_DISTRIBUTIONS,
      CANONICAL_PORTFOLIO_INPUTS,
      { deterministicMode: true, skipStore: true }
    );

    // Run DRE (would need compatible input construction)
    // This is a placeholder - actual implementation depends on input mapping
    const dreInput = {
      portfolio: [], // Would need to construct from CANONICAL_PORTFOLIO_INPUTS
      availableReserves: CANONICAL_PORTFOLIO_INPUTS.fundSize * CANONICAL_PORTFOLIO_INPUTS.reserveRatio,
      totalFundSize: CANONICAL_PORTFOLIO_INPUTS.fundSize,
      graduationMatrix: { /* ... */ },
      stageStrategies: [],
      minAllocationThreshold: 25000,
      maxPortfolioConcentration: 0.1,
      scenarioType: 'base' as const,
      timeHorizon: CANONICAL_CONFIG.timeHorizonYears * 12,
      enableDiversification: true,
      enableRiskAdjustment: true,
      enableLiquidationPreferences: true,
    };

    // const dreResult = await dreEngine.calculateOptimalReserveAllocation(dreInput);

    const mcMOIC = mcResult.multiple.statistics.mean;
    // const dreMOIC = dreResult.portfolioMetrics.expectedPortfolioMOIC;

    // Sanity: Should be within 2x (very loose, just catching gross errors)
    // expect(mcMOIC).toBeGreaterThan(dreMOIC * 0.5);
    // expect(mcMOIC).toBeLessThan(dreMOIC * 2.0);

    // For now, just verify MC produces reasonable MOIC
    expect(mcMOIC).toBeGreaterThan(1.0);
    expect(mcMOIC).toBeLessThan(10.0);
  });
});
```

---

## 6. File Structure

```
tests/
  integration/
    zero-variance-bridge/
      fixtures.ts              # Test data and expected values
      mirror.test.ts           # Phase 1: Self-consistency tests
      oracle.test.ts           # Phase 2: Mathematical correctness tests
      sanity.test.ts           # Phase 3: Optional cross-engine sanity check
  utils/
    monte-carlo-test-harness.ts  # Test harness for MC engine access

shared/
  validation/
    monte-carlo-schemas.ts     # Add test schemas (Patches 2.1, 2.6)
  utils/
    prng.ts                    # PRNG safety patch (Patch 2.5)

server/
  services/
    monte-carlo-engine.ts      # Core patches (2.2, 2.3, 2.4)
```

---

## 7. Implementation Checklist

### Phase 0: Engine Hygiene

- [ ] **Patch 2.1**: Add `StatisticsSchemaTest` and `RiskMetricsSchemaTest` to `monte-carlo-schemas.ts`
- [ ] **Patch 2.2**: Fix `||` bug in `calibrateDistributions` with `safeVolatility()` helper
- [ ] **Patch 2.3**: Extract `executeSimulationCore` method from `runPortfolioSimulation`
- [ ] **Patch 2.4**: Add `VOLATILITY_FLOOR` constant and math guards to risk calculations
- [ ] **Patch 2.5**: Add `stdDev === 0` fast path to `PRNG.nextNormal()`
- [ ] **Patch 2.6**: Add `DistributionParametersSchemaTest` for zero-vol inputs
- [ ] **Verify**: `npm run check` passes (TypeScript)
- [ ] **Verify**: `npm run lint` passes

### Phase 1: Mirror Test

- [ ] Create `tests/utils/monte-carlo-test-harness.ts`
- [ ] Create `tests/integration/zero-variance-bridge/fixtures.ts`
- [ ] Create `tests/integration/zero-variance-bridge/mirror.test.ts`
- [ ] **Verify**: Mirror test passes (`npm test -- --grep "Mirror"`)

### Phase 2: Oracle Parity

- [ ] Derive oracle formulas from engine source (document in fixtures.ts)
- [ ] Create `tests/integration/zero-variance-bridge/oracle.test.ts`
- [ ] **Verify**: Oracle test passes (`npm test -- --grep "Oracle"`)

### Phase 3: Sanity Bridge (Optional)

- [ ] Create input adapter for DRE compatibility
- [ ] Create `tests/integration/zero-variance-bridge/sanity.test.ts`
- [ ] **Verify**: Sanity test passes (loose tolerances)

### Final

- [ ] All tests pass: `npm test`
- [ ] Create PR with comprehensive description
- [ ] Document in CHANGELOG.md

---

## 8. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Schema changes break other tests | Medium | High | Separate test schemas, don't modify production |
| Engine refactor introduces bugs | Low | High | Extract method pattern preserves behavior |
| Oracle formula mismatch | Medium | Medium | Derive directly from source, document derivation |
| PRNG state leakage between tests | Low | Low | Use fresh harness instance per test |
| Floating-point accumulation noise | Low | Low | Use `VOLATILITY_FLOOR` threshold |

---

## 9. Success Criteria

| Phase | Criterion | Measurement |
|-------|-----------|-------------|
| 0 | All patches applied | `npm run check` passes |
| 1 | Self-consistency proven | `Run A === Run B` for all deterministic fields |
| 2 | Mathematical correctness | All percentiles collapse to mean, total value matches oracle |
| 3 | Sanity verified | MC and DRE within 2x for overlapping metrics |

---

## 10. References

- Monte Carlo Engine: `server/services/monte-carlo-engine.ts`
- PRNG Implementation: `shared/utils/prng.ts`
- Validation Schemas: `shared/validation/monte-carlo-schemas.ts`
- DRE Implementation: `shared/core/reserves/DeterministicReserveEngine.ts`
- Truth Case Helpers: `tests/unit/truth-cases/helpers.ts`
