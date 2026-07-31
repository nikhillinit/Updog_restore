/**
 * cash-assembly-period-loop-v1.ts
 *
 * Pure projected-period cash assembly loop. Phases 1-2 compose the existing
 * period-grid, event-stream, call-sizing, and quarterly-row modules; enforce
 * opening-state eligibility, cutover partitioning, and historical cash
 * reconciliation; then apply the D6 cash recurrence in its required order.
 * Decimal waterfall decomposition, terminal realization, and XIRR assembly
 * remain later ordered TDD phases.
 *
 * Phase 1 invariants:
 * - opening cash threads from each emitted quarter into the next;
 * - cumulative LP paid-in and distributed amounts never decrease;
 * - remaining unfunded-envelope capacity never increases;
 * - NAV remains a stock outside the cash recurrence;
 * - all emitted money crosses the existing canonical 6dp row boundary.
 */

import type { CurrentForecastSeriesPointV1 } from '../../contracts/current-forecast-v2.contract';
import type { FundAccountingStateObservationV1_1 } from '../../contracts/internal-economics/fund-accounting-state-observation-v1.1.contract';
import { buildFactsStableSourceId } from '../../contracts/internal-economics/event-ordering-v1.contract';
import {
  compareCanonicalUtcInstants,
  validatePersistedTerminalResolutionV1,
  type PersistedTerminalResolutionV1,
  type TerminalModeV1,
} from '../../contracts/internal-economics/terminal-policy-v1.contract';
import type { XirrDiagnostic } from '../../contracts/lp-reporting/lp-metric-run.contract';
import { Decimal } from '../decimal-config';
import {
  assembleCashEventStreamV1,
  type AssembledCashEventStreamV1,
  type FactsCashAssemblyEventV1,
  type FactsCashAssemblyNavMarkV1,
  type FactsCashAssemblyPeriodNavV1,
} from './cash-assembly-event-stream-v1';
import {
  sizeCashAssemblyCallsV1,
  type CallSizingQuarterNeedInputV1,
} from './cash-assembly-call-sizing-v1';
import {
  buildCashAssemblyPeriodGridV1,
  buildCashAssemblyQuarterRowV1,
  type CashAssemblyPeriodV1,
  type CashAssemblyQuarterRowV1,
} from './cash-assembly-types-v1';

const ZERO = new Decimal(0);
const RESULT_STATUS_REASONS = [
  'DECIMAL_CORE_UNCERTIFIED',
  'LP_NET_NAV_FLAT_SHARE_APPROXIMATION',
] as const;

const PHASE_1_XIRR_DIAGNOSTIC: XirrDiagnostic = {
  convergence: 'failed',
  iterations: 0,
  method: 'none',
  boundHit: null,
  failureReason: 'INSUFFICIENT_CASH_FLOWS',
};

export interface ExecuteCashAssemblyPeriodLoopV1Input {
  readonly factsSnapshotId: number;
  readonly forecastSnapshotId: number;
  readonly economicsPolicyVersion: string;
  readonly engineVersion: string;
  readonly methodologyVersion: string;
  readonly factsEvents: readonly FactsCashAssemblyEventV1[];
  readonly factsNavMarks: readonly FactsCashAssemblyNavMarkV1[];
  readonly factsPeriodNav: readonly FactsCashAssemblyPeriodNavV1[];
  readonly openingState: FundAccountingStateObservationV1_1;
  readonly forecastSeries: readonly CurrentForecastSeriesPointV1[];
  readonly scheduledNeeds: readonly CallSizingQuarterNeedInputV1[];
  readonly cashBufferQuarters: number;
  readonly unfundedEnvelopeRemainingUsd: Decimal;
  readonly persistedTerminalResolution: PersistedTerminalResolutionV1;
  readonly terminalMode: TerminalModeV1;
  readonly carryPct: number;
}

export interface CashAssemblyWaterfallEventV1 {
  readonly periodEnd: string;
  readonly sourceId: string;
  readonly grossDistributionUsd: string;
  readonly lpCapitalReturnUsd: string;
  readonly lpProfitUsd: string;
  readonly gpInvestmentDistributionUsd: string;
  readonly gpCarryUsd: string;
}

export interface ExecuteCashAssemblyPeriodLoopV1Result {
  readonly quarters: readonly CashAssemblyQuarterRowV1[];
  readonly waterfallEvents: readonly CashAssemblyWaterfallEventV1[];
  readonly terminalNavBeforeRealizationUsd: string;
  readonly lpNetIrr: string | null;
  readonly xirrDiagnostic: XirrDiagnostic;
  readonly resultStatus: 'indicative';
  readonly resultStatusReasons: readonly string[];
  readonly terminalMode: TerminalModeV1;
  readonly engineVersion: string;
  readonly methodologyVersion: string;
}

export type CashAssemblyPeriodLoopV1ErrorCode =
  | 'FACT_AFTER_CUTOVER'
  | 'PARTIAL_PROJECTED_PERIOD'
  | 'SCHEDULE_GRID_MISMATCH'
  | 'OPENING_STATE_INELIGIBLE'
  | 'HISTORICAL_RECONCILIATION_MISMATCH'
  | 'CORE_ROW_MAPPING_MISMATCH'
  | 'TERMINAL_RECONCILIATION_FAILED'
  | 'MONOTONICITY_VIOLATION'
  | 'CARRY_PCT_INVALID';

export class CashAssemblyPeriodLoopV1Error extends Error {
  constructor(
    readonly code: CashAssemblyPeriodLoopV1ErrorCode,
    message: string,
    readonly context: Record<string, string> = {}
  ) {
    super(message);
    this.name = 'CashAssemblyPeriodLoopV1Error';
  }
}

function periodKey(period: CashAssemblyPeriodV1): string {
  return `${period.periodStart}|${period.periodEnd}|${period.source}`;
}

function compareForecastPoints(
  left: CurrentForecastSeriesPointV1,
  right: CurrentForecastSeriesPointV1
): number {
  return (
    left.periodEnd.localeCompare(right.periodEnd) ||
    left.periodStart.localeCompare(right.periodStart) ||
    left.source.localeCompare(right.source)
  );
}

function assertCarryPct(carryPct: number): void {
  if (!Number.isFinite(carryPct) || carryPct < 0 || carryPct > 1) {
    throw new CashAssemblyPeriodLoopV1Error(
      'CARRY_PCT_INVALID',
      `carryPct must be a finite number in [0, 1], received ${String(carryPct)}.`,
      { carryPct: String(carryPct) }
    );
  }
}

const INELIGIBLE_OPENING_STATE_FIELDS = [
  'cumulativeGpPaidInUsd',
  'gpUnreturnedContributedCapitalUsd',
  'gpInvestmentDistributionsPaidUsd',
  'accruedPreferredReturnUsd',
] as const satisfies readonly (keyof FundAccountingStateObservationV1_1)[];

function assertOpeningStateEligible(openingState: FundAccountingStateObservationV1_1): void {
  for (const field of INELIGIBLE_OPENING_STATE_FIELDS) {
    const value = new Decimal(openingState[field]);
    if (!value.isZero()) {
      throw new CashAssemblyPeriodLoopV1Error(
        'OPENING_STATE_INELIGIBLE',
        `${field} must be zero for the V1 period loop.`,
        { field, valueUsd: value.toFixed(6) }
      );
    }
  }

  // Historical GP carry paid is provenance only. It never becomes LP cash.
}

function assertFactsAtOrBeforeCutover(input: {
  readonly factsSnapshotId: number;
  readonly factsEvents: readonly FactsCashAssemblyEventV1[];
  readonly factsNavMarks: readonly FactsCashAssemblyNavMarkV1[];
  readonly factsPeriodNav: readonly FactsCashAssemblyPeriodNavV1[];
  readonly cutoverInstant: string;
}): void {
  const assertInstant = (sourceId: string, effectiveAt: string): void => {
    if (compareCanonicalUtcInstants(effectiveAt, input.cutoverInstant) > 0) {
      throw new CashAssemblyPeriodLoopV1Error(
        'FACT_AFTER_CUTOVER',
        `Facts source ${sourceId} occurs after the opening-state cutover.`,
        {
          sourceId,
          effectiveAt,
          cutoverInstant: input.cutoverInstant,
        }
      );
    }
  };

  for (const event of input.factsEvents) {
    assertInstant(
      buildFactsStableSourceId(input.factsSnapshotId, event.eventId),
      event.effectiveAt
    );
  }
  for (const mark of input.factsNavMarks) {
    assertInstant(
      `facts:${input.factsSnapshotId}:nav_mark:${mark.markId}`,
      `${mark.effectiveAt}T23:59:59.999Z`
    );
  }
  for (const observation of input.factsPeriodNav) {
    assertInstant(
      `facts:${input.factsSnapshotId}:period_nav:${observation.periodEnd}`,
      `${observation.periodEnd}T23:59:59.999Z`
    );
  }
}

function partitionProjectedPeriods(
  periodGrid: readonly CashAssemblyPeriodV1[],
  cutoverInstant: string
): CashAssemblyPeriodV1[] {
  const projectedPeriods: CashAssemblyPeriodV1[] = [];

  for (const period of periodGrid) {
    if (period.source !== 'projected') continue;

    const callInstant = `${period.periodStart}T00:00:00.000Z`;
    const distributionInstant = `${period.periodEnd}T23:59:59.999Z`;
    const callAfterCutover = compareCanonicalUtcInstants(callInstant, cutoverInstant) > 0;
    const distributionAfterCutover =
      compareCanonicalUtcInstants(distributionInstant, cutoverInstant) > 0;

    if (distributionAfterCutover && !callAfterCutover) {
      throw new CashAssemblyPeriodLoopV1Error(
        'PARTIAL_PROJECTED_PERIOD',
        `Projected quarter ending ${period.periodEnd} crosses the opening-state cutover.`,
        {
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          callInstant,
          distributionInstant,
          cutoverInstant,
        }
      );
    }

    if (callAfterCutover) projectedPeriods.push(period);
  }

  return projectedPeriods;
}

type HistoricalReconciliationCategory =
  | 'lp_capital_call'
  | 'lp_distribution'
  | 'recallable_distribution';

function assertHistoricalReconciliation(input: {
  readonly eventStream: AssembledCashEventStreamV1;
  readonly openingState: FundAccountingStateObservationV1_1;
}): void {
  const expectations: readonly {
    category: HistoricalReconciliationCategory;
    expected: Decimal;
  }[] = [
    {
      category: 'lp_capital_call',
      expected: new Decimal(input.openingState.cumulativeLpPaidInUsd),
    },
    {
      category: 'lp_distribution',
      expected: new Decimal(input.openingState.actualLpDistributionsCumulativeUsd).minus(
        input.openingState.recallableDistributionsCumulativeUsd
      ),
    },
    {
      category: 'recallable_distribution',
      expected: new Decimal(input.openingState.recallableDistributionsCumulativeUsd),
    },
  ];

  for (const { category, expected } of expectations) {
    const events = input.eventStream.events.filter(
      (event) => event.source === 'facts' && event.eventType === category
    );
    const actual = events.reduce((sum, event) => sum.plus(event.amountUsd), ZERO);
    if (!actual.eq(expected)) {
      throw new CashAssemblyPeriodLoopV1Error(
        'HISTORICAL_RECONCILIATION_MISMATCH',
        `Historical ${category} cash does not reconcile to the opening state.`,
        {
          category,
          expectedUsd: expected.toFixed(6),
          actualUsd: actual.toFixed(6),
          firstSourceId: events.at(0)?.stableSourceId ?? 'none',
          lastSourceId: events.at(-1)?.stableSourceId ?? 'none',
        }
      );
    }
  }
}

function alignScheduledNeeds(
  projectedPeriods: readonly CashAssemblyPeriodV1[],
  scheduledNeeds: readonly CallSizingQuarterNeedInputV1[]
): void {
  if (projectedPeriods.length !== scheduledNeeds.length) {
    throw new CashAssemblyPeriodLoopV1Error(
      'SCHEDULE_GRID_MISMATCH',
      'Scheduled needs must align one-to-one with projected cash-assembly periods.',
      {
        projectedPeriodCount: String(projectedPeriods.length),
        scheduledNeedCount: String(scheduledNeeds.length),
      }
    );
  }

  for (let index = 0; index < projectedPeriods.length; index += 1) {
    const projectedPeriod = projectedPeriods[index]!;
    const scheduledPeriod = scheduledNeeds[index]!.period;
    if (periodKey(projectedPeriod) !== periodKey(scheduledPeriod)) {
      throw new CashAssemblyPeriodLoopV1Error(
        'SCHEDULE_GRID_MISMATCH',
        `Scheduled need at index ${index} does not match its projected period.`,
        {
          index: String(index),
          projectedPeriod: periodKey(projectedPeriod),
          scheduledPeriod: periodKey(scheduledPeriod),
        }
      );
    }
  }
}

function assertNondecreasing(input: {
  readonly name: string;
  readonly previous: Decimal;
  readonly current: Decimal;
  readonly periodEnd: string;
}): void {
  if (input.current.lt(input.previous)) {
    throw new CashAssemblyPeriodLoopV1Error(
      'MONOTONICITY_VIOLATION',
      `${input.name} decreased at quarter ending ${input.periodEnd}.`,
      {
        field: input.name,
        periodEnd: input.periodEnd,
        previous: input.previous.toString(),
        current: input.current.toString(),
      }
    );
  }
}

function assertNonincreasing(input: {
  readonly name: string;
  readonly previous: Decimal;
  readonly current: Decimal;
  readonly periodEnd: string;
}): void {
  if (input.current.gt(input.previous)) {
    throw new CashAssemblyPeriodLoopV1Error(
      'MONOTONICITY_VIOLATION',
      `${input.name} increased at quarter ending ${input.periodEnd}.`,
      {
        field: input.name,
        periodEnd: input.periodEnd,
        previous: input.previous.toString(),
        current: input.current.toString(),
      }
    );
  }
}

function buildProjectedPointMap(
  forecastSeries: readonly CurrentForecastSeriesPointV1[]
): Map<string, CurrentForecastSeriesPointV1> {
  return new Map(
    forecastSeries
      .filter((point) => point.source === 'projected')
      .map((point) => [periodKey(point), point])
  );
}

function buildDeploymentDeltaMap(
  forecastSeries: readonly CurrentForecastSeriesPointV1[]
): Map<string, Decimal> {
  const deploymentDeltas = new Map<string, Decimal>();
  let previousCumulativeDeployment = ZERO;

  for (const point of [...forecastSeries].sort(compareForecastPoints)) {
    const cumulativeDeployment = new Decimal(point.deployedUsd);
    if (point.source === 'projected') {
      deploymentDeltas.set(
        periodKey(point),
        cumulativeDeployment.minus(previousCumulativeDeployment)
      );
    }
    previousCumulativeDeployment = cumulativeDeployment;
  }

  return deploymentDeltas;
}

function assertScheduledDeploymentsMatchForecast(input: {
  readonly projectedPeriods: readonly CashAssemblyPeriodV1[];
  readonly scheduledNeeds: readonly CallSizingQuarterNeedInputV1[];
  readonly deploymentDeltaByPeriod: ReadonlyMap<string, Decimal>;
}): void {
  for (let index = 0; index < input.projectedPeriods.length; index += 1) {
    const period = input.projectedPeriods[index]!;
    const scheduledDeployment = input.scheduledNeeds[index]!.scheduledDeploymentUsd;
    const forecastDeploymentDelta = input.deploymentDeltaByPeriod.get(periodKey(period));

    if (forecastDeploymentDelta === undefined || !scheduledDeployment.eq(forecastDeploymentDelta)) {
      throw new CashAssemblyPeriodLoopV1Error(
        'SCHEDULE_GRID_MISMATCH',
        `Scheduled deployment does not match the forecast deployment delta at quarter ending ${period.periodEnd}.`,
        {
          periodEnd: period.periodEnd,
          scheduledDeploymentUsd: scheduledDeployment.toFixed(6),
          forecastDeploymentDeltaUsd:
            forecastDeploymentDelta?.toFixed(6) ?? 'missing',
        }
      );
    }
  }
}

export function executeCashAssemblyPeriodLoopV1(
  input: ExecuteCashAssemblyPeriodLoopV1Input
): ExecuteCashAssemblyPeriodLoopV1Result {
  assertOpeningStateEligible(input.openingState);

  validatePersistedTerminalResolutionV1({
    persisted: input.persistedTerminalResolution,
    forecastPeriodEnds: input.forecastSeries.map((point) => point.periodEnd),
    openingCutoverInstant: input.openingState.cutoverInstant,
  });

  const periodGrid = buildCashAssemblyPeriodGridV1({
    forecastSeries: input.forecastSeries,
    persistedTerminalResolution: input.persistedTerminalResolution,
  });
  const eventStream = assembleCashEventStreamV1({
    factsSnapshotId: input.factsSnapshotId,
    forecastSnapshotId: input.forecastSnapshotId,
    factsEvents: input.factsEvents,
    factsNavMarks: input.factsNavMarks,
    factsPeriodNav: input.factsPeriodNav,
    forecastSeries: input.forecastSeries,
    periodGrid,
    persistedTerminalResolution: input.persistedTerminalResolution,
    terminalMode: input.terminalMode,
  });
  assertFactsAtOrBeforeCutover({
    factsSnapshotId: input.factsSnapshotId,
    factsEvents: input.factsEvents,
    factsNavMarks: input.factsNavMarks,
    factsPeriodNav: input.factsPeriodNav,
    cutoverInstant: input.openingState.cutoverInstant,
  });
  const projectedPeriods = partitionProjectedPeriods(
    periodGrid,
    input.openingState.cutoverInstant
  );
  assertHistoricalReconciliation({ eventStream, openingState: input.openingState });
  alignScheduledNeeds(projectedPeriods, input.scheduledNeeds);
  const deploymentDeltaByPeriod = buildDeploymentDeltaMap(input.forecastSeries);
  assertScheduledDeploymentsMatchForecast({
    projectedPeriods,
    scheduledNeeds: input.scheduledNeeds,
    deploymentDeltaByPeriod,
  });

  const initialRemainingEnvelope = input.unfundedEnvelopeRemainingUsd.toDecimalPlaces(
    6,
    Decimal.ROUND_FLOOR
  );
  const callSizing = sizeCashAssemblyCallsV1({
    quarters: input.scheduledNeeds,
    cashBufferQuarters: input.cashBufferQuarters,
    openingCashUsd: new Decimal(input.openingState.cashBalanceUsd),
    unfundedEnvelopeRemainingUsd: initialRemainingEnvelope,
  });
  const projectedPointByPeriod = buildProjectedPointMap(input.forecastSeries);

  const quarters: CashAssemblyQuarterRowV1[] = [];
  let openingCash = new Decimal(input.openingState.cashBalanceUsd);
  let cumulativeLpPaidIn = new Decimal(input.openingState.cumulativeLpPaidInUsd);
  let cumulativeLpDistributed = new Decimal(
    input.openingState.actualLpDistributionsCumulativeUsd
  );
  let remainingEnvelope = initialRemainingEnvelope;

  for (let index = 0; index < projectedPeriods.length; index += 1) {
    const period = projectedPeriods[index]!;
    const key = periodKey(period);
    const forecastPoint = projectedPointByPeriod.get(key);
    const deployment = deploymentDeltaByPeriod.get(key);
    const callSizingQuarter = callSizing.quarters[index]!;
    const scheduledNeed = input.scheduledNeeds[index]!;

    if (forecastPoint === undefined || deployment === undefined) {
      throw new CashAssemblyPeriodLoopV1Error(
        'SCHEDULE_GRID_MISMATCH',
        `Projected forecast point is missing for quarter ending ${period.periodEnd}.`,
        { period: key }
      );
    }

    const lpCall = new Decimal(callSizingQuarter.totalCallUsd);
    const managementFees = scheduledNeed.scheduledFeeUsd;
    const fundExpenses = scheduledNeed.scheduledExpenseUsd;
    const grossProceeds = new Decimal(forecastPoint.distributionsUsd);

    // Phase 1 has no waterfall decomposition. Until Phase 3 joins the Decimal
    // core, projected gross proceeds leave as LP distributions with zero GP
    // participation, preserving the cash recurrence without inventing carry.
    const lpDistribution = grossProceeds;
    const gpInvestmentDistribution = ZERO;
    const gpCarryDistribution = ZERO;

    let endingCash = openingCash.plus(lpCall);
    endingCash = endingCash.minus(deployment);
    endingCash = endingCash.minus(managementFees);
    endingCash = endingCash.minus(fundExpenses);
    endingCash = endingCash.plus(grossProceeds);
    endingCash = endingCash.minus(lpDistribution);
    endingCash = endingCash.minus(gpInvestmentDistribution);
    endingCash = endingCash.minus(gpCarryDistribution);

    const nextCumulativeLpPaidIn = cumulativeLpPaidIn.plus(lpCall);
    const nextCumulativeLpDistributed = cumulativeLpDistributed.plus(lpDistribution);
    const nextRemainingEnvelope = new Decimal(callSizingQuarter.remainingEnvelopeCapacityUsd);

    assertNondecreasing({
      name: 'cumulativeLpPaidInUsd',
      previous: cumulativeLpPaidIn,
      current: nextCumulativeLpPaidIn,
      periodEnd: period.periodEnd,
    });
    assertNondecreasing({
      name: 'cumulativeLpDistributedUsd',
      previous: cumulativeLpDistributed,
      current: nextCumulativeLpDistributed,
      periodEnd: period.periodEnd,
    });
    assertNonincreasing({
      name: 'unfundedEnvelopeRemainingUsd',
      previous: remainingEnvelope,
      current: nextRemainingEnvelope,
      periodEnd: period.periodEnd,
    });

    quarters.push(
      buildCashAssemblyQuarterRowV1({
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        source: 'projected',
        openingCashUsd: openingCash,
        lpCapitalCallUsd: lpCall,
        gpCommitmentCallUsd: ZERO,
        portfolioDeploymentUsd: deployment,
        managementFeesUsd: managementFees,
        fundExpensesUsd: fundExpenses,
        grossRealizedProceedsUsd: grossProceeds,
        lpDistributionUsd: lpDistribution,
        gpInvestmentDistributionUsd: gpInvestmentDistribution,
        gpCarryDistributedUsd: gpCarryDistribution,
        endingCashUsd: endingCash,
        grossNavUsd: new Decimal(forecastPoint.navUsd),
        lpNetNavUsd: new Decimal(forecastPoint.navUsd),
        cumulativeLpPaidInUsd: nextCumulativeLpPaidIn,
        cumulativeLpDistributedUsd: nextCumulativeLpDistributed,
      })
    );

    openingCash = endingCash;
    cumulativeLpPaidIn = nextCumulativeLpPaidIn;
    cumulativeLpDistributed = nextCumulativeLpDistributed;
    remainingEnvelope = nextRemainingEnvelope;
  }

  // Carry is first consumed during Phase 3 core-input construction. Keep its
  // validation after the already-implemented pipeline steps 1-8 so an invalid
  // future-stage input cannot mask an earlier opening/cutover/schedule error.
  assertCarryPct(input.carryPct);

  const terminalNavBeforeRealizationUsd =
    projectedPointByPeriod.get(periodKey(projectedPeriods.at(-1)!))?.navUsd ?? '0.000000';

  return {
    quarters,
    waterfallEvents: [],
    terminalNavBeforeRealizationUsd,
    lpNetIrr: null,
    xirrDiagnostic: PHASE_1_XIRR_DIAGNOSTIC,
    resultStatus: 'indicative',
    resultStatusReasons: RESULT_STATUS_REASONS,
    terminalMode: input.terminalMode,
    engineVersion: input.engineVersion,
    methodologyVersion: input.methodologyVersion,
  };
}
