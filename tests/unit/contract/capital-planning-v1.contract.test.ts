import { describe, expect, it } from 'vitest';
import {
  CAPITAL_PLANNING_DISCLOSURES,
  CapitalAllocationInputV1Schema,
  CapitalBudgetBridgeV1Schema,
  CapitalCountViewV1Schema,
  CapitalDecimalV1Schema,
  CapitalLabelV1Schema,
  CapitalMoneyV1Schema,
  CapitalOptionalMoneyV1Schema,
  CapitalPlanningInputV1Schema,
  CapitalPlanningMemoV1Schema,
  CapitalRatioV1Schema,
  CapitalScenarioNameV1Schema,
  CapitalUnitDeclarationsV1Schema,
} from '../../../shared/contracts/capital-planning-v1.contract';
import {
  CreateFundScenarioSetV1Schema,
  CreateFundScenarioSetV2Schema,
  FundScenarioVariantOverrideV1Schema,
} from '../../../shared/contracts/fund-scenario-sets-v1.contract';
import fixtures from '../../fixtures/capital-planning/core-contracts.json';

const allocation = fixtures.input.allocations[0]!;
const legacyVariant = {
  name: 'Baseline',
  override: {
    overrideType: 'allocation',
    payload: { allocations: [{ id: 'seed', category: 'Seed', percentage: 100 }] },
  },
};

describe('B1 capital planning core contracts and independent fixtures', () => {
  it('preserves canonical input literals and omitted optional values', () => {
    expect(CapitalPlanningInputV1Schema.parse(fixtures.input)).toEqual(fixtures.input);
    expect(CapitalPlanningInputV1Schema.parse(fixtures.input)).not.toHaveProperty(
      'netInvestableCapitalUsd'
    );
    expect(CapitalAllocationInputV1Schema.parse(allocation)).not.toHaveProperty(
      'plannedCompanyCount'
    );
  });

  it('preserves explicit zero separately from omission', () => {
    const input = {
      ...fixtures.input,
      netInvestableCapitalUsd: '0.000000',
      allocations: [{ ...allocation, plannedCompanyCount: 0 }],
    };
    expect(CapitalPlanningInputV1Schema.parse(input)).toEqual(input);
    expect(CapitalOptionalMoneyV1Schema.parse({ state: 'available', value: '0.000000' })).toEqual({
      state: 'available',
      value: '0.000000',
    });
    const unavailable = { state: 'unavailable', value: null, reason: 'NOT_ENTERED' };
    expect(CapitalOptionalMoneyV1Schema.parse(unavailable)).toEqual(unavailable);
    expect(
      CapitalOptionalMoneyV1Schema.safeParse({ ...unavailable, value: '0.000000' }).success
    ).toBe(false);
  });

  it.each([
    ['netInvestableCapitalUsd', { ...fixtures.input, netInvestableCapitalUsd: null }],
    [
      'plannedCompanyCount',
      { ...fixtures.input, allocations: [{ ...allocation, plannedCompanyCount: null }] },
    ],
  ])('does not replace null %s with a default', (_field, input) => {
    expect(CapitalPlanningInputV1Schema.safeParse(input).success).toBe(false);
  });

  it.each(['0.000000', '-1.000000', '99999999999999999.999999', '-9999999999999999.999999'])(
    'preserves canonical scale-6 money %s',
    (value) => expect(CapitalMoneyV1Schema.parse(value)).toBe(value)
  );

  it.each([
    1,
    '1',
    '01.000000',
    '+1.000000',
    '1e6',
    'NaN',
    'Infinity',
    ' 1.000000',
    '1.00000',
    '1.0000000',
    '-0.000000',
    '999999999999999999.999999',
    '-99999999999999999.999999',
  ])('refuses malformed or oversized money %s', (value) => {
    expect(CapitalMoneyV1Schema.safeParse(value)).toMatchObject({
      success: false,
      error: { issues: expect.arrayContaining([expect.objectContaining({ path: [] })]) },
    });
    expect(
      CapitalPlanningInputV1Schema.safeParse({ ...fixtures.input, netInvestableCapitalUsd: value })
    ).toMatchObject({
      success: false,
      error: {
        issues: expect.arrayContaining([
          expect.objectContaining({ path: ['netInvestableCapitalUsd'] }),
        ]),
      },
    });
  });

  it.each(['0.000000000000', '-1.000000000000', '99999999999.999999999999'])(
    'preserves canonical scale-12 decimal %s',
    (value) => expect(CapitalDecimalV1Schema.parse(value)).toBe(value)
  );

  it.each(['1', '1.000000', '-0.000000000000', '999999999999.999999999999'])(
    'refuses malformed or oversized scale-12 decimal %s',
    (value) =>
      expect(CapitalDecimalV1Schema.safeParse(value)).toMatchObject({
        success: false,
        error: { issues: expect.arrayContaining([expect.objectContaining({ path: [] })]) },
      })
  );

  it('admits ratio endpoints and refuses values outside the closed interval', () => {
    expect(CapitalRatioV1Schema.parse('0.000000000000')).toBe('0.000000000000');
    expect(CapitalRatioV1Schema.parse('1.000000000000')).toBe('1.000000000000');
    for (const value of ['-0.000000000001', '1.000000000001']) {
      expect(CapitalRatioV1Schema.safeParse(value).success).toBe(false);
    }
  });

  it('preserves independent scale-12 expected counts and zero-deemed budget literals', () => {
    expect(CapitalCountViewV1Schema.parse(fixtures.countView)).toEqual(fixtures.countView);
    expect(CapitalBudgetBridgeV1Schema.parse(fixtures.zeroDeemedBudgetBridge)).toEqual(
      fixtures.zeroDeemedBudgetBridge
    );
  });

  it('requires entered counts to be integers with their matching label', () => {
    const entered = {
      ...fixtures.countView,
      countBasis: 'entered',
      label: 'Entered company count',
      companyCount: '0.000000000000',
    };
    expect(CapitalCountViewV1Schema.parse(entered)).toEqual(entered);
    expect(
      CapitalCountViewV1Schema.safeParse({ ...entered, companyCount: '1.500000000000' })
    ).toMatchObject({
      success: false,
      error: { issues: [expect.objectContaining({ path: ['companyCount'] })] },
    });
    expect(
      CapitalCountViewV1Schema.safeParse({ ...entered, label: 'Expected companies' })
    ).toMatchObject({
      success: false,
      error: { issues: [expect.objectContaining({ path: ['label'] })] },
    });
  });

  it('enforces the 120-character scenario-name boundary without narrowing raw labels', () => {
    expect(CapitalScenarioNameV1Schema.parse(` ${'n'.repeat(120)} `)).toBe('n'.repeat(120));
    expect(CapitalScenarioNameV1Schema.safeParse('n'.repeat(121)).success).toBe(false);
    expect(CapitalScenarioNameV1Schema.safeParse('   ').success).toBe(false);
    expect(CapitalLabelV1Schema.parse('n'.repeat(240))).toBe('n'.repeat(240));
    expect(CapitalLabelV1Schema.safeParse('n'.repeat(241)).success).toBe(false);
  });

  it.each(['scenarioSetName', 'variantName'] as const)(
    'enforces the actual memo %s boundary at its exact path',
    (field) => {
      for (const length of [120, 121]) {
        const result = CapitalPlanningMemoV1Schema.safeParse({ [field]: 'n'.repeat(length) });
        expect(result.success).toBe(false);
        if (result.success) throw new Error('Other required memo fields are intentionally absent');
        const fieldIssues = result.error.issues.filter((issue) => issue.path[0] === field);
        expect(fieldIssues).toEqual(
          length === 120 ? [] : [expect.objectContaining({ code: 'too_big', path: [field] })]
        );
      }
    }
  );

  it('CP-036: rejects recycling and preserves unchanged strict legacy scenario families', () => {
    expect(
      CapitalPlanningInputV1Schema.safeParse({
        ...fixtures.input,
        recyclingAssumptionUsd: '100.000000',
      })
    ).toMatchObject({
      success: false,
      error: {
        issues: [
          expect.objectContaining({
            code: 'unrecognized_keys',
            path: [],
            keys: ['recyclingAssumptionUsd'],
          }),
        ],
      },
    });
    const v1 = { name: 'Legacy allocation', variants: [legacyVariant] };
    const v2 = {
      contractVersion: 'fund-scenario-set-create/2.0.0',
      name: 'Legacy source-pinned allocation',
      variants: [
        legacyVariant,
        { ...legacyVariant, name: 'Upside' },
        { ...legacyVariant, name: 'Downside' },
      ],
      expectedSourceConfigId: 1,
      expectedSourceConfigVersion: 1,
    };
    expect(CreateFundScenarioSetV1Schema.parse(v1)).toEqual(v1);
    expect(CreateFundScenarioSetV2Schema.parse(v2)).toEqual(v2);
    expect(FundScenarioVariantOverrideV1Schema.parse(legacyVariant.override)).toEqual(
      legacyVariant.override
    );
    const capitalVariant = {
      name: 'Capital',
      override: { overrideType: 'capital_plan', payload: fixtures.input },
    };
    expect(FundScenarioVariantOverrideV1Schema.safeParse(capitalVariant.override)).toMatchObject({
      success: false,
      error: { issues: [expect.objectContaining({ path: ['overrideType'] })] },
    });
    expect(
      CreateFundScenarioSetV1Schema.safeParse({ ...v1, variants: [legacyVariant, capitalVariant] })
        .success
    ).toBe(false);
    expect(
      CreateFundScenarioSetV2Schema.safeParse({
        ...v2,
        variants: [legacyVariant, legacyVariant, capitalVariant],
      }).success
    ).toBe(false);
    expect(CapitalPlanningInputV1Schema.safeParse(legacyVariant.override.payload).success).toBe(
      false
    );
  });

  it.each(['sourceBundle', 'sourceBundleHash', 'normalizedValues', 'interpretationVersion'])(
    'rejects client-injected %s at the core boundary',
    (key) => {
      expect(
        CapitalPlanningInputV1Schema.safeParse({ ...fixtures.input, [key]: {} })
      ).toMatchObject({
        success: false,
        error: {
          issues: [expect.objectContaining({ code: 'unrecognized_keys', path: [], keys: [key] })],
        },
      });
    }
  );

  it('rejects a legacy discriminator attached to otherwise valid capital input', () => {
    expect(
      CapitalPlanningInputV1Schema.safeParse({
        ...fixtures.input,
        contractVersion: 'fund-scenario-set-create/2.0.0',
      })
    ).toMatchObject({
      success: false,
      error: { issues: [expect.objectContaining({ path: ['contractVersion'] })] },
    });
  });

  it.each([
    ['initialCheckUsd', '0.000000'],
    ['budgetShareRatio', '1.000000000001'],
    ['deploymentPeriodYears', 11],
    ['plannedCompanyCount', 10001],
    ['plannedCompanyCount', -1],
  ])('reports the exact path for invalid allocation %s=%s', (field, value) => {
    const result = CapitalPlanningInputV1Schema.safeParse({
      ...fixtures.input,
      allocations: [{ ...allocation, [field]: value }],
    });
    expect(result).toMatchObject({
      success: false,
      error: {
        issues: expect.arrayContaining([
          expect.objectContaining({ path: ['allocations', 0, field] }),
        ]),
      },
    });
  });

  it('admits bounded allocation counts and rejects duplicate IDs and limit-plus-one', () => {
    const allocations = Array.from({ length: 10 }, (_, i) => ({
      ...allocation,
      allocationId: `allocation-${i}`,
      budgetShareRatio: '0.100000000000',
      deploymentPeriodYears: 10,
      plannedCompanyCount: 10000,
    }));
    expect(
      CapitalPlanningInputV1Schema.parse({ ...fixtures.input, allocations }).allocations
    ).toEqual(allocations);
    for (const invalid of [
      [allocation, allocation],
      [...allocations, { ...allocations[0], allocationId: 'allocation-10' }],
    ]) {
      expect(
        CapitalPlanningInputV1Schema.safeParse({ ...fixtures.input, allocations: invalid })
      ).toMatchObject({
        success: false,
        error: {
          issues: expect.arrayContaining([expect.objectContaining({ path: ['allocations'] })]),
        },
      });
    }
  });

  it('validates unit declarations against exact field classes and reports their paths', () => {
    const declarations = { 'funds.size': 'usd', fundSize: 'usd_millions' };
    expect(CapitalUnitDeclarationsV1Schema.parse(declarations)).toEqual(declarations);
    for (const [path, unit] of [
      ['funds.size', 'ratio'],
      ['fundSize', 'percent_points'],
      ['managementFeeRate', 'ratio'],
      ['fundedFromFeesPct', 'percent_points'],
      ['capitalPlanAllocations[01].initialCheckAmount', 'usd'],
    ] as const) {
      expect(CapitalUnitDeclarationsV1Schema.safeParse({ [path]: unit })).toMatchObject({
        success: false,
        error: { issues: expect.arrayContaining([expect.objectContaining({ path: [path] })]) },
      });
    }
    expect(
      CapitalUnitDeclarationsV1Schema.safeParse({
        'feeProfiles[0].feeTiers[0].startMonth': 'fund_month_zero_based',
        'feeProfiles[0].feeTiers[0].endMonth': 'fund_month_one_based',
      })
    ).toMatchObject({
      success: false,
      error: {
        issues: [expect.objectContaining({ path: ['feeProfiles[0].feeTiers[0].endMonth'] })],
      },
    });
  });

  it('keeps fixed checks valid without ownership while pro rata requires financing and pool facts', () => {
    expect(CapitalAllocationInputV1Schema.parse(allocation)).toEqual(allocation);
    const followOnRounds = [
      {
        roundId: 'series-a',
        stageId: 'stage-series-a',
        roundLabel: 'Series A',
        graduationRatio: '0.500000000000',
        participationRatio: '1.000000000000',
        checkPolicy: { type: 'pro_rata', proRataExerciseRatio: '1.000000000000' },
        monthsAfterPreviousRound: 12,
        timeOrigin: 'previous_round',
      },
    ];
    expect(
      CapitalAllocationInputV1Schema.safeParse({ ...allocation, followOnRounds })
    ).toMatchObject({
      success: false,
      error: {
        issues: expect.arrayContaining([
          expect.objectContaining({ path: ['entryFinancing'] }),
          expect.objectContaining({ path: ['followOnRounds', 0, 'financing'] }),
          expect.objectContaining({
            path: ['followOnRounds', 0, 'incrementalPreMoneyPoolDilutionRatio'],
          }),
        ]),
      },
    });
  });

  it('preserves all four approved disclosures exactly', () => {
    expect(CAPITAL_PLANNING_DISCLOSURES).toEqual({
      timing:
        'This schedule assumes capital can be called as needed. It does not model current cash availability or capital-call execution.',
      budget:
        'Available construction capital excludes recycling and exit proceeds; fee offsets are not modeled. Feasibility is evaluated under these assumptions.',
      preference:
        'Aggregate preference forecast based on entered ownership and summarized preference terms. It does not reproduce a security-level cap table or legal distribution waterfall.',
      gp: 'Available construction capital deducts the GP deemed contribution under ADR-070. An omitted funded-from-fees fraction is treated as zero for this calculation without changing the saved source. The fraction does not reduce the management-fee basis or fee amount.',
    });
  });
});
