import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import { parseFundViewContextV1 } from '../../../client/src/lib/fund-view-context';

function validFundViewContext() {
  return {
    contractVersion: 'fund-view-context-v1',
    fundId: 7,
    vehicleId: null,
    asOfDate: '2026-07-29',
    currentPlanVersionId: 'plan-version-1',
    viewPreset: 'live',
  };
}

describe('parseFundViewContextV1', () => {
  it('returns the parsed value for a valid candidate', () => {
    const candidate = validFundViewContext();

    expect(parseFundViewContextV1(candidate)).toEqual(candidate);
  });

  it('throws a ZodError for an invalid candidate', () => {
    expect(() =>
      parseFundViewContextV1({
        ...validFundViewContext(),
        fundId: 0,
      })
    ).toThrow(z.ZodError);
  });
});
