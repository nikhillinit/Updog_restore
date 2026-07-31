import { describe, expect, it } from 'vitest';

import type { FundAccountingStateObservationV1_1 } from '../../../shared/contracts/internal-economics/fund-accounting-state-observation-v1.1.contract';
import {
  computeDecimalWaterfallAllocationV1,
  DECIMAL_WATERFALL_CORE_ENGINE_VERSION,
  DECIMAL_WATERFALL_CORE_METHODOLOGY_VERSION,
} from '../../../shared/lib/internal-economics/decimal-waterfall-core-v1';

function openingState(
  overrides: Partial<FundAccountingStateObservationV1_1> = {}
): FundAccountingStateObservationV1_1 {
  return {
    contractVersion: 'fund-accounting-state-observation/1.1.0',
    cutoverInstant: '2026-06-30T23:59:59.000Z',
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
    accruedPreferredReturnThroughInstant: '2026-06-30T23:59:59.000Z',
    recallableDistributionsCumulativeUsd: '0.000000',
    recallableDistributionsOutstandingUsd: '0.000000',
    recycledProceedsCumulativeUsd: '0.000000',
    realizedProceedsCumulativeUsd: '0.000000',
    methodologyVersion: 'fund-accounting-methodology/1.0.0',
    lpUnreturnedContributedCapitalUsd: '0.000000',
    ...overrides,
  };
}

function money(value: { toFixed(decimalPlaces: number): string }): string {
  return value.toFixed(6);
}

describe('computeDecimalWaterfallAllocationV1', () => {
  it('T0.1 returns capital before applying carry to an over-distribution', () => {
    const result = computeDecimalWaterfallAllocationV1({
      carryRatio: '0.200000000000',
      hurdle: { basis: 'none' },
      openingState: openingState(),
      contributions: [{ sourceId: 'call-1', periodIndex: 1, amountUsd: '100.000000' }],
      distributions: [
        {
          sourceId: 'exit-1',
          periodIndex: 2,
          grossUsd: '200.000000',
          isTerminal: false,
        },
      ],
    });

    expect(result.engineVersion).toBe('decimal-waterfall-core-v1/1.0.0');
    expect(result.methodologyVersion).toBe('correct-unreturned-capital/1.0.0');
    expect(DECIMAL_WATERFALL_CORE_ENGINE_VERSION).toBe(result.engineVersion);
    expect(DECIMAL_WATERFALL_CORE_METHODOLOGY_VERSION).toBe(result.methodologyVersion);
    expect(result.rows).toHaveLength(1);
    expect({
      gross: money(result.rows[0].gross),
      roc: money(result.rows[0].roc),
      lpProfit: money(result.rows[0].lpProfit),
      gpCarry: money(result.rows[0].gpCarry),
      unreturnedCapitalAfter: money(result.rows[0].unreturnedCapitalAfter),
    }).toEqual({
      gross: '200.000000',
      roc: '100.000000',
      lpProfit: '80.000000',
      gpCarry: '20.000000',
      unreturnedCapitalAfter: '0.000000',
    });
    expect(
      result.rows[0].roc
        .plus(result.rows[0].lpProfit)
        .plus(result.rows[0].gpCarry)
        .eq(result.rows[0].gross)
    ).toBe(true);
    expect(money(result.totals.endingUnreturnedCapital)).toBe('0.000000');
  });

  it('T0.2 keeps opening unreturned capital independent from historical LP profit', () => {
    const result = computeDecimalWaterfallAllocationV1({
      carryRatio: '0.200000000000',
      hurdle: { basis: 'none' },
      openingState: openingState({
        cumulativeLpPaidInUsd: '60.000000',
        lpUnreturnedContributedCapitalUsd: '60.000000',
        lpDistributionsProfitUsd: '30.000000',
        actualLpDistributionsCumulativeUsd: '30.000000',
      }),
      contributions: [],
      distributions: [
        {
          sourceId: 'exit-1',
          periodIndex: 1,
          grossUsd: '100.000000',
          isTerminal: false,
        },
      ],
    });

    expect({
      roc: money(result.rows[0].roc),
      lpProfit: money(result.rows[0].lpProfit),
      gpCarry: money(result.rows[0].gpCarry),
      unreturnedCapitalAfter: money(result.rows[0].unreturnedCapitalAfter),
      profitDistributedAfter: money(result.rows[0].profitDistributedAfter),
    }).toEqual({
      roc: '60.000000',
      lpProfit: '32.000000',
      gpCarry: '8.000000',
      unreturnedCapitalAfter: '0.000000',
      profitDistributedAfter: '62.000000',
    });
  });

  it('T0.3 CORRECTED-LEGACY-04 replenishes unreturned capital after profit', () => {
    const result = computeDecimalWaterfallAllocationV1({
      carryRatio: '0.200000000000',
      hurdle: { basis: 'none' },
      openingState: openingState(),
      contributions: [
        { sourceId: 'call-q3', periodIndex: 3, amountUsd: '100.000000' },
        { sourceId: 'call-q1', periodIndex: 1, amountUsd: '100.000000' },
      ],
      distributions: [
        {
          sourceId: 'exit-q4',
          periodIndex: 4,
          grossUsd: '100.000000',
          isTerminal: false,
        },
        {
          sourceId: 'exit-q2',
          periodIndex: 2,
          grossUsd: '200.000000',
          isTerminal: false,
        },
      ],
    });

    expect(
      result.rows.map((row) => ({
        sourceId: row.sourceId,
        periodIndex: row.periodIndex,
        gross: money(row.gross),
        roc: money(row.roc),
        lpProfit: money(row.lpProfit),
        gpCarry: money(row.gpCarry),
        unreturnedCapitalAfter: money(row.unreturnedCapitalAfter),
        profitDistributedAfter: money(row.profitDistributedAfter),
      }))
    ).toEqual([
      {
        sourceId: 'exit-q2',
        periodIndex: 2,
        gross: '200.000000',
        roc: '100.000000',
        lpProfit: '80.000000',
        gpCarry: '20.000000',
        unreturnedCapitalAfter: '0.000000',
        profitDistributedAfter: '80.000000',
      },
      {
        sourceId: 'exit-q4',
        periodIndex: 4,
        gross: '100.000000',
        roc: '100.000000',
        lpProfit: '0.000000',
        gpCarry: '0.000000',
        unreturnedCapitalAfter: '0.000000',
        profitDistributedAfter: '80.000000',
      },
    ]);
    expect({
      openingUnreturnedCapital: money(result.totals.openingUnreturnedCapital),
      endingUnreturnedCapital: money(result.totals.endingUnreturnedCapital),
      paidIn: money(result.totals.paidIn),
      gross: money(result.totals.gross),
      roc: money(result.totals.roc),
      lpProfit: money(result.totals.lpProfit),
      gpCarry: money(result.totals.gpCarry),
    }).toEqual({
      openingUnreturnedCapital: '0.000000',
      endingUnreturnedCapital: '0.000000',
      paidIn: '200.000000',
      gross: '300.000000',
      roc: '200.000000',
      lpProfit: '80.000000',
      gpCarry: '20.000000',
    });
  });

  it('T0.3 CORRECTED-LEGACY-05 retains a final call in ending basis and paid-in', () => {
    const result = computeDecimalWaterfallAllocationV1({
      carryRatio: '0.200000000000',
      hurdle: { basis: 'none' },
      openingState: openingState(),
      contributions: [
        { sourceId: 'call-q3', periodIndex: 3, amountUsd: '50.000000' },
        { sourceId: 'call-q1', periodIndex: 1, amountUsd: '100.000000' },
      ],
      distributions: [
        {
          sourceId: 'exit-q2',
          periodIndex: 2,
          grossUsd: '100.000000',
          isTerminal: true,
        },
      ],
    });

    expect(
      result.rows.map((row) => ({
        sourceId: row.sourceId,
        periodIndex: row.periodIndex,
        gross: money(row.gross),
        roc: money(row.roc),
        lpProfit: money(row.lpProfit),
        gpCarry: money(row.gpCarry),
        unreturnedCapitalAfter: money(row.unreturnedCapitalAfter),
      }))
    ).toEqual([
      {
        sourceId: 'exit-q2',
        periodIndex: 2,
        gross: '100.000000',
        roc: '100.000000',
        lpProfit: '0.000000',
        gpCarry: '0.000000',
        unreturnedCapitalAfter: '0.000000',
      },
    ]);
    expect({
      openingUnreturnedCapital: money(result.totals.openingUnreturnedCapital),
      endingUnreturnedCapital: money(result.totals.endingUnreturnedCapital),
      paidIn: money(result.totals.paidIn),
      gross: money(result.totals.gross),
      roc: money(result.totals.roc),
      lpProfit: money(result.totals.lpProfit),
      gpCarry: money(result.totals.gpCarry),
    }).toEqual({
      openingUnreturnedCapital: '0.000000',
      endingUnreturnedCapital: '50.000000',
      paidIn: '150.000000',
      gross: '100.000000',
      roc: '100.000000',
      lpProfit: '0.000000',
      gpCarry: '0.000000',
    });
  });
});
