import { z } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CurrentForecastV2InputSchema,
  CurrentForecastV2Schema,
} from '@shared/contracts/current-forecast-v2.contract';
import { CurrentPlanVersionV1Schema } from '@shared/contracts/current-plan-version-v1.contract';
import {
  FinancialFactsSnapshotV1_0_0Schema,
  FinancialFactsSnapshotV1Schema,
} from '@shared/contracts/financial-facts-snapshot-v1.contract';
import {
  CurrentForecastBasisMismatchError,
  runCohortProjectionV2,
} from '@shared/core/cohorts/CohortProjectionV2';
import {
  canonicalizeDecimalLeaves,
  MoneyDecimalStringSchema,
  RatioDecimalStringSchema,
} from '@shared/lib/decimal-string';
import rawTruthCases from '../../../docs/current-forecast.truth-cases.json';

const FactsWithIdSchema = z.union([
  FinancialFactsSnapshotV1_0_0Schema.extend({
    id: z.number().int().positive(),
  }),
  FinancialFactsSnapshotV1Schema.extend({
    id: z.number().int().positive(),
  }),
]);

const cf003 = rawTruthCases.find((truthCase) => truthCase.id === 'CF-003');
if (!cf003) {
  throw new Error('CF-003 is required for the cohort projection V2 unit fixture.');
}

const resultMoneyFields = [
  'remainingDeployableCapitalUsd',
  'committedCapitalUsd',
  'calledToDateUsd',
  'projectedFeesRemainingUsd',
  'recallableDistributionsUsd',
  'uncalledCapitalUsd',
] as const;

const seriesMoneyFields = [
  'deployedUsd',
  'contributionsUsd',
  'distributionsUsd',
  'navUsd',
] as const;

const seriesRatioFields = ['tvpi', 'dpi'] as const;

const seriesPointKeys = [
  'activeCompanyCount',
  'contributionsUsd',
  'deployedUsd',
  'distributionsUsd',
  'dpi',
  'navUsd',
  'periodEnd',
  'periodStart',
  'projectedCohortCount',
  'source',
  'tvpi',
];

function validFixture() {
  return {
    input: CurrentForecastV2InputSchema.parse(cf003.input),
    plan: CurrentPlanVersionV1Schema.parse(cf003.plan),
    facts: FactsWithIdSchema.parse(cf003.facts),
  };
}

function payload5Facts(periodNav: unknown[]) {
  const { facts } = validFixture();
  const governedMoney = (value: string) => ({
    value,
    availability: 'available',
    reasonCodes: [],
    sourceRefs: ['fixture:payload-5'],
  });

  return {
    ...facts,
    policyVersion: 'financial-facts-policy/1.4.0',
    payloadSchemaId: 'financial-facts-payload/5',
    payload: {
      ...facts.payload,
      companyActuals: { ...facts.payload.companyActuals, facts: [] },
      sourceObservationIds: [],
      workingValueSelectionIds: [],
      participationTermRefs: [],
      positionRefs: [],
      positionComponentRefs: [],
      ownershipRefs: [],
      valuationRefs: [],
      observationRefs: [],
      openingAccountingState: null,
      cashFlowSeries: {
        series: [
          {
            eventType: 'lp_capital_call',
            vehicleId: null,
            perspective: 'lp_net',
            points: [
              {
                eventId: 101,
                effectiveAt: '2026-01-15T00:00:00.000Z',
                amount: '100.000000',
              },
            ],
          },
          {
            eventType: 'lp_distribution',
            vehicleId: null,
            perspective: 'lp_net',
            points: [
              {
                eventId: 102,
                effectiveAt: '2026-04-15T00:00:00.000Z',
                amount: '20.000000',
              },
            ],
          },
          {
            eventType: 'realized_proceeds',
            vehicleId: null,
            perspective: 'fund_gross',
            points: [
              {
                eventId: 103,
                effectiveAt: '2026-05-15T00:00:00.000Z',
                amount: '30.000000',
              },
            ],
          },
          {
            eventType: 'portfolio_investment',
            vehicleId: 11,
            perspective: 'company',
            points: [
              {
                eventId: 104,
                effectiveAt: '2026-02-15T00:00:00.000Z',
                amount: '40.000000',
              },
              {
                eventId: 105,
                effectiveAt: '2026-05-20T00:00:00.000Z',
                amount: '10.000000',
              },
            ],
          },
        ],
        totals: {
          contributions: '100.000000',
          distributions: '20.000000',
          recallableDistributions: '0.000000',
        },
        warnings: [],
      },
      marksSeries: { marks: [], periodNav, warnings: [] },
      vehicleRoster: [],
      capitalActuals: {
        ledgerCoverage: 'complete',
        paidInCapital: governedMoney('100.000000'),
        deployedCapital: governedMoney('50.000000'),
        realizedFundProceeds: governedMoney('30.000000'),
        distributionsToPartners: governedMoney('20.000000'),
      },
      valuationActuals: {
        valuationDate: '2026-06-30',
        roster: [],
        marks: [],
        coverage: 'complete',
        missingCompanyIds: [],
      },
      admissionReceiptCore: {
        contractVersion: 'actuals-pilot-publish-receipt/1.0.0',
        fundId: facts.fundId,
        asOfDate: facts.asOfDate,
      },
    },
  };
}

function payload5ActualSeries(periodNav: unknown[]) {
  const { input, plan } = validFixture();
  const facts = payload5Facts(periodNav);
  // Phase 1 adds payload-5 schema/types; keep this characterization fixture plain.
  const result = runCohortProjectionV2(
    input,
    plan,
    facts as unknown as Parameters<typeof runCohortProjectionV2>[2]
  );
  return result.series.filter((point) => point.source === 'actual');
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runCohortProjectionV2', () => {
  it('does not consume Math.random', () => {
    const randomSpy = vi.spyOn(Math, 'random');
    const { input, plan, facts } = validFixture();

    runCohortProjectionV2(input, plan, facts);

    expect(randomSpy).not.toHaveBeenCalled();
  });

  it('replays persisted policy 1.0.0 facts deterministically for an identical basis', () => {
    const firstFixture = validFixture();
    const secondFixture = validFixture();

    const first = runCohortProjectionV2(firstFixture.input, firstFixture.plan, firstFixture.facts);
    const second = runCohortProjectionV2(
      secondFixture.input,
      secondFixture.plan,
      secondFixture.facts
    );

    expect(first.resultHash).not.toBeNull();
    expect(second.resultHash).toBe(first.resultHash);
    expect(second).toEqual(first);
  });

  it('accepts deeply frozen inputs without mutating them', () => {
    const fixture = validFixture();
    const before = structuredClone(fixture);
    deepFreeze(fixture);

    expect(() => runCohortProjectionV2(fixture.input, fixture.plan, fixture.facts)).not.toThrow();
    expect(fixture).toEqual(before);
  });

  it('returns only aggregate cohort and company counts', () => {
    const { input, plan, facts } = validFixture();
    const result = runCohortProjectionV2(input, plan, facts);

    expect(() => CurrentForecastV2Schema.parse(result)).not.toThrow();
    expect(result.series.length).toBeGreaterThan(0);
    for (const point of result.series) {
      expect(Object.keys(point).sort()).toEqual(seriesPointKeys);
      expect(Number.isInteger(point.activeCompanyCount)).toBe(true);
      expect(Number.isInteger(point.projectedCohortCount)).toBe(true);
    }
  });

  it('formats every money and ratio result field as a canonical decimal string', () => {
    const { input, plan, facts } = validFixture();
    const result = runCohortProjectionV2(input, plan, facts);

    for (const field of resultMoneyFields) {
      expect(MoneyDecimalStringSchema.safeParse(result[field]).success).toBe(true);
    }
    for (const point of result.series) {
      for (const field of seriesMoneyFields) {
        expect(MoneyDecimalStringSchema.safeParse(point[field]).success).toBe(true);
      }
      for (const field of seriesRatioFields) {
        expect(RatioDecimalStringSchema.safeParse(point[field]).success).toBe(true);
      }
    }
    if (result.netIrr !== null) {
      expect(RatioDecimalStringSchema.safeParse(result.netIrr).success).toBe(true);
    }
  });

  it('keeps the resultHash preimage free of hash leaves and scientific notation', () => {
    const { input, plan, facts } = validFixture();
    const result = runCohortProjectionV2(input, plan, facts);
    const resultHashPreimage = {
      fundId: result.fundId,
      financialFactsSnapshotId: result.financialFactsSnapshotId,
      currentPlanVersionId: result.currentPlanVersionId,
      asOfDate: result.asOfDate,
      engineVersion: result.engineVersion,
      methodologyVersion: result.methodologyVersion,
      status: result.status,
      series: result.series,
      remainingDeployableCapitalUsd: result.remainingDeployableCapitalUsd,
      committedCapitalUsd: result.committedCapitalUsd,
      calledToDateUsd: result.calledToDateUsd,
      projectedFeesRemainingUsd: result.projectedFeesRemainingUsd,
      recallableDistributionsUsd: result.recallableDistributionsUsd,
      uncalledCapitalUsd: result.uncalledCapitalUsd,
      netIrr: result.netIrr,
    };

    expect(() => canonicalizeDecimalLeaves(resultHashPreimage)).not.toThrow();
  });

  it('rejects an asOfDate that differs from the facts snapshot', () => {
    const { input, plan, facts } = validFixture();
    const mismatchedInput = CurrentForecastV2InputSchema.parse({
      ...input,
      asOfDate: '2026-07-20',
    });

    let thrown: unknown;
    try {
      runCohortProjectionV2(mismatchedInput, plan, facts);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CurrentForecastBasisMismatchError);
    expect(thrown).toMatchObject({ code: 'AS_OF_DATE_MISMATCH' });
  });

  it('uses populated payload-5 periodNav and sums both distribution series', () => {
    const actualSeries = payload5ActualSeries([
      {
        periodEnd: '2026-06-30',
        nav: '75.000000',
        warnings: [],
      },
    ]);

    expect(actualSeries).toEqual([
      {
        periodStart: '2026-01-01',
        periodEnd: '2026-03-31',
        source: 'actual',
        deployedUsd: '40.000000',
        contributionsUsd: '100.000000',
        distributionsUsd: '0.000000',
        navUsd: '0.000000',
        tvpi: '0.000000000000',
        dpi: '0.000000000000',
        activeCompanyCount: 0,
        projectedCohortCount: 0,
      },
      {
        periodStart: '2026-04-01',
        periodEnd: '2026-06-30',
        source: 'actual',
        deployedUsd: '50.000000',
        contributionsUsd: '0.000000',
        distributionsUsd: '50.000000',
        navUsd: '75.000000',
        tvpi: '1.250000000000',
        dpi: '0.500000000000',
        activeCompanyCount: 0,
        projectedCohortCount: 0,
      },
      {
        periodStart: '2026-07-01',
        periodEnd: '2026-09-30',
        source: 'actual',
        deployedUsd: '50.000000',
        contributionsUsd: '0.000000',
        distributionsUsd: '0.000000',
        navUsd: '75.000000',
        tvpi: '1.250000000000',
        dpi: '0.500000000000',
        activeCompanyCount: 0,
        projectedCohortCount: 0,
      },
    ]);
  });

  it('keeps empty payload-5 periodNav at zero and tvpi equal to dpi', () => {
    const projected = payload5ActualSeries([]).map(({ navUsd, tvpi, dpi }) => ({
      navUsd,
      tvpi,
      dpi,
    }));

    expect(projected).toEqual([
      { navUsd: '0.000000', tvpi: '0.000000000000', dpi: '0.000000000000' },
      { navUsd: '0.000000', tvpi: '0.500000000000', dpi: '0.500000000000' },
      { navUsd: '0.000000', tvpi: '0.500000000000', dpi: '0.500000000000' },
    ]);
  });
});
