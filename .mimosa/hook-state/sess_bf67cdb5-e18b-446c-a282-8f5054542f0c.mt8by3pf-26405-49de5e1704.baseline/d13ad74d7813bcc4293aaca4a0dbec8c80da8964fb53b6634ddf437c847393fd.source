import { describe, it, expect } from 'vitest';
import { eq, normalizeNumber } from '../../client/src/utils/state-utils';

describe('NaN-safe equality', () => {
  it('should handle NaN equality correctly', () => {
    // Object.is treats NaN as equal to NaN
    expect(eq(NaN, NaN)).toBe(true);
    
    // Regular === fails for NaN
    expect(NaN === NaN).toBe(false);
  });

  it('should handle numeric equality correctly', () => {
    expect(eq(5, 5)).toBe(true);
    expect(eq(5, 6)).toBe(false);
    expect(eq(0, -0)).toBe(false); // Object.is distinguishes +0 and -0
  });

  it('should normalize empty values to NaN', () => {
    expect(normalizeNumber('')).toBeNaN();
    expect(normalizeNumber(null)).toBeNaN();
    expect(normalizeNumber(undefined)).toBeNaN();
    expect(normalizeNumber('not-a-number')).toBeNaN();
  });

  it('should preserve valid numbers', () => {
    expect(normalizeNumber(5)).toBe(5);
    expect(normalizeNumber('5')).toBe(5);
    expect(normalizeNumber(0)).toBe(0);
    expect(normalizeNumber('0')).toBe(0);
  });

  it('should detect NaN equality in normalized values', () => {
    const v1 = normalizeNumber('');
    const v2 = normalizeNumber(null);
    
    // Both normalize to NaN
    expect(v1).toBeNaN();
    expect(v2).toBeNaN();
    
    // Object.is correctly identifies them as equal
    expect(eq(v1, v2)).toBe(true);
    
    // Regular === would fail
    expect(v1 === v2).toBe(false);
  });
});