import { describe, expect, it } from 'vitest';

import type { FundAccountingStateObservationV1_1 } from '../../../shared/contracts/internal-economics/fund-accounting-state-observation-v1.1.contract';
import {
  __testOnlyFoldDecimalWaterfallEventV1,
  __testOnlyProbeNonnegativeMoneyGuardsV1,
  __testOnlySerializeCoreDecimalV1,
  computeDecimalWaterfallAllocationV1,
  DECIMAL_WATERFALL_CORE_ENGINE_VERSION,
  DECIMAL_WATERFALL_CORE_METHODOLOGY_VERSION,
  DecimalWaterfallCoreV1Error,
  type DecimalWaterfallCoreV1ErrorCode,
  type DecimalWaterfallCoreV1Input,
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

function fixed(value: { toFixed(): string }): string {
  return value.toFixed();
}

function byteExact(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error('Expected a JSON-serializable waterfall result.');
  }
  return serialized;
}

function permutations<T>(values: readonly T[]): T[][] {
  if (values.length <= 1) return [[...values]];

  return values.flatMap((value, index) => {
    const remaining = [...values.slice(0, index), ...values.slice(index + 1)];
    return permutations(remaining).map((permutation) => [value, ...permutation]);
  });
}

function validInput(
  overrides: Partial<DecimalWaterfallCoreV1Input> = {}
): DecimalWaterfallCoreV1Input {
  return {
    carryRatio: '0.200000000000',
    hurdle: { basis: 'none' },
    openingState: openingState(),
    contributions: [],
    distributions: [],
    ...overrides,
  };
}

function mixedMultiPeriodInput(): DecimalWaterfallCoreV1Input {
  return validInput({
    openingState: openingState({
      cumulativeLpPaidInUsd: '30.000000',
      lpDistributionsProfitUsd: '5.000000',
      actualLpDistributionsCumulativeUsd: '5.000000',
      lpUnreturnedContributedCapitalUsd: '30.000000',
    }),
    contributions: [
      { sourceId: 'call-q3', periodIndex: 3, amountUsd: '40.000000' },
      { sourceId: 'call-q1', periodIndex: 1, amountUsd: '70.000000' },
      { sourceId: 'call-q2', periodIndex: 2, amountUsd: '10.000000' },
    ],
    distributions: [
      {
        sourceId: 'exit-q4-normal',
        periodIndex: 4,
        grossUsd: '200.000000',
        isTerminal: false,
      },
      {
        sourceId: 'exit-q2',
        periodIndex: 2,
        grossUsd: '50.000000',
        isTerminal: false,
      },
      {
        sourceId: 'a-exit-q4-terminal',
        periodIndex: 4,
        grossUsd: '20.000000',
        isTerminal: true,
      },
    ],
  });
}

function expectCoreError(
  run: () => unknown,
  code: DecimalWaterfallCoreV1ErrorCode
): DecimalWaterfallCoreV1Error {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(DecimalWaterfallCoreV1Error);
  if (!(caught instanceof DecimalWaterfallCoreV1Error)) {
    throw new Error(`Expected DecimalWaterfallCoreV1Error with code ${code}.`);
  }
  expect(caught.code).toBe(code);
  return caught;
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
  it('T0.8 converts a 1e-8 carry through the shared boundary by exact fixed notation', () => {
    const result = computeDecimalWaterfallAllocationV1({
      carryRatio: '0.010000000000',
      hurdle: { basis: 'none' },
      openingState: openingState(),
      contributions: [{ sourceId: 'call-1', periodIndex: 1, amountUsd: '0.999999' }],
      distributions: [
        {
          sourceId: 'exit-1',
          periodIndex: 2,
          grossUsd: '1.000000',
          isTerminal: false,
        },
      ],
    });

    const gpCarry = result.rows[0].gpCarry;
    const serialized = __testOnlySerializeCoreDecimalV1(gpCarry.toFixed());

    expect(gpCarry.constructor).toBe(SharedDecimal);
    expect(fixed(gpCarry)).toBe('0.00000001');
    expect(serialized).toBe('0.00000001');
    expect(serialized).not.toMatch(/[eE]/);
    expect(new SharedDecimal(serialized).eq(gpCarry)).toBe(true);
  });

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

  describe('T0.4 typed invariant errors', () => {
    it.each(['-0.100000000000', '1.000000000001', '0.2'])(
      'rejects invalid carry ratio %s',
      (carryRatio) => {
        expectCoreError(
          () => computeDecimalWaterfallAllocationV1(validInput({ carryRatio })),
          'CARRY_RATIO_INVALID'
        );
      }
    );

    it.each([
      ['negative amount', { amountUsd: '-1.000000' }],
      ['malformed amount', { amountUsd: '1' }],
      ['fractional periodIndex', { periodIndex: 1.5 }],
      ['negative periodIndex', { periodIndex: -1 }],
      ['empty sourceId', { sourceId: '' }],
      ['ceiling-exceeding amount', { amountUsd: '10000000000.000001' }],
    ] as const)('rejects contribution with %s', (_label, contributionOverride) => {
      expectCoreError(
        () =>
          computeDecimalWaterfallAllocationV1(
            validInput({
              contributions: [
                {
                  sourceId: 'call-1',
                  periodIndex: 1,
                  amountUsd: '1.000000',
                  ...contributionOverride,
                },
              ],
            })
          ),
        'EVENT_INPUT_INVALID'
      );
    });

    it('rejects non-boolean isTerminal', () => {
      const distributions = [
        {
          sourceId: 'exit-1',
          periodIndex: 1,
          grossUsd: '1.000000',
          isTerminal: 'false',
        },
      ] as unknown as DecimalWaterfallCoreV1Input['distributions'];

      const error = expectCoreError(
        () => computeDecimalWaterfallAllocationV1(validInput({ distributions })),
        'EVENT_INPUT_INVALID'
      );
      expect(error.context.field).toBe('isTerminal');
    });

    it('rejects a second terminal distribution', () => {
      const error = expectCoreError(
        () =>
          computeDecimalWaterfallAllocationV1(
            validInput({
              distributions: [
                {
                  sourceId: 'terminal-1',
                  periodIndex: 1,
                  grossUsd: '1.000000',
                  isTerminal: true,
                },
                {
                  sourceId: 'terminal-2',
                  periodIndex: 2,
                  grossUsd: '1.000000',
                  isTerminal: true,
                },
              ],
            })
          ),
        'EVENT_INPUT_INVALID'
      );
      expect(error.context).toMatchObject({ field: 'isTerminal', reason: 'duplicate' });
    });

    it.each([
      ['negative', '-1.000000'],
      ['malformed', '1'],
      ['ceiling-exceeding', '10000000000.000001'],
    ])('rejects %s opening-state money', (_label, cashBalanceUsd) => {
      const error = expectCoreError(
        () =>
          computeDecimalWaterfallAllocationV1(
            validInput({ openingState: openingState({ cashBalanceUsd }) })
          ),
        'OPENING_STATE_INVALID'
      );
      expect(error.context.field).toBe('cashBalanceUsd');
    });

    it('rejects duplicate source IDs across event classes', () => {
      expectCoreError(
        () =>
          computeDecimalWaterfallAllocationV1(
            validInput({
              contributions: [{ sourceId: 'duplicate', periodIndex: 1, amountUsd: '1.000000' }],
              distributions: [
                {
                  sourceId: 'duplicate',
                  periodIndex: 2,
                  grossUsd: '1.000000',
                  isTerminal: false,
                },
              ],
            })
          ),
        'DUPLICATE_EVENT_ID'
      );
    });

    it('rejects preference-bearing hurdles', () => {
      const input = validInput({
        hurdle: { basis: 'annualized_compound' } as unknown as { readonly basis: 'none' },
      });
      expectCoreError(
        () => computeDecimalWaterfallAllocationV1(input),
        'PREF_BEARING_UNSUPPORTED_V1'
      );
    });

    it('detects a corrupted accumulator that violates conservation', () => {
      expectCoreError(
        () =>
          __testOnlyFoldDecimalWaterfallEventV1({
            carryRatio: '0.200000000000',
            accumulator: {
              unreturnedCapital: '0',
              profitDistributed: '0',
              paidIn: '0',
              totalGross: '1',
              totalRoc: '0',
              totalLpProfit: '0',
              totalGpCarry: '0',
            },
            event: {
              kind: 'distribution',
              sourceId: 'exit-corrupt-conservation',
              periodIndex: 1,
              gross: '0',
              isTerminal: false,
            },
          }),
        'CONSERVATION_FAILED'
      );
    });

    it('detects a corrupted negative unreturned-capital accumulator', () => {
      expectCoreError(
        () =>
          __testOnlyFoldDecimalWaterfallEventV1({
            carryRatio: '0.200000000000',
            accumulator: {
              unreturnedCapital: '-1',
              profitDistributed: '0',
              paidIn: '0',
              totalGross: '0',
              totalRoc: '0',
              totalLpProfit: '0',
              totalGpCarry: '0',
            },
            event: {
              kind: 'distribution',
              sourceId: 'exit-corrupt-unreturned-capital',
              periodIndex: 1,
              gross: '0',
              isTerminal: false,
            },
          }),
        'UNRETURNED_CAPITAL_MONOTONICITY'
      );
    });
  });

  it('T0.5 preserves full 18dp allocation precision without core rounding', () => {
    const result = computeDecimalWaterfallAllocationV1({
      carryRatio: '0.123456789012',
      hurdle: { basis: 'none' },
      openingState: openingState(),
      contributions: [{ sourceId: 'call-1', periodIndex: 1, amountUsd: '0.000001' }],
      distributions: [
        {
          sourceId: 'exit-1',
          periodIndex: 2,
          grossUsd: '1.000000',
          isTerminal: false,
        },
      ],
    });

    expect({
      gross: fixed(result.rows[0].gross),
      roc: fixed(result.rows[0].roc),
      lpProfit: fixed(result.rows[0].lpProfit),
      gpCarry: fixed(result.rows[0].gpCarry),
      profitDistributedAfter: fixed(result.rows[0].profitDistributedAfter),
      totalLpProfit: fixed(result.totals.lpProfit),
      totalGpCarry: fixed(result.totals.gpCarry),
    }).toEqual({
      gross: '1',
      roc: '0.000001',
      lpProfit: '0.876542334444789012',
      gpCarry: '0.123456665555210988',
      profitDistributedAfter: '0.876542334444789012',
      totalLpProfit: '0.876542334444789012',
      totalGpCarry: '0.123456665555210988',
    });
  });

  describe('T0.7 ordering and determinism properties', () => {
    it('returns byte-identical output for every contribution and distribution permutation', () => {
      const input = mixedMultiPeriodInput();
      const expected = byteExact(computeDecimalWaterfallAllocationV1(input));

      for (const contributions of permutations(input.contributions)) {
        for (const distributions of permutations(input.distributions)) {
          const actual = computeDecimalWaterfallAllocationV1({
            ...input,
            contributions,
            distributions,
          });
          expect(byteExact(actual)).toBe(expected);
        }
      }
    });

    it('applies a same-period contribution before a distribution regardless of source order', () => {
      const result = computeDecimalWaterfallAllocationV1(
        validInput({
          contributions: [{ sourceId: 'z-call', periodIndex: 1, amountUsd: '100.000000' }],
          distributions: [
            {
              sourceId: 'a-exit',
              periodIndex: 1,
              grossUsd: '150.000000',
              isTerminal: false,
            },
          ],
        })
      );

      expect(fixed(result.rows[0].roc)).toBe('100');
      expect(fixed(result.rows[0].gpCarry)).toBe('10');
    });

    it('sorts a normal distribution before a same-period alphabetically earlier terminal event', () => {
      const result = computeDecimalWaterfallAllocationV1(
        validInput({
          openingState: openingState({
            cumulativeLpPaidInUsd: '100.000000',
            lpUnreturnedContributedCapitalUsd: '100.000000',
          }),
          distributions: [
            {
              sourceId: 'a-terminal',
              periodIndex: 1,
              grossUsd: '50.000000',
              isTerminal: true,
            },
            {
              sourceId: 'z-normal',
              periodIndex: 1,
              grossUsd: '150.000000',
              isTerminal: false,
            },
          ],
        })
      );

      expect(result.rows.map((row) => ({ sourceId: row.sourceId, roc: fixed(row.roc) }))).toEqual([
        { sourceId: 'z-normal', roc: '100' },
        { sourceId: 'a-terminal', roc: '0' },
      ]);
    });

    it('returns byte-identical output for two identical invocations', () => {
      const input = mixedMultiPeriodInput();

      expect(byteExact(computeDecimalWaterfallAllocationV1(input))).toBe(
        byteExact(computeDecimalWaterfallAllocationV1(input))
      );
    });

    it('matches every batch row to the row from its incrementally prefixed call', () => {
      const callQ1 = { sourceId: 'call-q1', periodIndex: 1, amountUsd: '100.000000' };
      const exitQ2 = {
        sourceId: 'exit-q2',
        periodIndex: 2,
        grossUsd: '60.000000',
        isTerminal: false,
      };
      const callQ3 = { sourceId: 'call-q3', periodIndex: 3, amountUsd: '25.000000' };
      const exitQ3 = {
        sourceId: 'exit-q3',
        periodIndex: 3,
        grossUsd: '80.000000',
        isTerminal: false,
      };
      const exitQ4 = {
        sourceId: 'exit-q4',
        periodIndex: 4,
        grossUsd: '50.000000',
        isTerminal: false,
      };
      const batch = computeDecimalWaterfallAllocationV1(
        validInput({
          contributions: [callQ3, callQ1],
          distributions: [exitQ4, exitQ2, exitQ3],
        })
      );
      const prefixes = [
        validInput({ contributions: [callQ1], distributions: [exitQ2] }),
        validInput({ contributions: [callQ3, callQ1], distributions: [exitQ2, exitQ3] }),
        validInput({
          contributions: [callQ3, callQ1],
          distributions: [exitQ4, exitQ2, exitQ3],
        }),
      ];
      const prefixedRows = prefixes.map((prefix) => {
        const rows = computeDecimalWaterfallAllocationV1(prefix).rows;
        return rows[rows.length - 1];
      });

      expect(prefixedRows.map(byteExact)).toEqual(batch.rows.map(byteExact));
    });
  });

  describe('T0.8 precision envelope', () => {
    it('matches a precision-100 reference for one max-ceiling multiplication', () => {
      const ReferenceDecimal = SharedDecimal.clone({
        precision: 100,
        rounding: SharedDecimal.ROUND_HALF_UP,
      });
      const maximumTenDigitMoney = '9999999999.999999';
      const carryRatio = '0.000000000001';
      const reference = new ReferenceDecimal(maximumTenDigitMoney).times(carryRatio);
      const result = computeDecimalWaterfallAllocationV1(
        validInput({
          carryRatio,
          distributions: [
            {
              sourceId: 'max-ceiling-exit',
              periodIndex: 1,
              grossUsd: maximumTenDigitMoney,
              isTerminal: false,
            },
          ],
        })
      );

      expect(fixed(result.rows[0].gpCarry)).toBe(reference.toFixed());
    });

    it('rejects an 11-integer-digit event before the fold', () => {
      const error = expectCoreError(
        () =>
          computeDecimalWaterfallAllocationV1(
            validInput({
              distributions: [
                {
                  sourceId: 'oversized-exit',
                  periodIndex: 1,
                  grossUsd: '10000000000.000000',
                  isTerminal: false,
                },
              ],
            })
          ),
        'EVENT_INPUT_INVALID'
      );

      expect(error.context).toMatchObject({
        field: 'grossUsd',
        sourceId: 'oversized-exit',
      });
    });

    it('keeps one million shared precision-28 cumulative additions bit-exact', () => {
      const ReferenceDecimal = SharedDecimal.clone({
        precision: 100,
        rounding: SharedDecimal.ROUND_HALF_UP,
      });
      const maximumTenDigitMoney = '9999999999.999999';
      const addend = new SharedDecimal(maximumTenDigitMoney);
      let actual = new SharedDecimal(0);

      for (let index = 0; index < 1_000_000; index += 1) {
        actual = actual.plus(addend);
      }

      const reference = new ReferenceDecimal(maximumTenDigitMoney).times(1_000_000);
      expect(actual.toFixed()).toBe(reference.toFixed());
    });
  });

  it('T6.6 accepts sign-flipped zero at every Decimal money nonnegativity guard', () => {
    const negativeZero = new SharedDecimal(0).neg();

    expect(negativeZero.isNegative()).toBe(true);
    expect(negativeZero.gte(0)).toBe(true);
    expect(__testOnlyProbeNonnegativeMoneyGuardsV1(negativeZero)).toEqual({
      accumulatorUnreturnedCapital: true,
      nextUnreturnedCapital: true,
    });
  });
});
