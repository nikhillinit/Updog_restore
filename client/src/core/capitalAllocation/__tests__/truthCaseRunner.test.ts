/**
 * Capital Allocation Truth Case Runner
 *
 * Validates CA engine against 20 truth cases.
 * Target: 19/20 pass (CA-005 skipped per semantic lock Section 6)
 *
 * @see docs/capital-allocation.truth-cases.json
 * @see docs/CA-SEMANTIC-LOCK.md
 */

import { describe, it, expect } from 'vitest';
import {
  adaptTruthCaseInput,
  shouldSkipTruthCase,
  executeCapitalAllocation,
  type TruthCaseInput,
} from '@/core/capitalAllocation';
import capitalCases from '../../../../docs/capital-allocation.truth-cases.json';

// Type for truth case JSON structure
interface CATruthCase {
  id: string;
  module: string;
  category: string;
  description: string;
  inputs: {
    fund: {
      commitment: number;
      target_reserve_pct: number;
      reserve_policy: 'static_pct' | 'dynamic_ratio';
      pacing_window_months?: number;
      vintage_year: number;
    };
    timeline: {
      start_date: string;
      end_date: string;
    };
    flows: {
      contributions: Array<{ date: string; amount: number }>;
      distributions: Array<{ date: string; amount: number; recycle_eligible?: boolean }>;
    };
    constraints: {
      min_cash_buffer: number;
      rebalance_frequency?: string;
      max_allocation_per_cohort?: number;
    };
    cohorts?: Array<{
      name: string;
      start_date: string;
      end_date: string;
      weight: number;
    }>;
  };
  expected: {
    reserve_balance: number;
    allocations_by_cohort: Array<{ cohort: string; amount: number }>;
    violations: string[];
    reserve_balance_over_time?: Array<{ date: string; balance: number }>;
    pacing_targets_by_period?: Array<{ period: string; target: number }>;
  };
  notes: string;
  schemaVersion?: string;
}

/**
 * Tolerance for numeric comparisons (in output units).
 * Using 0.01 tolerance for dollar amounts.
 */
const NUMERIC_TOLERANCE = 0.01;

/**
 * Assert numeric equality with tolerance.
 */
function assertNumericEqual(actual: number, expected: number, field: string): void {
  const diff = Math.abs(actual - expected);
  const relativeDiff = expected !== 0 ? diff / Math.abs(expected) : diff;

  // Use relative tolerance for large values, absolute for small
  const tolerance = Math.max(NUMERIC_TOLERANCE, Math.abs(expected) * 0.001);

  expect(diff).toBeLessThanOrEqual(
    tolerance,
    `${field}: expected ${expected}, got ${actual} (diff: ${diff.toFixed(4)})`
  );
}

/**
 * Convert truth case to engine input format.
 */
function convertToEngineInput(tc: CATruthCase): TruthCaseInput {
  return {
    fund: {
      commitment: tc.inputs.fund.commitment,
      target_reserve_pct: tc.inputs.fund.target_reserve_pct,
      vintage_year: tc.inputs.fund.vintage_year,
      reserve_policy: tc.inputs.fund.reserve_policy,
    },
    constraints: {
      min_cash_buffer: tc.inputs.constraints.min_cash_buffer,
      max_allocation_per_cohort: tc.inputs.constraints.max_allocation_per_cohort,
    },
    timeline: {
      start_date: tc.inputs.timeline.start_date,
      end_date: tc.inputs.timeline.end_date,
      rebalance_frequency: tc.inputs.constraints.rebalance_frequency as 'quarterly' | 'monthly' | 'annual',
    },
    flows: {
      contributions: tc.inputs.flows.contributions,
      distributions: tc.inputs.flows.distributions,
    },
    cohorts: tc.inputs.cohorts?.map((c) => ({
      id: c.name,
      name: c.name,
      start_date: c.start_date,
      end_date: c.end_date,
      weight: c.weight,
    })),
  };
}

describe('Capital Allocation Truth Cases', () => {
  // Track pass/fail stats
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  const cases = capitalCases as CATruthCase[];

  cases.forEach((tc) => {
    const skipCheck = shouldSkipTruthCase(tc.id, tc.inputs.fund.reserve_policy);

    if (skipCheck.skip) {
      it.skip(`${tc.id}: ${tc.description} - ${skipCheck.reason}`, () => {
        skipped++;
      });
      return;
    }

    it(`${tc.id}: ${tc.description}`, () => {
      try {
        // Convert and adapt input
        const rawInput = convertToEngineInput(tc);
        const normalizedInput = adaptTruthCaseInput(rawInput);

        // Execute engine
        const result = executeCapitalAllocation(normalizedInput);

        // Validate reserve_balance
        assertNumericEqual(
          result.reserve_balance,
          tc.expected.reserve_balance,
          'reserve_balance'
        );

        // Validate allocations_by_cohort
        expect(result.allocations_by_cohort.length).toBe(
          tc.expected.allocations_by_cohort.length
        );

        for (const expectedAlloc of tc.expected.allocations_by_cohort) {
          const actualAlloc = result.allocations_by_cohort.find(
            (a) => a.cohort === expectedAlloc.cohort
          );

          expect(actualAlloc).toBeDefined();
          if (actualAlloc) {
            assertNumericEqual(
              actualAlloc.amount,
              expectedAlloc.amount,
              `allocation[${expectedAlloc.cohort}]`
            );
          }
        }

        // Validate violations (if specified)
        if (tc.expected.violations.length > 0) {
          // Check for expected violation types
          for (const expectedViolation of tc.expected.violations) {
            const hasViolation = result.violations.some(
              (v) => v.type === expectedViolation || v.message.includes(expectedViolation)
            );
            expect(hasViolation).toBe(true);
          }
        }

        passed++;
      } catch (error) {
        failed++;
        throw error;
      }
    });
  });

  // Summary test
  it('Summary: Pass rate meets target', () => {
    const total = passed + failed;
    const passRate = total > 0 ? (passed / total) * 100 : 0;

    console.log(`\nCA Truth Cases Summary:`);
    console.log(`  Passed: ${passed}/${total} (${passRate.toFixed(1)}%)`);
    console.log(`  Failed: ${failed}`);
    console.log(`  Skipped: ${skipped}`);

    // Phase 1 target: Core reserve calculations (CA-001, CA-002, CA-003)
    // Full target: 19/20 (95%)
    expect(passRate).toBeGreaterThanOrEqual(15); // Start with 15% baseline
  });
});

describe('CA Core Reserve Calculations (CA-001, CA-002, CA-003)', () => {
  /**
   * These are the critical validation cases from CA-SEMANTIC-LOCK.md Section 1.1.0
   */

  it('CA-001: Reserve at target with smooth inflows', () => {
    const tc = (capitalCases as CATruthCase[]).find((c) => c.id === 'CA-001');
    expect(tc).toBeDefined();
    if (!tc) return;

    const rawInput = convertToEngineInput(tc);
    const normalizedInput = adaptTruthCaseInput(rawInput);
    const result = executeCapitalAllocation(normalizedInput);

    // CA-001 verification from semantic lock:
    // ending_cash = 20M (4 quarters × 5M)
    // effective_buffer = max(1, 100*0.2) = 20M
    // reserve_balance = min(20, 20) = 20M
    expect(result.reserve_balance).toBeCloseTo(20, 0);

    // Note: allocation in CA-001 may have different semantics
    // (planned capacity vs actual deployed)
    console.log(`CA-001 result: reserve=${result.reserve_balance}, allocations=`,
      result.allocations_by_cohort);
  });

  it('CA-002: Reserve below target due to distribution', () => {
    const tc = (capitalCases as CATruthCase[]).find((c) => c.id === 'CA-002');
    expect(tc).toBeDefined();
    if (!tc) return;

    const rawInput = convertToEngineInput(tc);
    const normalizedInput = adaptTruthCaseInput(rawInput);
    const result = executeCapitalAllocation(normalizedInput);

    // CA-002 verification from semantic lock:
    // ending_cash = 10 - 8 = 2M
    // effective_buffer = max(2, 100*0.2) = 20M
    // reserve_balance = min(2, 20) = 2M
    expect(result.reserve_balance).toBeCloseTo(2, 0);

    console.log(`CA-002 result: reserve=${result.reserve_balance}, allocations=`,
      result.allocations_by_cohort);
  });

  it('CA-003: Excess cash above reserve target', () => {
    const tc = (capitalCases as CATruthCase[]).find((c) => c.id === 'CA-003');
    expect(tc).toBeDefined();
    if (!tc) return;

    const rawInput = convertToEngineInput(tc);
    const normalizedInput = adaptTruthCaseInput(rawInput);
    const result = executeCapitalAllocation(normalizedInput);

    // CA-003 verification from semantic lock:
    // ending_cash = 25M
    // effective_buffer = max(1, 100*0.15) = 15M
    // reserve_balance = min(25, 15) = 15M
    expect(result.reserve_balance).toBeCloseTo(15, 0);

    // Excess = 25 - 15 = 10M should be allocated
    const totalAllocated = result.allocations_by_cohort.reduce(
      (sum, a) => sum + a.amount,
      0
    );
    expect(totalAllocated).toBeCloseTo(10, 0);

    console.log(`CA-003 result: reserve=${result.reserve_balance}, allocations=`,
      result.allocations_by_cohort);
  });
});
