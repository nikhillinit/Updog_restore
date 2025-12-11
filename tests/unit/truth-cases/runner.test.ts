/**
 * Truth-Case Unified Runner - Phoenix Phase 0 (v2.31)
 *
 * Validates all 104 truth-case scenarios across 6 calculation modules:
 * - XIRR (25 scenarios): Active execution with Excel parity assertions
 * - Waterfall-Tier (15 scenarios): Structural validation (Phase 1A)
 * - Waterfall-Ledger (14 scenarios): Structural validation (Phase 1A)
 * - Fees (10 scenarios): Load + count only (Phase 1B+)
 * - Capital Allocation (20 scenarios): Load + count only (Phase 1B+)
 * - Exit Recycling (20 scenarios): Load + count only (Phase 1B+)
 *
 * Phase 0 Scope: Infrastructure + XIRR baseline (17/25 pass = 68%)
 * Phase 1A Gate: 80% XIRR pass rate (20/25) to unlock Waterfall modules
 *
 * @see docs/PHOENIX-EXECUTION-PLAN-v2.31.md - Canonical specification
 * @see docs/phase0-xirr-v2.31-baseline.txt - Initial XIRR baseline
 */

import { describe, it, expect } from 'vitest';
import { xirrNewtonBisection } from '@/lib/finance/xirr';
import type { CashFlow } from '@/lib/finance/xirr';
import { assertNumericField } from './helpers';

// Import all truth-case JSON files (v2.31 validated)
import xirrCases from '../../../docs/xirr.truth-cases.json';
import waterfallTierCases from '../../../docs/waterfall.truth-cases.json';
import waterfallLedgerCases from '../../../docs/waterfall-ledger.truth-cases.json';
import feesCases from '../../../docs/fees.truth-cases.json';
import capitalCases from '../../../docs/capital-allocation.truth-cases.json';
import exitCases from '../../../docs/exit-recycling.truth-cases.json';

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
  solutionStatus?: string;
}

interface TruthCase {
  scenario: string;
  tags?: string[];
  notes?: string;
  input: TruthCaseInput;
  expected: TruthCaseExpected;
  category?: string;
}

// [PHASE 0] XIRR - Active Execution (Excel Parity)
describe('Truth Cases: XIRR (Phase 0)', () => {
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
        if (expected.solutionStatus === 'NO_SOLUTION_IN_RANGE') {
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

  // Summary test: XIRR coverage and pass rate
  it('XIRR truth table summary', () => {
    const allTags = xirrCases.flatMap((tc: TruthCase) => tc.tags || []);
    const tagSet = new Set(allTags);

    // Required categories per Phoenix v2.31 plan
    const requiredCategories = ['baseline', 'basic', 'edge', 'convergence', 'business'];

    requiredCategories.forEach((category) => {
      expect(tagSet.has(category)).toBe(true);
    });

    // Report actual scenario count (v2.31 reality: 25, not 50)
    expect(xirrCases.length).toBeGreaterThan(0);
  });
});

// [PHASE 1A] Waterfall-Tier - Structural Validation Only
describe('Truth Cases: Waterfall-Tier (Phase 1A - Structural)', () => {
  it('loads waterfall-tier truth cases', () => {
    expect(waterfallTierCases).toBeDefined();
    expect(Array.isArray(waterfallTierCases)).toBe(true);
    expect(waterfallTierCases.length).toBeGreaterThan(0);
  });

  it('waterfall-tier scenarios have required structure', () => {
    waterfallTierCases.forEach((testCase: unknown) => {
      const tc = testCase as Record<string, unknown>;
      expect(tc).toHaveProperty('scenario');
      expect(tc).toHaveProperty('input');
      expect(tc).toHaveProperty('expected');
    });
  });

  // PHASE 1A: Active execution blocked until XIRR >= 80% pass rate
  it.skip('[GATE] Waterfall-Tier execution requires XIRR >= 80% pass rate', () => {
    // Current: 17/25 XIRR pass (68%)
    // Target: 20/25 XIRR pass (80%) to unlock Phase 1A
    // See: docs/PHOENIX-EXECUTION-PLAN-v2.31.md Section 1A
  });
});

// [PHASE 1A] Waterfall-Ledger - Structural Validation Only
describe('Truth Cases: Waterfall-Ledger (Phase 1A - Structural)', () => {
  it('loads waterfall-ledger truth cases', () => {
    expect(waterfallLedgerCases).toBeDefined();
    expect(Array.isArray(waterfallLedgerCases)).toBe(true);
    expect(waterfallLedgerCases.length).toBeGreaterThan(0);
  });

  it('waterfall-ledger scenarios have required structure', () => {
    waterfallLedgerCases.forEach((testCase: unknown) => {
      const tc = testCase as Record<string, unknown>;
      expect(tc).toHaveProperty('scenario');
      expect(tc).toHaveProperty('input');
      expect(tc).toHaveProperty('expected');
    });
  });

  // PHASE 1A: Active execution blocked until XIRR >= 80% pass rate
  it.skip('[GATE] Waterfall-Ledger execution requires XIRR >= 80% pass rate', () => {
    // Current: 17/25 XIRR pass (68%)
    // Target: 20/25 XIRR pass (80%) to unlock Phase 1A
    // See: docs/PHOENIX-EXECUTION-PLAN-v2.31.md Section 1A
  });
});

// [PHASE 1B+] Fees - Load + Count Only
describe('Truth Cases: Fees (Phase 1B+ - Load Only)', () => {
  it('loads fees truth cases', () => {
    expect(feesCases).toBeDefined();
    expect(Array.isArray(feesCases)).toBe(true);
    expect(feesCases.length).toBeGreaterThan(0);
  });

  // PHASE 1B+: Execution deferred until Waterfall modules complete
  it.skip('[GATE] Fees execution requires Waterfall-Tier + Ledger completion', () => {
    // See: docs/PHOENIX-EXECUTION-PLAN-v2.31.md Section 1B
  });
});

// [PHASE 1B+] Capital Allocation - Load + Count Only
describe('Truth Cases: Capital Allocation (Phase 1B+ - Load Only)', () => {
  it('loads capital allocation truth cases', () => {
    expect(capitalCases).toBeDefined();
    expect(Array.isArray(capitalCases)).toBe(true);
    expect(capitalCases.length).toBeGreaterThan(0);
  });

  // PHASE 1B+: Execution deferred until Waterfall modules complete
  it.skip('[GATE] Capital Allocation execution requires Waterfall-Tier + Ledger completion', () => {
    // See: docs/PHOENIX-EXECUTION-PLAN-v2.31.md Section 1B
  });
});

// [PHASE 1B+] Exit Recycling - Load + Count Only
describe('Truth Cases: Exit Recycling (Phase 1B+ - Load Only)', () => {
  it('loads exit recycling truth cases', () => {
    expect(exitCases).toBeDefined();
    expect(Array.isArray(exitCases)).toBe(true);
    expect(exitCases.length).toBeGreaterThan(0);
  });

  // PHASE 1B+: Execution deferred until Waterfall modules complete
  it.skip('[GATE] Exit Recycling execution requires Waterfall-Tier + Ledger completion', () => {
    // See: docs/PHOENIX-EXECUTION-PLAN-v2.31.md Section 1B
  });
});

// [SUMMARY] Overall Truth-Case Coverage
describe('Truth Cases: Coverage Summary', () => {
  it('reports total scenario counts across all modules', () => {
    const totalScenarios =
      xirrCases.length +
      waterfallTierCases.length +
      waterfallLedgerCases.length +
      feesCases.length +
      capitalCases.length +
      exitCases.length;

    // v2.31 reality: 104 total scenarios
    // (25 XIRR + 15 Tier + 14 Ledger + 10 Fees + 20 Capital + 20 Exit)
    expect(totalScenarios).toBeGreaterThan(0);

    // Report breakdown (informational, not enforcing hard-coded counts)
    const breakdown = {
      xirr: xirrCases.length,
      'waterfall-tier': waterfallTierCases.length,
      'waterfall-ledger': waterfallLedgerCases.length,
      fees: feesCases.length,
      capitalAllocation: capitalCases.length,
      exitRecycling: exitCases.length,
      total: totalScenarios,
    };

    // Log for baseline capture
    console.log('Truth-Case Scenario Counts:', breakdown);
  });
});
