import { describe, expect, it } from 'vitest';

import { Decimal } from '../../../shared/lib/decimal-config';
import {
  CashAssemblyCallSizingV1Error,
  sizeCashAssemblyCallsV1,
  type CallSizingQuarterNeedInputV1,
} from '../../../shared/lib/internal-economics/cash-assembly-call-sizing-v1';
import type { CashAssemblyPeriodV1 } from '../../../shared/lib/internal-economics/cash-assembly-types-v1';

const ZERO = new Decimal(0);

function period(periodStart: string, periodEnd: string): CashAssemblyPeriodV1 {
  return { periodStart, periodEnd, source: 'projected' };
}

function quarter(
  periodStart: string,
  periodEnd: string,
  scheduledDeploymentUsd: string,
  overrides: Partial<
    Pick<CallSizingQuarterNeedInputV1, 'scheduledFeeUsd' | 'scheduledExpenseUsd'>
  > = {}
): CallSizingQuarterNeedInputV1 {
  return {
    period: period(periodStart, periodEnd),
    scheduledDeploymentUsd: new Decimal(scheduledDeploymentUsd),
    scheduledFeeUsd: overrides.scheduledFeeUsd ?? ZERO,
    scheduledExpenseUsd: overrides.scheduledExpenseUsd ?? ZERO,
  };
}

const FOUR_QUARTERS: CallSizingQuarterNeedInputV1[] = [
  quarter('2026-01-01', '2026-03-31', '10'),
  quarter('2026-04-01', '2026-06-30', '0'),
  quarter('2026-07-01', '2026-09-30', '0'),
  quarter('2026-10-01', '2026-12-31', '20'),
];

const LARGE_ENVELOPE = new Decimal('1000000');

describe('cash assembly call sizing and buffer roll-down v1', () => {
  it('at buffer=0, each quarter calls exactly its own scheduled need (pay-as-you-go)', () => {
    const result = sizeCashAssemblyCallsV1({
      quarters: FOUR_QUARTERS,
      cashBufferQuarters: 0,
      openingCashUsd: ZERO,
      unfundedEnvelopeRemainingUsd: LARGE_ENVELOPE,
    });

    expect(result.quarters.map((q) => q.totalCallUsd)).toEqual([
      '10.000000',
      '0.000000',
      '0.000000',
      '20.000000',
    ]);
    expect(result.totalCalledUsd).toBe('30.000000');
  });

  it('at buffer=1, a quarter pulls forward the next quarter’s deployment need into its own call', () => {
    const result = sizeCashAssemblyCallsV1({
      quarters: FOUR_QUARTERS,
      cashBufferQuarters: 1,
      openingCashUsd: ZERO,
      unfundedEnvelopeRemainingUsd: LARGE_ENVELOPE,
    });

    // window for Q1 = [Q1,Q2] = 10+0 = 10; Q2 window=[Q2,Q3]=0; Q3 window=[Q3,Q4]=20 (new);
    // Q4 window=[Q4,Q4] already covered -> 0.
    expect(result.quarters.map((q) => q.totalCallUsd)).toEqual([
      '10.000000',
      '0.000000',
      '20.000000',
      '0.000000',
    ]);
    expect(result.totalCalledUsd).toBe('30.000000');
  });

  it('invariant: total called across the whole horizon is identical at cashBufferQuarters=0 vs N (timing-only, never total)', () => {
    const needSchedule: CallSizingQuarterNeedInputV1[] = [
      quarter('2026-01-01', '2026-03-31', '7'),
      quarter('2026-04-01', '2026-06-30', '13'),
      quarter('2026-07-01', '2026-09-30', '0'),
      quarter('2026-10-01', '2026-12-31', '25'),
      quarter('2027-01-01', '2027-03-31', '4'),
    ];

    const resultBufferZero = sizeCashAssemblyCallsV1({
      quarters: needSchedule,
      cashBufferQuarters: 0,
      openingCashUsd: ZERO,
      unfundedEnvelopeRemainingUsd: LARGE_ENVELOPE,
    });
    const resultBufferFour = sizeCashAssemblyCallsV1({
      quarters: needSchedule,
      cashBufferQuarters: 4,
      openingCashUsd: ZERO,
      unfundedEnvelopeRemainingUsd: LARGE_ENVELOPE,
    });

    expect(resultBufferZero.totalCalledUsd).toBe('49.000000');
    expect(resultBufferFour.totalCalledUsd).toBe('49.000000');
    expect(resultBufferFour.totalCalledUsd).toBe(resultBufferZero.totalCalledUsd);
    // The two schedules must differ in timing (otherwise the test proves nothing).
    expect(resultBufferFour.quarters.map((q) => q.totalCallUsd)).not.toEqual(
      resultBufferZero.quarters.map((q) => q.totalCallUsd)
    );
  });

  it('buffer roll-down: the target rolls to zero approaching the terminal horizon with no residual after terminal', () => {
    const result = sizeCashAssemblyCallsV1({
      quarters: FOUR_QUARTERS,
      cashBufferQuarters: 2,
      openingCashUsd: ZERO,
      unfundedEnvelopeRemainingUsd: LARGE_ENVELOPE,
    });

    // Q1 window=[Q1,Q3]=10; Q2 window=[Q2,Q4]=20 (new, since Q4's 20 enters); Q3 window=[Q3,Q4] saturated=0 already covered;
    // Q4 window=[Q4,Q4] saturated=0 already covered.
    expect(result.quarters.map((q) => q.totalCallUsd)).toEqual([
      '10.000000',
      '20.000000',
      '0.000000',
      '0.000000',
    ]);
    // No residual: cumulative called after the terminal quarter equals total need exactly.
    expect(result.quarters[3]!.cumulativeCalledUsd).toBe('30.000000');
    expect(result.totalCalledUsd).toBe('30.000000');
  });

  it('opening cash offsets the coverage target exactly once, never assumed zero when present', () => {
    const result = sizeCashAssemblyCallsV1({
      quarters: FOUR_QUARTERS,
      cashBufferQuarters: 0,
      openingCashUsd: new Decimal('10'),
      unfundedEnvelopeRemainingUsd: LARGE_ENVELOPE,
    });

    // Opening cash of 10 fully covers Q1's need of 10; nothing double-counted into later quarters.
    expect(result.quarters.map((q) => q.totalCallUsd)).toEqual([
      '0.000000',
      '0.000000',
      '0.000000',
      '20.000000',
    ]);
    expect(result.totalCalledUsd).toBe('20.000000');
  });

  it('throws OPENING_CASH_UNAVAILABLE when opening cash is missing, never assumes zero', () => {
    expect(() =>
      sizeCashAssemblyCallsV1({
        quarters: FOUR_QUARTERS,
        cashBufferQuarters: 0,
        openingCashUsd: null,
        unfundedEnvelopeRemainingUsd: LARGE_ENVELOPE,
      })
    ).toThrow(CashAssemblyCallSizingV1Error);

    try {
      sizeCashAssemblyCallsV1({
        quarters: FOUR_QUARTERS,
        cashBufferQuarters: 0,
        openingCashUsd: null,
        unfundedEnvelopeRemainingUsd: LARGE_ENVELOPE,
      });
      expect.fail('expected sizeCashAssemblyCallsV1 to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(CashAssemblyCallSizingV1Error);
      expect((error as CashAssemblyCallSizingV1Error).code).toBe('OPENING_CASH_UNAVAILABLE');
    }
  });

  it('rejects (never clamps) a call that would exceed the legal envelope, with full COMMITTED_CAPITAL_EXCEEDED context', () => {
    const quarters: CallSizingQuarterNeedInputV1[] = [
      quarter('2026-01-01', '2026-03-31', '10'),
      quarter('2026-04-01', '2026-06-30', '50'),
      quarter('2026-07-01', '2026-09-30', '5'),
    ];

    try {
      sizeCashAssemblyCallsV1({
        quarters,
        cashBufferQuarters: 0,
        openingCashUsd: ZERO,
        unfundedEnvelopeRemainingUsd: new Decimal('30'),
      });
      expect.fail('expected sizeCashAssemblyCallsV1 to throw COMMITTED_CAPITAL_EXCEEDED');
    } catch (error) {
      expect(error).toBeInstanceOf(CashAssemblyCallSizingV1Error);
      const typed = error as CashAssemblyCallSizingV1Error;
      expect(typed.code).toBe('COMMITTED_CAPITAL_EXCEEDED');
      expect(typed.context).toEqual({
        period: period('2026-04-01', '2026-06-30'),
        requestedCallUsd: '50.000000',
        remainingCapacityUsd: '20.000000',
        cumulativeCalledUsd: '10.000000',
      });
    }
  });

  it('never clamps: the envelope-exceeding quarter is not silently reduced to fit remaining capacity', () => {
    const quarters: CallSizingQuarterNeedInputV1[] = [
      quarter('2026-01-01', '2026-03-31', '10'),
      quarter('2026-04-01', '2026-06-30', '50'),
    ];

    let thrown: CashAssemblyCallSizingV1Error | undefined;
    try {
      sizeCashAssemblyCallsV1({
        quarters,
        cashBufferQuarters: 0,
        openingCashUsd: ZERO,
        unfundedEnvelopeRemainingUsd: new Decimal('30'),
      });
    } catch (error) {
      thrown = error as CashAssemblyCallSizingV1Error;
    }

    expect(thrown).toBeDefined();
    // Requested call is reported as the full, un-clamped amount (50), not a clamped 20.
    expect(thrown!.context?.requestedCallUsd).toBe('50.000000');
  });

  it('carries the two-slot periodStart/periodEnd shape: fee/expense true-up is always zero and separate from deployment funding in V1', () => {
    const result = sizeCashAssemblyCallsV1({
      quarters: FOUR_QUARTERS,
      cashBufferQuarters: 1,
      openingCashUsd: ZERO,
      unfundedEnvelopeRemainingUsd: LARGE_ENVELOPE,
    });

    for (const quarterResult of result.quarters) {
      expect(quarterResult.feeExpenseTrueUpUsd).toBe('0.000000');
      expect(quarterResult.deploymentFundingCallUsd).toBe(quarterResult.totalCallUsd);
    }
  });

  it('rejects nonzero fee/expense outright instead of letting the two-slot split emit a negative call (reviewer repro)', () => {
    // Repro: dep 100 fee 10 in Q1, dep 0 fee 10 in Q2, buffer 1. Without the
    // guard, Q2's totalCallUsd (buffered forward only for deployment need,
    // not fee) minus Q2's own feeExpenseTrueUpUsd (10) would go negative.
    const quarters: CallSizingQuarterNeedInputV1[] = [
      quarter('2026-01-01', '2026-03-31', '100', { scheduledFeeUsd: new Decimal('10') }),
      quarter('2026-04-01', '2026-06-30', '0', { scheduledFeeUsd: new Decimal('10') }),
    ];

    let thrown: CashAssemblyCallSizingV1Error | undefined;
    try {
      sizeCashAssemblyCallsV1({
        quarters,
        cashBufferQuarters: 1,
        openingCashUsd: ZERO,
        unfundedEnvelopeRemainingUsd: LARGE_ENVELOPE,
      });
    } catch (error) {
      thrown = error as CashAssemblyCallSizingV1Error;
    }

    expect(thrown).toBeInstanceOf(CashAssemblyCallSizingV1Error);
    expect(thrown!.code).toBe('NONZERO_FEE_EXPENSE_UNSUPPORTED_V1');
  });

  it.each([
    ['scheduledFeeUsd', { scheduledFeeUsd: new Decimal('5'), scheduledExpenseUsd: ZERO }] as const,
    [
      'scheduledExpenseUsd',
      { scheduledFeeUsd: ZERO, scheduledExpenseUsd: new Decimal('5') },
    ] as const,
  ])(
    'rejects a nonzero %s with NONZERO_FEE_EXPENSE_UNSUPPORTED_V1 and full context',
    (field, overrides) => {
      const quarters: CallSizingQuarterNeedInputV1[] = [
        {
          period: period('2026-01-01', '2026-03-31'),
          scheduledDeploymentUsd: new Decimal('10'),
          scheduledFeeUsd: overrides.scheduledFeeUsd,
          scheduledExpenseUsd: overrides.scheduledExpenseUsd,
        },
      ];

      let thrown: CashAssemblyCallSizingV1Error | undefined;
      try {
        sizeCashAssemblyCallsV1({
          quarters,
          cashBufferQuarters: 0,
          openingCashUsd: ZERO,
          unfundedEnvelopeRemainingUsd: LARGE_ENVELOPE,
        });
      } catch (error) {
        thrown = error as CashAssemblyCallSizingV1Error;
      }

      expect(thrown).toBeInstanceOf(CashAssemblyCallSizingV1Error);
      expect(thrown!.code).toBe('NONZERO_FEE_EXPENSE_UNSUPPORTED_V1');
      expect(thrown!.context).toMatchObject({
        period: period('2026-01-01', '2026-03-31'),
        field,
        valueUsd: '5.000000',
      });
    }
  );

  it('still accepts explicit zero-value fee/expense inputs (the two-slot shape stays behaviorally inert in V1)', () => {
    const quarters: CallSizingQuarterNeedInputV1[] = [
      quarter('2026-01-01', '2026-03-31', '10', {
        scheduledFeeUsd: ZERO,
        scheduledExpenseUsd: ZERO,
      }),
    ];

    const result = sizeCashAssemblyCallsV1({
      quarters,
      cashBufferQuarters: 0,
      openingCashUsd: ZERO,
      unfundedEnvelopeRemainingUsd: LARGE_ENVELOPE,
    });

    expect(result.quarters[0]!.feeExpenseTrueUpUsd).toBe('0.000000');
    expect(result.quarters[0]!.deploymentFundingCallUsd).toBe('10.000000');
    expect(result.quarters[0]!.totalCallUsd).toBe('10.000000');
  });

  it('conserves precision: per-quarter totalCallUsd values sum exactly to totalCalledUsd for canonical 6dp inputs', () => {
    const result = sizeCashAssemblyCallsV1({
      quarters: FOUR_QUARTERS,
      cashBufferQuarters: 1,
      openingCashUsd: ZERO,
      unfundedEnvelopeRemainingUsd: LARGE_ENVELOPE,
    });

    const summedTotalCallUsd = result.quarters
      .reduce((sum, quarterResult) => sum.plus(quarterResult.totalCallUsd), new Decimal(0))
      .toFixed(6);

    expect(summedTotalCallUsd).toBe(result.totalCalledUsd);
  });

  it('formats every money output as a canonical 6dp decimal string', () => {
    const result = sizeCashAssemblyCallsV1({
      quarters: FOUR_QUARTERS,
      cashBufferQuarters: 1,
      openingCashUsd: ZERO,
      unfundedEnvelopeRemainingUsd: LARGE_ENVELOPE,
    });

    const sixDpPattern = /^-?(?:0|[1-9]\d*)\.\d{6}$/;
    for (const quarterResult of result.quarters) {
      expect(quarterResult.deploymentFundingCallUsd).toMatch(sixDpPattern);
      expect(quarterResult.feeExpenseTrueUpUsd).toMatch(sixDpPattern);
      expect(quarterResult.totalCallUsd).toMatch(sixDpPattern);
      expect(quarterResult.cumulativeCalledUsd).toMatch(sixDpPattern);
      expect(quarterResult.remainingEnvelopeCapacityUsd).toMatch(sixDpPattern);
    }
    expect(result.totalCalledUsd).toMatch(sixDpPattern);
  });

  it('rejects a non-integer or negative cashBufferQuarters', () => {
    expect(() =>
      sizeCashAssemblyCallsV1({
        quarters: FOUR_QUARTERS,
        cashBufferQuarters: -1,
        openingCashUsd: ZERO,
        unfundedEnvelopeRemainingUsd: LARGE_ENVELOPE,
      })
    ).toThrow();

    expect(() =>
      sizeCashAssemblyCallsV1({
        quarters: FOUR_QUARTERS,
        cashBufferQuarters: 1.5,
        openingCashUsd: ZERO,
        unfundedEnvelopeRemainingUsd: LARGE_ENVELOPE,
      })
    ).toThrow();
  });

  it('rejects an empty quarters array', () => {
    expect(() =>
      sizeCashAssemblyCallsV1({
        quarters: [],
        cashBufferQuarters: 0,
        openingCashUsd: ZERO,
        unfundedEnvelopeRemainingUsd: LARGE_ENVELOPE,
      })
    ).toThrow();
  });

  it.each([
    ['scheduledDeploymentUsd', { scheduledFeeUsd: ZERO, scheduledExpenseUsd: ZERO }] as const,
    ['scheduledFeeUsd', { scheduledFeeUsd: new Decimal('-5'), scheduledExpenseUsd: ZERO }] as const,
    [
      'scheduledExpenseUsd',
      { scheduledFeeUsd: ZERO, scheduledExpenseUsd: new Decimal('-5') },
    ] as const,
  ])(
    'rejects a negative %s with NEGATIVE_SCHEDULED_AMOUNT, never silently going non-monotonic',
    (field, overrides) => {
      const quarters: CallSizingQuarterNeedInputV1[] =
        field === 'scheduledDeploymentUsd'
          ? [quarter('2026-01-01', '2026-03-31', '-5')]
          : [
              {
                period: period('2026-01-01', '2026-03-31'),
                scheduledDeploymentUsd: new Decimal('10'),
                scheduledFeeUsd: overrides.scheduledFeeUsd,
                scheduledExpenseUsd: overrides.scheduledExpenseUsd,
              },
            ];

      let thrown: CashAssemblyCallSizingV1Error | undefined;
      try {
        sizeCashAssemblyCallsV1({
          quarters,
          cashBufferQuarters: 0,
          openingCashUsd: ZERO,
          unfundedEnvelopeRemainingUsd: LARGE_ENVELOPE,
        });
      } catch (error) {
        thrown = error as CashAssemblyCallSizingV1Error;
      }

      expect(thrown).toBeInstanceOf(CashAssemblyCallSizingV1Error);
      expect(thrown!.code).toBe('NEGATIVE_SCHEDULED_AMOUNT');
      expect(thrown!.context).toMatchObject({
        period: period('2026-01-01', '2026-03-31'),
        field,
        valueUsd: '-5.000000',
      });
    }
  );

  it('reports the first violating quarter when a later quarter carries the negative amount', () => {
    const quarters: CallSizingQuarterNeedInputV1[] = [
      quarter('2026-01-01', '2026-03-31', '10'),
      quarter('2026-04-01', '2026-06-30', '-1'),
    ];

    let thrown: CashAssemblyCallSizingV1Error | undefined;
    try {
      sizeCashAssemblyCallsV1({
        quarters,
        cashBufferQuarters: 0,
        openingCashUsd: ZERO,
        unfundedEnvelopeRemainingUsd: LARGE_ENVELOPE,
      });
    } catch (error) {
      thrown = error as CashAssemblyCallSizingV1Error;
    }

    expect(thrown).toBeInstanceOf(CashAssemblyCallSizingV1Error);
    expect(thrown!.code).toBe('NEGATIVE_SCHEDULED_AMOUNT');
    expect(thrown!.context).toMatchObject({
      period: period('2026-04-01', '2026-06-30'),
      field: 'scheduledDeploymentUsd',
    });
  });
});
