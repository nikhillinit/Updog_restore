import { z } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CurrentForecastV2InputSchema,
  CurrentForecastV2Schema,
} from '@shared/contracts/current-forecast-v2.contract';
import { CurrentPlanVersionV1Schema } from '@shared/contracts/current-plan-version-v1.contract';
import { FinancialFactsSnapshotV1Schema } from '@shared/contracts/financial-facts-snapshot-v1.contract';
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

const FactsWithIdSchema = FinancialFactsSnapshotV1Schema.extend({
  id: z.number().int().positive(),
});

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

  it('returns a deterministic result for an identical basis', () => {
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
});
