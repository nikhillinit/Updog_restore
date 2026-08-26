/**
 * "Called Capital Each Period" fee-basis primitives.
 *
 * Business meaning
 * ----------------
 * The basis is the net capital that investors call **during** one period, not
 * the capital called to date. It answers "what did the fund draw down this
 * period?" and it therefore falls back to zero in periods with no call.
 *
 * Period boundary
 *   A period is the half-open interval [startInclusive, endExclusive). A call
 *   dated on the start boundary belongs to that period; a call dated on the end
 *   boundary belongs to the next period. Every call therefore counts exactly
 *   once across a contiguous timeline.
 *
 * Adjustments and negatives
 *   A call adjustment (a rebate or a corrected over-call) is a negative amount
 *   dated in the period that carries the correction. It nets against the calls
 *   of that same period. The period basis is floored at zero, so an adjustment
 *   larger than the period's calls yields a zero basis and never a negative fee.
 *   The excess does not carry back to an earlier period nor forward to a later
 *   one; each period stands alone.
 *
 * All arithmetic stays in Decimal so that the caller keeps the
 * decimal-string/Decimal precision boundary of the economics engine.
 */

import Decimal from '@shared/lib/decimal-config';

/** A single capital call or call adjustment placed on the fund timeline. */
export interface CapitalCallEvent {
  /**
   * Position of the call on the fund timeline, in the same unit that the
   * caller uses for period boundaries (month index, quarter index, or year
   * index). The unit only has to be consistent within one call set.
   */
  periodPoint: number;

  /** Call amount; negative for a call adjustment. */
  amount: Decimal;
}

/** Half-open period boundary: [startInclusive, endExclusive). */
export interface PeriodBoundary {
  startInclusive: number;
  endExclusive: number;
}

/**
 * Net capital called inside one period, floored at zero.
 *
 * @param calls - Capital calls and call adjustments across the whole timeline.
 * @param period - Half-open period boundary.
 */
export function calledCapitalForPeriod(
  calls: readonly CapitalCallEvent[],
  period: PeriodBoundary
): Decimal {
  const net = calls.reduce((total, event) => {
    const inPeriod =
      event.periodPoint >= period.startInclusive && event.periodPoint < period.endExclusive;
    return inPeriod ? total.plus(event.amount) : total;
  }, new Decimal(0));

  return Decimal.max(new Decimal(0), net);
}

/**
 * Net capital called inside one period, derived from a cumulative called-capital
 * schedule. A downward step in the cumulative schedule is a call adjustment and
 * gives a zero basis for that period.
 *
 * @param previousCumulative - Called capital at the end of the previous period.
 * @param currentCumulative - Called capital at the end of the current period.
 */
export function calledCapitalPeriodFromCumulative(
  previousCumulative: Decimal,
  currentCumulative: Decimal
): Decimal {
  return Decimal.max(new Decimal(0), currentCumulative.minus(previousCumulative));
}
