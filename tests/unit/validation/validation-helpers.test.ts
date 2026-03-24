import { describe, expect, it } from 'vitest';
import { ensureFinancialNumber } from '@/lib/validation-helpers';

describe('ensureFinancialNumber', () => {
  it('parses sanitized currency and percentage strings', () => {
    expect(ensureFinancialNumber('$1,234.50')).toBe(1234.5);
    expect(ensureFinancialNumber('12.5%')).toBe(12.5);
  });

  it('falls back for partially numeric strings instead of partially parsing them', () => {
    expect(ensureFinancialNumber('12abc', 9)).toBe(9);
    expect(ensureFinancialNumber('abc', 7)).toBe(7);
  });

  it('returns the fallback for empty sanitized strings', () => {
    expect(ensureFinancialNumber('$', 5)).toBe(5);
    expect(ensureFinancialNumber('   ', 4)).toBe(4);
  });
});
