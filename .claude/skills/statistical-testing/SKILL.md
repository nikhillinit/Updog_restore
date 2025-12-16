# Statistical Testing and Simulation Validation

## Overview

This skill provides patterns for testing probabilistic code (Monte Carlo simulations, statistical estimates, random sampling) in a way that is both rigorous and stable in CI. The goal is to eliminate flaky tests while maintaining meaningful statistical assertions.

## Decision Tree: Which Testing Approach?

```
                    +-----------------------------+
                    | What are you testing?       |
                    +-------------+---------------+
                                  |
              +-------------------+-------------------+
              v                   v                   v
    +-----------------+  +-----------------+  +-----------------+
    | Control flow /  |  | Distributional  |  | Edge cases /    |
    | specific output |  | properties      |  | robustness      |
    +--------+--------+  +--------+--------+  +--------+--------+
             |                    |                    |
             v                    v                    v
    +-----------------+  +-----------------+  +-----------------+
    | DETERMINISTIC   |  | SEEDED          |  | RANDOM-SEED     |
    | MOCK            |  | STATISTICAL     |  | DISTRIBUTION    |
    +-----------------+  +-----------------+  +-----------------+
```

### Use Deterministic Mocking When:
- Testing control flow, not statistical properties
- Exact output values matter for the test
- Reproducing a specific edge case
- Testing error handling paths

### Use Seeded Statistical Tests When:
- Validating distributional properties (mean, variance, percentiles)
- Need reproducibility for debugging failures
- CI stability is critical
- Testing convergence behavior

### Use Random-Seed Distribution Tests When:
- Exploring edge cases in development (not CI)
- Validating robustness across seeds
- Complement to seeded tests, not replacement

## Choosing N for Statistical Assertions

### For Proportions (e.g., "50% of simulations should be profitable")

| Desired Precision | Minimum N | Example |
|-------------------|-----------|---------|
| +/-10% (rough) | 100 | Quick sanity check |
| +/-5% (moderate) | 400 | Standard CI test |
| +/-3% (good) | 1,000 | Important assertions |
| +/-1% (precise) | 10,000 | Critical validations |

### For Means (e.g., "average return should be ~7%")

Depends on variance. Use power analysis or empirical calibration.

## Confidence Interval Patterns

### Pattern 1: Clopper-Pearson for Proportions
Use when testing binary outcomes (success/failure, profit/loss).

### Pattern 2: Bootstrap for Complex Statistics
Use when testing medians, percentiles, or custom statistics.

### Pattern 3: Tolerance Bands for Time Series
Use when testing simulated paths over time.

## Anti-Patterns

### Point Estimate Assertion (BAD)
```typescript
// BAD: Asserts exact value from random process
expect(mean(results)).toBe(0.5); // Will fail ~always
```

### Tight Tolerance with Small N (BAD)
```typescript
// BAD: N=100 can't support 2-decimal precision
expect(mean(results)).toBeCloseTo(0.5, 2); // Flaky
```

### Random Seed in CI (BAD)
```typescript
// BAD: Different seed each run = non-reproducible failures
const results = runSimulations({ n: 1000 }); // No seed!
```

## Seed Management Strategy

### Development Seeds vs. CI Seeds

```typescript
// config/test-seeds.ts
export const SEEDS = {
  // CI seeds: fixed, documented, produce known-good results
  ci: {
    monteCarlo: 42,
    portfolioSim: 123,
    stressTest: 7777,
  },

  // Development: use current timestamp for exploration
  development: () => Date.now(),
};
```

### Documenting Seed Behavior

Document expected statistical properties for each seed to catch when simulation logic changes.

## Property-Based Testing for Invariants

Use for properties that must hold regardless of random outcomes:

```typescript
import * as fc from 'fast-check';

test('portfolio value is always non-negative', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 100 }),
      fc.integer({ min: 100, max: 10000 }),
      fc.integer({ min: 0, max: 999999 }),
      (periods, n, seed) => {
        const results = runSimulations({ periods, n, seed });
        return results.every(r => r.finalValue >= 0);
      }
    ),
    { numRuns: 50 }
  );
});
```

## Integration with Phoenix Workflows

When Monte Carlo or statistical code changes:

1. **Before merge**: Run seeded statistical tests (standard CI)
2. **After merge**: Run random-seed distribution tests (nightly job)
3. **On failure**: Check if seed behavior changed, recalibrate if needed
4. **Document**: Update seed documentation with new expected values
