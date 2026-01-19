---
status: ACTIVE
last_updated: 2026-01-19
---

# Monte Carlo Simulation - Validation Strategy

**Document Version**: 1.0.0 **Last Updated**: 2025-11-06 **Related**: ADR-010
(Monte Carlo Validation Strategy)

## Table of Contents

- [Validation Strategy Overview](#validation-strategy-overview)
- [Three-Tier Input Validation](#three-tier-input-validation)
- [NaN Prevention](#nan-prevention)
- [Performance Validation](#performance-validation)
- [Accuracy Verification](#accuracy-verification)
- [Integration Testing](#integration-testing)
- [Common Pitfalls and Solutions](#common-pitfalls-and-solutions)
- [Real-World Scenarios](#real-world-scenarios)

---

## Validation Strategy Overview

**Source**: ADR-010 (Monte Carlo Validation Strategy)

Monte Carlo simulations for portfolio modeling require **robust input validation
and NaN prevention** to ensure stable, reproducible results. Power law
distributions used in venture capital return modeling are particularly sensitive
to edge cases (zero values, infinite results, division by zero) that can
propagate through calculations and corrupt entire simulation runs.

### Core Principles (from ADR-010:47-55)

1. **Fail fast**: Reject invalid inputs immediately with descriptive errors
2. **Type safety**: Validate both type (number) and mathematical properties
   (finite, positive)
3. **Zero tolerance**: No silent coercion or "best effort" handling of bad
   inputs
4. **Explicit bounds**: Document valid ranges in code comments and error
   messages

### Business Impact (from ADR-010:29-35)

- **Fund modeling accuracy**: LP reports require 10,000+ Monte Carlo scenarios
  with 99.9%+ success rate
- **Performance**: NaN edge cases can cause 10-100x slowdowns in iterative
  algorithms
- **Auditability**: Regulators require reproducible, explainable simulation
  results

---

## Three-Tier Input Validation

**Pattern**: Every Monte Carlo function uses three-tier validation before
expensive calculations.

### Tier 1: Type Validation

**Purpose**: Ensure inputs are actually numbers (not strings, objects,
undefined, null).

```typescript
// File: server/services/power-law-distribution.ts:246-252
if (typeof portfolioSize !== 'number' || typeof scenarios !== 'number') {
  throw new TypeError(
    `portfolioSize and scenarios must be numbers, got: ${typeof portfolioSize}, ${typeof scenarios}`
  );
}
```

**Why This Matters**:

```javascript
// JavaScript type coercion gotchas:
'10' * 2           → 20 (works but wrong)
'10' + 2           → '102' (string concatenation)
null * 10          → 0 (silent zero)
undefined * 10     → NaN (propagates silently)
{value: 10} * 2    → NaN (object)

// Fail fast prevents silent bugs:
typeof '10' === 'number'        → false ✓ (caught early)
typeof {value: 10} === 'number' → false ✓ (caught early)
```

### Tier 2: Mathematical Validity (Finite Check)

**Purpose**: Reject NaN and Infinity values that corrupt calculations.

```typescript
// File: server/services/power-law-distribution.ts:248-254
if (!Number.isFinite(portfolioSize) || !Number.isFinite(scenarios)) {
  throw new RangeError(
    `portfolioSize and scenarios must be finite numbers, got: ${portfolioSize}, ${scenarios}`
  );
}
```

**Why isFinite()?** (from ADR-010:146-163)

`Number.isFinite(x)` checks both:

- `!isNaN(x)` - not NaN
- `x !== Infinity && x !== -Infinity` - not infinite

**More robust than manual checks**:

```javascript
// ❌ Incomplete: Allows NaN
if (x > 0) { ... }  // NaN > 0 is false, but NaN is invalid

// ❌ Incomplete: Allows Infinity
if (!isNaN(x)) { ... }  // Infinity is not NaN

// ✅ Complete: Rejects both NaN and Infinity
if (Number.isFinite(x) && x > 0) { ... }
```

**Example Edge Cases**:

```javascript
Number.isFinite(NaN)       → false ✓
Number.isFinite(Infinity)  → false ✓
Number.isFinite(-Infinity) → false ✓
Number.isFinite(0 / 0)     → false ✓ (NaN)
Number.isFinite(1 / 0)     → false ✓ (Infinity)
Number.isFinite(42)        → true ✓
```

### Tier 3: Domain Constraints

**Purpose**: Enforce business-level constraints (e.g., portfolio size must be
positive).

```typescript
// File: server/services/power-law-distribution.ts:253-256
if (portfolioSize <= 0 || scenarios <= 0) {
  throw new RangeError(
    `portfolioSize and scenarios must be positive, got: ${portfolioSize}, ${scenarios}`
  );
}
```

**Domain Constraints by Parameter** (from ADR-010:167-179):

```typescript
// Portfolio size: Number of investments (1+)
if (portfolioSize <= 0) {
  throw new RangeError(
    'portfolioSize must be positive (at least 1 investment)'
  );
}

// Scenarios: Simulation count (100-50,000)
if (scenarios < 100 || scenarios > 50_000) {
  throw new RangeError('scenarios must be between 100 and 50,000');
}

// Exponent: Power law shape parameter (>1 for realistic VC distributions)
if (alpha <= 1.0) {
  throw new RangeError('alpha must be > 1.0 for convergent power law');
}

// Multiples: Return multiples (≥0, where 0 = total loss)
if (multiple < 0) {
  throw new RangeError('multiple must be non-negative (0 = total loss)');
}
```

### Complete Validation Pattern

**Template** (from ADR-010:287-293):

```typescript
function monteCarloFunction(input: number, scenarios: number): Result {
  // ✅ Validation checklist:
  // [ ] typeof check (number, not string/object)
  // [ ] isFinite check (not NaN, not Infinity)
  // [ ] Range check (>0 for counts, >=0 for multiples)
  // [ ] Descriptive error message (includes actual value)

  // Tier 1: Type validation
  if (typeof input !== 'number' || typeof scenarios !== 'number') {
    throw new TypeError(
      `Expected numbers, got ${typeof input}, ${typeof scenarios}`
    );
  }

  // Tier 2: Mathematical validity
  if (!Number.isFinite(input) || !Number.isFinite(scenarios)) {
    throw new RangeError(
      `Non-finite input: input=${input}, scenarios=${scenarios}`
    );
  }

  // Tier 3: Domain constraints
  if (input <= 0 || scenarios <= 0) {
    throw new RangeError(
      `Positive values required: input=${input}, scenarios=${scenarios}`
    );
  }

  // Proceed with calculation
  return performCalculation(input, scenarios);
}
```

---

## NaN Prevention

**Problem** (from ADR-010:10-27): Without comprehensive validation:

- **Invalid inputs** (negative portfolio sizes, non-finite exponents) cause
  simulation crashes
- **NaN propagation** from edge cases (log(0), division by zero) corrupts
  thousands of scenarios
- **Non-deterministic results** from floating-point edge cases make debugging
  impossible
- **Silent failures** where calculations succeed but produce meaningless results

### Common NaN Sources

**Division by Zero**:

```javascript
const avgReturn = totalReturn / portfolioSize; // NaN if portfolioSize = 0
// ✓ Fixed: Validate portfolioSize > 0 upfront
```

**Logarithm of Zero or Negative**:

```javascript
const z0 = Math.sqrt(-2 * Math.log(u1)); // NaN if u1 = 0
// ✓ Fixed: Clamp u1 to [1e-10, 1 - 1e-10]
```

**Negative Exponents in Power Law**:

```javascript
const irr = Math.pow(multiple, 1 / years) - 1; // NaN if multiple < 0
// ✓ Fixed: Sentinel value for total loss
```

### Sentinel Values

**Pattern**: Use explicit sentinel values for valid edge cases (from
ADR-010:309-318).

```typescript
// File: server/services/power-law-distribution.ts:316-322
if (returnSample.multiple <= 0) {
  irr = -1.0; // Total loss sentinel (avoids Math.pow(negative, fractional))
} else {
  irr = Math.pow(returnSample.multiple, 1 / actualTimeHorizon) - 1;
}
```

**Why -1.0?**

- Represents 100% capital loss (IRR of -100%)
- Avoids `Math.pow(0, fractional)` = 0 (misleading)
- Avoids `Math.pow(negative, fractional)` = NaN (crashes)
- Interpretable: "This investment lost all capital"

**Other Sentinel Examples**:

```typescript
// DPI: Clamp to zero (can't distribute negative capital)
dpi: Math.max(0, dpiSample);

// TVPI: Clamp to zero (total value can't be negative)
tvpi: Math.max(0, tvpi);

// Exit timing: Clamp to minimum 1 year (no instant exits)
exitTiming: Math.max(1, exitTimingSample);
```

### NaN Detection

**Runtime Checks**:

```typescript
// After critical calculations, verify no NaN propagated
const mean = values.reduce((sum, v) => sum + v, 0) / values.length;

if (!Number.isFinite(mean)) {
  throw new Error(`NaN detected in mean calculation: ${mean}`);
}
```

**Test Assertions**:

```typescript
// File: tests/unit/services/monte-carlo-engine.test.ts:599-603
it('should handle zero or negative scenarios gracefully', async () => {
  const result = await engine.runPortfolioSimulation({
    ...mockConfig,
    runs: 100,
  });

  // Ensure no negative values in critical metrics
  expect(result.dpi.scenarios.every((val) => val >= 0)).toBe(true);
  expect(result.tvpi.scenarios.every((val) => val >= 0)).toBe(true);
  expect(result.totalValue.scenarios.every((val) => val >= 0)).toBe(true);
});
```

---

## Performance Validation

### Benchmark Test Cases

**From**: `scripts/validation/monte-carlo-validation.yaml`

#### Test Case 1: Basic Simulation (1000 iterations)

```yaml
# Lines 10-30
description: 'Basic simulation with 1000 iterations'
vars:
  scenario: 'Standard Monte Carlo with default parameters'
  simulation:
    iterations: 1000
    fundSize: 100000000
    companies: 20
    meanReturn: 0.15
    stdDeviation: 0.30
  seed: 42

assert:
  - type: javascript
    value: |
      const result = output;
      // Validate simulation structure
      result.iterations === 1000 &&
      result.outcomes.length === 1000 &&
      Math.abs(result.mean - 1.15) < 0.10 &&  // ~15% return
      result.p50 > 1.0 &&  // Median > 1x
      result.p90 > result.p50
```

**Validation Checks**:

- ✅ Correct number of iterations generated
- ✅ Mean within ±10% of expected (15% return → 1.15x multiple)
- ✅ Median > 1.0 (positive returns)
- ✅ P90 > P50 (right-skewed distribution)

#### Test Case 2: High-Variance Scenario

```yaml
# Lines 32-51
description: 'High-variance scenario testing distribution spread'
vars:
  scenario: 'High-risk portfolio simulation'
  simulation:
    iterations: 1000
    fundSize: 100000000
    companies: 15
    meanReturn: 0.25
    stdDeviation: 0.60
  seed: 123

assert:
  - type: javascript
    value: |
      const result = output;
      // Validate high variance characteristics
      result.stdDev > 0.50 &&
      result.p90 / result.p10 > 3.0 &&  // Wide distribution
      result.outcomes.some(o => o.multiple > 3.0) &&
      result.outcomes.some(o => o.multiple < 0.5)
```

**Validation Checks**:

- ✅ Standard deviation > 50% (high volatility)
- ✅ P90/P10 ratio > 3.0 (wide spread)
- ✅ Extreme outcomes present (>3x and <0.5x)

#### Test Case 3: Conservative Portfolio (Low Volatility)

```yaml
# Lines 53-70
description: 'Conservative portfolio with low volatility'
vars:
  scenario: 'Low-risk, steady returns'
  simulation:
    iterations: 1000
    fundSize: 50000000
    companies: 30
    meanReturn: 0.08
    stdDeviation: 0.15
  seed: 456

assert:
  - type: javascript
    value: |
      const result = output;
      // Validate low volatility
      result.stdDev < 0.20 &&
      result.p90 / result.p10 < 2.0 &&  // Narrow distribution
      result.mean > 1.05 && result.mean < 1.15
```

**Validation Checks**:

- ✅ Standard deviation < 20% (low volatility)
- ✅ P90/P10 ratio < 2.0 (narrow spread)
- ✅ Mean in expected range (1.05-1.15x)

#### Test Case 4: Aggressive Portfolio (High Expected Returns)

```yaml
# Lines 72-89
description: 'Aggressive portfolio with high expected returns'
vars:
  scenario: 'High-growth venture portfolio'
  simulation:
    iterations: 1000
    fundSize: 150000000
    companies: 25
    meanReturn: 0.35
    stdDeviation: 0.50
  seed: 789

assert:
  - type: javascript
    value: |
      const result = output;
      // Validate high return expectations
      result.mean > 1.30 &&
      result.p75 > 1.50 &&
      result.outcomes.some(o => o.multiple > 5.0)  // Outliers possible
```

**Validation Checks**:

- ✅ Mean > 1.30x (high returns)
- ✅ P75 > 1.50x (strong upper quartile)
- ✅ Outliers present (>5x multiples)

#### Test Case 5: Statistical Validation (10,000 iterations)

```yaml
# Lines 90-112
description: 'Statistical validation (mean, median, percentiles)'
vars:
  scenario: 'Verify statistical properties'
  simulation:
    iterations: 10000
    fundSize: 100000000
    companies: 20
    meanReturn: 0.12
    stdDeviation: 0.25
  seed: 999

assert:
  - type: javascript
    value: |
      const result = output;
      // Validate statistical consistency
      result.iterations === 10000 &&
      Math.abs(result.mean - 1.12) < 0.05 &&  // Close to expected
      result.p50 < result.mean &&  // Median < mean (right-skewed)
      result.p25 < result.p50 && result.p50 < result.p75 &&
      result.p10 < result.p90 &&
      // Check percentile ordering
      result.outcomes.filter(o => o.multiple >= result.p90).length <= 1000
```

**Validation Checks**:

- ✅ Mean within ±5% of expected (convergence test)
- ✅ Median < mean (right-skewed VC distribution)
- ✅ Percentile ordering correct (P10 < P25 < P50 < P75 < P90)
- ✅ P90 threshold correct (≤10% of outcomes above)

### Performance Benchmarks

**Execution Time Targets** (from
`tests/unit/services/monte-carlo-engine.test.ts:538-545`):

```typescript
it('should complete simulation within reasonable time', async () => {
  const startTime = Date.now();
  const result = await engine.runPortfolioSimulation({
    ...mockConfig,
    runs: 5000,
  });
  const executionTime = Date.now() - startTime;

  expect(executionTime).toBeLessThan(10000); // Should complete within 10 seconds
  expect(result.executionTimeMs).toBeGreaterThan(0);
});
```

**Performance Targets**:

- 1,000 scenarios: <1 second
- 5,000 scenarios: <5 seconds
- 10,000 scenarios: <10 seconds
- 50,000 scenarios: <60 seconds (or use streaming engine)

---

## Accuracy Verification

### Power Law Distribution Validation

**70% Failure Rate Test** (from
`tests/unit/services/monte-carlo-power-law-validation.test.ts:22-38`):

```typescript
it('should show approximately 70% failure rate for seed investments', () => {
  const distribution = createVCPowerLawDistribution(testSeed);
  const sampleSize = 10000;

  const samples = Array.from({ length: sampleSize }, () =>
    distribution.sampleReturn('seed')
  );

  // Count failures (returns ≤ 1x)
  const failures = samples.filter((sample) => sample.multiple <= 1.0);
  const failureRate = failures.length / sampleSize;

  // Should be approximately 70% ± 2% tolerance for statistical variation
  expect(failureRate).toBeGreaterThan(0.68);
  expect(failureRate).toBeLessThan(0.72);
  expect(failureRate).toBeCloseTo(0.7, 1);
});
```

**Validation**: Seed-stage failure rate matches Kauffman Foundation data
(68-70%).

### Extreme Outliers Validation (1% Unicorns)

**Test** (from
`tests/unit/services/monte-carlo-power-law-validation.test.ts:87-103`):

```typescript
it('should show extreme outliers in approximately 1% of simulations', () => {
  const distribution = createVCPowerLawDistribution(testSeed);
  const sampleSize = 20000; // Large sample for outlier detection

  const samples = Array.from({ length: sampleSize }, () =>
    distribution.sampleReturn('seed')
  );

  // Count extreme outliers (>50x returns)
  const extremeOutliers = samples.filter((sample) => sample.multiple > 50);
  const outlierRate = extremeOutliers.length / sampleSize;

  // Should be approximately 1% ± 0.3% tolerance
  expect(outlierRate).toBeGreaterThan(0.007); // 0.7%
  expect(outlierRate).toBeLessThan(0.013); // 1.3%
  expect(outlierRate).toBeCloseTo(0.01, 2); // ~1%
});
```

**Validation**: Unicorn rate (>50x) matches realistic VC data (~1%).

### Series A Chasm Validation

**Test** (from
`tests/unit/services/monte-carlo-power-law-validation.test.ts:40-59`):

```typescript
it('should show different failure rates by stage reflecting Series A Chasm', () => {
  const distribution = createVCPowerLawDistribution(testSeed);
  const sampleSize = 5000;

  // Test seed vs series-a failure rates
  const seedSamples = Array.from({ length: sampleSize }, () =>
    distribution.sampleReturn('seed')
  );
  const seriesASamples = Array.from({ length: sampleSize }, () =>
    distribution.sampleReturn('series-a')
  );

  const seedFailureRate =
    seedSamples.filter((s) => s.multiple <= 1.0).length / sampleSize;
  const seriesAFailureRate =
    seriesASamples.filter((s) => s.multiple <= 1.0).length / sampleSize;

  // Series A should have lower failure rate (Series A Chasm effect)
  expect(seriesAFailureRate).toBeLessThan(seedFailureRate);
  expect(seedFailureRate).toBeCloseTo(0.7, 1);
  expect(seriesAFailureRate).toBeCloseTo(0.5, 1);
});
```

**Validation**: Series A failure rate (50%) significantly lower than seed (70%),
reflecting survivor bias.

### Statistical Properties

**Power Law Tail Characteristics** (from
`tests/unit/services/monte-carlo-power-law-validation.test.ts:125-145`):

```typescript
it('should show power law tail characteristics', () => {
  const distribution = createVCPowerLawDistribution(testSeed);
  const portfolioDistribution = distribution.generatePortfolioReturns(
    50, // 50 companies
    { seed: 1.0 },
    2000 // 2000 scenarios
  );

  // Should show high skewness (long right tail)
  expect(portfolioDistribution.statistics.skewness).toBeGreaterThan(2);

  // Should show high kurtosis (fat tails)
  expect(portfolioDistribution.statistics.kurtosis).toBeGreaterThan(5);

  // Median should be much lower than mean (right-skewed)
  expect(portfolioDistribution.statistics.median).toBeLessThan(
    portfolioDistribution.statistics.mean
  );

  // 99th percentile should be dramatically higher than 90th
  const ratio99to90 =
    portfolioDistribution.percentiles.p99 /
    portfolioDistribution.percentiles.p90;
  expect(ratio99to90).toBeGreaterThan(2);
});
```

**Validation**:

- ✅ Skewness > 2 (right-skewed)
- ✅ Kurtosis > 5 (fat tails)
- ✅ Median < Mean (asymmetric)
- ✅ P99/P90 > 2 (extreme tail)

---

## Integration Testing

### Database Integration

**Test** (from `tests/unit/services/monte-carlo-engine.test.ts:607-624`):

```typescript
it('should correctly extract portfolio inputs from baseline', async () => {
  await engine.runPortfolioSimulation(mockConfig);

  // Verify database queries were made correctly
  expect(db.query.fundBaselines.findFirst).toHaveBeenCalledWith({
    where: expect.any(Object),
  });

  expect(db.query.funds.findFirst).toHaveBeenCalledWith({
    where: expect.any(Object),
  });

  expect(db.query.varianceReports.findMany).toHaveBeenCalledWith({
    where: expect.any(Object),
    orderBy: expect.any(Object),
    limit: 30,
  });
});
```

**Validation**:

- ✅ Baseline query includes `fundId`, `isActive`, `isDefault` filters
- ✅ Variance reports limited to last 30 reports
- ✅ Queries executed in correct order

### Concurrent Simulation Testing

**Test** (from `tests/unit/services/monte-carlo-engine.test.ts:547-559`):

```typescript
it('should handle concurrent simulations', async () => {
  const simulations = Array.from({ length: 3 }, () =>
    engine.runPortfolioSimulation({ ...mockConfig, runs: 500 })
  );

  const results = await Promise.all(simulations);

  expect(results).toHaveLength(3);
  results.forEach((result) => {
    expect(result.simulationId).toBeDefined();
    expect(result.irr.scenarios).toHaveLength(500);
  });
});
```

**Validation**:

- ✅ Multiple simulations can run concurrently
- ✅ Each simulation has unique ID
- ✅ Results don't interfere with each other
- ✅ No race conditions in PRNG state

### Reserve Optimization Integration

**Test** (from `tests/unit/services/monte-carlo-engine.test.ts:401-425`):

```typescript
it('should find optimal reserve allocation', async () => {
  const mockScenarios = Array.from({ length: 100 }, () => ({
    irr: 0.15 + Math.random() * 0.1,
    multiple: 2.0 + Math.random() * 1.0,
    followOnNeed: 0.3 + Math.random() * 0.4,
  }));

  const optimization = await engine.optimizeReserveAllocation(
    mockConfig,
    mockPortfolioInputs,
    mockScenarios
  );

  expect(optimization.currentReserveRatio).toBe(
    mockPortfolioInputs.reserveRatio
  );
  expect(optimization.optimalReserveRatio).toBeGreaterThan(0.1);
  expect(optimization.optimalReserveRatio).toBeLessThan(0.5);

  expect(optimization.allocationRecommendations).toBeInstanceOf(Array);
  expect(optimization.allocationRecommendations.length).toBeGreaterThan(0);

  expect(optimization.coverageScenarios).toBeDefined();
  expect(optimization.coverageScenarios.p25).toBeLessThanOrEqual(
    optimization.coverageScenarios.p50
  );
  expect(optimization.coverageScenarios.p50).toBeLessThanOrEqual(
    optimization.coverageScenarios.p75
  );
});
```

**Validation**:

- ✅ Tests reserve ratios from 10% to 50%
- ✅ Optimal ratio within reasonable bounds
- ✅ Coverage scenarios properly ordered
- ✅ Recommendations array populated

---

## Common Pitfalls and Solutions

### Pitfall 1: Silent Type Coercion

**Problem** (from ADR-010:132-138):

```typescript
// ❌ Silently coerces invalid inputs
const portfolioSize = Math.abs(input); // Turns '-10' into 10
const scenarios = input || defaultValue; // Turns null into default
```

**Problems**:

- Masks bugs (developer mistakes go undetected)
- Unpredictable (`null`, `undefined`, `NaN` behave differently)
- No audit trail (no record that invalid input was received)

**Solution** (from ADR-010:139-143):

```typescript
// ✅ Fail fast with explicit validation
if (typeof portfolioSize !== 'number' || portfolioSize <= 0) {
  throw new TypeError(
    `portfolioSize must be positive number, got: ${portfolioSize}`
  );
}
```

**Benefits**:

- Clear debugging (stack trace points to exact invalid input source)
- Contract enforcement (API consumers must validate before calling)
- No silent corruption (bad data never enters calculation pipeline)

### Pitfall 2: Insufficient Validation

**Problem**:

```typescript
// ❌ Incomplete: Allows NaN
if (x > 0) { ... }

// ❌ Incomplete: Allows Infinity
if (!isNaN(x)) { ... }
```

**Solution** (from ADR-010:154-163):

```typescript
// ✅ Complete: Rejects both NaN and Infinity
if (Number.isFinite(x) && x > 0) { ... }
```

### Pitfall 3: Try-Catch at Simulation Level

**Problem** (from ADR-010:203-218):

```typescript
// ❌ Wrap entire simulation in try-catch, discard failed scenarios
try {
  runSimulation();
} catch {
  // Ignore and continue
}
```

**Problems**:

- Wastes computation (20% overhead from failed scenarios)
- Masks root causes (no way to know which input caused failure)
- Non-reproducible (random failures make debugging impossible)

**Solution**:

```typescript
// ✅ Validate inputs before simulation
this.validateConfig(config);
const baseline = await this.getBaselineData(config.fundId);
// ... all validation complete before expensive calculations
```

**Acceptable Use Case**: Portfolio-level aggregation where individual deal
failures are expected domain behavior (e.g., startup failures), not calculation
errors.

### Pitfall 4: Warning Logs Instead of Errors

**Problem** (from ADR-010:221-233):

```typescript
// ❌ Log warnings but continue calculation
if (portfolioSize <= 0) {
  console.warn(`Invalid portfolio size: ${portfolioSize}, using default`);
  portfolioSize = 25;
}
```

**Problems**:

- Production blindness (warnings get lost in log noise)
- Progressive corruption (one NaN can corrupt entire result set)
- No error boundary (caller has no way to detect and handle failure)

**Solution**:

```typescript
// ✅ Throw descriptive error
if (portfolioSize <= 0) {
  throw new RangeError(`portfolioSize must be positive, got: ${portfolioSize}`);
}
```

**Acceptable Use Case**: Deprecation warnings for old API usage (non-critical,
informational).

### Pitfall 5: Non-Deterministic PRNG

**Problem**:

```typescript
// ❌ Using Math.random() (non-reproducible)
const random = Math.random();
```

**Solution**:

```typescript
// ✅ Using seeded PRNG (reproducible)
const prng = new PRNG(12345);
const random = prng.next();
```

**Benefit**: Same seed → same sequence → reproducible results for auditing and
debugging.

---

## Real-World Scenarios

### Scenario 1: Fund Modeling for LP Report

**Context**: Quarterly LP report requires 10,000-scenario Monte Carlo simulation
with 99.9%+ success rate.

**Validation Steps**:

1. **Input Validation**: Verify fund baseline data is complete and valid
2. **Execution**: Run 10,000 scenarios with deterministic seed
3. **Output Validation**: Check all percentiles are properly ordered (P5 < P25 <
   P50 < P75 < P95)
4. **Statistical Checks**: Verify skewness > 2, mean > median, no NaN values
5. **Performance**: Confirm execution < 10 seconds
6. **Reproducibility**: Re-run with same seed, verify identical results

**Test** (from `tests/integration/monte-carlo-2025-market-validation.spec.ts`):

```typescript
it('should support complete portfolio construction workflow', async () => {
  const config: SimulationConfig = {
    fundId: 1,
    runs: 2000,
    timeHorizonYears: 10,
    portfolioSize: 25,
    deploymentScheduleMonths: 42,
    randomSeed: 54321,
  };

  const result = await engine.runPortfolioSimulation(config);

  // Verify comprehensive results
  expect(result.simulationId).toBeDefined();
  expect(result.config).toEqual(config);
  expect(result.irr.scenarios).toHaveLength(2000);
  expect(result.insights.keyMetrics.length).toBeGreaterThan(0);
  expect(
    result.reserveOptimization.allocationRecommendations.length
  ).toBeGreaterThan(0);
});
```

### Scenario 2: Stress Testing for Risk Committee

**Context**: Risk committee requires stress test (P5 scenario) to assess
downside risk.

**Validation Steps**:

1. **High-Variance Configuration**: Use 60% standard deviation
2. **Conservative Portfolio**: 15 companies (lower diversification)
3. **Extreme Scenarios**: Verify P5 < 0 (negative returns possible)
4. **VaR/CVaR**: Calculate Value at Risk and Expected Shortfall
5. **Probability of Loss**: Report % of scenarios with negative IRR

**From** `scripts/validation/monte-carlo-validation.yaml:32-51`:

```yaml
scenario: 'High-risk portfolio simulation'
simulation:
  stdDeviation: 0.60 # Very high volatility
  companies: 15 # Lower diversification

expected:
  - stdDev > 0.50
  - p90 / p10 > 3.0
  - some outcomes > 3.0x
  - some outcomes < 0.5x
```

### Scenario 3: Reserve Optimization

**Context**: Investment committee needs to decide optimal reserve allocation
(30% vs 40%).

**Validation Steps**:

1. **Simulation**: Run 10,000 scenarios with different reserve ratios (10%-50%)
2. **Coverage Calculation**: Measure follow-on coverage at each ratio
3. **Risk-Adjusted Return**: Calculate Sharpe ratio for each allocation
4. **Recommendation**: Identify optimal ratio (highest Sharpe)
5. **Improvement**: Quantify expected IRR improvement

**From** `tests/unit/services/monte-carlo-engine.test.ts:401-425`:

```typescript
it('should find optimal reserve allocation', async () => {
  const optimization = await engine.optimizeReserveAllocation(
    mockConfig,
    mockPortfolioInputs,
    mockScenarios
  );

  expect(optimization.optimalReserveRatio).toBeGreaterThan(0.1);
  expect(optimization.optimalReserveRatio).toBeLessThan(0.5);
  expect(optimization.improvementPotential).toBeDefined();
});
```

### Scenario 4: Historical Calibration

**Context**: New fund with 30 variance reports needs calibrated distributions.

**Validation Steps**:

1. **Extract Variance**: Pull last 30 variance reports
2. **Calculate Volatility**: Compute standard deviation from variance history
3. **Calibrate Distributions**: Use actual fund volatility (not industry
   defaults)
4. **Validate**: Confirm simulated returns match historical patterns
5. **Fallback**: If <3 reports, use industry defaults with warning

**From** `server/services/monte-carlo-engine.ts:506-549`:

```typescript
private async calibrateDistributions(fundId: number, baseline: FundBaseline): Promise<DistributionParameters> {
  const reports = await db.query.varianceReports.findMany({
    where: and(eq(varianceReports.fundId, fundId), eq(varianceReports.baselineId, baseline.id)),
    orderBy: desc(varianceReports.asOfDate),
    limit: 30
  });

  if (reports.length < 3) {
    return this.getDefaultDistributions(); // Fall back to industry defaults
  }

  const irrVariances = this.extractVariances(reports, 'irrVariance');
  return {
    irr: {
      mean: parseFloat(baseline.irr?.toString() || '0.15'),
      volatility: this.calculateVolatility(irrVariances) || 0.08
    }
    // ... other distributions
  };
}
```

---

## Next Steps

### Quality Targets (from HANDOFF-MEMO-PHASE2-READY-2025-11-06.md)

Monte Carlo documentation should achieve:

- **98%+ Promptfoo validation pass rate** (highest standard due to complexity)
- All 5 test cases from `monte-carlo-validation.yaml` passing
- ADR-010 validation strategy fully documented
- Code references use `file:line` format
- Cross-references to DECISIONS.md ADRs included
- Edge cases from tests documented
- Statistical correctness verified
- Performance benchmarks included

### Validation Workflow

1. **Initial Draft**: Create documentation
2. **Self-Check**: Verify all ADR-010 requirements covered
3. **Promptfoo Validation**: Run validation suite
   ```bash
   promptfoo eval --config scripts/validation/monte-carlo-validation.yaml
   ```
4. **Iterate**: Address failures (target 3-5 iterations to 95%+)
5. **Final Review**: Human review for 98%+ quality

### Success Criteria

Documentation enables:

1. New developer to understand Monte Carlo simulation in 20-25 minutes
2. AI agent to answer complex questions about distributions and statistical
   properties
3. Integration developers to implement simulations correctly
4. Maintainers to understand performance optimization and validation strategies

---

## Code References

### Validation Implementation

- **Power Law Validation**: `server/services/power-law-distribution.ts:246-256`
  - Three-tier validation pattern
  - Type, finite, and range checks

- **IRR Edge Case**: `server/services/power-law-distribution.ts:316-322`
  - Total loss sentinel value (-1.0)
  - Prevents NaN from negative multiples

- **NaN Detection**: `tests/unit/services/monte-carlo-engine.test.ts:599-603`
  - Runtime checks for negative values
  - Assertions in tests

### Validation Tests

- **70% Failure Rate**:
  `tests/unit/services/monte-carlo-power-law-validation.test.ts:22-38`
- **1% Unicorns**:
  `tests/unit/services/monte-carlo-power-law-validation.test.ts:87-103`
- **Series A Chasm**:
  `tests/unit/services/monte-carlo-power-law-validation.test.ts:40-59`
- **Power Law Tails**:
  `tests/unit/services/monte-carlo-power-law-validation.test.ts:125-145`
- **Performance**: `tests/unit/services/monte-carlo-engine.test.ts:538-545`
- **Concurrent Execution**:
  `tests/unit/services/monte-carlo-engine.test.ts:547-559`

### Validation Config

- **Promptfoo Suite**: `scripts/validation/monte-carlo-validation.yaml`
  - 5 test cases covering all scenarios
  - JavaScript assertions for statistical properties

## References

- **ADR-010**: Monte Carlo Validation Strategy
  (`docs/adr/ADR-010-monte-carlo-validation-strategy.md`)
- **DECISIONS.md**: PowerLawDistribution API Design
- **HANDOFF-MEMO**: Phase 2 strategy and quality targets
- **Tests**: Comprehensive validation test suite
- **Kauffman Foundation**: Seed-stage failure rate data
- **IEEE 754**: Floating-point arithmetic standard

---

**End of Monte Carlo Documentation**

**Related Documentation**:

- [01-overview.md](./01-overview.md): Executive summary and key concepts
- [02-simulation.md](./02-simulation.md): Detailed algorithm walkthrough
- [03-statistics.md](./03-statistics.md): Statistical properties and risk
  metrics
