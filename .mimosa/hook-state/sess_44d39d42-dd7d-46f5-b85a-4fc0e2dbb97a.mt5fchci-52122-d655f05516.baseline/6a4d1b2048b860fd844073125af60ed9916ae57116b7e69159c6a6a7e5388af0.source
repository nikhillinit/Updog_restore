import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import { FundViewContextV1Schema } from '../../../shared/contracts/fund-view-context-v1.contract';

function validFundViewContext() {
  return {
    contractVersion: 'fund-view-context-v1',
    fundId: 7,
    vehicleId: 11,
    asOfDate: '2026-07-29',
    currentPlanVersionId: 'plan-version-1',
    viewPreset: 'historical',
  };
}

describe('FundViewContextV1 contract', () => {
  it('parses a valid fund-view context', () => {
    const candidate = validFundViewContext();

    expect(FundViewContextV1Schema.parse(candidate)).toEqual(candidate);
  });

  it.each(['fundId', 'vehicleId', 'asOfDate', 'currentPlanVersionId'] as const)(
    'accepts null for %s',
    (field) => {
      const parsed = FundViewContextV1Schema.parse({
        ...validFundViewContext(),
        [field]: null,
      });

      expect(parsed[field]).toBeNull();
    }
  );

  it('rejects a view preset outside the shared live/historical vocabulary', () => {
    expect(() =>
      FundViewContextV1Schema.parse({
        ...validFundViewContext(),
        viewPreset: 'forecast',
      })
    ).toThrow(z.ZodError);
  });

  it('rejects unknown top-level keys', () => {
    expect(() =>
      FundViewContextV1Schema.parse({
        ...validFundViewContext(),
        unexpected: true,
      })
    ).toThrow(z.ZodError);
  });
});
