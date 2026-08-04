/**
 * Retroactive Fee Catch-Up Truth Cases
 *
 * The retroactive catch-up in this file is a FEE PROFILE setting.
 * It is not the GP carry catch-up of the distribution waterfall.
 * The two settings are independent. This file must not touch waterfall logic.
 *
 * @see shared/schemas/fee-profile.ts
 * @see shared/lib/fund-math.ts
 */

import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
  FeeProfileSchema,
  calculateManagementFees,
  calculateManagementFeeBreakdown,
  resolveRetroactiveFeeCatchUpMonths,
  resolveRetroactiveFeeCatchUpPolicy,
  DEFAULT_RETROACTIVE_FEE_CATCH_UP,
  type FeeProfile,
  type FeeCalculationContext,
} from '@shared/schemas/fee-profile';
import { computeFeeBasisTimeline } from '@shared/lib/fund-math';

const FUND_SIZE = new Decimal(100_000_000);
const ANNUAL_RATE = new Decimal(0.02);
const MONTHLY_FEE = FUND_SIZE.times(ANNUAL_RATE).div(12);

/**
 * Build a profile with one tier that becomes active in fund year 3.
 * Months 0 to 23 are therefore not chargeable.
 */
function makeLateStartProfile(
  retroactiveFeeCatchUp?: FeeProfile['retroactiveFeeCatchUp']
): FeeProfile {
  return {
    id: 'late-start',
    name: 'Late start 2%',
    tiers: [
      {
        basis: 'committed_capital',
        annualRatePercent: ANNUAL_RATE,
        startYear: 3,
        endYear: 10,
      },
    ],
    ...(retroactiveFeeCatchUp ? { retroactiveFeeCatchUp } : {}),
  };
}

function makeContext(
  currentMonth: number,
  overrides: Partial<FeeCalculationContext> = {}
): FeeCalculationContext {
  return {
    committedCapital: FUND_SIZE,
    calledCapitalPeriod: new Decimal(0),
    calledCapitalCumulative: new Decimal(0),
    calledCapitalNetOfReturns: new Decimal(0),
    investedCapital: new Decimal(0),
    fairMarketValue: new Decimal(0),
    unrealizedCost: new Decimal(0),
    currentMonth,
    ...overrides,
  };
}

describe('Retroactive fee catch-up - configuration and validation', () => {
  it('defaults to disabled when the profile does not declare the setting', () => {
    const parsed = FeeProfileSchema.parse({
      id: 'legacy',
      name: 'Legacy profile',
      tiers: [{ basis: 'committed_capital', annualRatePercent: 0.02, startYear: 1 }],
    });

    expect(parsed.retroactiveFeeCatchUp).toBeUndefined();
    expect(resolveRetroactiveFeeCatchUpPolicy(parsed)).toEqual(DEFAULT_RETROACTIVE_FEE_CATCH_UP);
    expect(DEFAULT_RETROACTIVE_FEE_CATCH_UP.enabled).toBe(false);
  });

  it('accepts an explicitly enabled fee-profile catch-up policy', () => {
    const parsed = FeeProfileSchema.parse({
      id: 'enabled',
      name: 'Enabled profile',
      tiers: [{ basis: 'committed_capital', annualRatePercent: 0.02, startYear: 3 }],
      retroactiveFeeCatchUp: { enabled: true, accrualStartMonth: 0, maxCatchUpMonths: 12 },
    });

    expect(parsed.retroactiveFeeCatchUp.enabled).toBe(true);
    expect(parsed.retroactiveFeeCatchUp.maxCatchUpMonths).toBe(12);
  });

  it('rejects an accrual start that is after the first fee tier', () => {
    const result = FeeProfileSchema.safeParse({
      id: 'invalid',
      name: 'Invalid profile',
      tiers: [{ basis: 'committed_capital', annualRatePercent: 0.02, startYear: 3 }],
      retroactiveFeeCatchUp: { enabled: true, accrualStartMonth: 36 },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const message = result.error.issues.map((issue) => issue.message).join(' ');
      expect(message).toContain('retroactive fee catch-up');
      expect(message).not.toContain('carry');
    }
  });

  it('fails closed when catch-up requires a period-flow basis without monthly history', () => {
    const profile: FeeProfile = {
      id: 'period-flow-catch-up',
      name: 'Period-flow catch-up',
      tiers: [
        {
          basis: 'called_capital_period',
          annualRatePercent: ANNUAL_RATE,
          startYear: 3,
        },
      ],
      retroactiveFeeCatchUp: { enabled: true, accrualStartMonth: 0 },
    };

    const parsed = FeeProfileSchema.safeParse(profile);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues).toContainEqual(
        expect.objectContaining({
          message:
            'Retroactive fee catch-up requires historical monthly bases, which a period-flow basis does not provide',
          path: ['retroactiveFeeCatchUp'],
        })
      );
    }

    expect(() =>
      calculateManagementFeeBreakdown(
        profile,
        makeContext(24, { calledCapitalPeriod: new Decimal(10_000_000) })
      )
    ).toThrow(
      'Retroactive fee catch-up requires historical monthly bases, which a period-flow basis does not provide'
    );
  });

  it('keeps prospective-only period-flow fees available', () => {
    const parsed = FeeProfileSchema.safeParse({
      id: 'period-flow-prospective',
      name: 'Period-flow prospective',
      tiers: [
        {
          basis: 'called_capital_period',
          annualRatePercent: ANNUAL_RATE,
          startYear: 3,
        },
      ],
      retroactiveFeeCatchUp: { enabled: true, accrualStartMonth: 24 },
    });

    expect(parsed.success).toBe(true);
  });
});

describe('Retroactive fee catch-up - truth cases', () => {
  it('CASE disabled: no catch-up is charged in the first eligible period', () => {
    const profile = makeLateStartProfile({ enabled: false, accrualStartMonth: 0 });
    const breakdown = calculateManagementFeeBreakdown(profile, makeContext(24));

    expect(breakdown.retroactiveCatchUpMonths).toBe(0);
    expect(breakdown.retroactiveCatchUpFees.toNumber()).toBe(0);
    expect(breakdown.recurringFees.toNumber()).toBeCloseTo(MONTHLY_FEE.toNumber(), 6);
    expect(calculateManagementFees(profile, makeContext(24)).toNumber()).toBeCloseTo(
      MONTHLY_FEE.toNumber(),
      6
    );
  });

  it('CASE enabled, first eligible period, multiple missed periods: charges all missed months once', () => {
    const profile = makeLateStartProfile({ enabled: true, accrualStartMonth: 0 });
    const breakdown = calculateManagementFeeBreakdown(profile, makeContext(24));

    expect(breakdown.retroactiveCatchUpMonths).toBe(24);
    expect(breakdown.retroactiveCatchUpFees.toNumber()).toBeCloseTo(
      MONTHLY_FEE.times(24).toNumber(),
      6
    );
  });

  it('CASE after the first eligible period: no further catch-up', () => {
    const profile = makeLateStartProfile({ enabled: true, accrualStartMonth: 0 });

    for (const month of [25, 26, 36]) {
      const breakdown = calculateManagementFeeBreakdown(profile, makeContext(month));
      expect(breakdown.retroactiveCatchUpMonths).toBe(0);
      expect(breakdown.retroactiveCatchUpFees.toNumber()).toBe(0);
    }
  });

  it('CASE before the first eligible period: no fee and no catch-up', () => {
    const profile = makeLateStartProfile({ enabled: true, accrualStartMonth: 0 });
    const breakdown = calculateManagementFeeBreakdown(profile, makeContext(12));

    expect(breakdown.recurringFees.toNumber()).toBe(0);
    expect(breakdown.retroactiveCatchUpFees.toNumber()).toBe(0);
  });

  it('CASE single missed period: accrual start limits the catch-up', () => {
    const profile = makeLateStartProfile({ enabled: true, accrualStartMonth: 23 });
    const breakdown = calculateManagementFeeBreakdown(profile, makeContext(24));

    expect(breakdown.retroactiveCatchUpMonths).toBe(1);
    expect(breakdown.retroactiveCatchUpFees.toNumber()).toBeCloseTo(MONTHLY_FEE.toNumber(), 6);
  });

  it('CASE capped catch-up: maxCatchUpMonths limits the missed months', () => {
    const profile = makeLateStartProfile({
      enabled: true,
      accrualStartMonth: 0,
      maxCatchUpMonths: 6,
    });
    const breakdown = calculateManagementFeeBreakdown(profile, makeContext(24));

    expect(breakdown.retroactiveCatchUpMonths).toBe(6);
    expect(breakdown.retroactiveCatchUpFees.toNumber()).toBeCloseTo(
      MONTHLY_FEE.times(6).toNumber(),
      6
    );
  });

  it('CASE zero basis: reports the missed months but charges zero', () => {
    const profile: FeeProfile = {
      id: 'called-basis',
      name: 'Called capital 2%',
      tiers: [
        {
          basis: 'called_capital_cumulative',
          annualRatePercent: ANNUAL_RATE,
          startYear: 3,
          endYear: 10,
        },
      ],
      retroactiveFeeCatchUp: { enabled: true, accrualStartMonth: 0 },
    };

    const breakdown = calculateManagementFeeBreakdown(profile, makeContext(24));

    expect(breakdown.retroactiveCatchUpMonths).toBe(24);
    expect(breakdown.retroactiveCatchUpFees.toNumber()).toBe(0);
    expect(breakdown.recurringFees.toNumber()).toBe(0);
  });

  it('CASE fee holiday: waived months are not caught up', () => {
    const profile: FeeProfile = {
      id: 'holiday',
      name: 'Holiday 2%',
      tiers: [
        {
          basis: 'committed_capital',
          annualRatePercent: ANNUAL_RATE,
          startYear: 1,
          endYear: 10,
        },
      ],
      feeHolidays: [{ startMonth: 0, durationMonths: 12, reason: 'Ramp-up' }],
      retroactiveFeeCatchUp: { enabled: true, accrualStartMonth: 0 },
    };

    const breakdown = calculateManagementFeeBreakdown(profile, makeContext(12));

    expect(breakdown.retroactiveCatchUpMonths).toBe(0);
    expect(breakdown.retroactiveCatchUpFees.toNumber()).toBe(0);
  });

  it('CASE no chargeable month: reports no catch-up', () => {
    const profile = makeLateStartProfile({ enabled: true, accrualStartMonth: 0 });

    expect(resolveRetroactiveFeeCatchUpMonths(profile, 240)).toBe(0);
  });

  it('charges a period-flow tier once for the period', () => {
    const profile: FeeProfile = {
      id: 'period-flow',
      name: 'Period-flow fee',
      tiers: [
        {
          basis: 'called_capital_period',
          annualRatePercent: ANNUAL_RATE,
          startYear: 1,
        },
      ],
    };
    const context = makeContext(0, { calledCapitalPeriod: new Decimal(10_000_000) });

    const breakdown = calculateManagementFeeBreakdown(profile, context, { periodMonths: 3 });

    expect(breakdown.recurringFees.toNumber()).toBe(200_000);
    expect(calculateManagementFees(profile, context, 3).toNumber()).toBe(200_000);
  });

  it('prorates a stock-basis tier across the reporting period', () => {
    const profile: FeeProfile = {
      id: 'stock-period',
      name: 'Stock-basis fee',
      tiers: [
        {
          basis: 'committed_capital',
          annualRatePercent: ANNUAL_RATE,
          startYear: 1,
        },
      ],
    };

    const breakdown = calculateManagementFeeBreakdown(profile, makeContext(0), {
      periodMonths: 3,
    });

    expect(breakdown.recurringFees.toNumber()).toBe(500_000);
    expect(calculateManagementFees(profile, makeContext(0), 3).toNumber()).toBe(500_000);
  });
});

describe('Retroactive fee catch-up - reporting surface', () => {
  it('reports the catch-up once in the quarterly fee timeline', () => {
    const profile = makeLateStartProfile({ enabled: true, accrualStartMonth: 0 });

    const timeline = computeFeeBasisTimeline({
      fundSize: FUND_SIZE,
      numQuarters: 40,
      feeProfile: profile,
    });

    const catchUpPeriods = timeline.periods.filter((period) => period.retroactiveCatchUpFees.gt(0));

    expect(catchUpPeriods).toHaveLength(1);
    expect(catchUpPeriods[0]?.quarter).toBe(8);
    expect(catchUpPeriods[0]?.retroactiveCatchUpMonths).toBe(24);
    expect(timeline.totalRetroactiveCatchUpFees.toNumber()).toBeCloseTo(
      MONTHLY_FEE.times(24).toNumber(),
      6
    );
    expect(catchUpPeriods[0]?.managementFees.toNumber()).toBeCloseTo(
      MONTHLY_FEE.times(27).toNumber(),
      6
    );
  });

  it('leaves the timeline unchanged when the setting is disabled', () => {
    const disabled = makeLateStartProfile({ enabled: false, accrualStartMonth: 0 });
    const absent = makeLateStartProfile();

    const disabledTimeline = computeFeeBasisTimeline({
      fundSize: FUND_SIZE,
      numQuarters: 40,
      feeProfile: disabled,
    });
    const absentTimeline = computeFeeBasisTimeline({
      fundSize: FUND_SIZE,
      numQuarters: 40,
      feeProfile: absent,
    });

    expect(disabledTimeline.totalFees.toNumber()).toBeCloseTo(
      absentTimeline.totalFees.toNumber(),
      6
    );
    expect(disabledTimeline.totalRetroactiveCatchUpFees.toNumber()).toBe(0);
  });
});
