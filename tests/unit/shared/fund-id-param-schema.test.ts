import { describe, it, expect } from 'vitest';

import { FundIdParamSchema } from '@shared/schemas/portfolio-route';

describe('FundIdParamSchema (canonical fund id)', () => {
  it.each([
    ['1', 1],
    ['42', 42],
    ['1000000', 1000000],
  ])('accepts canonical %s and transforms to %i', (input, expected) => {
    const result = FundIdParamSchema.safeParse({ fundId: input });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fundId).toBe(expected);
    }
  });

  it.each(['0', '01', '007', '1e1', 'abc', '-1', '1.5', '', '99999999999999999999'])(
    'rejects non-canonical %s',
    (input) => {
      expect(FundIdParamSchema.safeParse({ fundId: input }).success).toBe(false);
    }
  );
});
