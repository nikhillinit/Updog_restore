import { describe, expect, it } from 'vitest';

import { Decimal } from '../../../shared/lib/decimal-config';
import { calculateGuardedRatios } from '../../../shared/lib/internal-economics/ratio-null-guard-v1';

describe('ratio-null-guard-v1', () => {
  it('calculates ratios correctly for positive contributions', () => {
    const result = calculateGuardedRatios('40', '60', '50');

    expect(result.warning).toBeNull();
    expect(result.dpi).toBe('0.800000');
    expect(result.rvpi).toBe('1.200000');
    expect(result.tvpi).toBe('2.000000');
    expect(result.moic).toBe('2.000000');
  });

  it('handles Decimal inputs transparently', () => {
    const result = calculateGuardedRatios(new Decimal('15'), new Decimal('35'), new Decimal('25'));

    expect(result.warning).toBeNull();
    expect(result.dpi).toBe('0.600000');
    expect(result.rvpi).toBe('1.400000');
    expect(result.tvpi).toBe('2.000000');
    expect(result.moic).toBe('2.000000');
  });

  it('returns nulls and a ZERO_CONTRIBUTIONS warning when contributions are exactly zero', () => {
    const result = calculateGuardedRatios('10', '20', '0');

    expect(result.dpi).toBeNull();
    expect(result.rvpi).toBeNull();
    expect(result.tvpi).toBeNull();
    expect(result.moic).toBeNull();

    expect(result.warning).not.toBeNull();
    expect(result.warning?.code).toBe('ZERO_CONTRIBUTIONS');
    expect(result.warning?.message).toMatch(/Net contributions are zero or negative/);
  });

  it('returns nulls and a ZERO_CONTRIBUTIONS warning when contributions are negative', () => {
    const result = calculateGuardedRatios('10', '20', '-5');

    expect(result.dpi).toBeNull();
    expect(result.rvpi).toBeNull();
    expect(result.tvpi).toBeNull();
    expect(result.moic).toBeNull();

    expect(result.warning).not.toBeNull();
    expect(result.warning?.code).toBe('ZERO_CONTRIBUTIONS');
  });

  it('maintains high precision without fabricating zeros for complex fractional ratios', () => {
    const result = calculateGuardedRatios('100.123', '200.456', '50.789');

    expect(result.warning).toBeNull();
    expect(result.dpi).toBe('1.971352');
    expect(result.rvpi).toBe('3.946839');
    expect(result.tvpi).toBe('5.918191');
    expect(result.moic).toBe('5.918191');
  });
});
