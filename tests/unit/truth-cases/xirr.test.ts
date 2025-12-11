/**
 * XIRR Truth Cases - 50 Scenarios
 *
 * Validates xirrNewtonBisection() against 50 Excel-verified test cases covering:
 * - Baseline cases (simple returns, multiple rounds)
 * - Edge cases (invalid inputs, convergence failures)
 * - Business patterns (VC fund lifecycles, follow-on investments)
 * - Algorithm verification (Newton, Bisection, Brent fallback)
 *
 * Truth cases mechanically validated against JSON schema to ensure structural consistency.
 * Numeric assertions use 6-decimal precision (toBeCloseTo) per Excel parity requirement.
 *
 * @see docs/xirr.truth-cases.json - 50 canonical test scenarios
 * @see docs/adr/ADR-005-xirr-excel-parity.md - Excel parity contract
 */

import { describe, it, expect } from 'vitest';
import { xirrNewtonBisection } from '@/lib/finance/xirr';
import type { CashFlow } from '@/lib/finance/xirr';
import { assertNumericField } from './helpers';
import xirrCases from '../../../docs/xirr.truth-cases.json';

// Type definitions for truth case structure
interface TruthCaseInput {
  cashflows: Array<{
    date: string;
    amount: number;
  }>;
  config: {
    tolerance: number;
    strategy: string;
    maxIterations?: number;
  };
}

interface TruthCaseExpected {
  irr: number | null;
  converged: boolean;
  algorithm: string | null;
  excelParity: boolean;
}

interface TruthCase {
  scenario: string;
  tags?: string[];
  notes?: string;
  input: TruthCaseInput;
  expected: TruthCaseExpected;
  category?: string;
}

describe('XIRR Truth Cases (50 scenarios)', () => {
  xirrCases.forEach((testCase: TruthCase) => {
    const { scenario, tags, notes, input, expected } = testCase;

    it(`${scenario}: ${notes || tags?.join(', ')}`, () => {
      // Convert JSON dates to Date objects and map to CashFlow interface
      const cashFlows: CashFlow[] = input.cashflows.map((cf) => ({
        date: new Date(cf.date),
        amount: cf.amount,
      }));

      // Execute XIRR calculation (production code)
      const strategy = (input.config.strategy as 'Hybrid' | 'Newton' | 'Bisection') ?? 'Hybrid';
      const result = xirrNewtonBisection(
        cashFlows,
        0.1, // Default guess
        input.config.tolerance,
        input.config.maxIterations ?? 100,
        strategy
      );

      // Assertions: IRR value
      if (expected.irr === null) {
        // Cases with no mathematical solution (NPV has no zero crossing)
        // or invalid inputs should return null
        expect(result.irr).toBeNull();
        expect(result.converged).toBe(false);

        // If solutionStatus is present, this is a documented unsolvable case
        // (e.g., scenarios 7 & 19: NO_SOLUTION_IN_RANGE)
        if (
          'solutionStatus' in expected &&
          (expected as { solutionStatus?: string }).solutionStatus === 'NO_SOLUTION_IN_RANGE'
        ) {
          // Engine correctly identified mathematically unsolvable case
          // Excel XIRR() also returns #NUM! for these scenarios
        }
      } else {
        // Valid cases: assert numeric precision (6 decimals)
        expect(result.irr).not.toBeNull();
        assertNumericField(result.irr!, expected.irr, 6);
        expect(result.converged).toBe(true);
      }

      // Optional: Algorithm verification (when expected is not null)
      if (expected.algorithm !== null && expected.excelParity) {
        // Map result.method to expected algorithm format
        const algorithmMap: Record<string, string> = {
          newton: 'Newton',
          bisection: 'Bisection',
          brent: 'Brent',
          none: 'none',
        };
        const actualAlgorithm = algorithmMap[result.method] || result.method;

        // Note: Some scenarios may use different algorithms due to convergence fallback
        // Only assert exact match for Excel-parity baseline cases
        if (tags?.includes('baseline')) {
          expect(actualAlgorithm).toBe(expected.algorithm);
        }
      }
    });
  });

  // Summary test: Report coverage
  it('truth table covers all required categories', () => {
    const allTags = xirrCases.flatMap((tc: TruthCase) => tc.tags || []);

    const tagSet = new Set(allTags);

    // Required categories per Phoenix v2.31 plan
    const requiredCategories = ['baseline', 'basic', 'edge', 'convergence', 'business'];

    requiredCategories.forEach((category) => {
      expect(tagSet.has(category)).toBe(true);
    });

    // Report total scenarios

    expect(xirrCases.length).toBe(50);
  });
});
