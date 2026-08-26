import { describe, expect, it } from 'vitest';

import {
  PortfolioCompanyMetadataPatch,
  PortfolioCompanyUpdateRequest,
} from '@shared/schemas/portfolio-route';

describe('portfolio company metadata update contract', () => {
  it('accepts metadata-only patches, including nullable clears', () => {
    expect(
      PortfolioCompanyUpdateRequest.parse({
        expectedVersion: 3,
        patch: {
          name: 'Updated Company',
          foundedYear: null,
          description: null,
          dealTags: null,
        },
      })
    ).toEqual({
      expectedVersion: 3,
      patch: {
        name: 'Updated Company',
        foundedYear: null,
        description: null,
        dealTags: null,
      },
    });
  });

  it('rejects unknown request and patch keys', () => {
    expect(
      PortfolioCompanyUpdateRequest.safeParse({
        expectedVersion: 1,
        patch: { name: 'Company', status: 'exited' },
      }).success
    ).toBe(false);
    expect(
      PortfolioCompanyUpdateRequest.safeParse({
        expectedVersion: 1,
        patch: { name: 'Company' },
        idempotencyKey: 'not-in-body',
      }).success
    ).toBe(false);
  });

  it('does not expose lifecycle or financial fields in the patch schema', () => {
    const result = PortfolioCompanyMetadataPatch.safeParse({
      stage: 'Series A',
      currentStage: 'Series A',
      status: 'active',
      investmentAmount: '1000000',
      currentValuation: '2000000',
    });

    expect(result.success).toBe(false);
  });
});
