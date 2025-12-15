/**
 * Banker's Rounding Test Suite
 *
 * Test vectors from CA-SEMANTIC-LOCK.md Section 4.1
 * These are MANDATORY tests that must pass before implementation proceeds.
 *
 * @see docs/CA-SEMANTIC-LOCK.md Section 4.1
 */

import { describe, it, expect } from 'vitest';
import {
  bankersRoundPositive,
  bankersRoundSymmetric,
  dollarsToCents,
  centsToDollars,
  roundPercentDerivedToCents,
} from '../rounding';

describe('Banker\'s Rounding', () => {
  describe('bankersRoundSymmetric - Locked Test Vectors', () => {
    // These 6 test vectors are LOCKED per CA-SEMANTIC-LOCK.md Section 4.1
    // DO NOT MODIFY without updating the semantic lock

    it('rounds 2.5 to 2 (tie → nearest even)', () => {
      expect(bankersRoundSymmetric(2.5)).toBe(2);
    });

    it('rounds 3.5 to 4 (tie → nearest even)', () => {
      expect(bankersRoundSymmetric(3.5)).toBe(4);
    });

    it('rounds -2.5 to -2 (negative tie → nearest even magnitude)', () => {
      expect(bankersRoundSymmetric(-2.5)).toBe(-2);
    });

    it('rounds -3.5 to -4 (negative tie → nearest even magnitude)', () => {
      expect(bankersRoundSymmetric(-3.5)).toBe(-4);
    });

    it('rounds 2.4 to 2 (below midpoint)', () => {
      expect(bankersRoundSymmetric(2.4)).toBe(2);
    });

    it('rounds 2.6 to 3 (above midpoint)', () => {
      expect(bankersRoundSymmetric(2.6)).toBe(3);
    });
  });

  describe('bankersRoundPositive', () => {
    it('throws on negative input', () => {
      expect(() => bankersRoundPositive(-1)).toThrow('non-negative');
    });

    it('handles zero', () => {
      expect(bankersRoundPositive(0)).toBe(0);
    });

    it('handles exact integers', () => {
      expect(bankersRoundPositive(5)).toBe(5);
      expect(bankersRoundPositive(100)).toBe(100);
    });

    it('rounds 0.5 to 0 (tie → even)', () => {
      expect(bankersRoundPositive(0.5)).toBe(0);
    });

    it('rounds 1.5 to 2 (tie → even)', () => {
      expect(bankersRoundPositive(1.5)).toBe(2);
    });

    it('rounds 4.5 to 4 (tie → even)', () => {
      expect(bankersRoundPositive(4.5)).toBe(4);
    });

    it('rounds 5.5 to 6 (tie → even)', () => {
      expect(bankersRoundPositive(5.5)).toBe(6);
    });
  });

  describe('bankersRoundSymmetric - Additional Cases', () => {
    it('handles zero', () => {
      expect(bankersRoundSymmetric(0)).toBe(0);
    });

    it('handles small positive values', () => {
      expect(bankersRoundSymmetric(0.1)).toBe(0);
      expect(bankersRoundSymmetric(0.9)).toBe(1);
    });

    it('handles small negative values', () => {
      expect(bankersRoundSymmetric(-0.1)).toBe(0);
      expect(bankersRoundSymmetric(-0.9)).toBe(-1);
    });

    it('handles large values', () => {
      expect(bankersRoundSymmetric(1000000.5)).toBe(1000000); // even
      expect(bankersRoundSymmetric(1000001.5)).toBe(1000002); // odd → round up
    });
  });

  describe('dollarsToCents', () => {
    it('converts whole dollars', () => {
      expect(dollarsToCents(100)).toBe(10000);
      expect(dollarsToCents(1)).toBe(100);
    });

    it('converts dollars with cents', () => {
      expect(dollarsToCents(100.50)).toBe(10050);
      expect(dollarsToCents(100.99)).toBe(10099);
    });

    it('applies banker\'s rounding at half-cent', () => {
      // $100.005 = 10000.5 cents → rounds to 10000 (even)
      expect(dollarsToCents(100.005)).toBe(10000);
      // $100.015 = 10001.5 cents → rounds to 10002 (even)
      expect(dollarsToCents(100.015)).toBe(10002);
    });

    it('handles negative amounts (CA-019 recalls)', () => {
      expect(dollarsToCents(-100)).toBe(-10000);
      expect(dollarsToCents(-100.50)).toBe(-10050);
    });

    it('handles zero', () => {
      expect(dollarsToCents(0)).toBe(0);
    });
  });

  describe('centsToDollars', () => {
    it('converts cents to dollars exactly', () => {
      expect(centsToDollars(10000)).toBe(100);
      expect(centsToDollars(10050)).toBe(100.5);
      expect(centsToDollars(10099)).toBe(100.99);
    });

    it('handles negative cents', () => {
      expect(centsToDollars(-10000)).toBe(-100);
    });
  });

  describe('roundPercentDerivedToCents', () => {
    it('rounds percent-derived values', () => {
      // commitment=100M, target_reserve_pct=0.2 → 20M → 2000000000 cents
      const commitmentCents = 10000000000; // 100M in cents
      const targetReservePct = 0.2;
      const targetReserveCents = commitmentCents * targetReservePct;
      expect(roundPercentDerivedToCents(targetReserveCents)).toBe(2000000000);
    });

    it('applies banker\'s rounding to fractional cent results', () => {
      // If calculation yields 1000000.5 cents → rounds to 1000000 (even)
      expect(roundPercentDerivedToCents(1000000.5)).toBe(1000000);
      // If calculation yields 1000001.5 cents → rounds to 1000002 (even)
      expect(roundPercentDerivedToCents(1000001.5)).toBe(1000002);
    });
  });
});
