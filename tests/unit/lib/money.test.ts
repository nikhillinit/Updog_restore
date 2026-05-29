import { describe, expect, it } from 'vitest';
import {
  Decimal,
  clamp,
  percentageChange,
  roundCurrency,
  roundIRR,
  roundMultiple,
  roundPercentage,
  safeDivide,
  sum,
} from '@shared/lib/decimal-money';
import { formatMetric } from '@shared/lib/format-money';
import {
  addCents,
  conservationCheck,
  fromCents,
  maxCents,
  minCents,
  subCents,
  toCents,
} from '@shared/lib/cents';
import { toCents as compatibilityToCents } from '@shared/money';
import {
  formatMetric as compatibilityFormatMetric,
  roundCurrency as compatibilityRoundCurrency,
} from '@shared/lib/money';

describe('money utilities', () => {
  it('keeps exact cents utilities on bigint conservation paths', () => {
    const first = toCents(10.25);
    const second = toCents(5.75);

    expect(first).toBe(1025n);
    expect(fromCents(first)).toBe(10.25);
    expect(addCents(first, second)).toBe(1600n);
    expect(subCents(first, second)).toBe(450n);
    expect(minCents(first, second)).toBe(second);
    expect(maxCents(first, second)).toBe(first);
    expect(conservationCheck([first, second], [1600n])).toBe(true);
    expect(conservationCheck([first], [second])).toBe(false);
    expect(() => toCents(Number.NaN)).toThrow('bad dollars');
  });

  it('rounds metric types with Decimal precision', () => {
    expect(roundIRR(0.24567).toString()).toBe('0.2457');
    expect(roundMultiple(2.54678).toString()).toBe('2.55');
    expect(roundCurrency(1234567.895).toString()).toBe('1234567.9');
    expect(roundPercentage(0.45678).toString()).toBe('0.46');
  });

  it('formats public metric display values', () => {
    expect(formatMetric(0.2456, 'irr')).toBe('24.5600%');
    expect(formatMetric(2.546, 'multiple')).toBe('2.55x');
    expect(formatMetric(1234567.89, 'currency')).toBe('$1,234,567.89');
    expect(formatMetric(0.4567, 'percentage')).toBe('46.00%');
    expect(formatMetric(null, 'irr')).toBe('N/A');
    expect(formatMetric(Number.POSITIVE_INFINITY, 'irr')).toBe('\u2014');
  });

  it('handles arithmetic helpers without floating-point drift', () => {
    expect(safeDivide(10, 4)?.toString()).toBe('2.5');
    expect(safeDivide(10, 0)).toBeNull();
    expect(percentageChange(100, 115)?.toString()).toBe('0.15');
    expect(percentageChange(0, 115)).toBeNull();
    expect(clamp(15, 0, 10).toString()).toBe('10');
    expect(sum([new Decimal('0.1'), new Decimal('0.2')]).toString()).toBe('0.3');
  });

  it('preserves temporary compatibility barrels', () => {
    expect(compatibilityToCents(1.23)).toBe(123n);
    expect(compatibilityRoundCurrency(12.345).toString()).toBe('12.35');
    expect(compatibilityFormatMetric(0.1, 'percentage')).toBe('10.00%');
  });
});
