/**
 * LP Reporting -- decimal-string formatter tests.
 *
 * Covers happy path, null, zero, negative, large, leading zero edge
 * cases. Plus a structural assertion that the formatter source never
 * calls `Number(` -- ADR-011 forbids floating-point parsing of money
 * decimal strings.
 */

import { describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';

// `tests/setup/node-setup.ts` mocks `fs` for the server project; pull the
// real `readFileSync` for the source-discipline test.
async function readSource(relativePath: string): Promise<string> {
  const realFs = await vi.importActual<typeof import('node:fs')>('node:fs');
  return realFs.readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

import {
  formatDecimalCurrency,
  formatDecimalRatio,
  formatIrr,
} from '@/lib/format/lp-reporting/decimal';

describe('formatDecimalCurrency', () => {
  it('formats a typical money decimal string with USD currency', () => {
    expect(formatDecimalCurrency('1250000')).toBe('$1,250,000.00');
  });

  it('renders the placeholder for null', () => {
    expect(formatDecimalCurrency(null)).toBe('--');
  });

  it('renders zero correctly', () => {
    expect(formatDecimalCurrency('0')).toBe('$0.00');
  });

  it('renders a negative amount', () => {
    expect(formatDecimalCurrency('-50.5')).toBe('-$50.50');
  });

  it('renders a value larger than Number.MAX_SAFE_INTEGER without precision loss', () => {
    // 9_007_199_254_740_993 is MAX_SAFE_INTEGER + 2; Number(value) would
    // round it to MAX_SAFE_INTEGER + 1.
    const value = '9007199254740993';
    const formatted = formatDecimalCurrency(value);
    expect(formatted).toBe('$9,007,199,254,740,993.00');
  });

  it('handles leading-zero decimals (e.g. "0.05") without dropping the leading zero', () => {
    expect(formatDecimalCurrency('0.05')).toBe('$0.05');
  });

  it('rounds to 2 fractional digits at display time', () => {
    expect(formatDecimalCurrency('1.234567')).toBe('$1.23');
  });

  it('honours an explicit currency code', () => {
    // Non-USD path -- exact glyph varies by ICU but the amount must
    // not drop precision.
    const result = formatDecimalCurrency('1000', 'EUR');
    expect(result).toMatch(/1,000\.00/);
  });
});

describe('formatDecimalRatio', () => {
  it('renders a typical TVPI multiple', () => {
    expect(formatDecimalRatio('1.25')).toBe('1.25x');
  });

  it('renders the placeholder for null', () => {
    expect(formatDecimalRatio(null)).toBe('--');
  });

  it('renders zero', () => {
    expect(formatDecimalRatio('0')).toBe('0.00x');
  });

  it('honours the precision argument', () => {
    expect(formatDecimalRatio('1.23456', 4)).toBe('1.2346x');
  });

  it('renders a negative ratio (rare but possible for variance)', () => {
    expect(formatDecimalRatio('-0.5')).toBe('-0.50x');
  });
});

describe('formatIrr', () => {
  it('renders a typical IRR ratio as a percentage', () => {
    expect(formatIrr('0.15')).toBe('15.00%');
  });

  it('renders the placeholder for null', () => {
    expect(formatIrr(null)).toBe('--');
  });

  it('renders zero', () => {
    expect(formatIrr('0')).toBe('0.00%');
  });

  it('renders a negative IRR', () => {
    expect(formatIrr('-0.05')).toBe('-5.00%');
  });

  it('handles leading zeros in the input', () => {
    expect(formatIrr('00.05')).toBe('5.00%');
  });
});

describe('source-level discipline (ADR-011)', () => {
  it('the decimal formatter source never calls Number() to parse the input', async () => {
    const raw = await readSource('client/src/lib/format/lp-reporting/decimal.ts');

    // Strip block comments and line comments before scanning so the
    // doc-comment that warns "NEVER call Number(value)" doesn't false
    // -positive against itself.
    const stripped = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');

    // `Number(` would be present if the formatter ever coerced a
    // decimal-string via the unsafe IEEE-754 path.
    expect(stripped.includes('Number(')).toBe(false);
  });
});
