/**
 * Input Adapter Tests
 *
 * Tests truth case input adaptation including:
 * - Unit inference and conversion
 * - Cohort normalization
 * - Effective buffer calculation
 * - CA-005 skip gate
 *
 * @see docs/CA-SEMANTIC-LOCK.md Section 3
 */

import { describe, it, expect } from 'vitest';
import {
  adaptTruthCaseInput,
  shouldSkipTruthCase,
  centsToOutputUnits,
  formatCohortOutput,
  type TruthCaseInput,
} from '../adapter';

describe('Input Adapter', () => {
  describe('adaptTruthCaseInput', () => {
    describe('Unit Inference', () => {
      it('infers $M scale for commitment < 10,000', () => {
        const input: TruthCaseInput = {
          fund: { commitment: 100 }, // $100M
          flows: { contributions: [{ date: '2024-03-31', amount: 20 }] },
        };

        const result = adaptTruthCaseInput(input);

        expect(result.unitScale).toBe(1_000_000);
        expect(result.commitmentCents).toBe(100 * 1_000_000 * 100); // $100M in cents
      });

      it('infers raw dollars for commitment >= 10,000', () => {
        const input: TruthCaseInput = {
          fund: { commitment: 100_000_000 }, // $100M in raw dollars
          flows: { contributions: [{ date: '2024-03-31', amount: 20_000_000 }] },
        };

        const result = adaptTruthCaseInput(input);

        expect(result.unitScale).toBe(1);
        expect(result.commitmentCents).toBe(100_000_000 * 100); // $100M in cents
      });

      it('applies same scale to all monetary fields', () => {
        const input: TruthCaseInput = {
          fund: { commitment: 100, target_reserve_pct: 0.2 },
          constraints: { min_cash_buffer: 5 },
          flows: {
            contributions: [{ date: '2024-03-31', amount: 30 }],
            distributions: [{ date: '2024-06-30', amount: 10 }],
          },
        };

        const result = adaptTruthCaseInput(input);

        // All should be in $M scale
        expect(result.commitmentCents).toBe(100 * 1_000_000 * 100);
        expect(result.minCashBufferCents).toBe(5 * 1_000_000 * 100);
        expect(result.contributionsCents[0]?.amountCents).toBe(30 * 1_000_000 * 100);
        expect(result.distributionsCents[0]?.amountCents).toBe(10 * 1_000_000 * 100);
      });
    });

    describe('Effective Buffer Calculation', () => {
      it('calculates effective buffer = max(min_cash_buffer, commitment * target_reserve_pct)', () => {
        const input: TruthCaseInput = {
          fund: { commitment: 100, target_reserve_pct: 0.2 }, // 20% = $20M
          constraints: { min_cash_buffer: 5 }, // $5M
        };

        const result = adaptTruthCaseInput(input);

        // effective_buffer = max($5M, $20M) = $20M
        expect(result.effectiveBufferCents).toBe(20 * 1_000_000 * 100);
      });

      it('uses min_cash_buffer when larger than percentage', () => {
        const input: TruthCaseInput = {
          fund: { commitment: 100, target_reserve_pct: 0.01 }, // 1% = $1M
          constraints: { min_cash_buffer: 10 }, // $10M
        };

        const result = adaptTruthCaseInput(input);

        // effective_buffer = max($10M, $1M) = $10M
        expect(result.effectiveBufferCents).toBe(10 * 1_000_000 * 100);
      });

      it('handles null/undefined constraints', () => {
        const input: TruthCaseInput = {
          fund: { commitment: 100, target_reserve_pct: 0.15 },
          // No constraints
        };

        const result = adaptTruthCaseInput(input);

        // effective_buffer = max(0, 15M) = $15M
        expect(result.effectiveBufferCents).toBe(15 * 1_000_000 * 100);
      });
    });

    describe('Cohort Normalization', () => {
      it('creates implicit cohort when no cohorts provided', () => {
        const input: TruthCaseInput = {
          fund: { commitment: 100, vintage_year: 2024 },
        };

        const result = adaptTruthCaseInput(input);

        expect(result.cohorts).toHaveLength(1);
        expect(result.cohorts[0]?.name).toBe('2024');
        expect(result.cohorts[0]?.id).toBe('_implicit_2024');
        expect(result.cohorts[0]?.weightBps).toBe(10_000_000); // 100%
      });

      it('normalizes cohort weights to basis points', () => {
        const input: TruthCaseInput = {
          fund: { commitment: 100 },
          cohorts: [
            { id: 'A', weight: 0.6 },
            { id: 'B', weight: 0.4 },
          ],
        };

        const result = adaptTruthCaseInput(input);

        expect(result.cohorts).toHaveLength(2);
        // Weights normalized to 1e7 scale
        const totalWeight = result.cohorts.reduce((sum, c) => sum + c.weightBps, 0);
        expect(totalWeight).toBe(10_000_000);
      });

      it('sorts cohorts by start_date, then id', () => {
        const input: TruthCaseInput = {
          fund: { commitment: 100 },
          cohorts: [
            { id: 'B', start_date: '2024-06-01', weight: 0.3 },
            { id: 'C', start_date: '2024-01-01', weight: 0.3 },
            { id: 'A', start_date: '2024-01-01', weight: 0.4 },
          ],
        };

        const result = adaptTruthCaseInput(input);

        // Should be sorted: A (2024-01-01), C (2024-01-01, but 'a' < 'c'), B (2024-06-01)
        expect(result.cohorts[0]?.id).toBe('A');
        expect(result.cohorts[1]?.id).toBe('C');
        expect(result.cohorts[2]?.id).toBe('B');
      });
    });

    describe('Unit Mismatch Detection', () => {
      it('throws on million-scale mismatch', () => {
        const input: TruthCaseInput = {
          fund: { commitment: 100 }, // Looks like $M (small number)
          constraints: { min_cash_buffer: 1_000_000 }, // Looks like raw dollars
        };

        expect(() => adaptTruthCaseInput(input)).toThrow(/mismatch/i);
      });

      it('accepts consistent scales', () => {
        const input: TruthCaseInput = {
          fund: { commitment: 100 },
          constraints: { min_cash_buffer: 5 }, // Both in $M
          flows: {
            contributions: [{ date: '2024-03-31', amount: 20 }],
          },
        };

        expect(() => adaptTruthCaseInput(input)).not.toThrow();
      });
    });

    describe('Timeline Derivation', () => {
      it('derives start date from earliest flow', () => {
        const input: TruthCaseInput = {
          fund: { commitment: 100 },
          flows: {
            contributions: [
              { date: '2024-03-31', amount: 20 },
              { date: '2024-01-15', amount: 30 },
            ],
          },
        };

        const result = adaptTruthCaseInput(input);

        expect(result.startDate).toBe('2024-01-15');
      });

      it('derives end date from latest flow', () => {
        const input: TruthCaseInput = {
          fund: { commitment: 100 },
          flows: {
            contributions: [{ date: '2024-03-31', amount: 20 }],
            distributions: [{ date: '2024-09-30', amount: 10 }],
          },
        };

        const result = adaptTruthCaseInput(input);

        expect(result.endDate).toBe('2024-09-30');
      });

      it('uses vintage year when no flows', () => {
        const input: TruthCaseInput = {
          fund: { commitment: 100, vintage_year: 2025 },
        };

        const result = adaptTruthCaseInput(input);

        expect(result.startDate).toBe('2025-01-01');
        expect(result.endDate).toBe('2025-12-31');
      });
    });
  });

  describe('shouldSkipTruthCase', () => {
    it('skips CA-005', () => {
      const result = shouldSkipTruthCase('CA-005');

      expect(result.skip).toBe(true);
      expect(result.reason).toContain('dynamic_ratio');
    });

    it('skips dynamic_ratio policy', () => {
      const result = shouldSkipTruthCase('CA-099', 'dynamic_ratio');

      expect(result.skip).toBe(true);
    });

    it('does not skip static_pct policy', () => {
      const result = shouldSkipTruthCase('CA-001', 'static_pct');

      expect(result.skip).toBe(false);
    });

    it('does not skip other cases', () => {
      const result = shouldSkipTruthCase('CA-001');

      expect(result.skip).toBe(false);
    });
  });

  describe('centsToOutputUnits', () => {
    it('converts cents back to $M scale', () => {
      const cents = 20 * 1_000_000 * 100; // $20M in cents
      const unitScale = 1_000_000;

      const result = centsToOutputUnits(cents, unitScale);

      expect(result).toBe(20);
    });

    it('converts cents back to raw dollars', () => {
      const cents = 20_000_000 * 100; // $20M in cents
      const unitScale = 1;

      const result = centsToOutputUnits(cents, unitScale);

      expect(result).toBe(20_000_000);
    });
  });

  describe('formatCohortOutput', () => {
    it('uses display name, not internal ID', () => {
      const cohort = {
        id: '_implicit_2024',
        name: '2024',
        startDate: '2024-01-01',
        endDate: null,
        weightBps: 10_000_000,
        maxAllocationCents: null,
        allocationCents: 60 * 1_000_000 * 100, // $60M
        type: 'planned' as const,
      };

      const result = formatCohortOutput(cohort, 1_000_000);

      expect(result.cohort).toBe('2024'); // Display name
      expect(result.amount).toBe(60);
      expect(result.type).toBe('planned');
    });
  });
});
