import { describe, it, expect } from 'vitest';
import { excelRound, isAlreadyRounded } from '../../shared/lib/excelRound';

describe('excelRound - Excel ROUND parity', () => {
  describe('tie cases (exactly 0.5) - round away from zero', () => {
    it('should round positive ties away from zero at 2 decimal places', () => {
      expect(excelRound(0.005, 2)).toBe(0.01);
      expect(excelRound(0.015, 2)).toBe(0.02);
      expect(excelRound(0.025, 2)).toBe(0.03);
    });

    it('should round negative ties away from zero at 2 decimal places', () => {
      expect(excelRound(-0.005, 2)).toBe(-0.01);
      expect(excelRound(-0.015, 2)).toBe(-0.02);
      expect(excelRound(-0.025, 2)).toBe(-0.03);
    });

    it('should handle tie cases at different decimal places', () => {
      expect(excelRound(0.5, 0)).toBe(1);
      expect(excelRound(-0.5, 0)).toBe(-1);
      expect(excelRound(1.5, 0)).toBe(2);
      expect(excelRound(-1.5, 0)).toBe(-2);
    });
  });

  describe('regular rounding (non-tie cases)', () => {
    it('should round normally at 2 decimal places', () => {
      expect(excelRound(2.345, 2)).toBe(2.35); // Note: 0.045 is not exactly 0.5
      expect(excelRound(-2.345, 2)).toBe(-2.35);
      expect(excelRound(2.344, 2)).toBe(2.34);
      expect(excelRound(2.346, 2)).toBe(2.35);
    });

    it('should round to integer when numDigits = 0', () => {
      expect(excelRound(2.4, 0)).toBe(2);
      expect(excelRound(2.6, 0)).toBe(3);
      expect(excelRound(-2.4, 0)).toBe(-2);
      expect(excelRound(-2.6, 0)).toBe(-3);
    });

    it('should handle very small fractions', () => {
      expect(excelRound(0.001, 2)).toBe(0);
      expect(excelRound(0.004, 2)).toBe(0);
      expect(excelRound(0.006, 2)).toBe(0.01);
    });
  });

  describe('negative digits (rounding to tens, hundreds, etc.)', () => {
    it('should round to tens when numDigits = -1', () => {
      expect(excelRound(123.45, -1)).toBe(120);
      expect(excelRound(125, -1)).toBe(130);
      expect(excelRound(-25, -1)).toBe(-30);
      expect(excelRound(-24, -1)).toBe(-20);
    });

    it('should round to hundreds when numDigits = -2', () => {
      expect(excelRound(1234.56, -2)).toBe(1200);
      expect(excelRound(1250, -2)).toBe(1300);
      expect(excelRound(-1250, -2)).toBe(-1300);
    });

    it('should round to thousands when numDigits = -3', () => {
      expect(excelRound(12345, -3)).toBe(12000);
      expect(excelRound(12500, -3)).toBe(13000);
    });
  });

  describe('edge cases', () => {
    it('should handle zero', () => {
      expect(excelRound(0, 0)).toBe(0);
      expect(excelRound(0, 2)).toBe(0);
      expect(excelRound(0, -1)).toBe(0);
    });

    it('should handle large numbers', () => {
      expect(excelRound(1000000.005, 2)).toBe(1000000.01);
      expect(excelRound(999999.999, 2)).toBe(1000000);
    });

    it('should handle very small numbers', () => {
      expect(excelRound(0.0000005, 6)).toBe(0.000001);
      expect(excelRound(-0.0000005, 6)).toBe(-0.000001);
    });

    it('should handle numbers already rounded', () => {
      expect(excelRound(1.23, 2)).toBe(1.23);
      expect(excelRound(100, -1)).toBe(100);
      expect(excelRound(-50.0, 2)).toBe(-50);
    });
  });

  describe('default parameter behavior', () => {
    it('should default to 0 decimal places when numDigits omitted', () => {
      expect(excelRound(2.5)).toBe(3);
      expect(excelRound(-2.5)).toBe(-3);
      expect(excelRound(2.4)).toBe(2);
      expect(excelRound(2.6)).toBe(3);
    });
  });

  describe('error handling', () => {
    it('should throw on non-finite values', () => {
      expect(() => excelRound(Infinity, 2)).toThrow('value must be finite');
      expect(() => excelRound(-Infinity, 2)).toThrow('value must be finite');
      expect(() => excelRound(NaN, 2)).toThrow('value must be finite');
    });

    it('should throw on non-integer numDigits', () => {
      expect(() => excelRound(1.23, 2.5)).toThrow('numDigits must be an integer');
      expect(() => excelRound(1.23, 1.1)).toThrow('numDigits must be an integer');
    });
  });

  describe('Excel parity validation cases', () => {
    // These test cases match exact Excel ROUND() behavior
    it('should match Excel ROUND(0.005, 2) = 0.01', () => {
      expect(excelRound(0.005, 2)).toBe(0.01);
    });

    it('should match Excel ROUND(-0.005, 2) = -0.01', () => {
      expect(excelRound(-0.005, 2)).toBe(-0.01);
    });

    it('should match Excel ROUND(2.5, 0) = 3', () => {
      expect(excelRound(2.5, 0)).toBe(3);
    });

    it('should match Excel ROUND(-2.5, 0) = -3', () => {
      expect(excelRound(-2.5, 0)).toBe(-3);
    });

    it('should match Excel ROUND(1.005, 2) = 1.01', () => {
      expect(excelRound(1.005, 2)).toBe(1.01);
    });
  });
});

describe('isAlreadyRounded - optimization helper', () => {
  it('should return true for values already rounded to specified digits', () => {
    expect(isAlreadyRounded(1.23, 2)).toBe(true);
    expect(isAlreadyRounded(100, -1)).toBe(true);
    expect(isAlreadyRounded(1200, -2)).toBe(true);
    expect(isAlreadyRounded(5.0, 2)).toBe(true);
  });

  it('should return false for values needing rounding', () => {
    expect(isAlreadyRounded(1.234, 2)).toBe(false);
    expect(isAlreadyRounded(123, -2)).toBe(false);
    expect(isAlreadyRounded(0.005, 2)).toBe(false);
  });

  it('should handle zero', () => {
    expect(isAlreadyRounded(0, 0)).toBe(true);
    expect(isAlreadyRounded(0, 2)).toBe(true);
    expect(isAlreadyRounded(0, -1)).toBe(true);
  });

  it('should return false for non-finite values', () => {
    expect(isAlreadyRounded(Infinity, 2)).toBe(false);
    expect(isAlreadyRounded(NaN, 2)).toBe(false);
  });

  it('should default to 0 decimal places when numDigits omitted', () => {
    expect(isAlreadyRounded(5)).toBe(true);
    expect(isAlreadyRounded(5.1)).toBe(false);
  });
});

describe('excelRound - waterfall calculation scenarios', () => {
  // Real-world scenarios from waterfall calculations
  it('should handle LP/GP carry split with 20% carry', () => {
    const distributable = 1000000;
    const carry = 0.2;

    const gpTotal = distributable * carry; // 200000
    const lpTotal = distributable * (1 - carry); // 800000

    expect(excelRound(gpTotal, 2)).toBe(200000);
    expect(excelRound(lpTotal, 2)).toBe(800000);
  });

  it('should handle hurdle calculations with 8% preferred return', () => {
    const contributedCapital = 500000;
    const hurdle = 0.08;

    const preferredReturn = contributedCapital * hurdle; // 40000
    expect(excelRound(preferredReturn, 2)).toBe(40000);
  });

  it('should handle catch-up tier with fractional amounts', () => {
    // After ROC and preferred return, GP catches up
    const catchUpAmount = 62500.125; // Hypothetical catch-up amount
    expect(excelRound(catchUpAmount, 2)).toBe(62500.13);
  });

  it('should handle residual split with rounding', () => {
    const residual = 450000.255;
    const carry = 0.2;

    const gpResidual = residual * carry; // 90000.051
    const lpResidual = residual * (1 - carry); // 360000.204

    expect(excelRound(gpResidual, 2)).toBe(90000.05);
    expect(excelRound(lpResidual, 2)).toBe(360000.2);
  });
});
