# Property-Based Testing Guide

This guide explains how to use property-based testing to ensure mathematical invariants and business rules hold across all possible inputs.

## Overview

Property-based testing automatically generates test inputs to verify that certain properties always hold true. This is particularly valuable for:
- Mathematical calculations (Monte Carlo simulations, financial models)
- Data transformations
- Business rule validation
- Edge case discovery

## Technology Stack

- **fast-check**: Property-based testing framework
- **vitest**: Test runner and assertions
- **Seeded snapshots**: Deterministic regression testing

## Property Testing Structure

### Basic Property Test

```typescript
import * as fc from 'fast-check';

fc.assert(
  fc.property(
    // Input generators
    fc.record({
      fundSize: fc.float({ min: 1e6, max: 1e10 }),
      deploymentPeriod: fc.integer({ min: 4, max: 40 })
    }),
    // Property to verify
    (input) => {
      const result = calculate(input);
      return result.value >= 0; // Invariant
    }
  )
);
```

### Key Concepts

1. **Generators**: Create random test inputs
   - `fc.float()`: Floating-point numbers
   - `fc.integer()`: Integers
   - `fc.record()`: Objects with properties
   - `fc.array()`: Arrays of values
   - `fc.oneof()`: Choose from alternatives

2. **Properties**: Conditions that must always be true
   - Mathematical invariants
   - Business rules
   - Ordering relationships
   - Range constraints

3. **Shrinking**: When a test fails, fast-check finds the minimal failing case

## Monte Carlo Simulation Properties

Our Monte Carlo simulations maintain these invariants:

### Financial Metrics
```typescript
// MOIC (Multiple on Invested Capital) must be non-negative
expect(result.moic).toBeGreaterThanOrEqual(0);

// IRR (Internal Rate of Return) must be greater than -100%
expect(result.irr).toBeGreaterThan(-1);

// TVPI >= DPI (Total Value >= Distributed Value)
expect(result.tvpi).toBeGreaterThanOrEqual(result.dpi);
```

### Statistical Properties
```typescript
// Percentiles must be ordered
expect(percentiles['10']).toBeLessThanOrEqual(percentiles['25']);
expect(percentiles['25']).toBeLessThanOrEqual(percentiles['50']);
expect(percentiles['50']).toBeLessThanOrEqual(percentiles['75']);
expect(percentiles['75']).toBeLessThanOrEqual(percentiles['90']);

// Median equals 50th percentile
expect(median).toBeCloseTo(percentiles['50'], 3);
```

## Seeded Snapshot Testing

Seeded tests ensure deterministic results for regression detection:

### Creating Seeded Tests

```typescript
function runSeededSimulation(seed: number) {
  const prng = createPRNG(seed);
  // Use prng() instead of Math.random()
  return simulate(prng);
}

// Test with fixed seed
const result = runSeededSimulation(12345);
expect(result.value).toBeCloseTo(expectedValue, epsilon);
```

### Pseudo-Random Number Generator

```typescript
function createPRNG(seed: number) {
  let state = seed;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}
```

## Test Scenarios

### 1. Conservative Fund
- Fund Size: $50M
- Target Multiple: 2.0x
- Reserve Ratio: 50%
- Expected MOIC: 1.8-2.2x

### 2. Aggressive Growth Fund
- Fund Size: $100M
- Target Multiple: 3.5x
- Reserve Ratio: 30%
- Expected MOIC: 3.0-4.0x

### 3. Small Seed Fund
- Fund Size: $10M
- Target Multiple: 5.0x
- Reserve Ratio: 40%
- Expected MOIC: 4.0-6.0x

### 4. Large Buyout Fund
- Fund Size: $500M
- Target Multiple: 1.8x
- Reserve Ratio: 35%
- Expected MOIC: 1.5-2.1x

## Running Tests

### Run all property tests
```bash
npm test -- tests/property/
```

### Run with verbose output
```bash
npm test -- tests/property/ --reporter=verbose
```

### Run seeded snapshots
```bash
npm test -- tests/snapshots/
```

### Generate coverage report
```bash
npm test -- --coverage tests/property/ tests/snapshots/
```

## Adding New Properties

1. **Identify Invariants**
   ```typescript
   // What must always be true?
   // Example: Total fees cannot exceed fund size
   ```

2. **Create Generators**
   ```typescript
   const fundGenerator = fc.record({
     size: fc.float({ min: 1e6, max: 1e9 }),
     fees: fc.float({ min: 0, max: 0.05 })
   });
   ```

3. **Write Property Test**
   ```typescript
   fc.assert(
     fc.property(fundGenerator, (fund) => {
       const totalFees = calculateFees(fund);
       return totalFees <= fund.size;
     })
   );
   ```

4. **Add Seeded Regression**
   ```typescript
   it('should match baseline', () => {
     const result = runWithSeed(BASELINE_SEED);
     expect(result).toMatchSnapshot();
   });
   ```

## Best Practices

### DO
- Test mathematical invariants
- Use appropriate ranges for generators
- Add seeded tests for critical scenarios
- Document discovered edge cases
- Use shrinking to find minimal failures

### DON'T
- Generate invalid inputs (use constraints)
- Test implementation details
- Use random seeds in CI (be deterministic)
- Ignore failing properties
- Skip edge cases

## Debugging Failures

When a property test fails:

1. **Check the counterexample**
   ```
   Property failed after 3 tests
   Counterexample: { fundSize: 1000000, deploymentPeriod: 4 }
   ```

2. **Reproduce with seed**
   ```typescript
   fc.assert(property, { seed: 1234, path: "3:5:2" });
   ```

3. **Add regression test**
   ```typescript
   it('should handle edge case from property test', () => {
     const input = { fundSize: 1000000, deploymentPeriod: 4 };
     const result = calculate(input);
     expect(result.moic).toBeGreaterThan(0);
   });
   ```

## Performance Considerations

- **numRuns**: Default 100, increase for critical properties
- **timeout**: Set appropriate timeouts for complex simulations
- **maxSkipsPerRun**: Limit filtered test cases
- **interruptAfterTimeLimit**: Stop long-running tests

```typescript
fc.assert(property, {
  numRuns: 1000,        // More thorough testing
  timeout: 5000,        // 5 second timeout
  verbose: true,        // Show progress
  examples: [           // Always test these
    { fundSize: 1e6 },
    { fundSize: 1e9 }
  ]
});
```

## Integration with CI/CD

### GitHub Actions
```yaml
- name: Run Property Tests
  run: |
    npm test -- tests/property/ --coverage
    npm test -- tests/snapshots/
  env:
    CI: true
```

### Pre-commit Hook
```json
{
  "husky": {
    "hooks": {
      "pre-commit": "npm test -- tests/property/ --bail"
    }
  }
}
```

## Monitoring and Metrics

Track property test metrics:
- Number of generated cases
- Shrinking efficiency
- Edge cases discovered
- Performance impact

## Summary

Property-based testing provides:
- Automatic edge case discovery
- Mathematical correctness guarantees
- Regression prevention through snapshots
- Confidence in business logic

For questions or issues, see the [test documentation](./TESTING.md) or contact the development team.