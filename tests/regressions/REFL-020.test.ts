// REFLECTION_ID: REFL-020
// This test is linked to: docs/skills/REFL-020-large-iteration-tests-need-explicit-timeouts.md
// Do not rename without updating the reflection's test_file field.

import { describe, expect, it } from 'vitest';

interface IterationHeavyTest {
  items: number;
  assertionsPerItem: number;
  estimatedRuntimeMs: number;
  explicitTimeoutMs?: number;
}

function totalAssertions(testCase: IterationHeavyTest): number {
  return testCase.items * testCase.assertionsPerItem;
}

function requiresExplicitTimeout(testCase: IterationHeavyTest): boolean {
  return testCase.items > 1000 || totalAssertions(testCase) > 5000;
}

function recommendedTimeoutMs(testCase: IterationHeavyTest): number {
  if (!requiresExplicitTimeout(testCase)) {
    return 5000;
  }
  return Math.max(15000, testCase.estimatedRuntimeMs * 3);
}

function isSafelyConfigured(testCase: IterationHeavyTest): boolean {
  if (!requiresExplicitTimeout(testCase)) {
    return true;
  }
  return (testCase.explicitTimeoutMs ?? 0) >= recommendedTimeoutMs(testCase);
}

describe('REFL-020: Large-Iteration Tests Need Explicit Timeouts', () => {
  it('flags large iteration tests without an explicit timeout as unsafe', () => {
    const workload: IterationHeavyTest = {
      items: 25000,
      assertionsPerItem: 5,
      estimatedRuntimeMs: 4000,
    };

    expect(requiresExplicitTimeout(workload)).toBe(true);
    expect(totalAssertions(workload)).toBe(125000);
    expect(recommendedTimeoutMs(workload)).toBe(15000);
    expect(isSafelyConfigured(workload)).toBe(false);
  });

  it('accepts explicit timeout overrides for heavy workloads', () => {
    const workload: IterationHeavyTest = {
      items: 25000,
      assertionsPerItem: 5,
      estimatedRuntimeMs: 4000,
      explicitTimeoutMs: 15000,
    };

    expect(isSafelyConfigured(workload)).toBe(true);
  });

  it('does not require an override for small fast tests', () => {
    const workload: IterationHeavyTest = {
      items: 100,
      assertionsPerItem: 3,
      estimatedRuntimeMs: 300,
    };

    expect(requiresExplicitTimeout(workload)).toBe(false);
    expect(recommendedTimeoutMs(workload)).toBe(5000);
    expect(isSafelyConfigured(workload)).toBe(true);
  });

  it('also flags assertion-heavy tests even when iteration count is below 1000', () => {
    const workload: IterationHeavyTest = {
      items: 900,
      assertionsPerItem: 6,
      estimatedRuntimeMs: 6000,
      explicitTimeoutMs: 15000,
    };

    expect(totalAssertions(workload)).toBe(5400);
    expect(requiresExplicitTimeout(workload)).toBe(true);
    expect(recommendedTimeoutMs(workload)).toBe(18000);
    expect(isSafelyConfigured(workload)).toBe(false);
  });
});
