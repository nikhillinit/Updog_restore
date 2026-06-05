import { describe, expect, it } from 'vitest';
import { ensureFinancialNumber, sanitizeUserInput } from '@/lib/validation-helpers';

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

describe('sanitizeUserInput', () => {
  it('removes executable URL schemes including data URLs', () => {
    const scriptScheme = ['java', 'script'].join('');

    expect(sanitizeUserInput(`${scriptScheme}:alert(1)`)).not.toMatch(/javascript:/i);
    expect(sanitizeUserInput('vbscript:alert(1)')).not.toMatch(/vbscript:/i);
    expect(sanitizeUserInput('data:text/html,<script>alert(1)</script>')).not.toMatch(/data:/i);
  });

  it('removes executable schemes reconstructed by repeated stripping', () => {
    for (const input of [
      'dadata:ta:text/html',
      'jajavascript:vascript:alert(1)',
      'vbvbscript:script:msgbox(1)',
    ]) {
      expect(sanitizeUserInput(input)).not.toMatch(/javascript:|vbscript:|data:/i);
    }
  });
});
