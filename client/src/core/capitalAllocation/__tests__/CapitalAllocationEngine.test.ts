/**
 * Capital Allocation Engine Tests
 *
 * Tests the core engine functionality including:
 * - Effective buffer calculation
 * - Reserve balance calculation
 * - Cash ledger
 * - Cohort allocation
 *
 * @see docs/CA-SEMANTIC-LOCK.md
 */

import { describe, it, expect } from 'vitest';
import {
  calculateEffectiveBuffer,
  calculateReserveBalance,
  executeCapitalAllocation,
} from '../CapitalAllocationEngine';
import { adaptTruthCaseInput } from '../adapter';

describe('Capital Allocation Engine', () => {
  describe('calculateEffectiveBuffer', () => {
    /**
     * Per CA-SEMANTIC-LOCK.md Section 1.1.0:
     * effective_buffer = max(min_cash_buffer ?? 0, commitment * target_reserve_pct ?? 0)
     */

    it('uses target_reserve_pct when larger than min_cash_buffer', () => {
      // commitment=100M ($10B cents), target=20% → $20M target
      // min_cash_buffer=$1M → $100M cents
      // effective_buffer = max($100M cents, $2B cents) = $2B cents
      const commitmentCents = 10_000_000_000; // $100M
      const targetReservePct = 0.2;
      const minCashBufferCents = 100_000_000; // $1M

      const result = calculateEffectiveBuffer(commitmentCents, targetReservePct, minCashBufferCents);

      expect(result).toBe(2_000_000_000); // $20M in cents
    });

    it('uses min_cash_buffer when larger than target_reserve', () => {
      // commitment=$100M, target=1% → $1M target
      // min_cash_buffer=$2M
      // effective_buffer = max($2M, $1M) = $2M
      const commitmentCents = 10_000_000_000; // $100M
      const targetReservePct = 0.01;
      const minCashBufferCents = 200_000_000; // $2M

      const result = calculateEffectiveBuffer(commitmentCents, targetReservePct, minCashBufferCents);

      expect(result).toBe(200_000_000); // $2M in cents
    });

    it('handles zero min_cash_buffer', () => {
      const commitmentCents = 10_000_000_000;
      const targetReservePct = 0.15;
      const minCashBufferCents = 0;

      const result = calculateEffectiveBuffer(commitmentCents, targetReservePct, minCashBufferCents);

      expect(result).toBe(1_500_000_000); // 15% of $100M
    });

    it('handles zero target_reserve_pct', () => {
      const commitmentCents = 10_000_000_000;
      const targetReservePct = 0;
      const minCashBufferCents = 500_000_000; // $5M

      const result = calculateEffectiveBuffer(commitmentCents, targetReservePct, minCashBufferCents);

      expect(result).toBe(500_000_000); // $5M
    });

    it('handles both zero', () => {
      const result = calculateEffectiveBuffer(10_000_000_000, 0, 0);
      expect(result).toBe(0);
    });
  });

  describe('calculateReserveBalance', () => {
    /**
     * Per CA-SEMANTIC-LOCK.md Section 1.1.0:
     * reserve_balance = min(ending_cash, effective_buffer)
     */

    it('returns effective_buffer when cash exceeds buffer (CA-001 pattern)', () => {
      const endingCashCents = 2_000_000_000; // $20M
      const effectiveBufferCents = 2_000_000_000; // $20M

      const result = calculateReserveBalance(endingCashCents, effectiveBufferCents);

      expect(result).toBe(2_000_000_000);
    });

    it('returns ending_cash when cash is below buffer (CA-002 pattern)', () => {
      const endingCashCents = 200_000_000; // $2M
      const effectiveBufferCents = 2_000_000_000; // $20M

      const result = calculateReserveBalance(endingCashCents, effectiveBufferCents);

      expect(result).toBe(200_000_000); // Cash is the limit
    });

    it('returns effective_buffer when excess cash (CA-003 pattern)', () => {
      const endingCashCents = 2_500_000_000; // $25M
      const effectiveBufferCents = 1_500_000_000; // $15M

      const result = calculateReserveBalance(endingCashCents, effectiveBufferCents);

      expect(result).toBe(1_500_000_000); // Buffer is the limit
    });

    it('handles zero ending_cash', () => {
      const result = calculateReserveBalance(0, 1_000_000_000);
      expect(result).toBe(0);
    });

    it('handles zero effective_buffer', () => {
      const result = calculateReserveBalance(1_000_000_000, 0);
      expect(result).toBe(0);
    });
  });

  describe('executeCapitalAllocation', () => {
    describe('CA-001 Pattern: Basic reserve calculation', () => {
      it('calculates reserve with target_reserve_pct', () => {
        const input = adaptTruthCaseInput({
          fund: {
            commitment: 100, // $100M (inferred)
            target_reserve_pct: 0.2,
          },
          constraints: {
            min_cash_buffer: 1, // $1M
          },
          flows: {
            contributions: [{ date: '2024-03-31', amount: 20 }], // $20M
          },
        });

        const result = executeCapitalAllocation(input);

        // effective_buffer = max(1M, 100M * 0.2) = max(1M, 20M) = 20M
        // ending_cash = 20M
        // reserve_balance = min(20M, 20M) = 20M
        expect(result.reserve_balance).toBe(20);
      });
    });

    describe('CA-002 Pattern: Buffer exceeds cash', () => {
      it('returns ending_cash when below buffer', () => {
        const input = adaptTruthCaseInput({
          fund: {
            commitment: 100, // $100M
            target_reserve_pct: 0.2,
          },
          constraints: {
            min_cash_buffer: 2, // $2M
          },
          flows: {
            contributions: [{ date: '2024-03-31', amount: 2 }], // $2M
          },
        });

        const result = executeCapitalAllocation(input);

        // effective_buffer = max(2M, 20M) = 20M
        // ending_cash = 2M
        // reserve_balance = min(2M, 20M) = 2M
        expect(result.reserve_balance).toBe(2);
      });
    });

    describe('CA-003 Pattern: Excess cash', () => {
      it('reserves up to buffer with excess available', () => {
        const input = adaptTruthCaseInput({
          fund: {
            commitment: 100, // $100M
            target_reserve_pct: 0.15, // 15%
          },
          constraints: {
            min_cash_buffer: 1, // $1M
          },
          flows: {
            contributions: [{ date: '2024-03-31', amount: 25 }], // $25M
          },
        });

        const result = executeCapitalAllocation(input);

        // effective_buffer = max(1M, 15M) = 15M
        // ending_cash = 25M
        // reserve_balance = min(25M, 15M) = 15M
        expect(result.reserve_balance).toBe(15);
      });
    });

    describe('Output Array Presence', () => {
      /**
       * Per CA-SEMANTIC-LOCK.md Section 4.4:
       * Arrays MUST be present (even if empty)
       */

      it('always includes allocations_by_cohort array', () => {
        const input = adaptTruthCaseInput({
          fund: { commitment: 100, target_reserve_pct: 0.2 },
          flows: { contributions: [{ date: '2024-01-01', amount: 10 }] },
        });

        const result = executeCapitalAllocation(input);

        expect(Array.isArray(result.allocations_by_cohort)).toBe(true);
      });

      it('always includes reserve_balance_over_time array', () => {
        const input = adaptTruthCaseInput({
          fund: { commitment: 100, target_reserve_pct: 0.2 },
          flows: { contributions: [{ date: '2024-01-01', amount: 10 }] },
        });

        const result = executeCapitalAllocation(input);

        expect(Array.isArray(result.reserve_balance_over_time)).toBe(true);
      });

      it('always includes violations array', () => {
        const input = adaptTruthCaseInput({
          fund: { commitment: 100, target_reserve_pct: 0.2 },
          flows: { contributions: [{ date: '2024-01-01', amount: 10 }] },
        });

        const result = executeCapitalAllocation(input);

        expect(Array.isArray(result.violations)).toBe(true);
      });
    });

    describe('Determinism', () => {
      /**
       * Per CA-SEMANTIC-LOCK.md Section 4.5:
       * Same input always produces same output
       */

      it('produces identical results for 10 runs', () => {
        const input = adaptTruthCaseInput({
          fund: { commitment: 100, target_reserve_pct: 0.2 },
          constraints: { min_cash_buffer: 5 },
          flows: {
            contributions: [
              { date: '2024-01-15', amount: 30 },
              { date: '2024-04-15', amount: 20 },
            ],
            distributions: [{ date: '2024-06-30', amount: 10 }],
          },
          cohorts: [
            { id: 'A', start_date: '2024-01-01', weight: 0.4 },
            { id: 'B', start_date: '2024-06-01', weight: 0.6 },
          ],
        });

        const results: ReturnType<typeof executeCapitalAllocation>[] = [];
        for (let i = 0; i < 10; i++) {
          results.push(executeCapitalAllocation(input));
        }

        // All results should be identical
        const first = results[0];
        for (let i = 1; i < results.length; i++) {
          expect(results[i]).toEqual(first);
        }
      });
    });

    describe('Implicit Cohort Generation', () => {
      /**
       * Per CA-SEMANTIC-LOCK.md Section 5.3:
       * No cohorts array → single implicit cohort by vintage year
       */

      it('creates implicit cohort when no cohorts provided', () => {
        const input = adaptTruthCaseInput({
          fund: { commitment: 100, vintage_year: 2024 },
          flows: { contributions: [{ date: '2024-03-31', amount: 50 }] },
        });

        const result = executeCapitalAllocation(input);

        expect(result.allocations_by_cohort).toHaveLength(1);
        expect(result.allocations_by_cohort[0].cohort).toBe('2024');
      });

      it('uses vintage_year for implicit cohort name', () => {
        const input = adaptTruthCaseInput({
          fund: { commitment: 100, vintage_year: 2025 },
          flows: { contributions: [{ date: '2025-01-15', amount: 30 }] },
        });

        const result = executeCapitalAllocation(input);

        expect(result.allocations_by_cohort[0].cohort).toBe('2025');
      });
    });

    describe('Conservation Properties', () => {
      it('maintains capacity conservation', () => {
        const input = adaptTruthCaseInput({
          fund: { commitment: 100, target_reserve_pct: 0.2 },
          flows: { contributions: [{ date: '2024-03-31', amount: 50 }] },
          cohorts: [
            { id: 'A', weight: 0.6 },
            { id: 'B', weight: 0.4 },
          ],
        });

        const result = executeCapitalAllocation(input);

        // commitment = sum(allocations) + remaining_capacity
        const totalAllocated = result.allocations_by_cohort.reduce(
          (sum, c) => sum + c.amount,
          0
        );
        const remaining = result.remaining_capacity ?? 0;
        const commitment = 100; // $100M

        expect(totalAllocated + remaining).toBeCloseTo(commitment, 2);
      });
    });
  });
});
