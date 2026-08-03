/**
 * Fee-basis timeline coverage for the "Called Capital Each Period" basis.
 *
 * The quarterly timeline in `computeFeeBasisTimeline` takes a cumulative
 * called-capital schedule, so the period basis is the increment between two
 * consecutive quarters, floored at zero.
 */

import Decimal from '@shared/lib/decimal-config';
import { describe, expect, it } from 'vitest';
import {
  computeFeeBasisTimeline,
  resolveFeeBasis,
  type FeeBasisConfig,
} from '@shared/lib/fund-math';
import type { FeeProfile } from '@shared/schemas/fee-profile';

function periodBasisProfile(): FeeProfile {
  return {
    id: 'period-called-profile',
    name: 'Called Capital Each Period 2%',
    tiers: [
      {
        basis: 'called_capital_period',
        annualRatePercent: new Decimal(0.02),
        startYear: 1,
      },
    ],
  };
}

describe('computeFeeBasisTimeline - called_capital_period', () => {
  it('charges each quarter on that quarter call only', () => {
    const config: FeeBasisConfig = {
      fundSize: new Decimal(100_000_000),
      numQuarters: 4,
      feeProfile: periodBasisProfile(),
      // Cumulative: no call, one call, a second call, then a call adjustment
      calledCapitalSchedule: [
        new Decimal(0),
        new Decimal(20_000_000),
        new Decimal(30_000_000),
        new Decimal(28_000_000),
      ],
    };

    const timeline = computeFeeBasisTimeline(config);

    expect(timeline.periods[0]?.calledCapitalPeriod.toNumber()).toBe(0);
    expect(timeline.periods[1]?.calledCapitalPeriod.toNumber()).toBe(20_000_000);
    expect(timeline.periods[2]?.calledCapitalPeriod.toNumber()).toBe(10_000_000);
    // A downward adjustment floors the period basis at zero, never a negative fee
    expect(timeline.periods[3]?.calledCapitalPeriod.toNumber()).toBe(0);

    // Quarterly fee = period call x annual rate, with no pro-rating: the call
    // belongs to that quarter alone, so the fee does not depend on how long the
    // period is.
    expect(timeline.periods[0]?.managementFees.toNumber()).toBe(0);
    expect(timeline.periods[1]?.managementFees.toNumber()).toBe(400_000);
    expect(timeline.periods[2]?.managementFees.toNumber()).toBe(200_000);
    expect(timeline.periods[3]?.managementFees.toNumber()).toBe(0);
    expect(timeline.totalFees.toNumber()).toBe(600_000);
  });

  it('gives the same total fee as the annual engine for the same call schedule', () => {
    // A fund that calls 10M per year at 2% pays 200K per year on this basis.
    // Modeling the same calls quarterly must not change the total.
    const quarterlyCumulative = Array.from({ length: 8 }, (_, quarter) =>
      new Decimal(10_000_000).times(Math.floor(quarter / 4) + 1)
    );

    const timeline = computeFeeBasisTimeline({
      fundSize: new Decimal(100_000_000),
      numQuarters: 8,
      feeProfile: periodBasisProfile(),
      calledCapitalSchedule: quarterlyCumulative,
    });

    expect(timeline.totalFees.toNumber()).toBe(400_000);
  });

  it('charges nothing when the fund calls no capital', () => {
    const config: FeeBasisConfig = {
      fundSize: new Decimal(100_000_000),
      numQuarters: 4,
      feeProfile: periodBasisProfile(),
    };

    const timeline = computeFeeBasisTimeline(config);

    expect(timeline.totalFees.toNumber()).toBe(0);
    expect(timeline.periods.every((period) => period.calledCapitalPeriod.isZero())).toBe(true);
  });

  it('leaves the cumulative called-capital basis unchanged', () => {
    const config: FeeBasisConfig = {
      fundSize: new Decimal(100_000_000),
      numQuarters: 3,
      calledCapitalSchedule: [
        new Decimal(10_000_000),
        new Decimal(25_000_000),
        new Decimal(25_000_000),
      ],
    };

    const timeline = computeFeeBasisTimeline(config);
    const lastPeriod = timeline.periods[2]!;

    expect(resolveFeeBasis('called_capital_cumulative', lastPeriod).toNumber()).toBe(25_000_000);
    expect(resolveFeeBasis('called_capital_period', lastPeriod).toNumber()).toBe(0);
  });
});
