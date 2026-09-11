import { describe, expect, it } from 'vitest';
import { CapitalComparisonMetricDeltaV1Schema } from '../../../shared/contracts/fund-scenario-comparison-v1.contract';
import {
  CAPITAL_PLANNING_DISCLOSURES,
  CAPITAL_PLANNING_VERSION,
  CAPITAL_SOURCE_INTERPRETATION_VERSION,
  CapitalAllocationInputV1Schema,
  CapitalMoneyV1Schema,
  CapitalPlanningInputV1Schema,
  CapitalRatioV1Schema,
  CapitalUnitDeclarationsV1Schema,
} from '../../../shared/contracts/capital-planning-v1.contract';
import {
  CreateFundScenarioSetV1Schema,
  CreateFundScenarioSetV2Schema,
  CreateFundScenarioSetV3Schema,
  FundScenarioCalculationStatusV1Schema,
  FundScenarioVariantOverrideV1Schema,
} from '../../../shared/contracts/fund-scenario-sets-v1.contract';

const allocation = {
  allocationId: 'seed',
  name: 'Seed',
  entryRound: 'Seed',
  pipelineProfileId: 'pipeline-seed',
  entryStageId: 'stage-seed',
  budgetShareRatio: '1.000000000000',
  initialCheckUsd: '500000.000000',
  deploymentPeriodYears: 4,
  followOnRounds: [],
};
const input = { contractVersion: CAPITAL_PLANNING_VERSION, allocations: [allocation] };
const variantId = '10000000-0000-4000-8000-000000000001';
const create = {
  contractVersion: 'fund-scenario-set-create/3.0.0',
  name: 'Synthetic capital plan',
  baselineVariantId: variantId,
  expectedSourceConfigId: 1,
  expectedSourceConfigVersion: 1,
  expectedSourceBundleHash: 'a'.repeat(64),
  expectedInterpretationVersion: CAPITAL_SOURCE_INTERPRETATION_VERSION,
  unitDeclarations: { 'funds.size': 'usd', fundSize: 'usd_millions' },
  variants: [
    { variantId, name: 'Baseline', override: { overrideType: 'capital_plan', payload: input } },
  ],
};

describe('capital planning trust-boundary contracts', () => {
  it('requires the exact percentage for complete nonzero comparison baselines', () => {
    const metric = {
      metric: 'planningBudgetUsd',
      label: 'Planning budget',
      group: 'construction',
      countBasis: 'expected',
      baselineValue: '100.000000',
      variantValue: '110.000000',
      absoluteDelta: '10.000000',
      percentageDelta: '10.000000000000',
      unavailableReason: null,
    };
    expect(CapitalComparisonMetricDeltaV1Schema.safeParse(metric).success).toBe(true);
    expect(
      CapitalComparisonMetricDeltaV1Schema.safeParse({
        ...metric,
        baselineValue: '-100.000000',
        variantValue: '-90.000000',
      }).success
    ).toBe(true);
    for (const change of [
      { percentageDelta: null },
      { unavailableReason: 'NOT_ENTERED' },
      { percentageDelta: '999.000000000000' },
    ])
      expect(CapitalComparisonMetricDeltaV1Schema.safeParse({ ...metric, ...change }).success).toBe(
        false
      );
    expect(
      CapitalComparisonMetricDeltaV1Schema.safeParse({
        ...metric,
        baselineValue: '0.000000',
        variantValue: '10.000000',
        percentageDelta: null,
        unavailableReason: 'ZERO_BASELINE',
      }).success
    ).toBe(true);
    expect(
      CapitalComparisonMetricDeltaV1Schema.safeParse({
        ...metric,
        baselineValue: null,
        absoluteDelta: null,
        percentageDelta: null,
        unavailableReason: 'NOT_ENTERED',
      }).success
    ).toBe(true);
  });

  it('admits strict V3 while preserving legacy discriminators', () => {
    expect(CreateFundScenarioSetV3Schema.parse(create)).toEqual(create);
    expect(CreateFundScenarioSetV1Schema.safeParse(create).success).toBe(false);
    expect(CreateFundScenarioSetV2Schema.safeParse(create).success).toBe(false);
    expect(
      FundScenarioVariantOverrideV1Schema.safeParse(create.variants[0]!.override).success
    ).toBe(false);
    expect(
      FundScenarioCalculationStatusV1Schema.safeParse({ calculationMode: 'sync_capital_plan' })
        .success
    ).toBe(false);
  });

  it.each(['sourceBundle', 'sourceBundleHash', 'normalizedValues', 'interpretationVersion'])(
    'rejects client injection of %s at create and input boundaries',
    (field) => {
      expect(CreateFundScenarioSetV3Schema.safeParse({ ...create, [field]: {} }).success).toBe(
        false
      );
      expect(CapitalPlanningInputV1Schema.safeParse({ ...input, [field]: {} }).success).toBe(false);
    }
  );

  it('requires stable baseline and unique IDs, and limits requests to five variants', () => {
    expect(
      CreateFundScenarioSetV3Schema.safeParse({
        ...create,
        baselineVariantId: '10000000-0000-4000-8000-000000000002',
      }).success
    ).toBe(false);
    expect(
      CreateFundScenarioSetV3Schema.safeParse({
        ...create,
        variants: [create.variants[0], create.variants[0]],
      }).success
    ).toBe(false);
    const variants = Array.from({ length: 6 }, (_, i) => ({
      ...create.variants[0],
      variantId: `10000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    }));
    expect(
      CreateFundScenarioSetV3Schema.safeParse({ ...create, variants: variants.slice(0, 5) }).success
    ).toBe(true);
    expect(CreateFundScenarioSetV3Schema.safeParse({ ...create, variants }).success).toBe(false);
  });

  it('requires canonical bounded decimal strings without magnitude inference', () => {
    for (const invalid of [
      1,
      '1',
      '1e6',
      'NaN',
      'Infinity',
      '-0.000000',
      '1000000000000000000.000000',
    ]) {
      expect(CapitalMoneyV1Schema.safeParse(invalid).success, String(invalid)).toBe(false);
    }
    expect(CapitalMoneyV1Schema.parse('-1.000000')).toBe('-1.000000');
    expect(CapitalRatioV1Schema.parse('1.000000000000')).toBe('1.000000000000');
    expect(CapitalRatioV1Schema.safeParse('1.000000000001').success).toBe(false);
  });

  it('validates declarations by exact field and unit class', () => {
    expect(CapitalUnitDeclarationsV1Schema.parse(create.unitDeclarations)).toEqual(
      create.unitDeclarations
    );
    for (const declarations of [
      { '*': 'usd' },
      { 'funds.size': 'ratio' },
      { fundSize: 'percent_points' },
      { managementFeeRate: 'ratio' },
      { fundedFromFeesPct: 'percent_points' },
      { 'capitalPlanAllocations[01].initialCheckAmount': 'usd' },
      {
        'feeProfiles[0].feeTiers[0].startMonth': 'fund_month_zero_based',
        'feeProfiles[0].feeTiers[0].endMonth': 'fund_month_one_based',
      },
    ]) {
      expect(CapitalUnitDeclarationsV1Schema.safeParse(declarations).success).toBe(false);
    }
  });

  it('keeps unknown ownership optional for fixed checks and requires all intervening financing for pro rata', () => {
    expect(CapitalAllocationInputV1Schema.safeParse(allocation).success).toBe(true);
    const followOnRounds = [
      {
        roundId: 'a',
        stageId: 'series-a',
        roundLabel: 'Series A',
        graduationRatio: '0.500000000000',
        participationRatio: '1.000000000000',
        checkPolicy: { type: 'pro_rata', proRataExerciseRatio: '1.000000000000' },
        monthsAfterPreviousRound: 12,
        timeOrigin: 'previous_round',
      },
    ];
    expect(
      CapitalAllocationInputV1Schema.safeParse({ ...allocation, followOnRounds }).success
    ).toBe(false);
    expect(
      CapitalAllocationInputV1Schema.safeParse({ ...allocation, plannedCompanyCount: -1 }).success
    ).toBe(false);
  });

  it('preserves the four approved disclosures exactly', () => {
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
