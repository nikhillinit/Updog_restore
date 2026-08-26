import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import {
  CurrentForecastSeriesPointV1Schema,
  CurrentForecastUnavailableReasonSchema,
  CurrentForecastV2InputSchema,
  CurrentForecastV2Schema,
} from '@shared/contracts/current-forecast-v2.contract';
import { CurrentPlanVersionV1Schema } from '@shared/contracts/current-plan-version-v1.contract';
import { PersistedFinancialFactsSnapshotV1Schema } from '@shared/contracts/financial-facts-snapshot-v1.contract';
// @ts-expect-error: Phase 1 intentionally precedes the Phase 2 engine implementation.
import { runCohortProjectionV2 } from '@shared/core/cohorts/CohortProjectionV2';
import { Decimal } from '@shared/lib/decimal-config';
import { MoneyDecimalStringSchema, RatioDecimalStringSchema } from '@shared/lib/decimal-string';
import rawTruthCases from '../../../docs/current-forecast.truth-cases.json';

const ProjectedQuarterMoneySchema = z
  .object({
    quarter: z.number().int().positive(),
    deployedUsd: MoneyDecimalStringSchema,
  })
  .strict();

const ProjectedQuarterDistributionSchema = z
  .object({
    quarter: z.number().int().positive(),
    distributionsUsd: MoneyDecimalStringSchema,
  })
  .strict();

const RemainingCapitalConservationSchema = z
  .object({
    deployedActualUsd: MoneyDecimalStringSchema,
    deployableCapitalUsd: MoneyDecimalStringSchema,
  })
  .strict();

const BridgeExpectationSchema = z
  .object({
    committedCapitalUsd: MoneyDecimalStringSchema,
    calledToDateUsd: MoneyDecimalStringSchema,
    projectedFeesRemainingUsd: MoneyDecimalStringSchema,
    recallableDistributionsUsd: MoneyDecimalStringSchema,
    uncalledCapitalUsd: MoneyDecimalStringSchema,
  })
  .strict();

const FittedNavExpectationSchema = z
  .object({
    quarter: z.number().int().positive(),
    navUsd: MoneyDecimalStringSchema,
    precision: z.number().int().nonnegative(),
  })
  .strict();

const NavBoundsExpectationSchema = z
  .object({
    throughQuarter: z.number().int().positive(),
    minimumUsd: MoneyDecimalStringSchema,
    maximumUsd: MoneyDecimalStringSchema,
    monotonicNonDecreasing: z.literal(true),
  })
  .strict();

const CohortNavConservationSchema = z
  .object({
    quarter: z.number().int().positive(),
    cohortNavUsd: z.array(MoneyDecimalStringSchema),
    aggregateNavUsd: MoneyDecimalStringSchema,
  })
  .strict();

const TruthCaseExpectationSchema = z
  .object({
    status: CurrentForecastV2Schema.shape.status,
    unavailableReason: CurrentForecastUnavailableReasonSchema.optional(),
    series: z.array(CurrentForecastSeriesPointV1Schema).optional(),
    remainingDeployableCapitalUsd: MoneyDecimalStringSchema.optional(),
    actualDeployedUsd: MoneyDecimalStringSchema.optional(),
    projectedPeriodsAbsent: z.literal(true).optional(),
    deploymentByProjectedQuarter: z.array(ProjectedQuarterMoneySchema).optional(),
    remainingCapitalConservation: RemainingCapitalConservationSchema.optional(),
    exitDistributionsByProjectedQuarter: z.array(ProjectedQuarterDistributionSchema).optional(),
    totalProjectedDistributionsUsd: MoneyDecimalStringSchema.optional(),
    terminalNavUsd: MoneyDecimalStringSchema.optional(),
    fittedNavByProjectedQuarter: z.array(FittedNavExpectationSchema).optional(),
    navBounds: NavBoundsExpectationSchema.optional(),
    bridge: BridgeExpectationSchema.optional(),
    netIrr: RatioDecimalStringSchema.nullable().optional(),
    netIrrApprox: z
      .object({
        value: z.number(),
        precision: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
    cohortNavConservation: z.array(CohortNavConservationSchema).optional(),
  })
  .strict();

const TruthCaseEnvelopeSchema = z
  .object({
    id: z.string().regex(/^CF-00[1-8]$/),
    description: z.string().min(1),
    input: z.unknown(),
    plan: z.unknown(),
    facts: z.unknown(),
    expect: TruthCaseExpectationSchema,
  })
  .strict();

const FactsEnvelopeSchema = z
  .object({
    id: z.number().int().positive(),
  })
  .passthrough();

const truthCases = z.array(TruthCaseEnvelopeSchema).parse(rawTruthCases);

type ForecastResult = z.infer<typeof CurrentForecastV2Schema>;
type ForecastExpectation = z.infer<typeof TruthCaseExpectationSchema>;
type ForecastSeriesPoint = ForecastResult['series'][number];

function projectedSeries(result: ForecastResult): ForecastSeriesPoint[] {
  return result.series.filter((point) => point.source === 'projected');
}

function projectedPointAt(result: ForecastResult, quarter: number): ForecastSeriesPoint {
  const point = projectedSeries(result)[quarter - 1];
  if (!point) {
    throw new Error(`Missing projected quarter ${quarter}.`);
  }
  return point;
}

function finalActualDeployed(result: ForecastResult): Decimal {
  const actualPoints = result.series.filter((point) => point.source === 'actual');
  return new Decimal(actualPoints.at(-1)?.deployedUsd ?? 0);
}

function assertUnavailableReason(result: ForecastResult, expected: ForecastExpectation): void {
  if (!expected.unavailableReason) return;

  expect(result.unavailableReasons.map((reason) => reason.code)).toEqual([
    expected.unavailableReason,
  ]);
}

function assertDeployment(result: ForecastResult, expected: ForecastExpectation): void {
  if (!expected.deploymentByProjectedQuarter) return;

  let previousCumulativeDeployed = finalActualDeployed(result);
  for (const deployment of expected.deploymentByProjectedQuarter) {
    const point = projectedPointAt(result, deployment.quarter);
    const deployedThisQuarter = new Decimal(point.deployedUsd)
      .minus(previousCumulativeDeployed)
      .toFixed(6);

    expect(deployedThisQuarter).toBe(deployment.deployedUsd);
    expect(point.contributionsUsd).toBe(deployment.deployedUsd);
    previousCumulativeDeployed = new Decimal(point.deployedUsd);
  }
}

function assertExitDistributions(result: ForecastResult, expected: ForecastExpectation): void {
  for (const exit of expected.exitDistributionsByProjectedQuarter ?? []) {
    expect(projectedPointAt(result, exit.quarter).distributionsUsd).toBe(exit.distributionsUsd);
  }

  if (expected.totalProjectedDistributionsUsd) {
    const total = projectedSeries(result).reduce(
      (sum, point) => sum.plus(point.distributionsUsd),
      new Decimal(0)
    );
    expect(total.toFixed(6)).toBe(expected.totalProjectedDistributionsUsd);
  }
}

function assertRemainingCapitalConservation(
  result: ForecastResult,
  expected: ForecastExpectation
): void {
  const conservation = expected.remainingCapitalConservation;
  if (!conservation) return;

  const deployedActual = new Decimal(conservation.deployedActualUsd);
  const deployable = new Decimal(conservation.deployableCapitalUsd);
  const cappedDeployed = Decimal.min(deployedActual, deployable);

  expect(finalActualDeployed(result).toFixed(6)).toBe(conservation.deployedActualUsd);
  expect(new Decimal(result.remainingDeployableCapitalUsd).plus(cappedDeployed).toFixed(6)).toBe(
    conservation.deployableCapitalUsd
  );
}

function assertBridge(result: ForecastResult, expected: ForecastExpectation): void {
  if (!expected.bridge) return;

  expect(result).toMatchObject(expected.bridge);

  const recomputedUncalled = new Decimal(expected.bridge.committedCapitalUsd)
    .minus(expected.bridge.calledToDateUsd)
    .minus(expected.bridge.projectedFeesRemainingUsd)
    .plus(expected.bridge.recallableDistributionsUsd)
    .toFixed(6);
  expect(recomputedUncalled).toBe(expected.bridge.uncalledCapitalUsd);
  expect(result.uncalledCapitalUsd).toBe(recomputedUncalled);
}

function assertFittedNav(result: ForecastResult, expected: ForecastExpectation): void {
  for (const navExpectation of expected.fittedNavByProjectedQuarter ?? []) {
    const actualNav = Number(projectedPointAt(result, navExpectation.quarter).navUsd);
    expect(actualNav).toBeCloseTo(Number(navExpectation.navUsd), navExpectation.precision);
  }

  if (!expected.navBounds) return;

  const points = projectedSeries(result).slice(0, expected.navBounds.throughQuarter);
  expect(points).toHaveLength(expected.navBounds.throughQuarter);

  let previousNav: Decimal | null = null;
  for (const point of points) {
    const nav = new Decimal(point.navUsd);
    expect(nav.gte(expected.navBounds.minimumUsd)).toBe(true);
    expect(nav.lte(expected.navBounds.maximumUsd)).toBe(true);
    if (previousNav) {
      expect(nav.gte(previousNav)).toBe(true);
    }
    previousNav = nav;
  }
}

function assertCohortNavConservation(result: ForecastResult, expected: ForecastExpectation): void {
  for (const period of expected.cohortNavConservation ?? []) {
    const exactCohortSum = period.cohortNavUsd.reduce(
      (sum, cohortNav) => sum.plus(cohortNav),
      new Decimal(0)
    );

    expect(exactCohortSum.toFixed(6)).toBe(period.aggregateNavUsd);
    expect(projectedPointAt(result, period.quarter).navUsd).toBe(period.aggregateNavUsd);
  }
}

function assertTruthCase(result: ForecastResult, expected: ForecastExpectation): void {
  expect(result.status).toBe(expected.status);
  assertUnavailableReason(result, expected);

  if (expected.series) {
    expect(result.series).toEqual(expected.series);
  }
  if (expected.remainingDeployableCapitalUsd) {
    expect(result.remainingDeployableCapitalUsd).toBe(expected.remainingDeployableCapitalUsd);
  }
  if (expected.actualDeployedUsd) {
    expect(finalActualDeployed(result).toFixed(6)).toBe(expected.actualDeployedUsd);
  }
  if (expected.projectedPeriodsAbsent) {
    expect(projectedSeries(result)).toEqual([]);
  }

  assertDeployment(result, expected);
  assertExitDistributions(result, expected);
  assertRemainingCapitalConservation(result, expected);
  assertBridge(result, expected);
  assertFittedNav(result, expected);
  assertCohortNavConservation(result, expected);

  if (expected.terminalNavUsd) {
    expect(result.series.at(-1)?.navUsd).toBe(expected.terminalNavUsd);
  }
  if (expected.netIrr !== undefined) {
    expect(result.netIrr).toBe(expected.netIrr);
  }
  if (expected.netIrrApprox) {
    expect(result.netIrr).not.toBeNull();
    expect(Number(result.netIrr)).toBeCloseTo(
      expected.netIrrApprox.value,
      expected.netIrrApprox.precision
    );
  }
}

describe('current forecast V2 truth cases', () => {
  it('contains CF-001 through CF-008 in order', () => {
    expect(truthCases.map((truthCase) => truthCase.id)).toEqual([
      'CF-001',
      'CF-002',
      'CF-003',
      'CF-004',
      'CF-005',
      'CF-006',
      'CF-007',
      'CF-008',
    ]);
  });

  truthCases.forEach((truthCase) => {
    it(`${truthCase.id}: ${truthCase.description}`, () => {
      const input = CurrentForecastV2InputSchema.parse(truthCase.input);
      const plan = CurrentPlanVersionV1Schema.parse(truthCase.plan);
      const factsEnvelope = FactsEnvelopeSchema.parse(truthCase.facts);
      const { id, ...factsWithoutId } = factsEnvelope;
      const facts = {
        ...PersistedFinancialFactsSnapshotV1Schema.parse(factsWithoutId),
        id,
      };

      const result = CurrentForecastV2Schema.parse(runCohortProjectionV2(input, plan, facts));

      assertTruthCase(result, truthCase.expect);
    });
  });
});
