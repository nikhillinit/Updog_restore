/**
 * Truth cases for the "Called Capital Each Period" management-fee basis.
 *
 * The basis is the net capital that investors call during one period. The
 * period is a half-open interval [startInclusive, endExclusive): a call that
 * is dated on the start boundary is inside the period, and a call that is
 * dated on the end boundary is inside the next period. Adjustments (negative
 * call amounts) net against the calls of the period in which they are dated.
 * The result is floored at zero; it does not carry back or carry forward.
 */

import Decimal from '@shared/lib/decimal-config';
import { describe, expect, it } from 'vitest';
import {
  calledCapitalForPeriod,
  calledCapitalPeriodFromCumulative,
  type CapitalCallEvent,
} from '@shared/lib/economics/called-capital-period';

const YEAR_1 = { startInclusive: 0, endExclusive: 12 };
const YEAR_2 = { startInclusive: 12, endExclusive: 24 };

function call(periodPoint: number, amount: number): CapitalCallEvent {
  return { periodPoint, amount: new Decimal(amount) };
}

describe('calledCapitalForPeriod', () => {
  it('returns zero when the period has no calls', () => {
    expect(calledCapitalForPeriod([], YEAR_1).toNumber()).toBe(0);
    expect(calledCapitalForPeriod([call(15, 5_000_000)], YEAR_1).toNumber()).toBe(0);
  });

  it('returns the single call that falls in the period', () => {
    expect(calledCapitalForPeriod([call(3, 5_000_000)], YEAR_1).toNumber()).toBe(5_000_000);
  });

  it('sums multiple calls in the same period', () => {
    const calls = [call(0, 5_000_000), call(4, 2_500_000), call(11, 1_500_000)];

    expect(calledCapitalForPeriod(calls, YEAR_1).toNumber()).toBe(9_000_000);
  });

  it('assigns a boundary-dated call to the period that starts on that boundary', () => {
    const calls = [call(0, 4_000_000), call(12, 6_000_000)];

    expect(calledCapitalForPeriod(calls, YEAR_1).toNumber()).toBe(4_000_000);
    expect(calledCapitalForPeriod(calls, YEAR_2).toNumber()).toBe(6_000_000);
  });

  it('nets a call adjustment against the calls of the same period', () => {
    const calls = [call(1, 5_000_000), call(7, -1_500_000)];

    expect(calledCapitalForPeriod(calls, YEAR_1).toNumber()).toBe(3_500_000);
  });

  it('floors the period at zero and does not carry an over-adjustment forward', () => {
    const calls = [call(1, 2_000_000), call(6, -3_000_000), call(13, 4_000_000)];

    expect(calledCapitalForPeriod(calls, YEAR_1).toNumber()).toBe(0);
    expect(calledCapitalForPeriod(calls, YEAR_2).toNumber()).toBe(4_000_000);
  });

  it('keeps Decimal precision instead of binary floating point', () => {
    const calls = [call(1, 0), call(2, 0)];
    calls[0]!.amount = new Decimal('0.1');
    calls[1]!.amount = new Decimal('0.2');

    expect(calledCapitalForPeriod(calls, YEAR_1).toFixed(2)).toBe('0.30');
  });
});

describe('calledCapitalPeriodFromCumulative', () => {
  it('returns zero for the first period when nothing is called', () => {
    expect(calledCapitalPeriodFromCumulative(new Decimal(0), new Decimal(0)).toNumber()).toBe(0);
  });

  it('returns the increment between two cumulative points', () => {
    expect(
      calledCapitalPeriodFromCumulative(new Decimal(10_000_000), new Decimal(25_000_000)).toNumber()
    ).toBe(15_000_000);
  });

  it('floors a downward cumulative adjustment at zero', () => {
    expect(
      calledCapitalPeriodFromCumulative(new Decimal(25_000_000), new Decimal(22_000_000)).toNumber()
    ).toBe(0);
  });
});
