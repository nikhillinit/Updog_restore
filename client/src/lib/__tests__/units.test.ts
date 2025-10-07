/**
 * Unit tests for precision conversion utilities
 *
 * **Purpose:** Prevent the 100× MOIC error and other precision bugs
 * **Coverage target:** 100% (this is critical infrastructure)
 */

import { describe, it, expect } from 'vitest';
import {
  // Monetary conversions
  dollarsToCents,
  centsToDollars,

  // Percentage conversions
  percentToBps,
  decimalToBps,
  bpsToDecimal,
  bpsToPercent,

  // MOIC conversions
  moicToBps,
  bpsToMoic,

  // Validated conversions
  dollarsToCentsValidated,
  percentToBpsValidated,
  moicToBpsValidated,

  // Clamping utilities
  clamp,
  clampBps,
  clampPercent,

  // Formatting utilities
  formatCents,
  formatBps,
  formatMoic,
} from '../units';

describe('units.ts - Monetary Conversions', () => {
  describe('dollarsToCents', () => {
    it('converts whole dollars to cents', () => {
      expect(dollarsToCents(1000000)).toBe(100000000);
      expect(dollarsToCents(100)).toBe(10000);
      expect(dollarsToCents(1)).toBe(100);
      expect(dollarsToCents(0)).toBe(0);
    });

    it('converts fractional dollars to cents', () => {
      expect(dollarsToCents(1000000.50)).toBe(100000050);
      expect(dollarsToCents(0.01)).toBe(1);
      expect(dollarsToCents(0.99)).toBe(99);
    });

    it('rounds to nearest cent', () => {
      expect(dollarsToCents(0.005)).toBe(1);  // Rounds up
      expect(dollarsToCents(0.004)).toBe(0);  // Rounds down
      expect(dollarsToCents(1.235)).toBe(124); // Rounds up
    });

    it('handles negative values', () => {
      expect(dollarsToCents(-100)).toBe(-10000);
      expect(dollarsToCents(-0.01)).toBe(-1);
    });
  });

  describe('centsToDollars', () => {
    it('converts cents to dollars', () => {
      expect(centsToDollars(100000000)).toBe(1000000);
      expect(centsToDollars(10000)).toBe(100);
      expect(centsToDollars(100)).toBe(1);
      expect(centsToDollars(1)).toBe(0.01);
      expect(centsToDollars(0)).toBe(0);
    });

    it('handles fractional cents correctly', () => {
      expect(centsToDollars(100000050)).toBe(1000000.50);
      expect(centsToDollars(99)).toBe(0.99);
    });

    it('handles negative cents', () => {
      expect(centsToDollars(-10000)).toBe(-100);
      expect(centsToDollars(-1)).toBe(-0.01);
    });

    it('round-trips correctly', () => {
      const amounts = [1000000.50, 0.01, 123.45, 9999.99];
      amounts.forEach(amount => {
        expect(centsToDollars(dollarsToCents(amount))).toBe(amount);
      });
    });
  });
});

describe('units.ts - Percentage Conversions', () => {
  describe('percentToBps', () => {
    it('converts percentage (0-100 scale) to bps', () => {
      expect(percentToBps(100)).toBe(10000);
      expect(percentToBps(35)).toBe(3500);
      expect(percentToBps(0.5)).toBe(50);
      expect(percentToBps(0)).toBe(0);
    });

    it('rounds to nearest basis point', () => {
      expect(percentToBps(35.005)).toBe(3501); // Rounds up
      expect(percentToBps(35.004)).toBe(3500); // Rounds down
    });
  });

  describe('decimalToBps', () => {
    it('converts decimal (0-1 scale) to bps', () => {
      expect(decimalToBps(1.0)).toBe(10000);
      expect(decimalToBps(0.35)).toBe(3500);
      expect(decimalToBps(0.005)).toBe(50);
      expect(decimalToBps(0)).toBe(0);
    });

    it('rounds to nearest basis point', () => {
      expect(decimalToBps(0.35005)).toBe(3501); // Rounds up
      expect(decimalToBps(0.35004)).toBe(3500); // Rounds down
    });
  });

  describe('bpsToDecimal', () => {
    it('converts bps to decimal', () => {
      expect(bpsToDecimal(10000)).toBe(1.0);
      expect(bpsToDecimal(3500)).toBe(0.35);
      expect(bpsToDecimal(50)).toBe(0.005);
      expect(bpsToDecimal(0)).toBe(0);
    });

    it('round-trips correctly with decimalToBps', () => {
      const decimals = [1.0, 0.35, 0.005, 0.0001];
      decimals.forEach(decimal => {
        expect(bpsToDecimal(decimalToBps(decimal))).toBeCloseTo(decimal, 4);
      });
    });
  });

  describe('bpsToPercent', () => {
    it('converts bps to percentage', () => {
      expect(bpsToPercent(10000)).toBe(100);
      expect(bpsToPercent(3500)).toBe(35);
      expect(bpsToPercent(50)).toBe(0.5);
      expect(bpsToPercent(0)).toBe(0);
    });

    it('round-trips correctly with percentToBps', () => {
      const percents = [100, 35, 0.5, 0.01];
      percents.forEach(percent => {
        expect(bpsToPercent(percentToBps(percent))).toBeCloseTo(percent, 2);
      });
    });
  });
});

describe('units.ts - MOIC Conversions (Critical)', () => {
  describe('moicToBps', () => {
    it('converts MOIC multiplier to bps (prevents 100× error)', () => {
      expect(moicToBps(2.5)).toBe(25000);  // NOT 2.5 or 250!
      expect(moicToBps(10)).toBe(100000);  // NOT 10 or 1000!
      expect(moicToBps(0.5)).toBe(5000);
      expect(moicToBps(1.0)).toBe(10000);
      expect(moicToBps(0)).toBe(0);
    });

    it('rounds to nearest basis point', () => {
      expect(moicToBps(2.50005)).toBe(25001); // Rounds up
      expect(moicToBps(2.50004)).toBe(25000); // Rounds down
    });

    it('handles high MOIC values', () => {
      expect(moicToBps(100)).toBe(1000000);
      expect(moicToBps(1000)).toBe(10000000);
    });
  });

  describe('bpsToMoic', () => {
    it('converts bps to MOIC multiplier', () => {
      expect(bpsToMoic(25000)).toBe(2.5);
      expect(bpsToMoic(100000)).toBe(10);
      expect(bpsToMoic(5000)).toBe(0.5);
      expect(bpsToMoic(10000)).toBe(1.0);
      expect(bpsToMoic(0)).toBe(0);
    });

    it('round-trips correctly with moicToBps', () => {
      const moics = [2.5, 10, 0.5, 1.0, 100];
      moics.forEach(moic => {
        expect(bpsToMoic(moicToBps(moic))).toBeCloseTo(moic, 4);
      });
    });
  });

  it('regression: prevents 100× MOIC error', () => {
    const userInputMoic = 2.5; // User enters "2.5x"

    // WRONG (old approach - causes 100× error):
    // const wrongBps = userInputMoic * 100; // => 250 bps = 0.025x

    // CORRECT (new approach):
    const correctBps = moicToBps(userInputMoic); // => 25000 bps = 2.5x

    expect(correctBps).toBe(25000);
    expect(bpsToMoic(correctBps)).toBe(2.5);
  });
});

describe('units.ts - Validated Conversions', () => {
  describe('dollarsToCentsValidated', () => {
    it('validates positive amounts', () => {
      expect(dollarsToCentsValidated(1000000)).toBe(100000000);
      expect(dollarsToCentsValidated(0.01)).toBe(1);
    });

    it('rejects negative amounts by default', () => {
      expect(() => dollarsToCentsValidated(-100)).toThrow('cannot be negative');
    });

    it('allows negative amounts with allowNegative flag', () => {
      expect(dollarsToCentsValidated(-100, { allowNegative: true })).toBe(-10000);
    });

    it('enforces minimum bounds', () => {
      expect(() => dollarsToCentsValidated(50, { min: 100 })).toThrow('below minimum');
    });

    it('enforces maximum bounds', () => {
      expect(() => dollarsToCentsValidated(200, { max: 100 })).toThrow('exceeds maximum');
    });

    it('rejects invalid values', () => {
      expect(() => dollarsToCentsValidated(NaN)).toThrow('Invalid dollar amount');
      expect(() => dollarsToCentsValidated(Infinity)).toThrow('Invalid dollar amount');
    });

    it('rejects unsafe integers', () => {
      const tooBig = Number.MAX_SAFE_INTEGER; // Already in cents scale
      expect(() => dollarsToCentsValidated(tooBig)).toThrow('unsafe integer');
    });
  });

  describe('percentToBpsValidated', () => {
    it('validates normal percentages', () => {
      expect(percentToBpsValidated(35)).toBe(3500);
      expect(percentToBpsValidated(100)).toBe(10000);
      expect(percentToBpsValidated(0)).toBe(0);
    });

    it('enforces 0-100 range by default', () => {
      expect(() => percentToBpsValidated(-10)).toThrow('below minimum');
      expect(() => percentToBpsValidated(150)).toThrow('exceeds maximum');
    });

    it('allows custom ranges', () => {
      expect(percentToBpsValidated(150, { max: 200 })).toBe(15000);
      expect(() => percentToBpsValidated(250, { max: 200 })).toThrow('exceeds maximum');
    });

    it('rejects invalid values', () => {
      expect(() => percentToBpsValidated(NaN)).toThrow('Invalid percentage');
      expect(() => percentToBpsValidated(Infinity)).toThrow('Invalid percentage');
    });
  });

  describe('moicToBpsValidated', () => {
    it('validates normal MOIC values', () => {
      expect(moicToBpsValidated(2.5)).toBe(25000);
      expect(moicToBpsValidated(10)).toBe(100000);
      expect(moicToBpsValidated(0)).toBe(0);
    });

    it('enforces 0-100 range by default', () => {
      expect(() => moicToBpsValidated(-1)).toThrow('below minimum');
      expect(() => moicToBpsValidated(150)).toThrow('exceeds maximum');
    });

    it('allows custom ranges for outliers', () => {
      expect(moicToBpsValidated(150, { max: 200 })).toBe(1500000);
      expect(() => moicToBpsValidated(250, { max: 200 })).toThrow('exceeds maximum');
    });

    it('rejects invalid values', () => {
      expect(() => moicToBpsValidated(NaN)).toThrow('Invalid MOIC');
      expect(() => moicToBpsValidated(Infinity)).toThrow('Invalid MOIC');
    });
  });
});

describe('units.ts - Clamping Utilities', () => {
  describe('clamp', () => {
    it('clamps values to range', () => {
      expect(clamp(150, 0, 100)).toBe(100);
      expect(clamp(-10, 0, 100)).toBe(0);
      expect(clamp(50, 0, 100)).toBe(50);
    });

    it('handles edge cases', () => {
      expect(clamp(0, 0, 100)).toBe(0);
      expect(clamp(100, 0, 100)).toBe(100);
    });
  });

  describe('clampBps', () => {
    it('clamps to 0-10000 range (0-100%)', () => {
      expect(clampBps(15000)).toBe(10000);
      expect(clampBps(-100)).toBe(0);
      expect(clampBps(5000)).toBe(5000);
    });
  });

  describe('clampPercent', () => {
    it('clamps to 0-100 range', () => {
      expect(clampPercent(150)).toBe(100);
      expect(clampPercent(-10)).toBe(0);
      expect(clampPercent(50)).toBe(50);
    });
  });
});

describe('units.ts - Formatting Utilities', () => {
  describe('formatCents', () => {
    it('formats cents as currency', () => {
      expect(formatCents(100000050)).toBe('$1,000,000.50');
      expect(formatCents(100)).toBe('$1.00');
      expect(formatCents(1)).toBe('$0.01');
      expect(formatCents(0)).toBe('$0.00');
    });

    it('formats in compact notation', () => {
      expect(formatCents(100000000, { compact: true })).toBe('$1M');
      expect(formatCents(1000000000, { compact: true })).toBe('$10M');
      expect(formatCents(1000000, { compact: true })).toBe('$10K');
    });

    it('respects decimal places', () => {
      expect(formatCents(100, { decimals: 0 })).toBe('$1');
      expect(formatCents(100, { decimals: 2 })).toBe('$1.00');
      expect(formatCents(100, { decimals: 3 })).toBe('$1.000');
    });
  });

  describe('formatBps', () => {
    it('formats bps as percentage', () => {
      expect(formatBps(3500)).toBe('35.00%');
      expect(formatBps(10000)).toBe('100.00%');
      expect(formatBps(50)).toBe('0.50%');
      expect(formatBps(0)).toBe('0.00%');
    });

    it('respects decimal places', () => {
      expect(formatBps(3500, { decimals: 0 })).toBe('35%');
      expect(formatBps(3500, { decimals: 1 })).toBe('35.0%');
      expect(formatBps(3500, { decimals: 3 })).toBe('35.000%');
    });
  });

  describe('formatMoic', () => {
    it('formats MOIC bps as multiplier', () => {
      expect(formatMoic(25000)).toBe('2.50x');
      expect(formatMoic(100000)).toBe('10.00x');
      expect(formatMoic(5000)).toBe('0.50x');
      expect(formatMoic(0)).toBe('0.00x');
    });

    it('respects decimal places', () => {
      expect(formatMoic(25000, { decimals: 0 })).toBe('3x'); // Rounds 2.5
      expect(formatMoic(25000, { decimals: 1 })).toBe('2.5x');
      expect(formatMoic(25000, { decimals: 3 })).toBe('2.500x');
    });
  });
});

describe('units.ts - Integration Tests', () => {
  it('handles complete fund calculation workflow', () => {
    // Scenario: $100M fund, 35% reserves, 2.5x exit MOIC
    const fundDollars = 100_000_000;
    const reservePercent = 35;
    const exitMoic = 2.5;

    // Convert to storage format
    const fundCents = dollarsToCents(fundDollars);
    const reserveBps = percentToBps(reservePercent);
    const exitMoicBps = moicToBps(exitMoic);

    expect(fundCents).toBe(10_000_000_000);
    expect(reserveBps).toBe(3500);
    expect(exitMoicBps).toBe(25000);

    // Calculate reserve amount
    const reserveAmountCents = Math.round(fundCents * bpsToDecimal(reserveBps));
    expect(reserveAmountCents).toBe(3_500_000_000);

    // Format for display
    expect(formatCents(reserveAmountCents, { compact: true })).toBe('$35M');
    expect(formatBps(reserveBps)).toBe('35.00%');
    expect(formatMoic(exitMoicBps)).toBe('2.50x');
  });

  it('prevents precision loss in multi-step calculations', () => {
    const initialDollars = 1_234_567.89;

    // Convert to cents and back
    const cents = dollarsToCents(initialDollars);
    const backToDollars = centsToDollars(cents);

    // Should be exact (no floating-point drift)
    expect(backToDollars).toBe(initialDollars);
  });

  it('maintains precision in percentage calculations', () => {
    const initialPercent = 35.75;

    // Convert to bps and back
    const bps = percentToBps(initialPercent);
    const backToPercent = bpsToPercent(bps);

    // Should be exact
    expect(backToPercent).toBe(initialPercent);
  });

  it('edge case: zero values', () => {
    expect(dollarsToCents(0)).toBe(0);
    expect(percentToBps(0)).toBe(0);
    expect(moicToBps(0)).toBe(0);
    expect(formatCents(0)).toBe('$0.00');
    expect(formatBps(0)).toBe('0.00%');
    expect(formatMoic(0)).toBe('0.00x');
  });

  it('edge case: maximum safe values', () => {
    const maxSafeCents = Number.MAX_SAFE_INTEGER;
    const maxSafeDollars = centsToDollars(maxSafeCents);

    // Should round-trip safely
    expect(dollarsToCents(maxSafeDollars)).toBeCloseTo(maxSafeCents, -2);
  });
});

describe('units.ts - Regression Tests', () => {
  it('regression: 100× MOIC error (original bug)', () => {
    // Original bug: user enters 2.5x MOIC, system stored as 250 bps instead of 25000 bps
    const userInput = '2.5';
    const moicValue = parseFloat(userInput);

    // Old (buggy) code would do:
    // const wrongBps = moicValue * 100; // => 250

    // New (correct) code:
    const correctBps = moicToBps(moicValue); // => 25000

    expect(correctBps).toBe(25000);
    expect(bpsToMoic(correctBps)).toBe(2.5);

    // Verify it produces correct exit value
    const investedCents = dollarsToCents(1_000_000); // $1M invested
    const exitValueCents = Math.round(investedCents * bpsToDecimal(correctBps));
    expect(centsToDollars(exitValueCents)).toBe(2_500_000); // $2.5M exit
  });

  it('regression: reserve percentage precision', () => {
    // Ensure 35% reserves calculates correctly
    const fundCents = dollarsToCents(100_000_000); // $100M
    const reserveBps = percentToBps(35); // 35%

    const reserveAmount = Math.round(fundCents * bpsToDecimal(reserveBps));
    expect(centsToDollars(reserveAmount)).toBe(35_000_000); // $35M
  });

  it('regression: fractional cent rounding', () => {
    // Ensure fractional cents round correctly
    expect(dollarsToCents(0.005)).toBe(1);  // Rounds up
    expect(dollarsToCents(0.004)).toBe(0);  // Rounds down
    expect(dollarsToCents(0.015)).toBe(2);  // Rounds up
    expect(dollarsToCents(0.014)).toBe(1);  // Rounds down
  });
});
