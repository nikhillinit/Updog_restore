/**
 * Conservation Invariant Tests
 *
 * Per CA-SEMANTIC-LOCK.md Section 1.3:
 * - Tests MUST compute totals from independent outputs (non-tautological)
 * - At least ONE test with independently-derivable expected values
 *
 * @see docs/CA-SEMANTIC-LOCK.md Section 1.2, 1.3
 */

import { describe, it, expect } from 'vitest';
import {
  verifyCashConservation,
  verifyCapacityConservation,
  verifyBufferConstraint,
  verifyNonNegativity,
  checkAllInvariants,
  calculateExpectedReserveIndependently,
  calculateExpectedAllocationIndependently,
} from '../invariants';
import { adaptTruthCaseInput } from '../adapter';
import { executeCapitalAllocation } from '../CapitalAllocationEngine';

describe('Conservation Invariants', () => {
  describe('Independently-Derivable Tests (MANDATORY)', () => {
    /**
     * TEST 1: Single cohort with 20% reserve
     *
     * This test uses a simplified case where expected values are
     * calculated BY HAND from the spec, WITHOUT running the engine first.
     *
     * Setup: target_reserve = 20%, single cohort (100%), no constraints
     * Net inflows: 50 + 50 - 20 = 80 ($M)
     * Expected reserve: min(80, max(0, 100*0.2)) = min(80, 20) = 20
     * Expected allocation: 80 - 20 = 60
     */
    it('independently-derivable: single cohort with 20% reserve', () => {
      const input = adaptTruthCaseInput({
        fund: {
          commitment: 100, // $100M
          target_reserve_pct: 0.2,
        },
        constraints: {
          min_cash_buffer: 0,
        },
        flows: {
          contributions: [
            { date: '2024-03-31', amount: 50 },
            { date: '2024-06-30', amount: 50 },
          ],
          distributions: [{ date: '2024-09-30', amount: 20 }],
        },
      });

      // CALCULATE EXPECTED VALUES BY HAND (from spec, not from engine)
      // All in cents, using $M scale (commitment < 10k, so scale = 1M)
      const contributionsCents = [50 * 1_000_000 * 100, 50 * 1_000_000 * 100]; // $50M each
      const distributionsCents = [20 * 1_000_000 * 100]; // $20M
      const commitmentCents = 100 * 1_000_000 * 100; // $100M

      const {
        endingCashCents: expectedEndingCashCents,
        effectiveBufferCents: expectedEffectiveBufferCents,
        reserveBalanceCents: expectedReserveBalanceCents,
      } = calculateExpectedReserveIndependently(
        contributionsCents,
        distributionsCents,
        commitmentCents,
        0.2, // target_reserve_pct
        0 // min_cash_buffer
      );

      // Verify hand calculation
      expect(expectedEndingCashCents).toBe(80 * 1_000_000 * 100); // 80M in cents
      expect(expectedEffectiveBufferCents).toBe(20 * 1_000_000 * 100); // 20M in cents
      expect(expectedReserveBalanceCents).toBe(20 * 1_000_000 * 100); // 20M in cents

      // Run engine
      const result = executeCapitalAllocation(input);

      // Assert reserve matches hand-calculated value
      expect(result.reserveBalanceCents).toBe(expectedReserveBalanceCents);
      expect(result.reserve_balance).toBe(20); // $20M

      // Assert allocation matches hand-calculated value
      const expectedAllocationCents = calculateExpectedAllocationIndependently(
        expectedEndingCashCents,
        expectedReserveBalanceCents
      );
      expect(expectedAllocationCents).toBe(60 * 1_000_000 * 100); // 60M in cents

      const actualAllocationCents = result.allocations_by_cohort.reduce(
        (sum, c) => sum + Math.round(c.amount * 1_000_000 * 100),
        0
      );
      expect(actualAllocationCents).toBe(expectedAllocationCents);
    });

    /**
     * TEST 2: Two cohorts with 60/40 split
     *
     * HAND CALCULATION:
     * Total to allocate: 60M (from above pattern)
     * Cohort A (60%): floor(60 * 0.6) = 36
     * Cohort B (40%): floor(60 * 0.4) = 24
     * Sum: 36 + 24 = 60 ✓
     */
    it('independently-derivable: two cohorts with 60/40 split', () => {
      const input = adaptTruthCaseInput({
        fund: {
          commitment: 100,
          target_reserve_pct: 0.2,
        },
        flows: {
          contributions: [{ date: '2024-03-31', amount: 80 }], // $80M
        },
        cohorts: [
          { id: 'A', start_date: '2024-01-01', weight: 0.6 },
          { id: 'B', start_date: '2024-06-01', weight: 0.4 },
        ],
      });

      // HAND CALCULATION
      // ending_cash = 80M
      // effective_buffer = max(0, 100 * 0.2) = 20M
      // reserve_balance = min(80, 20) = 20M
      // allocable = 80 - 20 = 60M
      // Cohort A: 60 * 0.6 = 36M
      // Cohort B: 60 * 0.4 = 24M

      const result = executeCapitalAllocation(input);

      expect(result.reserve_balance).toBe(20);

      // Find cohorts by name
      const cohortA = result.allocations_by_cohort.find((c) => c.cohort === 'A');
      const cohortB = result.allocations_by_cohort.find((c) => c.cohort === 'B');

      expect(cohortA).toBeDefined();
      expect(cohortB).toBeDefined();
      expect(cohortA!.amount).toBe(36);
      expect(cohortB!.amount).toBe(24);
    });
  });

  describe('verifyCashConservation', () => {
    it('passes for balanced cash ledger', () => {
      const input = adaptTruthCaseInput({
        fund: { commitment: 100, target_reserve_pct: 0.2 },
        flows: {
          contributions: [{ date: '2024-03-31', amount: 50 }],
          distributions: [{ date: '2024-06-30', amount: 10 }],
        },
      });

      const result = executeCapitalAllocation(input);
      const invariant = verifyCashConservation(input, result);

      expect(invariant.passed).toBe(true);
      expect(invariant.expected).toBe(40 * 1_000_000 * 100); // 50 - 10 = 40M
    });
  });

  describe('verifyCapacityConservation', () => {
    it('passes when allocations + remaining = commitment', () => {
      const input = adaptTruthCaseInput({
        fund: { commitment: 100, target_reserve_pct: 0.2 },
        flows: { contributions: [{ date: '2024-03-31', amount: 50 }] },
        cohorts: [
          { id: 'A', weight: 0.5 },
          { id: 'B', weight: 0.5 },
        ],
      });

      const result = executeCapitalAllocation(input);
      const invariant = verifyCapacityConservation(input, result);

      expect(invariant.passed).toBe(true);
    });

    it('computes allocations from array, not scalar (non-tautological)', () => {
      const input = adaptTruthCaseInput({
        fund: { commitment: 100, target_reserve_pct: 0.1 },
        flows: { contributions: [{ date: '2024-03-31', amount: 60 }] },
        cohorts: [
          { id: '2023', weight: 0.3 },
          { id: '2024', weight: 0.5 },
          { id: '2025', weight: 0.2 },
        ],
      });

      const result = executeCapitalAllocation(input);

      // Manually sum allocations from array
      const sumFromArray = result.allocations_by_cohort.reduce(
        (sum, c) => sum + c.amount,
        0
      );

      // Verify this matches what engine allocated
      const allocable = 60 - 10; // ending_cash - reserve
      expect(sumFromArray).toBeCloseTo(allocable, 1);

      // Verify conservation
      const invariant = verifyCapacityConservation(input, result);
      expect(invariant.passed).toBe(true);
    });
  });

  describe('verifyBufferConstraint', () => {
    it('passes when reserve >= effective_buffer', () => {
      const input = adaptTruthCaseInput({
        fund: { commitment: 100, target_reserve_pct: 0.1 }, // 10% = $10M buffer
        flows: { contributions: [{ date: '2024-03-31', amount: 50 }] }, // $50M cash
      });

      const result = executeCapitalAllocation(input);
      const invariant = verifyBufferConstraint(input, result);

      expect(invariant.passed).toBe(true);
      expect(result.reserve_balance).toBe(10); // buffer met
    });

    it('soft-passes when reserve < buffer due to insufficient cash', () => {
      const input = adaptTruthCaseInput({
        fund: { commitment: 100, target_reserve_pct: 0.5 }, // 50% = $50M buffer
        flows: { contributions: [{ date: '2024-03-31', amount: 20 }] }, // Only $20M cash
      });

      const result = executeCapitalAllocation(input);
      const invariant = verifyBufferConstraint(input, result);

      // This should pass because the breach is uncurable (not enough cash)
      expect(invariant.passed).toBe(true);
      expect(result.reserve_balance).toBe(20); // All cash reserved
    });
  });

  describe('verifyNonNegativity', () => {
    it('passes for all positive values', () => {
      const input = adaptTruthCaseInput({
        fund: { commitment: 100, target_reserve_pct: 0.2 },
        flows: { contributions: [{ date: '2024-03-31', amount: 50 }] },
        cohorts: [
          { id: 'A', weight: 0.5 },
          { id: 'B', weight: 0.5 },
        ],
      });

      const result = executeCapitalAllocation(input);
      const results = verifyNonNegativity(result);

      expect(results.every((r) => r.passed)).toBe(true);
    });

    it('checks each allocation individually', () => {
      const input = adaptTruthCaseInput({
        fund: { commitment: 100, target_reserve_pct: 0.2 },
        flows: { contributions: [{ date: '2024-03-31', amount: 50 }] },
        cohorts: [
          { id: 'A', weight: 0.3 },
          { id: 'B', weight: 0.3 },
          { id: 'C', weight: 0.4 },
        ],
      });

      const result = executeCapitalAllocation(input);
      const results = verifyNonNegativity(result);

      // Should have 1 reserve + 3 allocations + 1 remaining = 5 checks
      expect(results.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('checkAllInvariants', () => {
    it('returns all invariant results', () => {
      const input = adaptTruthCaseInput({
        fund: { commitment: 100, target_reserve_pct: 0.2 },
        flows: { contributions: [{ date: '2024-03-31', amount: 50 }] },
      });

      const result = executeCapitalAllocation(input);
      const check = checkAllInvariants(input, result);

      expect(check.cashConservation).toBeDefined();
      expect(check.capacityConservation).toBeDefined();
      expect(check.bufferConstraint).toBeDefined();
      expect(check.nonNegativity).toBeDefined();
      expect(typeof check.allPassed).toBe('boolean');
    });

    it('allPassed is true when all invariants hold', () => {
      const input = adaptTruthCaseInput({
        fund: { commitment: 100, target_reserve_pct: 0.2 },
        flows: {
          contributions: [{ date: '2024-03-31', amount: 50 }],
          distributions: [{ date: '2024-06-30', amount: 10 }],
        },
        cohorts: [
          { id: 'A', weight: 0.6 },
          { id: 'B', weight: 0.4 },
        ],
      });

      const result = executeCapitalAllocation(input);
      const check = checkAllInvariants(input, result);

      expect(check.allPassed).toBe(true);
    });
  });

  describe('Conservation Across Multiple Periods', () => {
    it('maintains conservation with multiple flows', () => {
      const input = adaptTruthCaseInput({
        fund: { commitment: 100, target_reserve_pct: 0.15 },
        flows: {
          contributions: [
            { date: '2024-01-15', amount: 30 },
            { date: '2024-04-15', amount: 25 },
            { date: '2024-07-15', amount: 20 },
          ],
          distributions: [
            { date: '2024-06-30', amount: 10 },
            { date: '2024-09-30', amount: 5 },
          ],
        },
        cohorts: [
          { id: '2024', weight: 0.7 },
          { id: '2025', weight: 0.3 },
        ],
      });

      const result = executeCapitalAllocation(input);
      const check = checkAllInvariants(input, result);

      expect(check.cashConservation.passed).toBe(true);
      expect(check.capacityConservation.passed).toBe(true);

      // Verify ending cash independently
      const expectedCash = 30 + 25 + 20 - 10 - 5; // 60M
      expect(result.ending_cash).toBe(expectedCash);
    });
  });
});
