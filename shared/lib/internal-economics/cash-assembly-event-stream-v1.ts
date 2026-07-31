import type { CurrentForecastSeriesPointV1 } from '../../contracts/current-forecast-v2.contract';
import {
  compareEventOrderKeys,
  deriveFactsEventOrderKey,
  deriveForecastEventOrderKey,
  type InternalEconomicsEventOrderKeyV1,
  type InternalEconomicsEventTypeV1,
  type InternalEconomicsForecastEventTypeV1,
} from '../../contracts/internal-economics/event-ordering-v1.contract';
import {
  hasPositivePostTermDeploymentDeltaV1,
  PersistedTerminalResolutionV1Schema,
  resolvePostTermDispositionV1,
  TerminalPolicyV1Error,
  type PersistedTerminalResolutionV1,
  type PostTermSourceClassV1,
  type TerminalModeV1,
} from '../../contracts/internal-economics/terminal-policy-v1.contract';
import { Decimal } from '../decimal-config';
import { MoneyDecimalStringSchema } from '../decimal-string';
import type { CashAssemblyPeriodV1 } from './cash-assembly-types-v1';

export type CashAssemblyEventStreamV1ErrorCode =
  'POST_TERM_ACTIVITY' | 'NEGATIVE_SOURCE_MONEY' | 'FORECAST_DEPLOYMENT_CUMULATIVE_DECREASE';

export class CashAssemblyEventStreamV1Error extends Error {
  constructor(
    readonly code: CashAssemblyEventStreamV1ErrorCode,
    message: string,
    override readonly cause?: unknown
  ) {
    super(message);
    this.name = 'CashAssemblyEventStreamV1Error';
  }
}

export class CashAssemblyEventStreamInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CashAssemblyEventStreamInvariantError';
  }
}

export interface FactsCashAssemblyEventV1 {
  readonly eventId: number;
  readonly eventType: InternalEconomicsEventTypeV1;
  readonly effectiveAt: string;
  readonly amountUsd: string;
}

export interface FactsCashAssemblyNavMarkV1 {
  readonly markId: number;
  readonly effectiveAt: string;
  readonly fairValueUsd: string;
}

export interface FactsCashAssemblyPeriodNavV1 {
  readonly periodEnd: string;
  readonly navUsd: string;
}

export interface AssembledCashEventV1 extends InternalEconomicsEventOrderKeyV1 {
  readonly source: 'facts' | 'forecast';
  readonly eventType: InternalEconomicsEventTypeV1 | InternalEconomicsForecastEventTypeV1;
  readonly amountUsd: string;
}

export interface CashEventQuarterBucketV1 extends CashAssemblyPeriodV1 {
  readonly events: AssembledCashEventV1[];
}

export interface AssembleCashEventStreamV1Input {
  readonly factsSnapshotId: number;
  readonly forecastSnapshotId: number;
  readonly factsEvents: readonly FactsCashAssemblyEventV1[];
  readonly factsNavMarks: readonly FactsCashAssemblyNavMarkV1[];
  readonly factsPeriodNav: readonly FactsCashAssemblyPeriodNavV1[];
  readonly forecastSeries: readonly CurrentForecastSeriesPointV1[];
  readonly periodGrid: readonly CashAssemblyPeriodV1[];
  readonly persistedTerminalResolution: PersistedTerminalResolutionV1;
  readonly terminalMode: TerminalModeV1;
}

export interface AssembledCashEventStreamV1 {
  readonly events: AssembledCashEventV1[];
  readonly buckets: CashEventQuarterBucketV1[];
}

const FACTS_POST_TERM_SOURCE_CLASS = {
  lp_capital_call: 'lp_capital_call',
  portfolio_investment: 'portfolio_investment',
  fund_expense: 'actual_fund_expense',
  realized_proceeds: 'actual_realized_proceeds',
  lp_distribution: 'actual_lp_distribution',
  recallable_distribution: 'actual_recallable_distribution',
} as const satisfies Record<InternalEconomicsEventTypeV1, PostTermSourceClassV1>;

function parseNonnegativeMoney(value: string, sourceDescription: string): string {
  const parsed = MoneyDecimalStringSchema.parse(value);
  if (new Decimal(parsed).lt(0)) {
    throw new CashAssemblyEventStreamV1Error(
      'NEGATIVE_SOURCE_MONEY',
      `${sourceDescription} cannot be negative.`
    );
  }
  return parsed;
}

function terminalInstant(input: AssembleCashEventStreamV1Input): string {
  const persisted = PersistedTerminalResolutionV1Schema.parse(input.persistedTerminalResolution);
  const terminalPeriodCount = input.periodGrid.filter(
    (period) => period.periodEnd === persisted.terminalPeriodEnd
  ).length;
  const containsPostTerminalPeriod = input.periodGrid.some(
    (period) => period.periodEnd > persisted.terminalPeriodEnd
  );
  if (terminalPeriodCount !== 1 || containsPostTerminalPeriod) {
    throw new Error(
      'Cash-assembly period grid must contain exactly one terminal period and no later periods.'
    );
  }
  return `${persisted.terminalPeriodEnd}T23:59:59.999Z`;
}

function isPostTerm(effectiveAt: string, terminalAt: string): boolean {
  return effectiveAt > terminalAt;
}

function resolvePostTermOrThrow(input: {
  sourceClass: PostTermSourceClassV1;
  terminalMode: TerminalModeV1;
  amountUsd?: string;
}): 'exclude' | 'ignore_zero' {
  const disposition = resolvePostTermDispositionV1(input);
  if (disposition.action === 'reject') {
    throw new CashAssemblyEventStreamV1Error(
      'POST_TERM_ACTIVITY',
      `Post-term ${input.sourceClass} activity is prohibited.`
    );
  }
  return disposition.action;
}

function wrapDeploymentValidation(
  previousCumulativeDeployedUsd: string,
  currentCumulativeDeployedUsd: string
): boolean {
  try {
    return hasPositivePostTermDeploymentDeltaV1(
      previousCumulativeDeployedUsd,
      currentCumulativeDeployedUsd
    );
  } catch (error) {
    if (
      error instanceof TerminalPolicyV1Error &&
      (error.code === 'NEGATIVE_SOURCE_MONEY' ||
        error.code === 'FORECAST_DEPLOYMENT_CUMULATIVE_DECREASE')
    ) {
      throw new CashAssemblyEventStreamV1Error(error.code, error.message, error);
    }
    throw error;
  }
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

interface PreparedFactsEventV1 {
  readonly event: FactsCashAssemblyEventV1;
  readonly orderKey: InternalEconomicsEventOrderKeyV1;
  readonly amountUsd: string;
}

function assertUniqueStableSourceIds(events: readonly PreparedFactsEventV1[]): void {
  const stableSourceIds = new Set<string>();
  for (const event of events) {
    if (stableSourceIds.has(event.orderKey.stableSourceId)) {
      throw new CashAssemblyEventStreamInvariantError(
        `Duplicate canonical event identity ${event.orderKey.stableSourceId}.`
      );
    }
    stableSourceIds.add(event.orderKey.stableSourceId);
  }
}

function assertUniqueForecastPeriods(
  forecastSeries: readonly CurrentForecastSeriesPointV1[]
): void {
  const periodEnds = new Set<string>();
  for (const point of forecastSeries) {
    if (periodEnds.has(point.periodEnd)) {
      throw new CashAssemblyEventStreamInvariantError(
        `Duplicate canonical forecast event identity for period ${point.periodEnd}.`
      );
    }
    periodEnds.add(point.periodEnd);
  }
}

function prepareFactsEvents(input: AssembleCashEventStreamV1Input): PreparedFactsEventV1[] {
  const events = input.factsEvents
    .map((event) => {
      const orderKey = deriveFactsEventOrderKey({
        factsSnapshotId: input.factsSnapshotId,
        eventId: event.eventId,
        eventType: event.eventType,
        effectiveAt: event.effectiveAt,
      });
      return {
        event,
        orderKey,
        amountUsd: parseNonnegativeMoney(
          event.amountUsd,
          `Facts cash-flow event ${orderKey.stableSourceId}`
        ),
      };
    })
    .sort((left, right) => compareEventOrderKeys(left.orderKey, right.orderKey));
  assertUniqueStableSourceIds(events);
  return events;
}

function prepareForecastSeries(
  input: AssembleCashEventStreamV1Input
): CurrentForecastSeriesPointV1[] {
  const forecastSeries = [...input.forecastSeries].sort(compareForecastPoints);

  for (const point of forecastSeries) {
    parseNonnegativeMoney(point.deployedUsd, `Forecast deployment at ${point.periodEnd}`);
    parseNonnegativeMoney(point.contributionsUsd, `Forecast contributions at ${point.periodEnd}`);
    parseNonnegativeMoney(point.distributionsUsd, `Forecast distributions at ${point.periodEnd}`);
    parseNonnegativeMoney(point.navUsd, `Forecast NAV at ${point.periodEnd}`);
  }
  assertUniqueForecastPeriods(forecastSeries);
  return forecastSeries;
}

function validateFactsNavMoney(input: AssembleCashEventStreamV1Input): void {
  for (const mark of input.factsNavMarks) {
    parseNonnegativeMoney(mark.fairValueUsd, `Facts NAV mark ${mark.markId}`);
  }
  for (const observation of input.factsPeriodNav) {
    parseNonnegativeMoney(
      observation.navUsd,
      `Facts period NAV observation at ${observation.periodEnd}`
    );
  }
}

function validateForecastDeployment(
  forecastSeries: readonly CurrentForecastSeriesPointV1[]
): boolean[] {
  const positiveDeltaByIndex = forecastSeries.map(() => false);
  for (let index = 1; index < forecastSeries.length; index += 1) {
    const previous = forecastSeries[index - 1]!;
    const current = forecastSeries[index]!;
    positiveDeltaByIndex[index] = wrapDeploymentValidation(
      previous.deployedUsd,
      current.deployedUsd
    );
  }
  return positiveDeltaByIndex;
}

function validatePostTermActivity(input: {
  assemblyInput: AssembleCashEventStreamV1Input;
  factsEvents: readonly PreparedFactsEventV1[];
  forecastSeries: readonly CurrentForecastSeriesPointV1[];
  positiveDeploymentDeltaByIndex: readonly boolean[];
  terminalAt: string;
}): void {
  const { assemblyInput, factsEvents, forecastSeries, positiveDeploymentDeltaByIndex, terminalAt } =
    input;
  const terminalPeriodEnd = assemblyInput.persistedTerminalResolution.terminalPeriodEnd;

  for (const { event, orderKey, amountUsd } of factsEvents) {
    if (isPostTerm(orderKey.effectiveAt, terminalAt)) {
      resolvePostTermOrThrow({
        sourceClass: FACTS_POST_TERM_SOURCE_CLASS[event.eventType],
        terminalMode: assemblyInput.terminalMode,
        amountUsd,
      });
    }
  }

  for (const mark of input.assemblyInput.factsNavMarks) {
    if (mark.effectiveAt > terminalPeriodEnd) {
      resolvePostTermOrThrow({
        sourceClass: 'actual_nav_mark',
        terminalMode: assemblyInput.terminalMode,
        amountUsd: mark.fairValueUsd,
      });
    }
  }

  for (const observation of input.assemblyInput.factsPeriodNav) {
    if (observation.periodEnd > terminalPeriodEnd) {
      resolvePostTermOrThrow({
        sourceClass: 'actual_period_nav',
        terminalMode: assemblyInput.terminalMode,
        amountUsd: observation.navUsd,
      });
    }
  }

  for (let index = 0; index < forecastSeries.length; index += 1) {
    const point = forecastSeries[index]!;
    if (point.periodEnd <= terminalPeriodEnd) continue;

    if (point.source === 'actual') {
      resolvePostTermOrThrow({
        sourceClass: 'actual_period_nav',
        terminalMode: assemblyInput.terminalMode,
        amountUsd: point.navUsd,
      });
      continue;
    }

    if (positiveDeploymentDeltaByIndex[index]) {
      const previous = forecastSeries[index - 1]!;
      resolvePostTermOrThrow({
        sourceClass: 'projected_deployment_delta',
        terminalMode: assemblyInput.terminalMode,
        amountUsd: new Decimal(point.deployedUsd).minus(previous.deployedUsd).toString(),
      });
    }

    resolvePostTermOrThrow({
      sourceClass: 'projected_contributions',
      terminalMode: assemblyInput.terminalMode,
      amountUsd: point.contributionsUsd,
    });
    resolvePostTermOrThrow({
      sourceClass: 'projected_nav',
      terminalMode: assemblyInput.terminalMode,
      amountUsd: point.navUsd,
    });
    resolvePostTermOrThrow({
      sourceClass: 'projected_forecast_quarterly_distribution',
      terminalMode: assemblyInput.terminalMode,
      amountUsd: point.distributionsUsd,
    });
  }
}

function buildFactsEvents(factsEvents: readonly PreparedFactsEventV1[]): AssembledCashEventV1[] {
  return factsEvents.flatMap(({ event, orderKey, amountUsd }) =>
    new Decimal(amountUsd).isZero()
      ? []
      : [
          {
            source: 'facts',
            eventType: event.eventType,
            effectiveAt: orderKey.effectiveAt,
            eventClassPriority: orderKey.eventClassPriority,
            stableSourceId: orderKey.stableSourceId,
            amountUsd,
          },
        ]
  );
}

function buildForecastEvents(
  input: AssembleCashEventStreamV1Input,
  forecastSeries: readonly CurrentForecastSeriesPointV1[]
): AssembledCashEventV1[] {
  const terminalPeriodEnd = input.persistedTerminalResolution.terminalPeriodEnd;

  return forecastSeries.flatMap((point) => {
    if (
      point.source !== 'projected' ||
      point.periodEnd > terminalPeriodEnd ||
      new Decimal(point.distributionsUsd).isZero()
    ) {
      return [];
    }
    const eventType = 'forecast_quarterly_distribution';
    const orderKey = deriveForecastEventOrderKey({
      forecastSnapshotId: input.forecastSnapshotId,
      periodEnd: point.periodEnd,
      eventType,
    });
    return [
      {
        source: 'forecast',
        eventType,
        effectiveAt: orderKey.effectiveAt,
        eventClassPriority: orderKey.eventClassPriority,
        stableSourceId: orderKey.stableSourceId,
        amountUsd: point.distributionsUsd,
      },
    ];
  });
}

function bucketEvents(
  events: readonly AssembledCashEventV1[],
  periodGrid: readonly CashAssemblyPeriodV1[]
): CashEventQuarterBucketV1[] {
  const buckets = [...periodGrid]
    .sort(
      (left, right) =>
        left.periodEnd.localeCompare(right.periodEnd) ||
        left.periodStart.localeCompare(right.periodStart) ||
        left.source.localeCompare(right.source)
    )
    .map((period) => ({ ...period, events: [] as AssembledCashEventV1[] }));

  for (const event of events) {
    const effectiveDate = event.effectiveAt.slice(0, 10);
    const bucket = buckets.find(
      (candidate) => effectiveDate >= candidate.periodStart && effectiveDate <= candidate.periodEnd
    );
    if (bucket === undefined) {
      throw new Error(
        `Cash event ${event.stableSourceId} does not map to the supplied period grid.`
      );
    }
    bucket.events.push(event);
  }

  return buckets;
}

export function assembleCashEventStreamV1(
  input: AssembleCashEventStreamV1Input
): AssembledCashEventStreamV1 {
  const terminalAt = terminalInstant(input);
  const factsEvents = prepareFactsEvents(input);
  validateFactsNavMoney(input);
  const forecastSeries = prepareForecastSeries(input);
  const positiveDeploymentDeltaByIndex = validateForecastDeployment(forecastSeries);
  validatePostTermActivity({
    assemblyInput: input,
    factsEvents,
    forecastSeries,
    positiveDeploymentDeltaByIndex,
    terminalAt,
  });

  const events = [
    ...buildFactsEvents(factsEvents),
    ...buildForecastEvents(input, forecastSeries),
  ].sort(compareEventOrderKeys);

  return {
    events,
    buckets: bucketEvents(events, input.periodGrid),
  };
}
