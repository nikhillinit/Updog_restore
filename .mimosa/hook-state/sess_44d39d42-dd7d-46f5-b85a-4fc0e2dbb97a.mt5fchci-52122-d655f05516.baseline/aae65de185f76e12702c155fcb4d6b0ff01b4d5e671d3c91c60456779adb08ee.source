import { describe, expect, it } from 'vitest';

import { AnalysisDraftEconomicsReferencePatchRequestSchema } from '../../../../shared/contracts/internal-analysis/analysis-reference-snapshot-v1.contract';

describe('analysis draft economics-reference PATCH request', () => {
  it.each([7, null])('accepts the strict supported value %s', (economicsReferenceId) => {
    expect(
      AnalysisDraftEconomicsReferencePatchRequestSchema.parse({ economicsReferenceId })
    ).toEqual({ economicsReferenceId });
  });

  it.each([
    {},
    { economicsReferenceId: 0 },
    { economicsReferenceId: -1 },
    { economicsReferenceId: 1.5 },
    { economicsReferenceId: '7' },
    { economicsReferenceId: 7, extra: true },
  ])('rejects unsupported payload %#', (payload) => {
    expect(AnalysisDraftEconomicsReferencePatchRequestSchema.safeParse(payload).success).toBe(
      false
    );
  });
});
