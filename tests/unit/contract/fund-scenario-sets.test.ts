import { describe, expect, it } from 'vitest';

import {
  CreateFundScenarioSetV1Schema,
  FundScenarioSetDetailV1Schema,
  FundScenarioVariantOverrideV1Schema,
} from '../../../shared/contracts/fund-scenario-sets-v1.contract';

const feeProfileOverride = {
  overrideType: 'fee_profile',
  payload: {
    feeProfiles: [
      {
        id: 'fee-profile-upside',
        name: 'Upside fees',
        feeTiers: [
          {
            id: 'tier-1',
            name: 'Management fee',
            percentage: 2,
            feeBasis: 'committed_capital',
            startMonth: 0,
            endMonth: 120,
            recyclingPercentage: 25,
          },
        ],
      },
    ],
  },
} as const;

describe('FundScenarioSetsV1 contract', () => {
  it('accepts a fee-profile-only scenario set create payload', () => {
    const result = CreateFundScenarioSetV1Schema.safeParse({
      name: 'Fee sensitivity',
      description: 'Compare alternate management fee profile',
      variants: [
        {
          name: 'Lower fee',
          description: '1.5 and 20 profile',
          override: feeProfileOverride,
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.data?.variants[0]?.override.overrideType).toBe('fee_profile');
  });

  it('rejects non-fee override types in the first slice', () => {
    const result = FundScenarioVariantOverrideV1Schema.safeParse({
      overrideType: 'allocation',
      payload: {
        allocations: [],
      },
    });

    expect(result.success).toBe(false);
  });

  it('caps first-slice scenario sets at five variants', () => {
    const variants = Array.from({ length: 6 }, (_, index) => ({
      name: `Variant ${index + 1}`,
      override: feeProfileOverride,
    }));

    const result = CreateFundScenarioSetV1Schema.safeParse({
      name: 'Too many variants',
      variants,
    });

    expect(result.success).toBe(false);
  });

  it('describes persisted set details with source config and archive attribution', () => {
    const result = FundScenarioSetDetailV1Schema.safeParse({
      id: '00000000-0000-0000-0000-000000000111',
      fundId: 1,
      name: 'Fee sensitivity',
      description: null,
      sourceConfigId: 12,
      sourceConfigVersion: 4,
      variantCount: 1,
      archivedAt: null,
      archivedByUserId: null,
      archivedByLabel: null,
      createdByUserId: 17,
      createdByLabel: 'analyst@example.com',
      updatedByUserId: 17,
      updatedByLabel: 'analyst@example.com',
      createdAt: '2026-05-26T12:00:00.000Z',
      updatedAt: '2026-05-26T12:00:00.000Z',
      variants: [
        {
          id: '00000000-0000-0000-0000-000000000112',
          scenarioSetId: '00000000-0000-0000-0000-000000000111',
          name: 'Lower fee',
          description: null,
          sortOrder: 0,
          override: feeProfileOverride,
          createdAt: '2026-05-26T12:00:00.000Z',
          updatedAt: '2026-05-26T12:00:00.000Z',
        },
      ],
    });

    expect(result.success).toBe(true);
  });
});
