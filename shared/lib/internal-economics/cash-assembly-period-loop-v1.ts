/**
 * cash-assembly-period-loop-v1.ts
 *
 * Pure projected-period cash assembly loop. Phases 1-4 compose the existing
 * period-grid, event-stream, call-sizing, and quarterly-row modules; enforce
 * opening-state eligibility, cutover partitioning, and historical cash
 * reconciliation; invoke the Decimal waterfall core once; join allocations by
 * source ID; quantize and validate presentation rows; apply the D6 cash
 * recurrence in its required order; resolve terminal realization; and compute
 * LP-net XIRR.
 *
 * D-5 timezone disclosure: XIRR determinism is conditional on running with
 * TZ=UTC because the frozen upstream safeXIRR date normalization uses local-time
 * getters (tracked by issue #1256). The rest of this loop is timezone-pure.
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
import { safeXIRR, type CashFlowEvent } from '../finance/xirr';
import {
  assembleCashEventStreamV1,
  type AssembledCashEventStreamV1,
  type FactsCashAssemblyEventV1,
  type FactsCashAssemblyNavMarkV1,
  type FactsCashAssemblyPeriodNavV1,
} from './cash-assembly-event-stream-v1';
import {
  sizeCashAssemblyCallsV1,
  type CashAssemblyCallSizingQuarterV1,
  type CallSizingQuarterNeedInputV1,
} from './cash-assembly-call-sizing-v1';
import {
  computeDecimalWaterfallAllocationV1,
  type CoreAllocationRowV1,
  type CoreContributionV1,
  type CoreDistributionV1,
} from './decimal-waterfall-core-v1';
import { processWaterfallRunForPresentation } from './presentation-rounding-v1';
import {
  buildCashAssemblyPeriodGridV1,
  buildCashAssemblyQuarterRowV1,
  type CashAssemblyPeriodV1,
  type CashAssemblyQuarterRowV1,
} from './cash-assembly-types-v1';

const ZERO = new Decimal(0);
const ZERO_MONEY = '0.000000';
const RESULT_STATUS_REASONS = [
  'DECIMAL_CORE_UNCERTIFIED',
  'LP_NET_NAV_FLAT_SHARE_APPROXIMATION',
] as const;

const XIRR_MIN_RATE = -0.999999;
const XIRR_MAX_RATE = 200;

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
  'lp_capital_call' | 'lp_distribution' | 'recallable_distribution';

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

interface PreparedProjectedQuarterV1 {
  readonly period: CashAssemblyPeriodV1;
  readonly forecastPoint: CurrentForecastSeriesPointV1;
  readonly deployment: Decimal;
  readonly callSizingQuarter: CashAssemblyCallSizingQuarterV1;
  readonly scheduledNeed: CallSizingQuarterNeedInputV1;
  readonly lpCall: Decimal;
  readonly grossProceeds: Decimal;
}

interface QuantizedCoreAllocationV1 {
  readonly sourceId: string;
  readonly periodIndex: number;
  readonly gross6: Decimal;
  readonly roc6: Decimal;
  readonly lpProfit6: Decimal;
  readonly carry6: Decimal;
}

interface DecimalXirrFlowV1 {
  readonly date: string;
  readonly amount: Decimal;
}

interface LpNetXirrResultV1 {
  readonly lpNetIrr: string | null;
  readonly xirrDiagnostic: XirrDiagnostic;
}

function buildTerminalLiquidationDistribution(input: {
  readonly forecastSnapshotId: number;
  readonly periodEnd: string;
  readonly periodIndex: number;
  readonly terminalNav: Decimal;
}): CoreDistributionV1 {
  return {
    sourceId: `forecast:${input.forecastSnapshotId}:quarter:${input.periodEnd}:terminal_liquidation`,
    periodIndex: input.periodIndex,
    grossUsd: input.terminalNav.toFixed(6),
    isTerminal: true,
  };
}

function xirrFailure(failureReason: XirrDiagnostic['failureReason']): LpNetXirrResultV1 {
  return {
    lpNetIrr: null,
    xirrDiagnostic: {
      convergence: 'failed',
      iterations: 0,
      method: 'none',
      boundHit: null,
      failureReason,
    },
  };
}

function canonicalXirrMethod(method: string): XirrDiagnostic['method'] {
  if (method === 'newton' || method === 'brent' || method === 'bisection') return method;
  return 'none';
}

function computeLpNetXirr(flows: readonly DecimalXirrFlowV1[]): LpNetXirrResultV1 {
  const nonzeroFlows = flows.filter((flow) => !flow.amount.isZero());
  if (nonzeroFlows.length < 2) {
    return xirrFailure('INSUFFICIENT_CASH_FLOWS');
  }

  const hasNegative = nonzeroFlows.some((flow) => flow.amount.lt(0));
  const hasPositive = nonzeroFlows.some((flow) => flow.amount.gt(0));
  if (!hasNegative || !hasPositive) {
    return xirrFailure('NO_SIGN_CHANGE');
  }

  // Sole sanctioned float64 boundary: safeXIRR accepts and returns JS numbers.
  const solverFlows: CashFlowEvent[] = nonzeroFlows.map((flow) => ({
    date: flow.date,
    amount: flow.amount.toNumber(),
  }));
  const solverResult = safeXIRR(solverFlows);
  const method = canonicalXirrMethod(solverResult.method);

  if (solverResult.error !== undefined || solverResult.irr === null) {
    return {
      lpNetIrr: null,
      xirrDiagnostic: {
        convergence: 'failed',
        iterations: solverResult.iterations,
        method,
        boundHit: null,
        failureReason: 'NUMERICAL_INSTABILITY',
      },
    };
  }

  if (solverResult.irr === XIRR_MAX_RATE) {
    return {
      lpNetIrr: null,
      xirrDiagnostic: {
        convergence: 'bounded_high',
        iterations: solverResult.iterations,
        method,
        boundHit: 'max',
        failureReason: 'OUT_OF_BOUNDS_HIGH',
      },
    };
  }
  if (solverResult.irr === XIRR_MIN_RATE) {
    return {
      lpNetIrr: null,
      xirrDiagnostic: {
        convergence: 'bounded_low',
        iterations: solverResult.iterations,
        method,
        boundHit: 'min',
        failureReason: 'OUT_OF_BOUNDS_LOW',
      },
    };
  }
  if (!solverResult.converged) {
    return {
      lpNetIrr: null,
      xirrDiagnostic: {
        convergence: 'failed',
        iterations: solverResult.iterations,
        method,
        boundHit: null,
        failureReason: 'NUMERICAL_INSTABILITY',
      },
    };
  }

  const roundedIrr = new Decimal(solverResult.irr).toDecimalPlaces(12);
  return {
    lpNetIrr: roundedIrr.isZero() ? '0.000000000000' : roundedIrr.toFixed(12),
    xirrDiagnostic: {
      convergence: 'converged',
      iterations: solverResult.iterations,
      method,
      boundHit: null,
      failureReason: null,
    },
  };
}

function coreMappingMismatch(message: string, context: Record<string, string>): never {
  throw new CashAssemblyPeriodLoopV1Error('CORE_ROW_MAPPING_MISMATCH', message, context);
}

function quantizeCoreRowsBySourceId(input: {
  readonly distributions: readonly CoreDistributionV1[];
  readonly rows: readonly CoreAllocationRowV1[];
}): QuantizedCoreAllocationV1[] {
  if (input.rows.length !== input.distributions.length) {
    coreMappingMismatch('Decimal core row count does not match distribution event count.', {
      distributionCount: String(input.distributions.length),
      rowCount: String(input.rows.length),
    });
  }

  const rowsBySourceId = new Map<string, CoreAllocationRowV1>();
  for (const row of input.rows) {
    if (rowsBySourceId.has(row.sourceId)) {
      coreMappingMismatch('Decimal core returned duplicate source IDs.', {
        sourceId: row.sourceId,
      });
    }
    rowsBySourceId.set(row.sourceId, row);
  }

  const distributionIds = new Set(input.distributions.map((event) => event.sourceId));
  for (const sourceId of rowsBySourceId.keys()) {
    if (!distributionIds.has(sourceId)) {
      coreMappingMismatch('Decimal core returned an unknown source ID.', { sourceId });
    }
  }

  return input.distributions.map((event) => {
    const row = rowsBySourceId.get(event.sourceId);
    if (row === undefined) {
      coreMappingMismatch('Decimal core omitted a distribution source ID.', {
        sourceId: event.sourceId,
      });
    }
    if (!row.gross.eq(new Decimal(event.grossUsd))) {
      coreMappingMismatch('Decimal core row gross does not match its distribution event.', {
        sourceId: event.sourceId,
        eventGrossUsd: event.grossUsd,
        rowGrossUsd: row.gross.toFixed(),
      });
    }

    const gross6 = row.gross.toDecimalPlaces(6);
    const roc6 = row.roc.toDecimalPlaces(6);
    const residual6 = gross6.minus(roc6);
    const carry6 = row.gpCarry.toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
    const lpProfit6 = residual6.minus(carry6);

    return {
      sourceId: event.sourceId,
      periodIndex: event.periodIndex,
      gross6,
      roc6,
      lpProfit6,
      carry6,
    };
  });
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
          forecastDeploymentDeltaUsd: forecastDeploymentDelta?.toFixed(6) ?? 'missing',
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
  const projectedPeriods = partitionProjectedPeriods(periodGrid, input.openingState.cutoverInstant);
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

  const preparedQuarters = projectedPeriods.map((period, index): PreparedProjectedQuarterV1 => {
    const key = periodKey(period);
    const forecastPoint = projectedPointByPeriod.get(key);
    const deployment = deploymentDeltaByPeriod.get(key);

    if (forecastPoint === undefined || deployment === undefined) {
      throw new CashAssemblyPeriodLoopV1Error(
        'SCHEDULE_GRID_MISMATCH',
        `Projected forecast point is missing for quarter ending ${period.periodEnd}.`,
        { period: key }
      );
    }

    return {
      period,
      forecastPoint,
      deployment,
      callSizingQuarter: callSizing.quarters[index]!,
      scheduledNeed: input.scheduledNeeds[index]!,
      lpCall: new Decimal(callSizing.quarters[index]!.totalCallUsd),
      grossProceeds: new Decimal(forecastPoint.distributionsUsd),
    };
  });

  // Carry first enters the pipeline at Phase 3 core-input construction. Its
  // validation remains after the already-implemented pipeline steps 1-8.
  assertCarryPct(input.carryPct);
  const carryRatio = new Decimal(input.carryPct).toFixed(12);

  const coreContributions: CoreContributionV1[] = preparedQuarters.flatMap(
    (quarter, periodIndex) =>
      quarter.lpCall.isZero()
        ? []
        : [
            {
              sourceId: `forecast:${input.forecastSnapshotId}:quarter:${quarter.period.periodEnd}:lp_capital_call`,
              periodIndex,
              amountUsd: quarter.lpCall.toFixed(6),
            },
          ]
  );
  const periodIndexByEnd = new Map(
    preparedQuarters.map((quarter, periodIndex) => [quarter.period.periodEnd, periodIndex])
  );
  const ordinaryCoreDistributions: CoreDistributionV1[] = eventStream.events.flatMap((event) => {
    if (event.source !== 'forecast' || event.eventType !== 'forecast_quarterly_distribution') {
      return [];
    }
    const periodEnd = event.effectiveAt.slice(0, 10);
    const periodIndex = periodIndexByEnd.get(periodEnd);
    if (periodIndex === undefined) return [];

    return [
      {
        sourceId: event.stableSourceId,
        periodIndex,
        grossUsd: event.amountUsd,
        isTerminal: false,
      },
    ];
  });
  const terminalQuarter = preparedQuarters.at(-1);
  const terminalNavBeforeRealization = new Decimal(terminalQuarter?.forecastPoint.navUsd ?? 0);
  const terminalLiquidationDistribution =
    input.terminalMode === 'liquidate_at_horizon' &&
    terminalQuarter !== undefined &&
    terminalNavBeforeRealization.gt(0)
      ? buildTerminalLiquidationDistribution({
          forecastSnapshotId: input.forecastSnapshotId,
          periodEnd: terminalQuarter.period.periodEnd,
          periodIndex: preparedQuarters.length - 1,
          terminalNav: terminalNavBeforeRealization,
        })
      : null;
  const coreDistributions: CoreDistributionV1[] = [
    ...ordinaryCoreDistributions,
    ...(terminalLiquidationDistribution === null ? [] : [terminalLiquidationDistribution]),
  ];

  const coreResult = computeDecimalWaterfallAllocationV1({
    carryRatio,
    hurdle: { basis: 'none' },
    openingState: input.openingState,
    contributions: coreContributions,
    distributions: coreDistributions,
  });
  const quantizedAllocations = quantizeCoreRowsBySourceId({
    distributions: coreDistributions,
    rows: coreResult.rows,
  });

  processWaterfallRunForPresentation(
    quantizedAllocations.map((allocation) => ({
      totalUsd: allocation.gross6,
      rocUsd: allocation.roc6,
      preferredReturnUsd: new Decimal(0),
      lpResidualUsd: allocation.lpProfit6,
      gpCarryUsd: allocation.carry6,
    }))
  );

  const waterfallEvents = quantizedAllocations.map((allocation): CashAssemblyWaterfallEventV1 => {
    const quarter = preparedQuarters[allocation.periodIndex];
    if (quarter === undefined) {
      coreMappingMismatch('Decimal core row references an unknown period index.', {
        sourceId: allocation.sourceId,
        periodIndex: String(allocation.periodIndex),
      });
    }

    return {
      periodEnd: quarter.period.periodEnd,
      sourceId: allocation.sourceId,
      grossDistributionUsd: allocation.gross6.toFixed(6),
      lpCapitalReturnUsd: allocation.roc6.toFixed(6),
      lpProfitUsd: allocation.lpProfit6.toFixed(6),
      // G2: GP investment distribution is structurally zero in V1; GP capital is out of scope.
      gpInvestmentDistributionUsd: ZERO_MONEY,
      gpCarryUsd: allocation.carry6.toFixed(6),
    };
  });
  const allocationsByPeriodIndex = new Map<number, QuantizedCoreAllocationV1[]>();
  for (const allocation of quantizedAllocations) {
    const quarterAllocations = allocationsByPeriodIndex.get(allocation.periodIndex) ?? [];
    quarterAllocations.push(allocation);
    allocationsByPeriodIndex.set(allocation.periodIndex, quarterAllocations);
  }

  const quarters: CashAssemblyQuarterRowV1[] = [];
  let openingCash = new Decimal(input.openingState.cashBalanceUsd);
  let cumulativeLpPaidIn = new Decimal(input.openingState.cumulativeLpPaidInUsd);
  let cumulativeLpDistributed = new Decimal(input.openingState.actualLpDistributionsCumulativeUsd);
  let remainingEnvelope = initialRemainingEnvelope;

  for (let index = 0; index < preparedQuarters.length; index += 1) {
    const preparedQuarter = preparedQuarters[index]!;
    const period = preparedQuarter.period;
    const forecastPoint = preparedQuarter.forecastPoint;
    const deployment = preparedQuarter.deployment;
    const callSizingQuarter = preparedQuarter.callSizingQuarter;
    const scheduledNeed = preparedQuarter.scheduledNeed;
    const lpCall = preparedQuarter.lpCall;
    const managementFees = scheduledNeed.scheduledFeeUsd;
    const fundExpenses = scheduledNeed.scheduledExpenseUsd;
    const terminalRealization =
      terminalLiquidationDistribution !== null && index === preparedQuarters.length - 1
        ? terminalNavBeforeRealization
        : ZERO;
    const grossProceeds = preparedQuarter.grossProceeds.plus(terminalRealization);
    const quarterAllocations = allocationsByPeriodIndex.get(index) ?? [];
    const lpDistribution = quarterAllocations.reduce(
      (total, allocation) => total.plus(allocation.roc6).plus(allocation.lpProfit6),
      ZERO
    );
    const gpInvestmentDistribution = ZERO;
    const gpCarryDistribution = quarterAllocations.reduce(
      (total, allocation) => total.plus(allocation.carry6),
      ZERO
    );

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
        grossNavUsd:
          terminalLiquidationDistribution !== null && index === preparedQuarters.length - 1
            ? ZERO
            : new Decimal(forecastPoint.navUsd),
        lpNetNavUsd:
          terminalLiquidationDistribution !== null && index === preparedQuarters.length - 1
            ? ZERO
            : new Decimal(forecastPoint.navUsd),
        cumulativeLpPaidInUsd: nextCumulativeLpPaidIn,
        cumulativeLpDistributedUsd: nextCumulativeLpDistributed,
      })
    );

    openingCash = endingCash;
    cumulativeLpPaidIn = nextCumulativeLpPaidIn;
    cumulativeLpDistributed = nextCumulativeLpDistributed;
    remainingEnvelope = nextRemainingEnvelope;
  }

  const xirrFlows: DecimalXirrFlowV1[] = [];
  for (const event of eventStream.events) {
    if (event.source !== 'facts') continue;
    if (event.eventType === 'lp_capital_call') {
      xirrFlows.push({ date: event.effectiveAt, amount: new Decimal(event.amountUsd).negated() });
    } else if (
      event.eventType === 'lp_distribution' ||
      event.eventType === 'recallable_distribution'
    ) {
      xirrFlows.push({ date: event.effectiveAt, amount: new Decimal(event.amountUsd) });
    }
  }
  for (const quarter of preparedQuarters) {
    if (quarter.lpCall.gt(0)) {
      xirrFlows.push({
        date: `${quarter.period.periodStart}T00:00:00.000Z`,
        amount: quarter.lpCall.negated(),
      });
    }
  }
  for (const allocation of quantizedAllocations) {
    const quarter = preparedQuarters[allocation.periodIndex];
    if (quarter === undefined) {
      coreMappingMismatch('Decimal core allocation cannot map to an XIRR instant.', {
        sourceId: allocation.sourceId,
        periodIndex: String(allocation.periodIndex),
      });
    }
    xirrFlows.push({
      date: `${quarter.period.periodEnd}T23:59:59.999Z`,
      amount: allocation.roc6.plus(allocation.lpProfit6),
    });
  }
  if (
    input.terminalMode === 'hold_unrealized' &&
    terminalQuarter !== undefined &&
    terminalNavBeforeRealization.gt(0)
  ) {
    xirrFlows.push({
      date: `${terminalQuarter.period.periodEnd}T23:59:59.999Z`,
      amount: terminalNavBeforeRealization,
    });
  }
  const xirrResult = computeLpNetXirr(xirrFlows);

  return {
    quarters,
    waterfallEvents,
    terminalNavBeforeRealizationUsd: terminalNavBeforeRealization.toFixed(6),
    lpNetIrr: xirrResult.lpNetIrr,
    xirrDiagnostic: xirrResult.xirrDiagnostic,
    resultStatus: 'indicative',
    resultStatusReasons: RESULT_STATUS_REASONS,
    terminalMode: input.terminalMode,
    engineVersion: input.engineVersion,
    methodologyVersion: input.methodologyVersion,
  };
}
