/**
 * Unit tests for type-safe unit discipline system
 *
 * Tests validators, conversions, formatters, and type guards to ensure
 * bulletproof protection against unit mismatch bugs.
 */

import { describe, it, expect } from 'vitest';
import {
  // Validators
  asFraction,
  asPercentage,
  asBasisPoints,
  asDollars,
  // Conversions
  fractionToPct,
  pctToFraction,
  bpsToFraction,
  fractionToBps,
  pctToBps,
  bpsToPct,
  // Formatters
  formatPct,
  formatFractionAsPct,
  formatBps,
  formatDollars,
  // Type Guards
  isFraction,
  isPercentage,
  isBasisPoints,
  isDollars,
} from '@shared/units';

// ============================================================================
// Validators - Valid Inputs
// ============================================================================

describe('asFraction', () => {
  it('accepts valid fractions', () => {
    expect(asFraction(0)).toBe(0);
    expect(asFraction(0.5)).toBe(0.5);
    expect(asFraction(1)).toBe(1);
    expect(asFraction(0.123456)).toBe(0.123456);
  });

  it('rejects negative values', () => {
    expect(() => asFraction(-0.1)).toThrow(TypeError);
    expect(() => asFraction(-1)).toThrow('Expected fraction [0,1], got -1');
  });

  it('rejects values > 1', () => {
    expect(() => asFraction(1.1)).toThrow(TypeError);
    expect(() => asFraction(100)).toThrow('Expected fraction [0,1], got 100');
  });

  it('rejects NaN', () => {
    expect(() => asFraction(NaN)).toThrow('Expected finite fraction, got NaN');
  });

  it('rejects Infinity', () => {
    expect(() => asFraction(Infinity)).toThrow(TypeError);
    expect(() => asFraction(-Infinity)).toThrow(TypeError);
  });
});

describe('asPercentage', () => {
  it('accepts valid percentages', () => {
    expect(asPercentage(0)).toBe(0);
    expect(asPercentage(50)).toBe(50);
    expect(asPercentage(100)).toBe(100);
    expect(asPercentage(12.345)).toBe(12.345);
  });

  it('rejects negative values', () => {
    expect(() => asPercentage(-1)).toThrow(TypeError);
    expect(() => asPercentage(-0.1)).toThrow('Expected percentage [0,100], got -0.1');
  });

  it('rejects values > 100', () => {
    expect(() => asPercentage(100.1)).toThrow(TypeError);
    expect(() => asPercentage(200)).toThrow('Expected percentage [0,100], got 200');
  });

  it('rejects NaN', () => {
    expect(() => asPercentage(NaN)).toThrow('Expected finite percentage, got NaN');
  });

  it('rejects Infinity', () => {
    expect(() => asPercentage(Infinity)).toThrow(TypeError);
    expect(() => asPercentage(-Infinity)).toThrow(TypeError);
  });
});

describe('asBasisPoints', () => {
  it('accepts valid basis points', () => {
    expect(asBasisPoints(0)).toBe(0);
    expect(asBasisPoints(5000)).toBe(5000);
    expect(asBasisPoints(10000)).toBe(10000);
    expect(asBasisPoints(123.45)).toBe(123.45);
  });

  it('rejects negative values', () => {
    expect(() => asBasisPoints(-1)).toThrow(TypeError);
    expect(() => asBasisPoints(-100)).toThrow('Expected basis points [0,10000], got -100');
  });

  it('rejects values > 10000', () => {
    expect(() => asBasisPoints(10001)).toThrow(TypeError);
    expect(() => asBasisPoints(20000)).toThrow('Expected basis points [0,10000], got 20000');
  });

  it('rejects NaN', () => {
    expect(() => asBasisPoints(NaN)).toThrow('Expected finite basis points, got NaN');
  });

  it('rejects Infinity', () => {
    expect(() => asBasisPoints(Infinity)).toThrow(TypeError);
    expect(() => asBasisPoints(-Infinity)).toThrow(TypeError);
  });
});

describe('asDollars', () => {
  it('accepts valid dollar amounts', () => {
    expect(asDollars(0)).toBe(0);
    expect(asDollars(100)).toBe(100);
    expect(asDollars(1000000)).toBe(1000000);
    expect(asDollars(123.45)).toBe(123.45);
  });

  it('rejects negative values', () => {
    expect(() => asDollars(-1)).toThrow(TypeError);
    expect(() => asDollars(-100.50)).toThrow('Expected non-negative dollar amount, got -100.5');
  });

  it('rejects NaN', () => {
    expect(() => asDollars(NaN)).toThrow('Expected finite dollar amount, got NaN');
  });

  it('rejects Infinity', () => {
    expect(() => asDollars(Infinity)).toThrow(TypeError);
    expect(() => asDollars(-Infinity)).toThrow(TypeError);
  });
});

// ============================================================================
// Conversions - Bidirectional and Precision
// ============================================================================

describe('Fraction <-> Percentage conversions', () => {
  it('converts fraction to percentage correctly', () => {
    expect(fractionToPct(asFraction(0))).toBe(0);
    expect(fractionToPct(asFraction(0.25))).toBe(25);
    expect(fractionToPct(asFraction(0.5))).toBe(50);
    expect(fractionToPct(asFraction(1))).toBe(100);
  });

  it('converts percentage to fraction correctly', () => {
    expect(pctToFraction(asPercentage(0))).toBe(0);
    expect(pctToFraction(asPercentage(25))).toBe(0.25);
    expect(pctToFraction(asPercentage(50))).toBe(0.5);
    expect(pctToFraction(asPercentage(100))).toBe(1);
  });

  it('is bidirectional', () => {
    const fraction = asFraction(0.375);
    const pct = fractionToPct(fraction);
    const backToFraction = pctToFraction(pct);
    expect(backToFraction).toBeCloseTo(0.375, 10);
  });
});

describe('Fraction <-> Basis Points conversions', () => {
  it('converts basis points to fraction correctly', () => {
    expect(bpsToFraction(asBasisPoints(0))).toBe(0);
    expect(bpsToFraction(asBasisPoints(2500))).toBe(0.25);
    expect(bpsToFraction(asBasisPoints(5000))).toBe(0.5);
    expect(bpsToFraction(asBasisPoints(10000))).toBe(1);
  });

  it('converts fraction to basis points correctly', () => {
    expect(fractionToBps(asFraction(0))).toBe(0);
    expect(fractionToBps(asFraction(0.25))).toBe(2500);
    expect(fractionToBps(asFraction(0.5))).toBe(5000);
    expect(fractionToBps(asFraction(1))).toBe(10000);
  });

  it('is bidirectional', () => {
    const fraction = asFraction(0.0375);
    const bps = fractionToBps(fraction);
    const backToFraction = bpsToFraction(bps);
    expect(backToFraction).toBeCloseTo(0.0375, 10);
  });
});

describe('Percentage <-> Basis Points conversions', () => {
  it('converts percentage to basis points correctly', () => {
    expect(pctToBps(asPercentage(0))).toBe(0);
    expect(pctToBps(asPercentage(2.5))).toBe(250);
    expect(pctToBps(asPercentage(25))).toBe(2500);
    expect(pctToBps(asPercentage(100))).toBe(10000);
  });

  it('converts basis points to percentage correctly', () => {
    expect(bpsToPct(asBasisPoints(0))).toBe(0);
    expect(bpsToPct(asBasisPoints(250))).toBe(2.5);
    expect(bpsToPct(asBasisPoints(2500))).toBe(25);
    expect(bpsToPct(asBasisPoints(10000))).toBe(100);
  });

  it('is bidirectional', () => {
    const pct = asPercentage(12.75);
    const bps = pctToBps(pct);
    const backToPct = bpsToPct(bps);
    expect(backToPct).toBeCloseTo(12.75, 10);
  });
});

// ============================================================================
// Formatters - Display Correctness
// ============================================================================

describe('formatPct', () => {
  it('formats percentages with default 2 decimals', () => {
    expect(formatPct(asPercentage(25))).toBe('25.00%');
    expect(formatPct(asPercentage(12.5))).toBe('12.50%');
    expect(formatPct(asPercentage(0.123))).toBe('0.12%');
  });

  it('formats percentages with custom decimals', () => {
    expect(formatPct(asPercentage(25), 0)).toBe('25%');
    expect(formatPct(asPercentage(25.123), 3)).toBe('25.123%');
    expect(formatPct(asPercentage(25.123456), 4)).toBe('25.1235%');
  });
});

describe('formatFractionAsPct', () => {
  it('formats fractions as percentages', () => {
    expect(formatFractionAsPct(asFraction(0.25))).toBe('25.00%');
    expect(formatFractionAsPct(asFraction(0.125))).toBe('12.50%');
    expect(formatFractionAsPct(asFraction(0.00123))).toBe('0.12%');
  });

  it('formats fractions with custom decimals', () => {
    expect(formatFractionAsPct(asFraction(0.25), 0)).toBe('25%');
    expect(formatFractionAsPct(asFraction(0.25123), 3)).toBe('25.123%');
  });
});

describe('formatBps', () => {
  it('formats basis points with default 0 decimals', () => {
    expect(formatBps(asBasisPoints(250))).toBe('250 bps');
    expect(formatBps(asBasisPoints(2500))).toBe('2500 bps');
    expect(formatBps(asBasisPoints(0))).toBe('0 bps');
  });

  it('formats basis points with custom decimals', () => {
    expect(formatBps(asBasisPoints(250.5), 1)).toBe('250.5 bps');
    expect(formatBps(asBasisPoints(250.123), 2)).toBe('250.12 bps');
  });
});

describe('formatDollars', () => {
  it('formats large amounts in compact notation', () => {
    expect(formatDollars(asDollars(2500000))).toBe('$2.5M');
    expect(formatDollars(asDollars(1500000))).toBe('$1.5M');
    expect(formatDollars(asDollars(1000000000))).toBe('$1.0B');
    expect(formatDollars(asDollars(2750000000))).toBe('$2.8B');
  });

  it('formats thousands in compact notation', () => {
    expect(formatDollars(asDollars(1500))).toBe('$1.5K');
    expect(formatDollars(asDollars(10000))).toBe('$10.0K');
  });

  it('formats small amounts with full precision', () => {
    expect(formatDollars(asDollars(999))).toBe('$999.00');
    expect(formatDollars(asDollars(100.50))).toBe('$100.50');
    expect(formatDollars(asDollars(0))).toBe('$0.00');
  });

  it('formats without compact notation when disabled', () => {
    expect(formatDollars(asDollars(2500000), false)).toBe('$2,500,000.00');
    expect(formatDollars(asDollars(1234.56), false)).toBe('$1,234.56');
    expect(formatDollars(asDollars(1000), false)).toBe('$1,000.00');
  });
});

// ============================================================================
// Type Guards - Validation Logic
// ============================================================================

describe('Type guards', () => {
  describe('isFraction', () => {
    it('returns true for valid fractions', () => {
      expect(isFraction(0)).toBe(true);
      expect(isFraction(0.5)).toBe(true);
      expect(isFraction(1)).toBe(true);
    });

    it('returns false for invalid fractions', () => {
      expect(isFraction(-0.1)).toBe(false);
      expect(isFraction(1.1)).toBe(false);
      expect(isFraction(NaN)).toBe(false);
      expect(isFraction(Infinity)).toBe(false);
    });
  });

  describe('isPercentage', () => {
    it('returns true for valid percentages', () => {
      expect(isPercentage(0)).toBe(true);
      expect(isPercentage(50)).toBe(true);
      expect(isPercentage(100)).toBe(true);
    });

    it('returns false for invalid percentages', () => {
      expect(isPercentage(-1)).toBe(false);
      expect(isPercentage(101)).toBe(false);
      expect(isPercentage(NaN)).toBe(false);
      expect(isPercentage(Infinity)).toBe(false);
    });
  });

  describe('isBasisPoints', () => {
    it('returns true for valid basis points', () => {
      expect(isBasisPoints(0)).toBe(true);
      expect(isBasisPoints(5000)).toBe(true);
      expect(isBasisPoints(10000)).toBe(true);
    });

    it('returns false for invalid basis points', () => {
      expect(isBasisPoints(-1)).toBe(false);
      expect(isBasisPoints(10001)).toBe(false);
      expect(isBasisPoints(NaN)).toBe(false);
      expect(isBasisPoints(Infinity)).toBe(false);
    });
  });

  describe('isDollars', () => {
    it('returns true for valid dollar amounts', () => {
      expect(isDollars(0)).toBe(true);
      expect(isDollars(100)).toBe(true);
      expect(isDollars(1000000)).toBe(true);
    });

    it('returns false for invalid dollar amounts', () => {
      expect(isDollars(-1)).toBe(false);
      expect(isDollars(NaN)).toBe(false);
      expect(isDollars(Infinity)).toBe(false);
    });
  });
});

// ============================================================================
// Integration Tests - Real-world Scenarios
// ============================================================================

describe('Integration scenarios', () => {
  it('handles typical VC ownership calculations', () => {
    // 20% ownership as fraction
    const ownership = asFraction(0.20);

    // Convert to percentage for display
    const ownershipPct = fractionToPct(ownership);
    expect(ownershipPct).toBe(20);
    expect(formatPct(ownershipPct)).toBe('20.00%');

    // Convert to basis points for precision
    const ownershipBps = fractionToBps(ownership);
    expect(ownershipBps).toBe(2000);
    expect(formatBps(ownershipBps)).toBe('2000 bps');
  });

  it('handles management fee calculations', () => {
    // 2% management fee
    const feePct = asPercentage(2);
    const feeFraction = pctToFraction(feePct);

    // Apply to $100M fund
    const fundSize = asDollars(100_000_000);
    const annualFee = asDollars(fundSize * feeFraction);

    expect(annualFee).toBe(2_000_000);
    expect(formatDollars(annualFee)).toBe('$2.0M');
  });

  it('handles carry calculations with precision', () => {
    // 20% carry
    const carry = asFraction(0.20);

    // On $50M profit
    const profit = asDollars(50_000_000);
    const carryAmount = asDollars(profit * carry);

    expect(carryAmount).toBe(10_000_000);
    expect(formatDollars(carryAmount)).toBe('$10.0M');
    expect(formatFractionAsPct(carry)).toBe('20.00%');
  });

  it('handles IRR conversion scenarios', () => {
    // 25% IRR as percentage
    const irrPct = asPercentage(25);

    // Convert to fraction for calculations
    const irrFraction = pctToFraction(irrPct);
    expect(irrFraction).toBe(0.25);

    // Convert to basis points for reporting
    const irrBps = pctToBps(irrPct);
    expect(irrBps).toBe(2500);

    expect(formatPct(irrPct)).toBe('25.00%');
    expect(formatBps(irrBps)).toBe('2500 bps');
  });
});
