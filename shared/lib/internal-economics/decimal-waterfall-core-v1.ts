/**
 * Date-free, deterministic waterfall fold implementing D-8 invariants: contributions
 * alone increase unreturned capital, only ROC decreases it, allocations conserve each
 * distribution exactly, and distributions never increase or make capital negative.
 * This corrects the legacy float64 ledger's outstanding-capital netting convention.
 */
import type { FundAccountingStateObservationV1_1 } from '@shared/contracts/internal-economics/fund-accounting-state-observation-v1.1.contract';
import { Decimal as SharedDecimal } from '@shared/lib/decimal-config';

export const DECIMAL_WATERFALL_CORE_ENGINE_VERSION = 'decimal-waterfall-core-v1/1.0.0';
export const DECIMAL_WATERFALL_CORE_METHODOLOGY_VERSION = 'correct-unreturned-capital/1.0.0';

const CoreDecimal = SharedDecimal.clone({
  precision: 60,
  rounding: SharedDecimal.ROUND_HALF_UP,
});

const MONEY_MAGNITUDE_CEILING = new CoreDecimal('10000000000.000000');
const CANONICAL_MONEY_PATTERN = /^(?:0|[1-9]\d*)\.\d{6}$/;
const CANONICAL_CARRY_RATIO_PATTERN = /^(?:0\.\d{12}|1\.0{12})$/;

const OPENING_MONEY_FIELDS = [
  'cashBalanceUsd',
  'cumulativeLpPaidInUsd',
  'cumulativeGpPaidInUsd',
  'gpUnreturnedContributedCapitalUsd',
  'lpDistributionsReturnOfCapitalUsd',
  'lpDistributionsProfitUsd',
  'actualLpDistributionsCumulativeUsd',
  'gpInvestmentDistributionsPaidUsd',
  'gpCarryPaidUsd',
  'accruedPreferredReturnUsd',
  'recallableDistributionsCumulativeUsd',
  'recallableDistributionsOutstandingUsd',
  'recycledProceedsCumulativeUsd',
  'realizedProceedsCumulativeUsd',
  'lpUnreturnedContributedCapitalUsd',
] as const satisfies readonly (keyof FundAccountingStateObservationV1_1)[];

export interface CoreContributionV1 {
  readonly sourceId: string;
  readonly periodIndex: number;
  readonly amountUsd: string;
}

export interface CoreDistributionV1 {
  readonly sourceId: string;
  readonly periodIndex: number;
  readonly grossUsd: string;
  readonly isTerminal: boolean;
}

export interface DecimalWaterfallCoreV1Input {
  readonly carryRatio: string;
  readonly hurdle: { readonly basis: 'none' };
  readonly openingState: FundAccountingStateObservationV1_1;
  readonly contributions: readonly CoreContributionV1[];
  readonly distributions: readonly CoreDistributionV1[];
}

/**
 * Exact core allocation diagnostics. `lpProfit` is unrounded and must not feed
 * presentation arithmetic. The future loop must quantize gross, ROC, and GP carry
 * before precision-28 arithmetic, then derive presentation LP profit from those values.
 */
export interface CoreAllocationRowV1 {
  readonly sourceId: string;
  readonly periodIndex: number;
  readonly gross: SharedDecimal;
  readonly roc: SharedDecimal;
  readonly lpProfit: SharedDecimal;
  readonly gpCarry: SharedDecimal;
  readonly unreturnedCapitalAfter: SharedDecimal;
  readonly profitDistributedAfter: SharedDecimal;
}

/**
 * Exact core totals. `lpProfit` remains an unrounded diagnostic; the future loop must
 * quantize gross, ROC, and GP carry first and derive its presentation LP-profit total.
 */
export interface CoreAllocationTotalsV1 {
  readonly openingUnreturnedCapital: SharedDecimal;
  readonly endingUnreturnedCapital: SharedDecimal;
  readonly paidIn: SharedDecimal;
  readonly gross: SharedDecimal;
  readonly roc: SharedDecimal;
  readonly lpProfit: SharedDecimal;
  readonly gpCarry: SharedDecimal;
}

export interface DecimalWaterfallCoreV1Result {
  readonly rows: readonly CoreAllocationRowV1[];
  readonly totals: CoreAllocationTotalsV1;
  readonly engineVersion: typeof DECIMAL_WATERFALL_CORE_ENGINE_VERSION;
  readonly methodologyVersion: typeof DECIMAL_WATERFALL_CORE_METHODOLOGY_VERSION;
}

export type DecimalWaterfallCoreV1ErrorCode =
  | 'PREF_BEARING_UNSUPPORTED_V1'
  | 'OPENING_STATE_INVALID'
  | 'CARRY_RATIO_INVALID'
  | 'EVENT_INPUT_INVALID'
  | 'DUPLICATE_EVENT_ID'
  | 'CONSERVATION_FAILED'
  | 'UNRETURNED_CAPITAL_MONOTONICITY';

export class DecimalWaterfallCoreV1Error extends Error {
  readonly code: DecimalWaterfallCoreV1ErrorCode;
  readonly context: Record<string, string>;

  constructor(
    code: DecimalWaterfallCoreV1ErrorCode,
    message: string,
    context: Record<string, string> = {}
  ) {
    super(message);
    this.name = 'DecimalWaterfallCoreV1Error';
    this.code = code;
    this.context = context;
  }
}

type CoreMoney = InstanceType<typeof CoreDecimal>;

interface ContributionEvent {
  readonly kind: 'contribution';
  readonly sourceId: string;
  readonly periodIndex: number;
  readonly amount: CoreMoney;
}

interface DistributionEvent {
  readonly kind: 'distribution';
  readonly sourceId: string;
  readonly periodIndex: number;
  readonly gross: CoreMoney;
  readonly isTerminal: boolean;
}

type CoreEvent = ContributionEvent | DistributionEvent;

function isCanonicalMoney(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    CANONICAL_MONEY_PATTERN.test(value) &&
    new CoreDecimal(value).lt(MONEY_MAGNITUDE_CEILING)
  );
}

function parseOpeningMoney(
  openingState: FundAccountingStateObservationV1_1,
  field: (typeof OPENING_MONEY_FIELDS)[number]
): CoreMoney {
  const value = openingState[field];
  if (!isCanonicalMoney(value)) {
    throw new DecimalWaterfallCoreV1Error(
      'OPENING_STATE_INVALID',
      `Opening-state field ${field} must be canonical nonnegative 6dp money below the magnitude ceiling.`,
      { field, value: String(value) }
    );
  }
  return new CoreDecimal(value);
}

function validateEventIdentity(
  event: { readonly sourceId: unknown; readonly periodIndex: unknown },
  eventClass: 'contribution' | 'distribution'
): void {
  if (typeof event.sourceId !== 'string' || event.sourceId.length === 0) {
    throw new DecimalWaterfallCoreV1Error(
      'EVENT_INPUT_INVALID',
      'Event sourceId must be nonempty.',
      { eventClass, field: 'sourceId', value: String(event.sourceId) }
    );
  }
  if (!Number.isInteger(event.periodIndex) || Number(event.periodIndex) < 0) {
    throw new DecimalWaterfallCoreV1Error(
      'EVENT_INPUT_INVALID',
      'Event periodIndex must be a nonnegative integer.',
      { eventClass, field: 'periodIndex', value: String(event.periodIndex) }
    );
  }
}

function parseEventMoney(
  value: unknown,
  field: 'amountUsd' | 'grossUsd',
  sourceId: string
): CoreMoney {
  if (!isCanonicalMoney(value)) {
    throw new DecimalWaterfallCoreV1Error(
      'EVENT_INPUT_INVALID',
      `Event field ${field} must be canonical nonnegative 6dp money below the magnitude ceiling.`,
      { field, sourceId, value: String(value) }
    );
  }
  return new CoreDecimal(value);
}

function compareEvents(left: CoreEvent, right: CoreEvent): number {
  if (left.periodIndex !== right.periodIndex) {
    return left.periodIndex - right.periodIndex;
  }
  if (left.kind !== right.kind) {
    return left.kind === 'contribution' ? -1 : 1;
  }
  if (
    left.kind === 'distribution' &&
    right.kind === 'distribution' &&
    left.isTerminal !== right.isTerminal
  ) {
    return left.isTerminal ? 1 : -1;
  }
  return left.sourceId < right.sourceId ? -1 : left.sourceId > right.sourceId ? 1 : 0;
}

function toSharedDecimal(value: CoreMoney): SharedDecimal {
  return new SharedDecimal(value.toString());
}

export function computeDecimalWaterfallAllocationV1(
  input: DecimalWaterfallCoreV1Input
): DecimalWaterfallCoreV1Result {
  if (input.hurdle?.basis !== 'none') {
    throw new DecimalWaterfallCoreV1Error(
      'PREF_BEARING_UNSUPPORTED_V1',
      'V1 supports only hurdle basis none.',
      { basis: String(input.hurdle?.basis) }
    );
  }

  if (
    typeof input.carryRatio !== 'string' ||
    !CANONICAL_CARRY_RATIO_PATTERN.test(input.carryRatio)
  ) {
    throw new DecimalWaterfallCoreV1Error(
      'CARRY_RATIO_INVALID',
      'Carry ratio must be a canonical 12dp value within [0,1].',
      { field: 'carryRatio', value: String(input.carryRatio) }
    );
  }
  const carryRatio = new CoreDecimal(input.carryRatio);

  for (const field of OPENING_MONEY_FIELDS) {
    parseOpeningMoney(input.openingState, field);
  }

  const sourceIds = new Set<string>();
  const events: CoreEvent[] = [];

  for (const contribution of input.contributions) {
    validateEventIdentity(contribution, 'contribution');
    if (sourceIds.has(contribution.sourceId)) {
      throw new DecimalWaterfallCoreV1Error(
        'DUPLICATE_EVENT_ID',
        'Event sourceId must be unique across contributions and distributions.',
        { sourceId: contribution.sourceId }
      );
    }
    sourceIds.add(contribution.sourceId);
    events.push({
      kind: 'contribution',
      sourceId: contribution.sourceId,
      periodIndex: contribution.periodIndex,
      amount: parseEventMoney(contribution.amountUsd, 'amountUsd', contribution.sourceId),
    });
  }

  let terminalSourceId: string | undefined;
  for (const distribution of input.distributions) {
    validateEventIdentity(distribution, 'distribution');
    if (sourceIds.has(distribution.sourceId)) {
      throw new DecimalWaterfallCoreV1Error(
        'DUPLICATE_EVENT_ID',
        'Event sourceId must be unique across contributions and distributions.',
        { sourceId: distribution.sourceId }
      );
    }
    if (typeof distribution.isTerminal !== 'boolean') {
      throw new DecimalWaterfallCoreV1Error(
        'EVENT_INPUT_INVALID',
        'Distribution isTerminal must be boolean.',
        {
          field: 'isTerminal',
          sourceId: distribution.sourceId,
          value: String(distribution.isTerminal),
        }
      );
    }
    if (distribution.isTerminal && terminalSourceId !== undefined) {
      throw new DecimalWaterfallCoreV1Error(
        'EVENT_INPUT_INVALID',
        'At most one terminal distribution is supported.',
        {
          field: 'isTerminal',
          reason: 'duplicate',
          sourceId: distribution.sourceId,
          priorSourceId: terminalSourceId,
        }
      );
    }
    if (distribution.isTerminal) terminalSourceId = distribution.sourceId;
    sourceIds.add(distribution.sourceId);
    events.push({
      kind: 'distribution',
      sourceId: distribution.sourceId,
      periodIndex: distribution.periodIndex,
      gross: parseEventMoney(distribution.grossUsd, 'grossUsd', distribution.sourceId),
      isTerminal: distribution.isTerminal,
    });
  }

  events.sort(compareEvents);

  const openingUnreturnedCapital = parseOpeningMoney(
    input.openingState,
    'lpUnreturnedContributedCapitalUsd'
  );
  let unreturnedCapital = new CoreDecimal(openingUnreturnedCapital.toString());
  let profitDistributed = parseOpeningMoney(input.openingState, 'lpDistributionsProfitUsd');
  let paidIn = parseOpeningMoney(input.openingState, 'cumulativeLpPaidInUsd');
  let totalGross = new CoreDecimal(0);
  let totalRoc = new CoreDecimal(0);
  let totalLpProfit = new CoreDecimal(0);
  let totalGpCarry = new CoreDecimal(0);
  const rows: CoreAllocationRowV1[] = [];

  for (const event of events) {
    if (event.kind === 'contribution') {
      unreturnedCapital = unreturnedCapital.plus(event.amount);
      paidIn = paidIn.plus(event.amount);
      continue;
    }

    const unreturnedCapitalBefore = unreturnedCapital;
    const roc = CoreDecimal.min(event.gross, unreturnedCapitalBefore);
    const residual = event.gross.minus(roc);
    const gpCarry = residual.times(carryRatio);
    const lpProfit = residual.minus(gpCarry);
    const nextUnreturnedCapital = unreturnedCapitalBefore.minus(roc);

    if (!roc.plus(lpProfit).plus(gpCarry).eq(event.gross)) {
      throw new DecimalWaterfallCoreV1Error(
        'CONSERVATION_FAILED',
        'Distribution allocation failed exact conservation.',
        { sourceId: event.sourceId }
      );
    }
    if (
      nextUnreturnedCapital.lt(0) ||
      nextUnreturnedCapital.gt(unreturnedCapitalBefore) ||
      !unreturnedCapitalBefore.minus(nextUnreturnedCapital).eq(roc)
    ) {
      throw new DecimalWaterfallCoreV1Error(
        'UNRETURNED_CAPITAL_MONOTONICITY',
        'Distribution changed unreturned capital outside the ROC amount.',
        { sourceId: event.sourceId }
      );
    }

    unreturnedCapital = nextUnreturnedCapital;
    profitDistributed = profitDistributed.plus(lpProfit);
    totalGross = totalGross.plus(event.gross);
    totalRoc = totalRoc.plus(roc);
    totalLpProfit = totalLpProfit.plus(lpProfit);
    totalGpCarry = totalGpCarry.plus(gpCarry);
    rows.push({
      sourceId: event.sourceId,
      periodIndex: event.periodIndex,
      gross: toSharedDecimal(event.gross),
      roc: toSharedDecimal(roc),
      lpProfit: toSharedDecimal(lpProfit),
      gpCarry: toSharedDecimal(gpCarry),
      unreturnedCapitalAfter: toSharedDecimal(unreturnedCapital),
      profitDistributedAfter: toSharedDecimal(profitDistributed),
    });
  }

  return {
    rows,
    totals: {
      openingUnreturnedCapital: toSharedDecimal(openingUnreturnedCapital),
      endingUnreturnedCapital: toSharedDecimal(unreturnedCapital),
      paidIn: toSharedDecimal(paidIn),
      gross: toSharedDecimal(totalGross),
      roc: toSharedDecimal(totalRoc),
      lpProfit: toSharedDecimal(totalLpProfit),
      gpCarry: toSharedDecimal(totalGpCarry),
    },
    engineVersion: DECIMAL_WATERFALL_CORE_ENGINE_VERSION,
    methodologyVersion: DECIMAL_WATERFALL_CORE_METHODOLOGY_VERSION,
  };
}
