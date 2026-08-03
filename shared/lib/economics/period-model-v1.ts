/**
 * period-model-v1.ts
 *
 * The one canonical period model for fund economics (ADR-069).
 *
 * Responsibilities
 * ----------------
 *   - Period dating: anniversary-based, contiguous, non-overlapping periods
 *     built from a single anchor date.
 *   - Proration: canonical-month count for a short trailing period. Day
 *     counts are reported but never prorate, because proration measured in
 *     days would disagree with the monthly accrual grain.
 *   - Rate application: `r * t` (simple) and `(1 + r)^t - 1` (compounded),
 *     where `t` is the period year fraction. Both conventions are
 *     grain-invariant, so accruing 12 canonical months equals accruing one
 *     annual period.
 *   - Aggregation: regroup accrued rows to a coarser grain. Flows sum,
 *     stocks keep their boundary value, and ratios are refused because they
 *     must be recomputed from aggregated components.
 *
 * Pure functions only: no I/O, no clock reads, no randomness.
 */

import {
  CANONICAL_ECONOMICS_ACCRUAL_GRAIN,
  ECONOMICS_MONTHS_PER_PERIOD_V1,
  ECONOMICS_PERIOD_MODEL_VERSION,
  EconomicsPeriodModelV1Error,
  type EconomicsAggregationKindV1,
  type EconomicsCanonicalPeriodV1,
  type EconomicsPeriodGrainV1,
  type EconomicsPeriodSeriesV1,
  type EconomicsRateCompoundingV1,
} from '../../contracts/economics-period-v1.contract';
import { Decimal } from '../decimal-config';

const MS_PER_DAY = 86_400_000;

export { CANONICAL_ECONOMICS_ACCRUAL_GRAIN, ECONOMICS_PERIOD_MODEL_VERSION };

export interface BuildEconomicsPeriodSeriesV1Input {
  /** Term start date (`YYYY-MM-DD`). Period 1 starts on this date. */
  readonly anchorDate: string;
  readonly grain: EconomicsPeriodGrainV1;
  /** Whole months covered by the series. A short trailing period is allowed. */
  readonly horizonMonths: number;
}

export interface AggregateEconomicsPeriodRowsV1Input<TRow extends Record<string, unknown>> {
  readonly series: EconomicsPeriodSeriesV1;
  /** One row per source period, in period order. */
  readonly rows: readonly TRow[];
  readonly targetGrain: EconomicsPeriodGrainV1;
  /** Field name to aggregation kind. Fields absent from this map are dropped. */
  readonly fields: Readonly<Record<string, EconomicsAggregationKindV1>>;
}

export interface AggregatedEconomicsPeriodGroupV1 {
  readonly period: EconomicsCanonicalPeriodV1;
  /** Zero-based offsets of the source rows folded into this group. */
  readonly sourceIndices: readonly number[];
  readonly values: Record<string, string>;
}

/** Whole months in one complete period of `grain`. */
export function monthsPerPeriodV1(grain: EconomicsPeriodGrainV1): number {
  return ECONOMICS_MONTHS_PER_PERIOD_V1[grain];
}

function parseCalendarDate(value: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new EconomicsPeriodModelV1Error(
      'INVALID_ANCHOR_DATE',
      `Expected a YYYY-MM-DD calendar date; received "${value}".`
    );
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);
  const roundTrip = new Date(utc);
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day
  ) {
    throw new EconomicsPeriodModelV1Error(
      'INVALID_ANCHOR_DATE',
      `"${value}" is not a real calendar date.`
    );
  }
  return { year, month, day };
}

function formatCalendarDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(
    2,
    '0'
  )}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Add whole months to a calendar date, clamping to the last day of the target
 * month (2026-01-31 plus one month is 2026-02-28).
 */
export function addMonthsV1(date: string, months: number): string {
  const { year, month, day } = parseCalendarDate(date);
  const absoluteMonth = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(absoluteMonth / 12);
  const targetMonth = (absoluteMonth % 12) + 1;
  return formatCalendarDate(
    targetYear,
    targetMonth,
    Math.min(day, daysInMonth(targetYear, targetMonth))
  );
}

/** Add whole days to a calendar date. */
export function addDaysV1(date: string, days: number): string {
  const { year, month, day } = parseCalendarDate(date);
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * MS_PER_DAY);
  return formatCalendarDate(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate()
  );
}

/** Inclusive day count between two calendar dates. */
export function inclusiveDayCountV1(periodStart: string, periodEnd: string): number {
  const start = parseCalendarDate(periodStart);
  const end = parseCalendarDate(periodEnd);
  const startUtc = Date.UTC(start.year, start.month - 1, start.day);
  const endUtc = Date.UTC(end.year, end.month - 1, end.day);
  return Math.round((endUtc - startUtc) / MS_PER_DAY) + 1;
}

/**
 * Ratios are kept at the full working precision of `Decimal` (28 significant
 * digits) rather than being rounded to a fixed scale. Grain invariance for a
 * non-terminating year fraction such as 1/12 holds to that precision, which
 * is many orders of magnitude below the 6 dp canonical money scale.
 */
function toRatioString(value: Decimal): string {
  return value.toString();
}

function buildPeriod(input: {
  grain: EconomicsPeriodGrainV1;
  /** Series anchor; every boundary is derived from it so periods stay contiguous. */
  anchorDate: string;
  index: number;
  monthsPlaced: number;
  monthsCovered: number;
}): EconomicsCanonicalPeriodV1 {
  const monthsPerPeriod = monthsPerPeriodV1(input.grain);
  const periodStart = addMonthsV1(input.anchorDate, input.monthsPlaced);
  const periodEnd = addDaysV1(
    addMonthsV1(input.anchorDate, input.monthsPlaced + input.monthsCovered),
    -1
  );
  const fullPeriodEnd = addDaysV1(
    addMonthsV1(input.anchorDate, input.monthsPlaced + monthsPerPeriod),
    -1
  );
  const prorationFactor =
    input.monthsCovered === monthsPerPeriod
      ? new Decimal(1)
      : new Decimal(input.monthsCovered).div(monthsPerPeriod);

  return {
    grain: input.grain,
    index: input.index,
    periodStart,
    periodEnd,
    monthsCovered: input.monthsCovered,
    dayCount: inclusiveDayCountV1(periodStart, periodEnd),
    fullPeriodDayCount: inclusiveDayCountV1(periodStart, fullPeriodEnd),
    prorationFactor: toRatioString(prorationFactor),
    yearFraction: toRatioString(new Decimal(input.monthsCovered).div(12)),
    partial: input.monthsCovered < monthsPerPeriod,
  };
}

/**
 * Build a canonical period series.
 *
 * Periods are anniversary-based on `anchorDate`: period `n` starts on the
 * anchor plus `(n - 1) * monthsPerPeriod` months. A trailing period that
 * covers fewer months than the grain is emitted as a partial period rather
 * than being dropped or extended.
 */
export function buildEconomicsPeriodSeriesV1(
  input: BuildEconomicsPeriodSeriesV1Input
): EconomicsPeriodSeriesV1 {
  if (!Number.isInteger(input.horizonMonths) || input.horizonMonths <= 0) {
    throw new EconomicsPeriodModelV1Error(
      'INVALID_HORIZON_MONTHS',
      `horizonMonths must be a positive integer; received ${input.horizonMonths}.`
    );
  }
  parseCalendarDate(input.anchorDate);

  const monthsPerPeriod = monthsPerPeriodV1(input.grain);
  const periods: EconomicsCanonicalPeriodV1[] = [];
  let monthsPlaced = 0;
  let index = 1;

  while (monthsPlaced < input.horizonMonths) {
    const monthsCovered = Math.min(monthsPerPeriod, input.horizonMonths - monthsPlaced);
    periods.push(
      buildPeriod({
        grain: input.grain,
        anchorDate: input.anchorDate,
        index,
        monthsPlaced,
        monthsCovered,
      })
    );
    monthsPlaced += monthsCovered;
    index += 1;
  }

  return {
    version: ECONOMICS_PERIOD_MODEL_VERSION,
    grain: input.grain,
    anchorDate: input.anchorDate,
    horizonMonths: input.horizonMonths,
    periods,
  };
}

/**
 * Convert an annual rate into the rate earned over one canonical period.
 *
 *   simple      -> `r * t`
 *   compounded  -> `(1 + r)^t - 1`
 *
 * where `t` is the period year fraction. Both are grain-invariant: the
 * periods of a full year sum (simple) or compound (compounded) back to the
 * annual rate, so changing the accrual grain cannot change the accrued
 * amount.
 */
export function periodRateV1(
  annualRate: Decimal.Value,
  period: Pick<EconomicsCanonicalPeriodV1, 'yearFraction'>,
  compounding: EconomicsRateCompoundingV1
): Decimal {
  const rate = new Decimal(annualRate);
  const yearFraction = new Decimal(period.yearFraction);
  if (compounding === 'simple') {
    return rate.times(yearFraction);
  }
  return rate.plus(1).pow(yearFraction).minus(1);
}

function aggregateValue(
  kind: EconomicsAggregationKindV1,
  field: string,
  values: readonly Decimal[]
): Decimal {
  switch (kind) {
    case 'flow':
      return values.reduce((total, value) => total.plus(value), new Decimal(0));
    case 'stock_start':
      return values[0]!;
    case 'stock_end':
      return values[values.length - 1]!;
    case 'ratio_derived':
      throw new EconomicsPeriodModelV1Error(
        'RATIO_AGGREGATION_FORBIDDEN',
        `Field "${field}" is a derived ratio and must be recomputed from aggregated components, not aggregated.`
      );
  }
}

/**
 * Regroup rows accrued at the series grain into a coarser grain.
 *
 * Aggregation is presentation only: it never re-runs a calculation, so a
 * served number cannot change when the reporting grain changes. Downscaling
 * (annual to monthly) is refused because it would have to invent amounts.
 */
export function aggregateEconomicsPeriodRowsV1<TRow extends Record<string, unknown>>(
  input: AggregateEconomicsPeriodRowsV1Input<TRow>
): AggregatedEconomicsPeriodGroupV1[] {
  const { series, rows, targetGrain, fields } = input;

  if (rows.length !== series.periods.length) {
    throw new EconomicsPeriodModelV1Error(
      'PERIOD_ROW_COUNT_MISMATCH',
      `Expected ${series.periods.length} rows for the period series; received ${rows.length}.`
    );
  }

  const sourceMonths = monthsPerPeriodV1(series.grain);
  const targetMonths = monthsPerPeriodV1(targetGrain);
  if (targetMonths < sourceMonths) {
    throw new EconomicsPeriodModelV1Error(
      'GRAIN_DOWNSCALE_FORBIDDEN',
      `Cannot regroup ${series.grain} rows into finer ${targetGrain} periods.`
    );
  }

  const fieldEntries = Object.entries(fields);
  fieldEntries.forEach(([field]) => {
    if (!rows.some((row) => row[field] !== undefined)) {
      throw new EconomicsPeriodModelV1Error(
        'UNKNOWN_AGGREGATION_FIELD',
        `Field "${field}" is absent from every row.`
      );
    }
  });

  const targetSeries = buildEconomicsPeriodSeriesV1({
    anchorDate: series.anchorDate,
    grain: targetGrain,
    horizonMonths: series.horizonMonths,
  });
  const sourcePerTarget = targetMonths / sourceMonths;

  return targetSeries.periods.map((period, groupOffset) => {
    const firstSource = groupOffset * sourcePerTarget;
    const sourceIndices: number[] = [];
    for (
      let offset = firstSource;
      offset < Math.min(firstSource + sourcePerTarget, rows.length);
      offset += 1
    ) {
      sourceIndices.push(offset);
    }

    if (sourceIndices.length === 0) {
      throw new EconomicsPeriodModelV1Error(
        'PERIOD_ROW_COUNT_MISMATCH',
        `Target period ${period.periodStart}/${period.periodEnd} has no source rows to aggregate.`
      );
    }

    const values: Record<string, string> = {};
    fieldEntries.forEach(([field, kind]) => {
      const fieldValues = sourceIndices.map(
        (offset) => new Decimal((rows[offset]![field] ?? 0) as Decimal.Value)
      );
      values[field] = aggregateValue(kind, field, fieldValues).toString();
    });

    return { period, sourceIndices, values };
  });
}
