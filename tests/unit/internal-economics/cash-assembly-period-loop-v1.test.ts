import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import type { CurrentForecastSeriesPointV1 } from '../../../shared/contracts/current-forecast-v2.contract';
import type { FundAccountingStateObservationV1 } from '../../../shared/contracts/internal-economics/fund-accounting-state-observation-v1.contract';
import {
  FundAccountingStateObservationV1_1Schema,
  type FundAccountingStateObservationV1_1,
} from '../../../shared/contracts/internal-economics/fund-accounting-state-observation-v1.1.contract';
import {
  compareCanonicalUtcInstants,
  INTERNAL_ECONOMICS_TERMINAL_RESOLUTION_VERSION,
} from '../../../shared/contracts/internal-economics/terminal-policy-v1.contract';
import { Decimal } from '../../../shared/lib/decimal-config';
import {
  CashAssemblyCallSizingV1Error,
  type CallSizingQuarterNeedInputV1,
} from '../../../shared/lib/internal-economics/cash-assembly-call-sizing-v1';
import {
  CashAssemblyEventStreamInvariantError,
  type FactsCashAssemblyEventV1,
  type FactsCashAssemblyNavMarkV1,
  type FactsCashAssemblyPeriodNavV1,
} from '../../../shared/lib/internal-economics/cash-assembly-event-stream-v1';
import {
  CashAssemblyPeriodLoopV1Error,
  executeCashAssemblyPeriodLoopV1,
  type ExecuteCashAssemblyPeriodLoopV1Input,
} from '../../../shared/lib/internal-economics/cash-assembly-period-loop-v1';
import * as decimalWaterfallCore from '../../../shared/lib/internal-economics/decimal-waterfall-core-v1';
import {
  DecimalWaterfallCoreV1Error,
  computeDecimalWaterfallAllocationV1,
} from '../../../shared/lib/internal-economics/decimal-waterfall-core-v1';
import { processWaterfallRunForPresentation } from '../../../shared/lib/internal-economics/presentation-rounding-v1';
import type { CashAssemblyPeriodV1 } from '../../../shared/lib/internal-economics/cash-assembly-types-v1';

const ZERO_MONEY = '0.000000';
const ZERO_RATIO = '0.000000000000';

type OpeningStateOverrides = Partial<
  Omit<FundAccountingStateObservationV1_1, 'lpUnreturnedContributedCapitalUsd'>
>;

function openingState(overrides: OpeningStateOverrides = {}): FundAccountingStateObservationV1_1 {
  const cutoverInstant = overrides.cutoverInstant ?? '2025-12-31T23:59:59.999Z';

  return FundAccountingStateObservationV1_1Schema.parse({
    contractVersion: 'fund-accounting-state-observation/1.1.0',
    currency: 'USD',
    cashBalanceUsd: '0.000000',
    cumulativeLpPaidInUsd: '0.000000',
    cumulativeGpPaidInUsd: '0.000000',
    gpUnreturnedContributedCapitalUsd: '0.000000',
    lpDistributionsReturnOfCapitalUsd: '0.000000',
    lpDistributionsProfitUsd: '0.000000',
    actualLpDistributionsCumulativeUsd: '0.000000',
    gpInvestmentDistributionsPaidUsd: '0.000000',
    gpCarryPaidUsd: '0.000000',
    accruedPreferredReturnUsd: '0.000000',
    recallableDistributionsCumulativeUsd: '0.000000',
    recallableDistributionsOutstandingUsd: '0.000000',
    recycledProceedsCumulativeUsd: '0.000000',
    realizedProceedsCumulativeUsd: '0.000000',
    methodologyVersion: 'opening-state-methodology/1.0.0',
    ...overrides,
    cutoverInstant,
    accruedPreferredReturnThroughInstant:
      overrides.accruedPreferredReturnThroughInstant ?? cutoverInstant,
  });
}

function forecastPoint(
  periodStart: string,
  periodEnd: string,
  overrides: Partial<CurrentForecastSeriesPointV1> = {}
): CurrentForecastSeriesPointV1 {
  return {
    periodStart,
    periodEnd,
    source: 'projected',
    deployedUsd: ZERO_MONEY,
    contributionsUsd: ZERO_MONEY,
    distributionsUsd: ZERO_MONEY,
    navUsd: ZERO_MONEY,
    tvpi: ZERO_RATIO,
    dpi: ZERO_RATIO,
    activeCompanyCount: 0,
    projectedCohortCount: 0,
    ...overrides,
  };
}

function scheduledNeed(
  period: CashAssemblyPeriodV1,
  scheduledDeploymentUsd: string
): CallSizingQuarterNeedInputV1 {
  return {
    period,
    scheduledDeploymentUsd: new Decimal(scheduledDeploymentUsd),
    scheduledFeeUsd: new Decimal(0),
    scheduledExpenseUsd: new Decimal(0),
  };
}

function execute(input: {
  readonly forecastSeries: readonly CurrentForecastSeriesPointV1[];
  readonly scheduledNeeds: readonly CallSizingQuarterNeedInputV1[];
  readonly openingState?: FundAccountingStateObservationV1_1;
  readonly unfundedEnvelopeRemainingUsd?: string;
  readonly factsEvents?: readonly FactsCashAssemblyEventV1[];
  readonly factsNavMarks?: readonly FactsCashAssemblyNavMarkV1[];
  readonly factsPeriodNav?: readonly FactsCashAssemblyPeriodNavV1[];
  readonly carryPct?: number;
}) {
  const terminalPeriodEnd = input.forecastSeries.at(-1)!.periodEnd;

  return executeCashAssemblyPeriodLoopV1({
    factsSnapshotId: 101,
    forecastSnapshotId: 202,
    economicsPolicyVersion: 'economics-policy/1.0.0',
    engineVersion: 'cash-assembly-period-loop-v1/1.0.0',
    methodologyVersion: 'cash-assembly-period-loop-methodology/1.0.0',
    factsEvents: input.factsEvents ?? [],
    factsNavMarks: input.factsNavMarks ?? [],
    factsPeriodNav: input.factsPeriodNav ?? [],
    openingState: input.openingState ?? openingState(),
    forecastSeries: input.forecastSeries,
    scheduledNeeds: input.scheduledNeeds,
    cashBufferQuarters: 0,
    unfundedEnvelopeRemainingUsd: new Decimal(input.unfundedEnvelopeRemainingUsd ?? '100'),
    persistedTerminalResolution: {
      terminalPeriodEnd,
      terminalResolutionMethodologyVersion: INTERNAL_ECONOMICS_TERMINAL_RESOLUTION_VERSION,
    },
    terminalMode: 'hold_unrealized',
    carryPct: input.carryPct ?? 0.2,
  });
}

describe('cash assembly period loop v1 Phase 1', () => {
  it('T1.1 emits a minimal four-quarter hold path with nullable pre-paid-in ratios', () => {
    const periods = [
      ['2026-01-01', '2026-03-31'],
      ['2026-04-01', '2026-06-30'],
      ['2026-07-01', '2026-09-30'],
      ['2026-10-01', '2026-12-31'],
    ] as const;
    const forecastSeries = periods.map(([periodStart, periodEnd]) =>
      forecastPoint(periodStart, periodEnd)
    );
    const result = execute({
      forecastSeries,
      scheduledNeeds: forecastSeries.map((point) => scheduledNeed(point, ZERO_MONEY)),
      openingState: openingState({ cashBalanceUsd: '25.000000' }),
    });

    expect(result.quarters).toHaveLength(4);
    expect(result.quarters.map((quarter) => quarter.endingCashUsd)).toEqual([
      '25.000000',
      '25.000000',
      '25.000000',
      '25.000000',
    ]);
    expect(result.quarters.map((quarter) => quarter.lpCapitalCallUsd)).toEqual([
      ZERO_MONEY,
      ZERO_MONEY,
      ZERO_MONEY,
      ZERO_MONEY,
    ]);
    expect(result.quarters.every((quarter) => quarter.dpi === null)).toBe(true);
    expect(result.quarters.every((quarter) => quarter.rvpi === null)).toBe(true);
    expect(result.quarters.every((quarter) => quarter.tvpi === null)).toBe(true);
    expect(result.resultStatus).toBe('indicative');
    expect(result.resultStatusReasons).toEqual([
      'DECIMAL_CORE_UNCERTIFIED',
      'LP_NET_NAV_FLAT_SHARE_APPROXIMATION',
    ]);
  });

  it('T1.2 applies every single-quarter recurrence term in the required order', () => {
    const point = forecastPoint('2026-01-01', '2026-03-31', {
      deployedUsd: '30.000000',
      distributionsUsd: '12.000000',
      navUsd: '50.000000',
    });
    const result = execute({
      forecastSeries: [point],
      scheduledNeeds: [scheduledNeed(point, '30.000000')],
      openingState: openingState({ cashBalanceUsd: '10.000000' }),
    });

    expect(result.quarters).toEqual([
      expect.objectContaining({
        openingCashUsd: '10.000000',
        lpCapitalCallUsd: '20.000000',
        gpCommitmentCallUsd: ZERO_MONEY,
        portfolioDeploymentUsd: '30.000000',
        managementFeesUsd: ZERO_MONEY,
        fundExpensesUsd: ZERO_MONEY,
        grossRealizedProceedsUsd: '12.000000',
        lpDistributionUsd: '12.000000',
        gpInvestmentDistributionUsd: ZERO_MONEY,
        gpCarryDistributedUsd: ZERO_MONEY,
        endingCashUsd: ZERO_MONEY,
        grossNavUsd: '50.000000',
        lpNetNavUsd: '50.000000',
      }),
    ]);
  });

  it('rejects a scheduled deployment that differs from the forecast deployment delta', () => {
    const point = forecastPoint('2026-01-01', '2026-03-31', {
      deployedUsd: '10.000000',
    });
    const action = () =>
      execute({
        forecastSeries: [point],
        scheduledNeeds: [scheduledNeed(point, ZERO_MONEY)],
      });

    expect(action).toThrowError(CashAssemblyPeriodLoopV1Error);
    expect(action).toThrowError(
      expect.objectContaining({
        code: 'SCHEDULE_GRID_MISMATCH',
        context: {
          periodEnd: '2026-03-31',
          scheduledDeploymentUsd: ZERO_MONEY,
          forecastDeploymentDeltaUsd: '10.000000',
        },
      })
    );
  });

  it('T1.3 threads cash and preserves cumulative and envelope monotonicity', () => {
    const forecastSeries = [
      forecastPoint('2026-01-01', '2026-03-31', { deployedUsd: '10.000000' }),
      forecastPoint('2026-04-01', '2026-06-30', { deployedUsd: '25.000000' }),
      forecastPoint('2026-07-01', '2026-09-30', { deployedUsd: '30.000000' }),
    ];
    const scheduledNeeds = [
      scheduledNeed(forecastSeries[0]!, '10.000000'),
      scheduledNeed(forecastSeries[1]!, '15.000000'),
      scheduledNeed(forecastSeries[2]!, '5.000000'),
    ];
    const result = execute({
      forecastSeries,
      scheduledNeeds,
      openingState: openingState({ cashBalanceUsd: '5.000000' }),
      unfundedEnvelopeRemainingUsd: '40.000000',
    });

    expect(result.quarters.map((quarter) => quarter.openingCashUsd)).toEqual([
      '5.000000',
      ZERO_MONEY,
      ZERO_MONEY,
    ]);
    expect(result.quarters.map((quarter) => quarter.endingCashUsd)).toEqual([
      ZERO_MONEY,
      ZERO_MONEY,
      ZERO_MONEY,
    ]);
    expect(result.quarters[0]!.endingCashUsd).toBe(result.quarters[1]!.openingCashUsd);
    expect(result.quarters[1]!.endingCashUsd).toBe(result.quarters[2]!.openingCashUsd);
    expect(result.quarters.map((quarter) => quarter.cumulativeLpPaidInUsd)).toEqual([
      '5.000000',
      '20.000000',
      '25.000000',
    ]);
    expect(result.quarters.map((quarter) => quarter.cumulativeLpDistributedUsd)).toEqual([
      ZERO_MONEY,
      ZERO_MONEY,
      ZERO_MONEY,
    ]);

    const remainingEnvelope = result.quarters.map((quarter) =>
      new Decimal('40.000000').minus(quarter.cumulativeLpPaidInUsd).toFixed(6)
    );
    expect(remainingEnvelope).toEqual(['35.000000', '20.000000', '15.000000']);
  });

  it('regression: normalizes the initial envelope before monotonicity comparisons', () => {
    const point = forecastPoint('2026-01-01', '2026-03-31');

    expect(() =>
      execute({
        forecastSeries: [point],
        scheduledNeeds: [scheduledNeed(point, ZERO_MONEY)],
        unfundedEnvelopeRemainingUsd: '99.9999996',
      })
    ).not.toThrow();
  });

  it('regression: rounds the call-sizing envelope down before enforcing its ceiling', () => {
    const point = forecastPoint('2026-01-01', '2026-03-31', {
      deployedUsd: '100.000000',
    });
    const action = () =>
      execute({
        forecastSeries: [point],
        scheduledNeeds: [scheduledNeed(point, '100.000000')],
        unfundedEnvelopeRemainingUsd: '99.9999996',
      });

    expect(action).toThrowError(CashAssemblyCallSizingV1Error);
    expect(action).toThrowError(
      expect.objectContaining({
        code: 'COMMITTED_CAPITAL_EXCEEDED',
        context: expect.objectContaining({
          period: expect.objectContaining({
            periodStart: '2026-01-01',
            periodEnd: '2026-03-31',
          }),
          requestedCallUsd: '100.000000',
          remainingCapacityUsd: '99.999999',
          cumulativeCalledUsd: ZERO_MONEY,
        }),
      })
    );
  });

  it('regression: rejects duplicate projected periods before period-keyed maps can collapse them', () => {
    const duplicateA = forecastPoint('2026-01-01', '2026-03-31', {
      deployedUsd: '10.000000',
    });
    const duplicateB = forecastPoint('2026-01-01', '2026-03-31', {
      deployedUsd: '20.000000',
    });
    const terminal = forecastPoint('2026-04-01', '2026-06-30', {
      deployedUsd: '30.000000',
    });
    const action = () =>
      execute({
        forecastSeries: [duplicateA, duplicateB, terminal],
        scheduledNeeds: [
          scheduledNeed(duplicateA, '10.000000'),
          scheduledNeed(duplicateB, '10.000000'),
          scheduledNeed(terminal, '10.000000'),
        ],
      });

    expect(action).toThrowError(CashAssemblyEventStreamInvariantError);
    expect(action).toThrowError(/Duplicate canonical forecast event identity/);
  });
});

describe('cash assembly period loop v1 Phase 2', () => {
  it('T2.1 accepts facts before or exactly at cutover and rejects facts after cutover', () => {
    const actual = forecastPoint('2025-10-01', '2025-12-31', { source: 'actual' });
    const projected = forecastPoint('2026-01-01', '2026-03-31');
    const executeAt = (effectiveAt: string) => () =>
      execute({
        forecastSeries: [actual, projected],
        scheduledNeeds: [scheduledNeed(projected, ZERO_MONEY)],
        factsEvents: [
          {
            eventId: 1,
            eventType: 'realized_proceeds',
            effectiveAt,
            amountUsd: ZERO_MONEY,
          },
        ],
      });

    expect(executeAt('2025-12-31T23:59:59.998Z')).not.toThrow();
    expect(executeAt('2025-12-31T23:59:59.999Z')).not.toThrow();
    expect(executeAt('2026-01-01T00:00:00.000Z')).toThrowError(
      expect.objectContaining({ code: 'FACT_AFTER_CUTOVER' })
    );

    const executeNavMarkAt = (effectiveAt: string) => () =>
      execute({
        forecastSeries: [actual, projected],
        scheduledNeeds: [scheduledNeed(projected, ZERO_MONEY)],
        factsNavMarks: [{ markId: 2, effectiveAt, fairValueUsd: ZERO_MONEY }],
      });
    expect(executeNavMarkAt('2025-12-30')).not.toThrow();
    expect(executeNavMarkAt('2025-12-31')).not.toThrow();
    expect(executeNavMarkAt('2026-01-01')).toThrowError(
      expect.objectContaining({ code: 'FACT_AFTER_CUTOVER' })
    );

    const executePeriodNavAt = (periodEnd: string) => () =>
      execute({
        forecastSeries: [actual, projected],
        scheduledNeeds: [scheduledNeed(projected, ZERO_MONEY)],
        factsPeriodNav: [{ periodEnd, navUsd: ZERO_MONEY }],
      });
    expect(executePeriodNavAt('2025-12-30')).not.toThrow();
    expect(executePeriodNavAt('2025-12-31')).not.toThrow();
    expect(executePeriodNavAt('2026-01-01')).toThrowError(
      expect.objectContaining({ code: 'FACT_AFTER_CUTOVER' })
    );
  });

  it('T2.2 compares fractionally equivalent canonical UTC instants as equal', () => {
    const equivalentInstants = [
      '2025-12-31T23:59:59.999Z',
      '2025-12-31T23:59:59.9990Z',
      '2025-12-31T23:59:59.999000Z',
    ];

    for (const left of equivalentInstants) {
      for (const right of equivalentInstants) {
        expect(compareCanonicalUtcInstants(left, right)).toBe(0);
      }
    }

    const actual = forecastPoint('2025-10-01', '2025-12-31', { source: 'actual' });
    const projected = forecastPoint('2026-01-01', '2026-03-31');
    expect(() =>
      execute({
        forecastSeries: [actual, projected],
        scheduledNeeds: [scheduledNeed(projected, ZERO_MONEY)],
        openingState: openingState({
          cutoverInstant: '2025-12-31T23:59:59.9990Z',
        }),
        factsEvents: [
          {
            eventId: 1,
            eventType: 'realized_proceeds',
            effectiveAt: '2025-12-31T23:59:59.999Z',
            amountUsd: ZERO_MONEY,
          },
        ],
      })
    ).not.toThrow();
  });

  it('T2.3 rejects a partial projected period instead of splitting the forecast quarter', () => {
    const projected = forecastPoint('2026-01-01', '2026-03-31');
    const action = () =>
      execute({
        forecastSeries: [projected],
        scheduledNeeds: [scheduledNeed(projected, ZERO_MONEY)],
        openingState: openingState({ cutoverInstant: '2026-01-15T00:00:00.000Z' }),
      });

    expect(action).toThrowError(CashAssemblyPeriodLoopV1Error);
    expect(action).toThrowError(
      expect.objectContaining({
        code: 'PARTIAL_PROJECTED_PERIOD',
        context: expect.objectContaining({
          periodStart: '2026-01-01',
          periodEnd: '2026-03-31',
        }),
      })
    );
  });

  it('T2.4 rejects ineligible opening balances but allows historical GP carry provenance', () => {
    const projected = forecastPoint('2026-01-01', '2026-03-31');
    const ineligibleFields = [
      'cumulativeGpPaidInUsd',
      'gpUnreturnedContributedCapitalUsd',
      'gpInvestmentDistributionsPaidUsd',
      'accruedPreferredReturnUsd',
    ] as const;

    for (const field of ineligibleFields) {
      const action = () =>
        execute({
          forecastSeries: [projected],
          scheduledNeeds: [scheduledNeed(projected, ZERO_MONEY)],
          openingState: openingState({ [field]: '0.000001' }),
        });

      expect(action).toThrowError(
        expect.objectContaining({
          code: 'OPENING_STATE_INELIGIBLE',
          context: expect.objectContaining({ field }),
        })
      );
    }

    const carryProvenanceResult = execute({
      forecastSeries: [projected],
      scheduledNeeds: [scheduledNeed(projected, ZERO_MONEY)],
      openingState: openingState({ gpCarryPaidUsd: '5.000000' }),
    });
    expect(carryProvenanceResult.quarters[0]).toEqual(
      expect.objectContaining({
        lpDistributionUsd: ZERO_MONEY,
        cumulativeLpDistributedUsd: ZERO_MONEY,
      })
    );

    expect(() =>
      execute({
        forecastSeries: [projected],
        scheduledNeeds: [scheduledNeed(projected, ZERO_MONEY)],
        openingState: openingState({ cumulativeGpPaidInUsd: '0.000001' }),
        carryPct: Number.NaN,
      })
    ).toThrowError(expect.objectContaining({ code: 'OPENING_STATE_INELIGIBLE' }));
  });

  it('T2.5 reconciles all three historical LP cash categories with source-id context', () => {
    const actual = forecastPoint('2025-10-01', '2025-12-31', { source: 'actual' });
    const projected = forecastPoint('2026-01-01', '2026-03-31');
    expect(() =>
      execute({
        forecastSeries: [actual, projected],
        scheduledNeeds: [scheduledNeed(projected, ZERO_MONEY)],
        openingState: openingState({
          cumulativeLpPaidInUsd: '5.000000',
          lpDistributionsReturnOfCapitalUsd: '2.000000',
          lpDistributionsProfitUsd: '3.000000',
          actualLpDistributionsCumulativeUsd: '5.000000',
          recallableDistributionsCumulativeUsd: '1.000000',
        }),
        factsEvents: [
          {
            eventId: 4,
            eventType: 'lp_capital_call',
            effectiveAt: '2025-12-15T00:00:00.000Z',
            amountUsd: '3.000000',
          },
          {
            eventId: 2,
            eventType: 'lp_distribution',
            effectiveAt: '2025-11-15T00:00:00.000Z',
            amountUsd: '2.000000',
          },
          {
            eventId: 3,
            eventType: 'recallable_distribution',
            effectiveAt: '2025-10-20T00:00:00.000Z',
            amountUsd: '1.000000',
          },
          {
            eventId: 1,
            eventType: 'lp_capital_call',
            effectiveAt: '2025-10-15T00:00:00.000Z',
            amountUsd: '2.000000',
          },
          {
            eventId: 5,
            eventType: 'lp_distribution',
            effectiveAt: '2025-10-25T00:00:00.000Z',
            amountUsd: '2.000000',
          },
        ],
      })
    ).not.toThrow();

    const cases: readonly {
      category: string;
      openingState: FundAccountingStateObservationV1_1;
      factsEvents: readonly FactsCashAssemblyEventV1[];
      expectedUsd: string;
      actualUsd: string;
      firstSourceId: string;
      lastSourceId: string;
    }[] = [
      {
        category: 'lp_capital_call',
        openingState: openingState({ cumulativeLpPaidInUsd: '4.000000' }),
        factsEvents: [
          {
            eventId: 11,
            eventType: 'lp_capital_call',
            effectiveAt: '2025-10-15T00:00:00.000Z',
            amountUsd: '1.000000',
          },
          {
            eventId: 13,
            eventType: 'lp_capital_call',
            effectiveAt: '2025-12-15T00:00:00.000Z',
            amountUsd: '2.000000',
          },
        ],
        expectedUsd: '4.000000',
        actualUsd: '3.000000',
        firstSourceId: 'facts:101:cash_flow_event:11',
        lastSourceId: 'facts:101:cash_flow_event:13',
      },
      {
        category: 'lp_distribution',
        openingState: openingState({
          lpDistributionsProfitUsd: '4.000000',
          actualLpDistributionsCumulativeUsd: '4.000000',
          recallableDistributionsCumulativeUsd: '1.000000',
        }),
        factsEvents: [
          {
            eventId: 21,
            eventType: 'lp_distribution',
            effectiveAt: '2025-10-15T00:00:00.000Z',
            amountUsd: '1.000000',
          },
          {
            eventId: 22,
            eventType: 'recallable_distribution',
            effectiveAt: '2025-11-15T00:00:00.000Z',
            amountUsd: '1.000000',
          },
          {
            eventId: 23,
            eventType: 'lp_distribution',
            effectiveAt: '2025-12-15T00:00:00.000Z',
            amountUsd: '1.000000',
          },
        ],
        expectedUsd: '3.000000',
        actualUsd: '2.000000',
        firstSourceId: 'facts:101:cash_flow_event:21',
        lastSourceId: 'facts:101:cash_flow_event:23',
      },
      {
        category: 'recallable_distribution',
        openingState: openingState({
          lpDistributionsProfitUsd: '3.000000',
          actualLpDistributionsCumulativeUsd: '3.000000',
          recallableDistributionsCumulativeUsd: '3.000000',
        }),
        factsEvents: [
          {
            eventId: 31,
            eventType: 'recallable_distribution',
            effectiveAt: '2025-10-15T00:00:00.000Z',
            amountUsd: '1.000000',
          },
          {
            eventId: 33,
            eventType: 'recallable_distribution',
            effectiveAt: '2025-12-15T00:00:00.000Z',
            amountUsd: '1.000000',
          },
        ],
        expectedUsd: '3.000000',
        actualUsd: '2.000000',
        firstSourceId: 'facts:101:cash_flow_event:31',
        lastSourceId: 'facts:101:cash_flow_event:33',
      },
    ];

    for (const testCase of cases) {
      const action = () =>
        execute({
          forecastSeries: [actual, projected],
          scheduledNeeds: [scheduledNeed(projected, ZERO_MONEY)],
          openingState: testCase.openingState,
          factsEvents: testCase.factsEvents,
        });

      expect(action).toThrowError(
        expect.objectContaining({
          code: 'HISTORICAL_RECONCILIATION_MISMATCH',
          context: {
            category: testCase.category,
            expectedUsd: testCase.expectedUsd,
            actualUsd: testCase.actualUsd,
            firstSourceId: testCase.firstSourceId,
            lastSourceId: testCase.lastSourceId,
          },
        })
      );
    }
  });

  it('T2.6 requires a v1.1 opening observation at the loop type boundary', () => {
    expectTypeOf<FundAccountingStateObservationV1>().not.toMatchTypeOf<
      ExecuteCashAssemblyPeriodLoopV1Input['openingState']
    >();
  });
});

describe('cash assembly period loop v1 Phase 3', () => {
  it('T3.1 conserves every event after residual D-12 quantization and wires LP/GP quarter totals', () => {
    const forecastSeries = [
      forecastPoint('2026-01-01', '2026-03-31', { deployedUsd: '100.000000' }),
      forecastPoint('2026-04-01', '2026-06-30', {
        deployedUsd: '100.000000',
        distributionsUsd: '150.000000',
      }),
      forecastPoint('2026-07-01', '2026-09-30', {
        deployedUsd: '100.000000',
        distributionsUsd: '50.000000',
      }),
    ];
    const result = execute({
      forecastSeries,
      scheduledNeeds: [
        scheduledNeed(forecastSeries[0]!, '100.000000'),
        scheduledNeed(forecastSeries[1]!, ZERO_MONEY),
        scheduledNeed(forecastSeries[2]!, ZERO_MONEY),
      ],
      carryPct: 0.2,
    });

    expect(result.waterfallEvents).toEqual([
      {
        periodEnd: '2026-06-30',
        sourceId: 'forecast:202:quarter:2026-06-30:forecast_quarterly_distribution',
        grossDistributionUsd: '150.000000',
        lpCapitalReturnUsd: '100.000000',
        lpProfitUsd: '40.000000',
        gpInvestmentDistributionUsd: ZERO_MONEY,
        gpCarryUsd: '10.000000',
      },
      {
        periodEnd: '2026-09-30',
        sourceId: 'forecast:202:quarter:2026-09-30:forecast_quarterly_distribution',
        grossDistributionUsd: '50.000000',
        lpCapitalReturnUsd: ZERO_MONEY,
        lpProfitUsd: '40.000000',
        gpInvestmentDistributionUsd: ZERO_MONEY,
        gpCarryUsd: '10.000000',
      },
    ]);

    for (const event of result.waterfallEvents) {
      const gross = new Decimal(event.grossDistributionUsd);
      const roc = new Decimal(event.lpCapitalReturnUsd);
      const lpProfit = new Decimal(event.lpProfitUsd);
      const gpInvestment = new Decimal(event.gpInvestmentDistributionUsd);
      const carry = new Decimal(event.gpCarryUsd);
      expect(roc.plus(lpProfit).plus(gpInvestment).plus(carry).toFixed(6)).toBe(gross.toFixed(6));
      expect(
        gross
          .minus(roc)
          .times('0.200000000000')
          .toDecimalPlaces(6, Decimal.ROUND_HALF_UP)
          .toFixed(6)
      ).toBe(event.gpCarryUsd);
    }

    expect(result.quarters.map((quarter) => quarter.lpDistributionUsd)).toEqual([
      ZERO_MONEY,
      '140.000000',
      '40.000000',
    ]);
    expect(result.quarters.map((quarter) => quarter.gpCarryDistributedUsd)).toEqual([
      ZERO_MONEY,
      '10.000000',
      '10.000000',
    ]);
    expect(result.quarters.map((quarter) => quarter.cumulativeLpDistributedUsd)).toEqual([
      ZERO_MONEY,
      '140.000000',
      '180.000000',
    ]);
  });

  it('T3.2 seeds ROC from opening basis without creating calls, paid-in, or XIRR flows', () => {
    const actual = forecastPoint('2025-10-01', '2025-12-31', { source: 'actual' });
    const projected = forecastPoint('2026-01-01', '2026-03-31', {
      distributionsUsd: '100.000000',
    });
    const result = execute({
      forecastSeries: [actual, projected],
      scheduledNeeds: [scheduledNeed(projected, ZERO_MONEY)],
      openingState: openingState({
        cumulativeLpPaidInUsd: '100.000000',
        lpDistributionsReturnOfCapitalUsd: '40.000000',
        actualLpDistributionsCumulativeUsd: '40.000000',
      }),
      factsEvents: [
        {
          eventId: 1,
          eventType: 'lp_capital_call',
          effectiveAt: '2025-10-01T00:00:00.000Z',
          amountUsd: '100.000000',
        },
        {
          eventId: 2,
          eventType: 'lp_distribution',
          effectiveAt: '2025-12-01T00:00:00.000Z',
          amountUsd: '40.000000',
        },
      ],
    });

    expect(result.waterfallEvents).toEqual([
      expect.objectContaining({
        lpCapitalReturnUsd: '60.000000',
        lpProfitUsd: '32.000000',
        gpCarryUsd: '8.000000',
      }),
    ]);
    expect(result.quarters[0]).toEqual(
      expect.objectContaining({
        lpCapitalCallUsd: ZERO_MONEY,
        cumulativeLpPaidInUsd: '100.000000',
        lpDistributionUsd: '92.000000',
      })
    );
    expect(result.waterfallEvents.every((event) => !event.sourceId.startsWith('facts:'))).toBe(
      true
    );
    expect(result.lpNetIrr).toBeNull();
    expect(result.xirrDiagnostic.failureReason).toBe('INSUFFICIENT_CASH_FLOWS');
  });

  it('T3.3 joins equal-gross rows by sourceId and orders terminal realization after normal exits', () => {
    const equalGross = computeDecimalWaterfallAllocationV1({
      carryRatio: '0.200000000000',
      hurdle: { basis: 'none' },
      openingState: openingState({ cumulativeLpPaidInUsd: '100.000000' }),
      contributions: [],
      distributions: [
        { sourceId: 'z-normal', periodIndex: 0, grossUsd: '75.000000', isTerminal: false },
        { sourceId: 'a-normal', periodIndex: 0, grossUsd: '75.000000', isTerminal: false },
      ],
    });
    expect(
      equalGross.rows.map((row) => ({ sourceId: row.sourceId, roc: row.roc.toFixed(6) }))
    ).toEqual([
      { sourceId: 'a-normal', roc: '75.000000' },
      { sourceId: 'z-normal', roc: '25.000000' },
    ]);

    const terminalOrdering = computeDecimalWaterfallAllocationV1({
      carryRatio: '0.200000000000',
      hurdle: { basis: 'none' },
      openingState: openingState({ cumulativeLpPaidInUsd: '100.000000' }),
      contributions: [],
      distributions: [
        { sourceId: 'a-terminal', periodIndex: 0, grossUsd: '50.000000', isTerminal: true },
        { sourceId: 'z-normal', periodIndex: 0, grossUsd: '150.000000', isTerminal: false },
      ],
    });
    expect(
      terminalOrdering.rows.map((row) => ({ sourceId: row.sourceId, roc: row.roc.toFixed(6) }))
    ).toEqual([
      { sourceId: 'z-normal', roc: '100.000000' },
      { sourceId: 'a-terminal', roc: ZERO_MONEY },
    ]);

    const projected = forecastPoint('2026-01-01', '2026-03-31', {
      distributionsUsd: '1.000000',
    });
    const coreSpy = vi.spyOn(decimalWaterfallCore, 'computeDecimalWaterfallAllocationV1');
    try {
      const result = execute({
        forecastSeries: [projected],
        scheduledNeeds: [scheduledNeed(projected, ZERO_MONEY)],
      });
      expect(coreSpy).toHaveBeenCalledOnce();
      const coreInput = coreSpy.mock.calls[0]![0];
      expect(coreInput.distributions).toEqual([
        {
          sourceId: 'forecast:202:quarter:2026-03-31:forecast_quarterly_distribution',
          periodIndex: 0,
          grossUsd: '1.000000',
          isTerminal: false,
        },
      ]);
      expect(
        coreInput.distributions.every(
          (event) => event.isTerminal === false && !event.sourceId.endsWith(':terminal_liquidation')
        )
      ).toBe(true);
      expect(result.waterfallEvents.map((event) => event.sourceId)).toEqual(
        coreInput.distributions.map((event) => event.sourceId)
      );
    } finally {
      coreSpy.mockRestore();
    }
  });

  it('T3.4 keeps LP profit nonnegative at the tight residual-quantization boundary', () => {
    const actual = forecastPoint('2025-10-01', '2025-12-31', { source: 'actual' });
    const projected = forecastPoint('2026-01-01', '2026-03-31', {
      distributionsUsd: '1.000000',
    });
    const result = execute({
      forecastSeries: [actual, projected],
      scheduledNeeds: [scheduledNeed(projected, ZERO_MONEY)],
      openingState: openingState({ cumulativeLpPaidInUsd: '0.999999' }),
      factsEvents: [
        {
          eventId: 1,
          eventType: 'lp_capital_call',
          effectiveAt: '2025-12-01T00:00:00.000Z',
          amountUsd: '0.999999',
        },
      ],
      carryPct: 0.999999,
    });

    expect(result.waterfallEvents).toEqual([
      expect.objectContaining({
        grossDistributionUsd: '1.000000',
        lpCapitalReturnUsd: '0.999999',
        lpProfitUsd: ZERO_MONEY,
        gpCarryUsd: '0.000001',
      }),
    ]);
    expect(new Decimal(result.waterfallEvents[0]!.lpProfitUsd).gte(0)).toBe(true);
  });

  it('T3.5 emits byte-identical waterfall prefixes for every loop prefix', () => {
    const fullForecast = [
      forecastPoint('2026-01-01', '2026-03-31', {
        deployedUsd: '100.000000',
        distributionsUsd: '60.000000',
      }),
      forecastPoint('2026-04-01', '2026-06-30', {
        deployedUsd: '125.000000',
        distributionsUsd: '80.000000',
      }),
      forecastPoint('2026-07-01', '2026-09-30', {
        deployedUsd: '125.000000',
        distributionsUsd: '50.000000',
      }),
    ];
    const fullNeeds = [
      scheduledNeed(fullForecast[0]!, '100.000000'),
      scheduledNeed(fullForecast[1]!, '25.000000'),
      scheduledNeed(fullForecast[2]!, ZERO_MONEY),
    ];
    const full = execute({
      forecastSeries: fullForecast,
      scheduledNeeds: fullNeeds,
      unfundedEnvelopeRemainingUsd: '200.000000',
    });
    expect(full.waterfallEvents).toHaveLength(3);

    for (let count = 1; count <= fullForecast.length; count += 1) {
      const prefix = execute({
        forecastSeries: fullForecast.slice(0, count),
        scheduledNeeds: fullNeeds.slice(0, count),
        unfundedEnvelopeRemainingUsd: '200.000000',
      });
      expect(JSON.stringify(prefix.waterfallEvents)).toBe(
        JSON.stringify(full.waterfallEvents.slice(0, count))
      );
    }
  });

  it('T3.6 propagates core opening-state errors without wrapping', () => {
    const projected = forecastPoint('2026-01-01', '2026-03-31');
    const malformedOpeningState = {
      ...openingState(),
      lpDistributionsProfitUsd: 'malformed',
    } as FundAccountingStateObservationV1_1;

    let caught: unknown;
    try {
      execute({
        forecastSeries: [projected],
        scheduledNeeds: [scheduledNeed(projected, ZERO_MONEY)],
        openingState: malformedOpeningState,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(DecimalWaterfallCoreV1Error);
    expect(caught).toMatchObject({
      name: 'DecimalWaterfallCoreV1Error',
      code: 'OPENING_STATE_INVALID',
    });
    expect(caught).not.toBeInstanceOf(CashAssemblyPeriodLoopV1Error);
  });

  it('T3.8 sends projected distributions and calls, never historical distributions, to the core', () => {
    const actual = forecastPoint('2025-10-01', '2025-12-31', { source: 'actual' });
    const projected = forecastPoint('2026-01-01', '2026-03-31', {
      deployedUsd: '25.000000',
      distributionsUsd: '75.000000',
    });
    const coreSpy = vi.spyOn(decimalWaterfallCore, 'computeDecimalWaterfallAllocationV1');
    try {
      const result = execute({
        forecastSeries: [actual, projected],
        scheduledNeeds: [scheduledNeed(projected, '25.000000')],
        openingState: openingState({
          cumulativeLpPaidInUsd: '100.000000',
          lpDistributionsReturnOfCapitalUsd: '50.000000',
          actualLpDistributionsCumulativeUsd: '50.000000',
        }),
        factsEvents: [
          {
            eventId: 1,
            eventType: 'lp_capital_call',
            effectiveAt: '2025-10-01T00:00:00.000Z',
            amountUsd: '100.000000',
          },
          {
            eventId: 2,
            eventType: 'lp_distribution',
            effectiveAt: '2025-12-01T00:00:00.000Z',
            amountUsd: '50.000000',
          },
        ],
      });

      expect(coreSpy).toHaveBeenCalledOnce();
      const coreInput = coreSpy.mock.calls[0]![0];
      expect(coreInput.contributions).toEqual([
        {
          sourceId: 'forecast:202:quarter:2026-03-31:lp_capital_call',
          periodIndex: 0,
          amountUsd: '25.000000',
        },
      ]);
      expect(coreInput.distributions.map((event) => event.sourceId)).toEqual([
        'forecast:202:quarter:2026-03-31:forecast_quarterly_distribution',
      ]);
      expect(coreInput.distributions.every((event) => !event.sourceId.startsWith('facts:'))).toBe(
        true
      );
      expect(result.waterfallEvents.map((event) => event.sourceId)).toEqual(
        coreInput.distributions.map((event) => event.sourceId)
      );
    } finally {
      coreSpy.mockRestore();
    }
  });

  it('T3.10 preserves the LP-first exact-remainder tie at the D1 validation boundary', () => {
    const projected = forecastPoint('2026-01-01', '2026-03-31', {
      distributionsUsd: '0.010000',
    });
    const result = execute({
      forecastSeries: [projected],
      scheduledNeeds: [scheduledNeed(projected, ZERO_MONEY)],
      carryPct: 0.5,
    });
    const event = result.waterfallEvents[0]!;
    const rounded = processWaterfallRunForPresentation([
      {
        totalUsd: new Decimal(event.grossDistributionUsd),
        rocUsd: new Decimal(event.lpCapitalReturnUsd),
        preferredReturnUsd: new Decimal(0),
        lpResidualUsd: new Decimal(event.lpProfitUsd),
        gpCarryUsd: new Decimal(event.gpCarryUsd),
      },
    ]);

    expect(event).toEqual(
      expect.objectContaining({
        lpProfitUsd: '0.005000',
        gpCarryUsd: '0.005000',
      })
    );
    expect(rounded.events[0]).toEqual({
      totalCents: '1',
      rocCents: '0',
      preferredReturnCents: '0',
      lpResidualCents: '1',
      gpCarryCents: '0',
    });
  });

  it('T3.11 pins the loop to hurdle none while the core refuses preference-bearing inputs', () => {
    const projected = forecastPoint('2026-01-01', '2026-03-31', {
      distributionsUsd: '1.000000',
    });
    const coreSpy = vi.spyOn(decimalWaterfallCore, 'computeDecimalWaterfallAllocationV1');
    try {
      execute({
        forecastSeries: [projected],
        scheduledNeeds: [scheduledNeed(projected, ZERO_MONEY)],
      });
      expect(coreSpy).toHaveBeenCalledOnce();
      expect(coreSpy.mock.calls[0]![0].hurdle).toEqual({ basis: 'none' });
    } finally {
      coreSpy.mockRestore();
    }

    expect(() =>
      computeDecimalWaterfallAllocationV1({
        carryRatio: '0.200000000000',
        hurdle: { basis: 'annualized_compound' } as unknown as { readonly basis: 'none' },
        openingState: openingState(),
        contributions: [],
        distributions: [],
      })
    ).toThrowError(
      expect.objectContaining({
        name: 'DecimalWaterfallCoreV1Error',
        code: 'PREF_BEARING_UNSUPPORTED_V1',
      })
    );
  });
});
