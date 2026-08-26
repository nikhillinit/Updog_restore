/**
 * Retroactive Fee Catch-Up Preview Tests
 *
 * The preview must agree with the shared fee engine, because the wizard shows
 * these numbers as proof of what the model charges.
 */

import { describe, it, expect } from 'vitest';
import { previewRetroactiveFeeCatchUp } from '@/lib/retroactive-fee-catch-up-preview';

describe('previewRetroactiveFeeCatchUp', () => {
  it('charges every missed month when no limit applies', () => {
    const preview = previewRetroactiveFeeCatchUp({
      rate: 2,
      basis: 'committed',
      firstFeeYear: 3,
      enabled: true,
      accrualStartMonth: 0,
    });

    expect(preview).not.toBeNull();
    expect(preview?.firstFeeMonth).toBe(24);
    expect(preview?.missedMonths).toBe(24);
    expect(preview?.chargedMonths).toBe(24);
    expect(preview?.cappedMonths).toBe(0);
    // 24 months at 2% / 12 per month = 4% of the fee basis
    expect(preview?.catchUpPercentOfBasis).toBeCloseTo(4, 10);
    expect(preview?.monthlyPercentOfBasis).toBeCloseTo(2 / 12, 10);
  });

  it('reports the months that the limit removed', () => {
    const preview = previewRetroactiveFeeCatchUp({
      rate: 2,
      basis: 'called',
      firstFeeYear: 3,
      enabled: true,
      accrualStartMonth: 0,
      maxCatchUpMonths: 6,
    });

    expect(preview?.chargedMonths).toBe(6);
    expect(preview?.cappedMonths).toBe(18);
    expect(preview?.catchUpPercentOfBasis).toBeCloseTo(1, 10);
  });

  it('charges nothing when the setting is disabled', () => {
    const preview = previewRetroactiveFeeCatchUp({
      rate: 2,
      basis: 'committed',
      firstFeeYear: 3,
      enabled: false,
      accrualStartMonth: 0,
    });

    expect(preview?.chargedMonths).toBe(0);
    expect(preview?.catchUpPercentOfBasis).toBe(0);
  });

  it('charges nothing when fees begin in fund year 1', () => {
    const preview = previewRetroactiveFeeCatchUp({
      rate: 2,
      basis: 'committed',
      firstFeeYear: 1,
      enabled: true,
      accrualStartMonth: 0,
    });

    expect(preview?.missedMonths).toBe(0);
    expect(preview?.catchUpPercentOfBasis).toBe(0);
  });

  it('returns null for inputs that the model cannot use', () => {
    const base = {
      rate: 2,
      basis: 'committed' as const,
      firstFeeYear: 3,
      enabled: true,
      accrualStartMonth: 0,
    };

    expect(previewRetroactiveFeeCatchUp({ ...base, rate: Number.NaN })).toBeNull();
    expect(previewRetroactiveFeeCatchUp({ ...base, firstFeeYear: 0 })).toBeNull();
    expect(previewRetroactiveFeeCatchUp({ ...base, accrualStartMonth: -1 })).toBeNull();
    // Accrual after the first fee month has no meaning
    expect(previewRetroactiveFeeCatchUp({ ...base, accrualStartMonth: 36 })).toBeNull();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects maxCatchUpMonths=%s before a negative catch-up fee can be exposed',
    (maxCatchUpMonths) => {
      const preview = previewRetroactiveFeeCatchUp({
        rate: 2,
        basis: 'committed',
        firstFeeYear: 3,
        enabled: true,
        accrualStartMonth: 0,
        maxCatchUpMonths,
      });

      expect(preview).toBeNull();
    }
  );

  it('returns only non-negative catch-up values for a valid limit', () => {
    const preview = previewRetroactiveFeeCatchUp({
      rate: 2,
      basis: 'committed',
      firstFeeYear: 3,
      enabled: true,
      accrualStartMonth: 0,
      maxCatchUpMonths: 6,
    });

    if (preview === null) {
      throw new Error('Expected a preview for a valid catch-up limit');
    }

    expect(preview.catchUpPercentOfBasis).toBeGreaterThanOrEqual(0);
    expect(preview.monthlyPercentOfBasis).toBeGreaterThanOrEqual(0);
    expect(preview.chargedMonths).toBeGreaterThanOrEqual(0);
    expect(preview.cappedMonths).toBeGreaterThanOrEqual(0);
  });
});
