import { describe, expect, it } from 'vitest';

import type { FundAccountingStateObservationV1_1 } from '../../../shared/contracts/internal-economics/fund-accounting-state-observation-v1.1.contract';
import {
  computeDecimalWaterfallAllocationV1,
  DECIMAL_WATERFALL_CORE_ENGINE_VERSION,
  DECIMAL_WATERFALL_CORE_METHODOLOGY_VERSION,
  DecimalWaterfallCoreV1Error,
  type DecimalWaterfallCoreV1Result,
} from '../../../shared/lib/internal-economics/decimal-waterfall-core-v1';
import { Decimal as SharedDecimal } from '../../../shared/lib/decimal-config';

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

function exact(value: { toString(): string }): string {
  return value.toString();
}

function expectSharedDecimalBoundaries(result: DecimalWaterfallCoreV1Result): void {
  for (const row of result.rows) {
    for (const value of [
      row.gross,
      row.roc,
      row.lpProfit,
      row.gpCarry,
      row.unreturnedCapitalAfter,
      row.profitDistributedAfter,
    ]) {
      expect(value.constructor).toBe(SharedDecimal);
    }
  }

  for (const value of [
    result.totals.openingUnreturnedCapital,
    result.totals.endingUnreturnedCapital,
    result.totals.paidIn,
    result.totals.gross,
    result.totals.roc,
    result.totals.lpProfit,
    result.totals.gpCarry,
  ]) {
    expect(value.constructor).toBe(SharedDecimal);
  }
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
      gross: exact(result.rows[0].gross),
      roc: exact(result.rows[0].roc),
      lpProfit: exact(result.rows[0].lpProfit),
      gpCarry: exact(result.rows[0].gpCarry),
      unreturnedCapitalAfter: exact(result.rows[0].unreturnedCapitalAfter),
    }).toEqual({
      gross: '200',
      roc: '100',
      lpProfit: '80',
      gpCarry: '20',
      unreturnedCapitalAfter: '0',
    });
    expect(
      result.rows[0].roc
        .plus(result.rows[0].lpProfit)
        .plus(result.rows[0].gpCarry)
        .eq(result.rows[0].gross)
    ).toBe(true);
    expect(exact(result.totals.endingUnreturnedCapital)).toBe('0');
    expectSharedDecimalBoundaries(result);
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
      roc: exact(result.rows[0].roc),
      lpProfit: exact(result.rows[0].lpProfit),
      gpCarry: exact(result.rows[0].gpCarry),
      unreturnedCapitalAfter: exact(result.rows[0].unreturnedCapitalAfter),
      profitDistributedAfter: exact(result.rows[0].profitDistributedAfter),
      paidIn: exact(result.totals.paidIn),
    }).toEqual({
      roc: '60',
      lpProfit: '32',
      gpCarry: '8',
      unreturnedCapitalAfter: '0',
      profitDistributedAfter: '62',
      paidIn: '60',
    });
    expectSharedDecimalBoundaries(result);
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
        gross: exact(row.gross),
        roc: exact(row.roc),
        lpProfit: exact(row.lpProfit),
        gpCarry: exact(row.gpCarry),
        unreturnedCapitalAfter: exact(row.unreturnedCapitalAfter),
        profitDistributedAfter: exact(row.profitDistributedAfter),
      }))
    ).toEqual([
      {
        sourceId: 'exit-q2',
        periodIndex: 2,
        gross: '200',
        roc: '100',
        lpProfit: '80',
        gpCarry: '20',
        unreturnedCapitalAfter: '0',
        profitDistributedAfter: '80',
      },
      {
        sourceId: 'exit-q4',
        periodIndex: 4,
        gross: '100',
        roc: '100',
        lpProfit: '0',
        gpCarry: '0',
        unreturnedCapitalAfter: '0',
        profitDistributedAfter: '80',
      },
    ]);
    expect({
      openingUnreturnedCapital: exact(result.totals.openingUnreturnedCapital),
      endingUnreturnedCapital: exact(result.totals.endingUnreturnedCapital),
      paidIn: exact(result.totals.paidIn),
      gross: exact(result.totals.gross),
      roc: exact(result.totals.roc),
      lpProfit: exact(result.totals.lpProfit),
      gpCarry: exact(result.totals.gpCarry),
    }).toEqual({
      openingUnreturnedCapital: '0',
      endingUnreturnedCapital: '0',
      paidIn: '200',
      gross: '300',
      roc: '200',
      lpProfit: '80',
      gpCarry: '20',
    });
    expectSharedDecimalBoundaries(result);
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
          isTerminal: false,
        },
      ],
    });

    expect(
      result.rows.map((row) => ({
        sourceId: row.sourceId,
        periodIndex: row.periodIndex,
        gross: exact(row.gross),
        roc: exact(row.roc),
        lpProfit: exact(row.lpProfit),
        gpCarry: exact(row.gpCarry),
        unreturnedCapitalAfter: exact(row.unreturnedCapitalAfter),
      }))
    ).toEqual([
      {
        sourceId: 'exit-q2',
        periodIndex: 2,
        gross: '100',
        roc: '100',
        lpProfit: '0',
        gpCarry: '0',
        unreturnedCapitalAfter: '0',
      },
    ]);
    expect({
      openingUnreturnedCapital: exact(result.totals.openingUnreturnedCapital),
      endingUnreturnedCapital: exact(result.totals.endingUnreturnedCapital),
      paidIn: exact(result.totals.paidIn),
      gross: exact(result.totals.gross),
      roc: exact(result.totals.roc),
      lpProfit: exact(result.totals.lpProfit),
      gpCarry: exact(result.totals.gpCarry),
    }).toEqual({
      openingUnreturnedCapital: '0',
      endingUnreturnedCapital: '50',
      paidIn: '150',
      gross: '100',
      roc: '100',
      lpProfit: '0',
      gpCarry: '0',
    });
    expectSharedDecimalBoundaries(result);
  });

  it('classifies repeated terminal source IDs as duplicate event IDs', () => {
    expect.assertions(2);

    try {
      computeDecimalWaterfallAllocationV1({
        carryRatio: '0.200000000000',
        hurdle: { basis: 'none' },
        openingState: openingState(),
        contributions: [],
        distributions: [
          {
            sourceId: 'terminal-duplicate',
            periodIndex: 1,
            grossUsd: '0.000000',
            isTerminal: true,
          },
          {
            sourceId: 'terminal-duplicate',
            periodIndex: 2,
            grossUsd: '0.000000',
            isTerminal: true,
          },
        ],
      });
    } catch (error) {
      expect(error).toBeInstanceOf(DecimalWaterfallCoreV1Error);
      expect((error as DecimalWaterfallCoreV1Error).code).toBe('DUPLICATE_EVENT_ID');
    }
  });
});
