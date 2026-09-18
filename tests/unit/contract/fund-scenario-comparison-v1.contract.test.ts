import { describe, expect, it } from 'vitest';
import { Decimal } from '../../../shared/lib/decimal-config';
import {
  CAPITAL_SOURCE_INTERPRETATION_VERSION,
  CapitalDecimalV1Schema,
  CapitalMoneyV1Schema,
  type CapitalPlanningMemoV1,
} from '../../../shared/contracts/capital-planning-v1.contract';
import { calculateCapitalPlanningV1 } from '../../../shared/lib/capital-planning/capital-planning-v1';
import { materializeCapitalSource } from '../../../shared/lib/capital-planning/materialize-from-fund-draft';
import {
  makeCapitalDeclarations,
  makeCapitalInput,
  makeCapitalRawConfig,
} from '../../fixtures/capital-planning/fixtures';

import {
  FundScenarioComparisonV1Schema,
  SCENARIO_COMPARISON_METRIC_KEYS,
  calculateCapitalComparisonDeltaV1,
  CapitalChangedInputV1Schema,
  CapitalComparisonMetricDeltaV1Schema,
  FundScenarioCapitalComparisonV1Schema,
} from '../../../shared/contracts/fund-scenario-comparison-v1.contract';

const metricMap = {
  lpNetIrr: 0.15,
  gpNetIrr: null,
  totalManagementFees: 2_000_000,
  totalGpCarryDistributed: 500_000,
  totalGpFeeIncome: 2_000_000,
  finalDpi: 0.6,
  finalTvpi: 1.8,
  finalClawbackDue: 0,
};

describe('FundScenarioComparisonV1 contract', () => {
  it('accepts the strict scenario comparison payload used by the UI', () => {
    const result = FundScenarioComparisonV1Schema.safeParse({
      fundId: 123,
      comparisonStatus: 'comparable',
      scenarioSet: {
        scenarioSetId: '00000000-0000-0000-0000-000000000111',
        name: 'Fee sensitivity',
        sourceConfigId: 12,
        sourceConfigVersion: 4,
      },
      baseline: {
        label: 'Authoritative baseline',
        metrics: metricMap,
      },
      variants: [
        {
          variantId: '00000000-0000-0000-0000-000000000112',
          name: 'Lower fee',
          overrideType: 'fee_profile',
          metrics: metricMap,
          metricDeltas: [
            {
              metric: 'finalTvpi',
              displayName: 'TVPI',
              baselineValue: 1.8,
              scenarioValue: 2.1,
              absoluteDelta: 0.3,
              percentageDelta: 16.6666667,
              driftCapable: true,
              driftReason: 'stable',
            },
          ],
        },
      ],
      staleness: {
        state: 'CURRENT',
        sourceConfigVersion: 4,
        currentPublishedConfigVersion: 4,
      },
      calculatedAt: '2026-05-26T12:30:00.000Z',
    });

    expect(result.success).toBe(true);
  });

  it('rejects extra fields so the local UI mirror cannot drift silently', () => {
    const result = FundScenarioComparisonV1Schema.safeParse({
      fundId: 123,
      comparisonStatus: 'no_scenario_results',
      scenarioSet: {
        scenarioSetId: '00000000-0000-0000-0000-000000000111',
        name: 'Fee sensitivity',
        sourceConfigId: 12,
        sourceConfigVersion: 4,
      },
      baseline: null,
      variants: [],
      staleness: null,
      calculatedAt: null,
      unexpected: true,
    });

    expect(result.success).toBe(false);
  });

  it('keeps the comparison metric list fixed', () => {
    expect(SCENARIO_COMPARISON_METRIC_KEYS).toEqual([
      'lpNetIrr',
      'gpNetIrr',
      'totalManagementFees',
      'totalGpCarryDistributed',
      'totalGpFeeIncome',
      'finalDpi',
      'finalTvpi',
      'finalClawbackDue',
    ]);
  });

  it('supports an explicit unsupported override status for reserve scenarios', () => {
    const result = FundScenarioComparisonV1Schema.safeParse({
      fundId: 123,
      comparisonStatus: 'unsupported_override_type',
      scenarioSet: {
        scenarioSetId: '00000000-0000-0000-0000-000000000111',
        name: 'Reserve sensitivity',
        sourceConfigId: 12,
        sourceConfigVersion: 4,
      },
      baseline: null,
      variants: [],
      staleness: null,
      calculatedAt: null,
    });

    expect(result.success).toBe(true);
  });

  it('accepts methodology variants after contract widening', () => {
    const result = FundScenarioComparisonV1Schema.safeParse({
      fundId: 1,
      comparisonStatus: 'comparable',
      scenarioSet: {
        scenarioSetId: '11111111-1111-4111-8111-111111111111',
        name: 'Waterfall comparison',
        sourceConfigId: 10,
        sourceConfigVersion: 3,
      },
      baseline: { label: 'Authoritative baseline', metrics: metricMap },
      variants: [
        {
          variantId: '22222222-2222-4222-8222-222222222222',
          name: 'Hybrid waterfall',
          overrideType: 'methodology',
          metrics: metricMap,
          metricDeltas: [],
        },
      ],
      staleness: null,
      calculatedAt: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts allocation variants after contract widening', () => {
    const result = FundScenarioComparisonV1Schema.safeParse({
      fundId: 1,
      comparisonStatus: 'comparable',
      scenarioSet: {
        scenarioSetId: '11111111-1111-4111-8111-111111111111',
        name: 'Allocation mix',
        sourceConfigId: 10,
        sourceConfigVersion: 3,
      },
      baseline: { label: 'Authoritative baseline', metrics: metricMap },
      variants: [
        {
          variantId: '22222222-2222-4222-8222-222222222222',
          name: 'Seed heavy',
          overrideType: 'allocation',
          metrics: metricMap,
          metricDeltas: [],
        },
      ],
      staleness: null,
      calculatedAt: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts sector_profile variants after contract widening', () => {
    const result = FundScenarioComparisonV1Schema.safeParse({
      fundId: 1,
      comparisonStatus: 'comparable',
      scenarioSet: {
        scenarioSetId: '11111111-1111-4111-8111-111111111111',
        name: 'Sector mix',
        sourceConfigId: 10,
        sourceConfigVersion: 3,
      },
      baseline: { label: 'Authoritative baseline', metrics: metricMap },
      variants: [
        {
          variantId: '22222222-2222-4222-8222-222222222222',
          name: 'AI infrastructure',
          overrideType: 'sector_profile',
          metrics: metricMap,
          metricDeltas: [],
        },
      ],
      staleness: null,
      calculatedAt: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects reserve_allocation overrideType in variant positions', () => {
    const result = FundScenarioComparisonV1Schema.safeParse({
      fundId: 1,
      comparisonStatus: 'comparable',
      scenarioSet: {
        scenarioSetId: '11111111-1111-4111-8111-111111111111',
        name: 'Reserve plan',
        sourceConfigId: 10,
        sourceConfigVersion: 3,
      },
      baseline: { label: 'Authoritative baseline', metrics: metricMap },
      variants: [
        {
          variantId: '22222222-2222-4222-8222-222222222222',
          name: 'Follow-on cap',
          overrideType: 'reserve_allocation',
          metrics: metricMap,
          metricDeltas: [],
        },
      ],
      staleness: null,
      calculatedAt: null,
    });
    expect(result.success).toBe(false);
  });

  it('accepts typed unavailable reasons for fail-closed comparison states', () => {
    expect(
      FundScenarioComparisonV1Schema.parse({
        fundId: 1,
        comparisonStatus: 'baseline_unavailable',
        unavailableReason: 'BASELINE_ECONOMICS_SNAPSHOT_MISSING',
        scenarioSet: {
          scenarioSetId: '11111111-1111-4111-8111-111111111111',
          name: 'Fee profile scenario',
          sourceConfigId: 10,
          sourceConfigVersion: 3,
        },
        baseline: null,
        variants: [],
        staleness: null,
        calculatedAt: null,
      }).unavailableReason
    ).toBe('BASELINE_ECONOMICS_SNAPSHOT_MISSING');
  });
});

// Independent literals frozen in the Round 8 supplemental recovery ledger.
// Expectations intentionally do not derive from the comparison implementation.
const round8DeltaVectors = [
  ['0.000001', '1000000.000000', '999999.999999', '99999999999900.000000000000'],
  [
    '-9999999999999999.999999',
    '99999999999999999.999999',
    '109999999999999999.999998',
    '1100.000000000000',
  ],
  [
    '99999999999999999.999999',
    '-9999999999999999.999999',
    '-109999999999999999.999998',
    '-110.000000000000',
  ],
  [
    '0.000001',
    '-9999999999999999.999999',
    '-10000000000000000.000000',
    '-1000000000000000000000000.000000000000',
  ],
  [
    '-0.000001',
    '99999999999999999.999999',
    '100000000000000000.000000',
    '10000000000000000000000000.000000000000',
  ],
  [
    '0.000007',
    '99999999999999999.999999',
    '99999999999999999.999992',
    '1428571428571428571428457.142857142857',
  ],
] as const;

function capitalMetric(
  baselineValue: string | null,
  variantValue: string | null,
  absoluteDelta: string | null,
  percentageDelta: string | null,
  scale: 6 | 12 = 6,
  unavailableReason: 'ZERO_BASELINE' | 'NOT_ENTERED' | null = null
) {
  return {
    metric: scale === 6 ? 'signedLifetimeHeadroomUsd' : 'companyCount',
    label: 'Capital comparison',
    group: 'construction',
    countBasis: 'expected',
    baselineValue,
    variantValue,
    absoluteDelta,
    percentageDelta,
    unavailableReason,
  };
}

const capitalSetId = '11111111-1111-4111-8111-111111111111';
const capitalBaselineId = '22222222-2222-4222-8222-222222222222';
const capitalVariantId = '33333333-3333-4333-8333-333333333333';
const capitalReadState = {
  sourceFreshness: 'CURRENT',
  calculationReadiness: { context: 'saved_input', state: 'READY', issues: [] },
  interpretationCompatibility: {
    state: 'CURRENT',
    savedVersion: CAPITAL_SOURCE_INTERPRETATION_VERSION,
    currentVersion: CAPITAL_SOURCE_INTERPRETATION_VERSION,
  },
} as const;

function makeCapitalComparison() {
  const input = makeCapitalInput();
  const raw = makeCapitalRawConfig();
  raw.investmentPeriod = 2;
  const materialized = materializeCapitalSource({
    source: {
      fund: { id: 101, size: '100.00', baseCurrency: 'USD' },
      config: {
        id: 11,
        version: 1,
        raw,
        publishedAt: '2026-09-01T00:00:00.000Z',
      },
    },
    inputs: [input],
    unitDeclarations: makeCapitalDeclarations(),
  });
  if (!materialized.ok) throw new Error(JSON.stringify(materialized));
  const result = calculateCapitalPlanningV1({ input, sourceBundle: materialized.sourceBundle });
  const variantInput = structuredClone(input);
  variantInput.allocations[0]!.initialCheckUsd = '2.000000';
  variantInput.allocations[0]!.deploymentPeriodYears = 2;
  const variantResult = calculateCapitalPlanningV1({
    input: variantInput,
    sourceBundle: materialized.sourceBundle,
  });
  const memo: CapitalPlanningMemoV1 = {
    contractVersion: 'capital-planning-memo/1.0.0',
    fundId: 101,
    scenarioSetId: capitalSetId,
    variantId: capitalBaselineId,
    scenarioSetName: 'Capital construction',
    variantName: 'Baseline',
    result,
    readState: {
      ...capitalReadState,
      calculationReadiness: { context: 'saved_input', state: 'READY', issues: [] },
    },
    countBasis: 'expected',
    limitations: ['Synthetic planning assumptions.'],
    detailScope: 'complete',
  };
  return {
    contractVersion: 'fund-scenario-capital-comparison/1.0.0',
    representation: 'capital-plan-v1',
    fundId: 101,
    scenarioSetId: capitalSetId,
    comparisonStatus: 'comparable',
    snapshotId: 42,
    baselineVariantId: capitalBaselineId,
    baseline: memo,
    variants: [
      {
        variantId: capitalVariantId,
        name: 'Higher checks',
        overrideType: 'capital_plan',
        memo: {
          ...memo,
          variantId: capitalVariantId,
          variantName: 'Higher checks',
          result: variantResult,
        },
        changedInputs: [
          {
            group: 'checks',
            path: 'allocations[0].initialCheckUsd',
            label: 'Initial check',
            baseline: '1.000000',
            variant: '2.000000',
          },
          {
            group: 'timing',
            path: 'allocations[0].deploymentPeriodYears',
            label: 'Deployment years',
            baseline: 1,
            variant: 2,
          },
        ],
        metricDeltas: [],
        companionComparison: 'companion_unavailable',
      },
    ],
    readState: capitalReadState,
    calculatedAt: '2026-09-11T12:00:00.000Z',
  };
}

describe('B5 exact capital comparison contracts', () => {
  it.each(round8DeltaVectors)(
    'preserves Round 8 exact delta for %s -> %s',
    (baselineValue, variantValue, absoluteDelta, percentageDelta) => {
      expect(calculateCapitalComparisonDeltaV1({ baselineValue, variantValue, scale: 6 })).toEqual({
        absoluteDelta,
        percentageDelta,
      });
      const metric = capitalMetric(baselineValue, variantValue, absoluteDelta, percentageDelta);
      expect(CapitalComparisonMetricDeltaV1Schema.parse(metric)).toEqual(metric);
    }
  );

  it.each([
    [6, '200000000.000000', '200000000.000001', '0.000001', '0.000000000001'],
    [6, '200000000.000000', '199999999.999999', '-0.000001', '-0.000000000001'],
    [12, '200.000000000000', '200.000000000001', '0.000000000001', '0.000000000001'],
    [12, '200.000000000000', '199.999999999999', '-0.000000000001', '-0.000000000001'],
    [6, '300000000.000000', '299999999.999999', '-0.000001', '0.000000000000'],
    [12, '300.000000000000', '299.999999999999', '-0.000000000001', '0.000000000000'],
    [12, '-2.000000000000', '-1.000000000000', '1.000000000000', '50.000000000000'],
    [12, '-1.000000000000', '-2.000000000000', '-1.000000000000', '-100.000000000000'],
  ] as const)(
    'rounds scale %s signed percentages half up and canonicalizes zero',
    (scale, baselineValue, variantValue, absoluteDelta, percentageDelta) => {
      expect(calculateCapitalComparisonDeltaV1({ baselineValue, variantValue, scale })).toEqual({
        absoluteDelta,
        percentageDelta,
      });
      expect(
        CapitalComparisonMetricDeltaV1Schema.safeParse(
          capitalMetric(baselineValue, variantValue, absoluteDelta, percentageDelta, scale)
        ).success
      ).toBe(true);
    }
  );

  it('keeps global Decimal precision and rounding unchanged, including refusal', () => {
    const before = { precision: Decimal.precision, rounding: Decimal.rounding };
    for (const [
      baselineValue,
      variantValue,
      absoluteDelta,
      percentageDelta,
    ] of round8DeltaVectors) {
      expect(calculateCapitalComparisonDeltaV1({ baselineValue, variantValue, scale: 6 })).toEqual({
        absoluteDelta,
        percentageDelta,
      });
      CapitalComparisonMetricDeltaV1Schema.parse(
        capitalMetric(baselineValue, variantValue, absoluteDelta, percentageDelta)
      );
    }
    expect(() =>
      calculateCapitalComparisonDeltaV1({
        baselineValue: 'NaN',
        variantValue: '1.000000',
        scale: 6,
      })
    ).toThrow();
    expect({ precision: Decimal.precision, rounding: Decimal.rounding }).toEqual(before);
  });

  it.each([
    [
      '-9999999999.999999999999',
      '99999999999.999999999999',
      '109999999999.999999999998',
      '1100.000000000000',
    ],
    [
      '99999999999.999999999999',
      '-9999999999.999999999999',
      '-109999999999.999999999998',
      '-110.000000000000',
    ],
    [
      '-0.000000000001',
      '99999999999.999999999999',
      '100000000000.000000000000',
      '10000000000000000000000000.000000000000',
    ],
  ] as const)(
    'keeps decimal12 extrema exact: %s -> %s',
    (baselineValue, variantValue, absoluteDelta, percentageDelta) => {
      expect(calculateCapitalComparisonDeltaV1({ baselineValue, variantValue, scale: 12 })).toEqual(
        { absoluteDelta, percentageDelta }
      );
      expect(
        CapitalComparisonMetricDeltaV1Schema.safeParse(
          capitalMetric(baselineValue, variantValue, absoluteDelta, percentageDelta, 12)
        ).success
      ).toBe(true);
      expect(CapitalDecimalV1Schema.safeParse(absoluteDelta).success).toBe(false);
    }
  );

  it.each([
    ['baselineValue', '-99999999999.999999999999'],
    ['variantValue', '999999999999.999999999999'],
    ['absoluteDelta', '-1109999999999.999999999998'],
  ] as const)('keeps decimal12 boundary-plus-one refusals field-specific: %s', (field, value) => {
    const metric = capitalMetric(
      '99999999999.999999999999',
      '-9999999999.999999999999',
      '-109999999999.999999999998',
      '-110.000000000000',
      12
    );
    expect(value).toHaveLength(field === 'absoluteDelta' ? 27 : 25);
    const parsed = CapitalComparisonMetricDeltaV1Schema.safeParse({ ...metric, [field]: value });
    expect(parsed.success).toBe(false);
    if (!parsed.success)
      expect(parsed.error.issues.some((issue) => issue.path[0] === field)).toBe(true);
  });

  it('admits derived 25/26 and 39 character strings without widening 24 character source values', () => {
    expect(round8DeltaVectors[1][2]).toHaveLength(25);
    expect(round8DeltaVectors[2][2]).toHaveLength(26);
    for (const index of [3, 4] as const) expect(round8DeltaVectors[index][3]).toHaveLength(39);
    expect(round8DeltaVectors[1][1]).toHaveLength(24);
    expect(CapitalMoneyV1Schema.safeParse(round8DeltaVectors[1][1]).success).toBe(true);
    for (const index of [1, 2] as const)
      expect(CapitalMoneyV1Schema.safeParse(round8DeltaVectors[index][2]).success).toBe(false);
    expect(CapitalDecimalV1Schema.safeParse(round8DeltaVectors[4][3]).success).toBe(false);
  });

  it.each([
    ['baselineValue', '999999999999999999.999999'],
    ['variantValue', '-99999999999999999.999999'],
    ['absoluteDelta', '-1109999999999999999.999998'],
    ['percentageDelta', '-11000000000000000000000000.000000000000'],
  ] as const)('rejects boundary-plus-one %s without truncation', (field, value) => {
    const metric = capitalMetric(...round8DeltaVectors[2]);
    expect(value.length).toBe(
      { baselineValue: 25, variantValue: 25, absoluteDelta: 27, percentageDelta: 40 }[field]
    );
    const parsed = CapitalComparisonMetricDeltaV1Schema.safeParse({ ...metric, [field]: value });
    expect(parsed.success).toBe(false);
    if (!parsed.success)
      expect(parsed.error.issues.some((issue) => issue.path[0] === field)).toBe(true);
  });

  it.each([
    '-0.000000',
    '+1.000000',
    '01.000000',
    '1e6',
    'NaN',
    'Infinity',
    '1.0000000',
    ' 1.000000',
    '999999999999999999.999999',
  ])('rejects noncanonical helper operand %s', (baselineValue) => {
    expect(() =>
      calculateCapitalComparisonDeltaV1({ baselineValue, variantValue: '1.000000', scale: 6 })
    ).toThrow();
  });

  it.each([6, 12] as const)(
    'preserves present zero and requires ZERO_BASELINE at scale %s',
    (scale) => {
      const zero = scale === 6 ? '0.000000' : '0.000000000000';
      const negative = scale === 6 ? '-1.000000' : '-1.000000000000';
      for (const variant of [zero, negative]) {
        expect(
          calculateCapitalComparisonDeltaV1({ baselineValue: zero, variantValue: variant, scale })
        ).toEqual({ absoluteDelta: variant, percentageDelta: null });
        const metric = capitalMetric(zero, variant, variant, null, scale, 'ZERO_BASELINE');
        expect(CapitalComparisonMetricDeltaV1Schema.parse(metric)).toEqual(metric);
        expect(
          CapitalComparisonMetricDeltaV1Schema.safeParse({ ...metric, unavailableReason: null })
            .success
        ).toBe(false);
      }
    }
  );

  it.each([
    [null, '1.000000'],
    ['1.000000', null],
    [null, null],
    ['0.000000', null],
    [null, '0.000000'],
  ] as const)('keeps unavailable operands distinct from zero: %s / %s', (baseline, variant) => {
    const metric = capitalMetric(baseline, variant, null, null, 6, 'NOT_ENTERED');
    expect(CapitalComparisonMetricDeltaV1Schema.parse(metric)).toEqual(metric);
    for (const patch of [
      { unavailableReason: null },
      { unavailableReason: 'ZERO_BASELINE' },
      { absoluteDelta: '0.000000' },
      { percentageDelta: '0.000000000000' },
    ]) {
      expect(CapitalComparisonMetricDeltaV1Schema.safeParse({ ...metric, ...patch }).success).toBe(
        false
      );
    }
  });

  it.each([6, 12] as const)(
    'returns positive zero for equal nonzero operands at scale %s',
    (scale) => {
      const zero = scale === 6 ? '0.000000' : '0.000000000000';
      for (const value of scale === 6
        ? ['1.000000', '-1.000000']
        : ['1.000000000000', '-1.000000000000']) {
        expect(
          calculateCapitalComparisonDeltaV1({ baselineValue: value, variantValue: value, scale })
        ).toEqual({ absoluteDelta: zero, percentageDelta: '0.000000000000' });
        expect(
          CapitalComparisonMetricDeltaV1Schema.safeParse(
            capitalMetric(value, value, zero, '0.000000000000', scale)
          ).success
        ).toBe(true);
      }
    }
  );

  it('rejects wrong sign, denominator, scale, derived negative zero, and unknown financial fields', () => {
    const metric = capitalMetric('-2.000000', '-1.000000', '1.000000', '50.000000000000');
    for (const patch of [
      { absoluteDelta: '-1.000000' },
      { percentageDelta: '-50.000000000000' },
      { baselineValue: '-2.000000000000' },
      { absoluteDelta: '1.000000000000' },
      { unavailableReason: 'NOT_ENTERED' },
      { additiveAttribution: '1.000000' },
    ]) {
      expect(CapitalComparisonMetricDeltaV1Schema.safeParse({ ...metric, ...patch }).success).toBe(
        false
      );
    }
    const roundedZero = capitalMetric(
      '300000000.000000',
      '299999999.999999',
      '-0.000001',
      '-0.000000000000'
    );
    expect(CapitalComparisonMetricDeltaV1Schema.safeParse(roundedZero).success).toBe(false);
    expect(
      CapitalComparisonMetricDeltaV1Schema.safeParse(
        capitalMetric('1.000000', '1.000000', '-0.000000', '0.000000000000')
      ).success
    ).toBe(false);
  });

  it('preserves typed simultaneous before/after changes without causal attribution fields', () => {
    const changes = makeCapitalComparison().variants[0]!.changedInputs;
    for (const change of changes) expect(CapitalChangedInputV1Schema.parse(change)).toEqual(change);
    for (const value of ['0.000000', 0, false, null]) {
      const change = { ...changes[0], baseline: value, variant: value };
      expect(CapitalChangedInputV1Schema.parse(change)).toEqual(change);
    }
    for (const patch of [
      { baseline: 0.5 },
      { variant: Number.MAX_SAFE_INTEGER + 1 },
      { baseline: {} },
      { variant: 'x'.repeat(2049) },
      { causalEffectUsd: '1.000000' },
      { group: 'attribution' },
    ]) {
      expect(CapitalChangedInputV1Schema.safeParse({ ...changes[0], ...patch }).success).toBe(
        false
      );
    }
  });

  it('accepts complete memo results produced by B4 and enforces comparison identity', () => {
    const comparison = makeCapitalComparison();
    expect(FundScenarioCapitalComparisonV1Schema.parse(comparison)).toEqual(comparison);
    for (const patch of [
      { snapshotId: null },
      { calculatedAt: null },
      { baseline: null },
      { fundId: 102 },
      { baselineVariantId: capitalVariantId },
      { representation: 'legacy' },
      { surplus: true },
    ]) {
      expect(
        FundScenarioCapitalComparisonV1Schema.safeParse({ ...comparison, ...patch }).success
      ).toBe(false);
    }
    const variant = comparison.variants[0]!;
    for (const patch of [
      { variantId: capitalBaselineId },
      { name: 'x'.repeat(121) },
      { memo: { ...variant.memo, fundId: 102 } },
      { memo: { ...variant.memo, scenarioSetId: capitalVariantId } },
    ]) {
      expect(
        FundScenarioCapitalComparisonV1Schema.safeParse({
          ...comparison,
          variants: [{ ...variant, ...patch }],
        }).success
      ).toBe(false);
    }
    expect(
      FundScenarioCapitalComparisonV1Schema.safeParse({
        ...comparison,
        variants: [variant, variant],
      }).success
    ).toBe(false);
    for (const length of [4, 5]) {
      const variants = Array.from({ length }, (_, index) => {
        const variantId = `44444444-4444-4444-8444-${String(index).padStart(12, '0')}`;
        return { ...variant, variantId, memo: { ...variant.memo, variantId } };
      });
      expect(
        FundScenarioCapitalComparisonV1Schema.safeParse({ ...comparison, variants }).success
      ).toBe(length === 4);
    }
    expect(
      FundScenarioCapitalComparisonV1Schema.safeParse({
        ...comparison,
        variants: [{ ...variant, name: 'x'.repeat(120) }],
      }).success
    ).toBe(true);
  });

  it('admits absent results only with an empty comparison', () => {
    const comparison = makeCapitalComparison();
    const absent = {
      ...comparison,
      comparisonStatus: 'no_scenario_results',
      snapshotId: null,
      baseline: null,
      variants: [],
      calculatedAt: null,
    };
    expect(FundScenarioCapitalComparisonV1Schema.parse(absent)).toEqual(absent);
    for (const patch of [
      { snapshotId: 42 },
      { baseline: comparison.baseline },
      { variants: comparison.variants },
      { calculatedAt: comparison.calculatedAt },
    ]) {
      expect(FundScenarioCapitalComparisonV1Schema.safeParse({ ...absent, ...patch }).success).toBe(
        false
      );
    }
    expect(FundScenarioComparisonV1Schema.safeParse(comparison).success).toBe(false);
  });
});
