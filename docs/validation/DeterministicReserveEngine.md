---
status: ACTIVE
last_updated: 2026-01-19
---

# DeterministicReserveEngine - Property-Based Testing Invariants

## Overview

This document describes the 5 core invariants tested through property-based testing for the `DeterministicReserveEngine`. These invariants are mathematical properties that **must hold true for all valid inputs**, ensuring the correctness and reliability of the reserve allocation algorithm.

Property-based testing uses the `fast-check` library to generate hundreds of random but valid test cases, verifying that these invariants always hold regardless of input variations.

---

## The 5 Core Invariants

### 1. Conservation of Reserves

**Invariant:** The sum of all allocated reserves must never exceed the total available reserves.

```
∑(allocations) ≤ availableReserves
```

**Why it matters:**
- Prevents over-allocation of capital
- Ensures the fund doesn't commit more money than it has
- Critical for financial integrity and regulatory compliance

**Test implementation:**
```typescript
const totalAllocated = result.allocations.reduce(
  (sum, allocation) => sum + allocation.recommendedAllocation,
  0
);
expect(totalAllocated).toBeLessThanOrEqual(input.availableReserves + TOLERANCE);
```

**Business impact:**
A violation would mean the GP commits to follow-on investments exceeding available cash, leading to either fund liquidity crisis or inability to honor commitments.

---

### 2. Non-negativity

**Invariant:** All reserve allocations must be non-negative.

```
∀ allocation ∈ allocations: allocation.recommendedAllocation ≥ 0
```

**Why it matters:**
- Negative allocations are financially meaningless
- Ensures all outputs are valid investment amounts
- Prevents arithmetic errors from propagating

**Test implementation:**
```typescript
for (const allocation of result.allocations) {
  expect(allocation.recommendedAllocation).toBeGreaterThanOrEqual(0);
}
expect(result.unallocatedReserves).toBeGreaterThanOrEqual(0);
```

**Business impact:**
A negative allocation would represent an invalid financial instrument and could cause downstream calculation errors in portfolio modeling.

---

### 3. Monotonicity (Priority Ordering)

**Invariant:** Companies are ranked by allocation priority, with higher-priority companies (lower priority numbers) appearing first.

```
∀ i < j: allocations[i].priority ≤ allocations[j].priority
```

**Why it matters:**
- Ensures the ranking algorithm produces consistent ordering
- Higher expected returns should get higher priority
- Validates the "Exit MOIC on Planned Reserves" algorithm is working correctly

**Test implementation:**
```typescript
for (let i = 0; i < allocations.length - 1; i++) {
  const current = allocations[i];
  const next = allocations[i + 1];
  expect(current.priority).toBeLessThanOrEqual(next.priority);
}
```

**Business impact:**
If violated, the engine might recommend investing in lower-return companies before higher-return ones, directly reducing fund performance and LP returns.

---

### 4. Graduation Probability Impact

**Invariant:** Graduation probability is properly factored into allocations, with all probabilities in the valid range [0, 1].

```
∀ allocation ∈ allocations:
  0 ≤ allocation.calculationMetadata.graduationProbability ≤ 1
  allocation.expectedMOIC > 0
  allocation.expectedValue > 0
```

**Why it matters:**
- Graduation probability is a key risk factor in venture capital
- Ensures the model accounts for stage-specific success rates
- Validates that expected returns are positive and realistic

**Test implementation:**
```typescript
for (const allocation of result.allocations) {
  expect(metadata.graduationProbability).toBeGreaterThanOrEqual(0);
  expect(metadata.graduationProbability).toBeLessThanOrEqual(1);
  expect(allocation.expectedMOIC).toBeGreaterThan(0);
  expect(allocation.expectedValue).toBeGreaterThan(0);
}
```

**Business impact:**
Invalid probabilities or negative expected values would indicate a fundamental flaw in the risk model, leading to poor allocation decisions and potential fund underperformance.

---

### 5. Idempotence (Deterministic Results)

**Invariant:** Running the calculation multiple times with identical inputs produces identical results.

```
∀ input: calculate(input) = calculate(input)
```

**Why it matters:**
- Ensures reproducibility for auditing and compliance
- Allows caching of results for performance optimization
- Critical for testing and debugging
- Enables "what-if" scenario comparisons

**Test implementation:**
```typescript
const result1 = await engine.calculateOptimalReserveAllocation(input);
const result2 = await engine.calculateOptimalReserveAllocation(input);

expect(result1.allocations.length).toBe(result2.allocations.length);
expect(result1.inputSummary.totalAllocated).toBeCloseTo(
  result2.inputSummary.totalAllocated,
  2
);
expect(result1.metadata.deterministicHash).toBe(result2.metadata.deterministicHash);
```

**Business impact:**
Non-deterministic results would make it impossible to reproduce analyses for LP reporting, regulatory compliance, or strategic decision-making.

---

## Additional Properties Tested

Beyond the 5 core invariants, we also test:

### 6. Portfolio Metrics Consistency
Portfolio-level metrics (expected value, MOIC, diversification) must be mathematically consistent with individual allocations.

### 7. Minimum Allocation Threshold
All allocations must respect the configured minimum threshold (e.g., $50,000).

### 8. Maximum Single Allocation
No single allocation should exceed the configured maximum limit.

---

## Property-Based Testing Approach

### Why Property-Based Testing?

Traditional unit tests check specific examples:
```typescript
// Example-based test
expect(calculateReserves([company1, company2], 1000000)).toEqual(expected);
```

Property-based tests check mathematical properties across thousands of random inputs:
```typescript
// Property-based test
fc.assert(fc.property(
  arbitraryInput,
  (input) => {
    const result = calculateReserves(input);
    expect(sumAllocations(result)).toBeLessThanOrEqual(input.available);
  }
));
```

### Benefits

1. **Broader coverage**: Tests thousands of edge cases automatically
2. **Shrinking**: When a test fails, fast-check automatically finds the minimal failing case
3. **Confidence**: Proves properties hold for all valid inputs, not just examples
4. **Regression detection**: Catches bugs that example tests might miss
5. **Documentation**: Properties serve as executable specifications

### Test Configuration

```typescript
fc.assert(
  fc.property(reserveAllocationInputArbitrary, async (input) => {
    // Test the invariant
  }),
  {
    numRuns: 50,      // Run 50 random test cases
    timeout: 60000    // 60 second timeout
  }
);
```

---

## Running the Tests

```bash
# Run all tests including property-based tests
npm test

# Run only property-based tests
npx vitest run reserves.property.test.ts

# Run with UI for debugging
npx vitest --ui reserves.property.test.ts

# Run with coverage
npx vitest run --coverage reserves.property.test.ts
```

---

## Interpreting Test Failures

When a property test fails, fast-check provides:

1. **The failing input**: The random data that caused the invariant to break
2. **Shrunk input**: The minimal version of the input that still fails
3. **Stack trace**: Where the assertion failed

Example failure output:
```
Property failed after 23 attempts
{ seed: 42, path: "23", endOnFailure: true }
Counterexample: {
  portfolio: [...],
  availableReserves: 5000000,
  totalAllocated: 5000001  // Violation!
}
Shrunk 15 times
```

---

## Mathematical Foundations

### The Reserve Allocation Formula

The core algorithm calculates an allocation score for each company:

```
AllocationScore = (ProjectedMOIC × GraduationProbability × RiskAdjustment) / CurrentValuation
```

Where:
- **ProjectedMOIC**: Expected multiple on invested capital at exit
- **GraduationProbability**: Likelihood of progressing to next funding stage (0-1)
- **RiskAdjustment**: (1 - failureRate) from stage strategy
- **CurrentValuation**: Company's current valuation

### Constraint Satisfaction

The engine must satisfy multiple constraints simultaneously:

1. Total allocation ≤ available reserves
2. Each allocation ≥ minimum threshold
3. Each allocation ≤ maximum single allocation
4. Portfolio concentration ≤ maximum concentration ratio
5. Sum of portfolio weights ≤ 1.0

Property-based testing ensures these constraints are always satisfied.

---

## Future Enhancements

Potential additional properties to test:

1. **Diversification monotonicity**: Enabling diversification should never decrease the diversification index
2. **Risk adjustment impact**: Enabling risk adjustments should reduce allocations to higher-risk companies
3. **Concentration limits**: Portfolio concentration should never exceed specified limits
4. **Time horizon sensitivity**: Longer time horizons should favor earlier-stage companies
5. **Cache consistency**: Cached results should match freshly calculated results

---

## References

- [fast-check documentation](https://fast-check.dev/)
- [Property-Based Testing in TypeScript](https://github.com/dubzzz/fast-check/blob/main/documentation/Tutorials.md)
- Press On Ventures Fund Strategy Playbook (internal)
- "Exit MOIC on Planned Reserves" industry standard algorithm

---

## Maintenance Notes

**Last updated:** 2025-10-05
**Test file:** `client/src/core/reserves/__tests__/reserves.property.test.ts`
**Test coverage:** 8 properties, 350+ random test cases per run
**Average test duration:** ~45 seconds (full suite)

**Review schedule:** Quarterly review to add new properties as engine evolves.
