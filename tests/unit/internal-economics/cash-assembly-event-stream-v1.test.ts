import { describe, expect, it } from 'vitest';

import type { CurrentForecastSeriesPointV1 } from '../../../shared/contracts/current-forecast-v2.contract';
import { INTERNAL_ECONOMICS_TERMINAL_RESOLUTION_VERSION } from '../../../shared/contracts/internal-economics/terminal-policy-v1.contract';
import {
  CashAssemblyEventStreamV1Error,
  CashAssemblyEventStreamInvariantError,
  assembleCashEventStreamV1,
  type FactsCashAssemblyEventV1,
} from '../../../shared/lib/internal-economics/cash-assembly-event-stream-v1';
import type { CashAssemblyPeriodV1 } from '../../../shared/lib/internal-economics/cash-assembly-types-v1';
import { assertEveryPermutationProducesByteIdenticalResult } from '../../helpers/multi-event-independence-fixtures';

const ZERO_MONEY = '0.000000';
const ZERO_RATIO = '0.000000000000';
const persistedTerminalResolution = {
  terminalPeriodEnd: '2026-06-30',
  terminalResolutionMethodologyVersion: INTERNAL_ECONOMICS_TERMINAL_RESOLUTION_VERSION,
} as const;

const periodGrid: CashAssemblyPeriodV1[] = [
  {
    periodStart: '2026-01-01',
    periodEnd: '2026-03-31',
    source: 'actual',
  },
  {
    periodStart: '2026-04-01',
    periodEnd: '2026-06-30',
    source: 'projected',
  },
];

function forecastPoint(
  periodStart: string,
  periodEnd: string,
  source: 'actual' | 'projected',
  overrides: Partial<CurrentForecastSeriesPointV1> = {}
): CurrentForecastSeriesPointV1 {
  return {
    periodStart,
    periodEnd,
    source,
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

function assemble(
  factsEvents: readonly FactsCashAssemblyEventV1[],
  forecastSeries: readonly CurrentForecastSeriesPointV1[],
  overrides: Partial<
    Pick<
      Parameters<typeof assembleCashEventStreamV1>[0],
      'factsNavMarks' | 'factsPeriodNav' | 'terminalMode'
    >
  > = {}
) {
  return assembleCashEventStreamV1({
    factsSnapshotId: 11,
    forecastSnapshotId: 22,
    factsEvents,
    factsNavMarks: [],
    factsPeriodNav: [],
    forecastSeries,
    periodGrid,
    persistedTerminalResolution,
    terminalMode: 'hold_unrealized',
    ...overrides,
  });
}

describe('cash assembly event stream v1', () => {
  it('merges facts and forecast distributions into one canonical stream bucketed by quarter', () => {
    const result = assemble(
      [
        {
          eventId: 1,
          eventType: 'lp_capital_call',
          effectiveAt: '2026-01-15T00:00:00.000Z',
          amountUsd: '100.000000',
        },
        {
          eventId: 7,
          eventType: 'realized_proceeds',
          effectiveAt: '2026-06-30T23:59:59.999Z',
          amountUsd: '15.000000',
        },
      ],
      [
        forecastPoint('2026-04-01', '2026-06-30', 'projected', {
          distributionsUsd: '20.000000',
        }),
        forecastPoint('2026-01-01', '2026-03-31', 'actual'),
        forecastPoint('2026-07-01', '2026-09-30', 'projected', {
          distributionsUsd: '30.000000',
        }),
      ]
    );

    expect(result.events.map((event) => event.stableSourceId)).toEqual([
      'facts:11:cash_flow_event:1',
      'facts:11:cash_flow_event:7',
      'forecast:22:quarter:2026-06-30:forecast_quarterly_distribution',
    ]);
    expect(result.events[2]).toMatchObject({
      eventType: 'forecast_quarterly_distribution',
      effectiveAt: '2026-06-30T23:59:59.999Z',
      eventClassPriority: 4,
      amountUsd: '20.000000',
    });
    expect(result.buckets.map((bucket) => bucket.events.length)).toEqual([1, 2]);
    expect(result.buckets[1]?.events).toEqual(result.events.slice(1));
  });

  it('produces byte-identical assembled output for every mixed input permutation', () => {
    type MixedInput =
      | { source: 'facts'; event: FactsCashAssemblyEventV1 }
      | { source: 'forecast'; point: CurrentForecastSeriesPointV1 };

    const inputs: MixedInput[] = [
      {
        source: 'facts',
        event: {
          eventId: 3,
          eventType: 'lp_distribution',
          effectiveAt: '2026-06-30T23:59:59.999Z',
          amountUsd: '5.000000',
        },
      },
      {
        source: 'facts',
        event: {
          eventId: 2,
          eventType: 'realized_proceeds',
          effectiveAt: '2026-06-30T23:59:59.999Z',
          amountUsd: '10.000000',
        },
      },
      {
        source: 'forecast',
        point: forecastPoint('2026-04-01', '2026-06-30', 'projected', {
          distributionsUsd: '20.000000',
        }),
      },
      {
        source: 'forecast',
        point: forecastPoint('2026-01-01', '2026-03-31', 'actual'),
      },
    ];

    const result = assertEveryPermutationProducesByteIdenticalResult(inputs, (permutation) =>
      assemble(
        permutation.flatMap((input) => (input.source === 'facts' ? [input.event] : [])),
        permutation.flatMap((input) => (input.source === 'forecast' ? [input.point] : []))
      )
    );

    expect(result.events.map((event) => event.stableSourceId)).toEqual([
      'facts:11:cash_flow_event:2',
      'forecast:22:quarter:2026-06-30:forecast_quarterly_distribution',
      'facts:11:cash_flow_event:3',
    ]);
  });

  it.each([
    {
      name: 'facts cash-flow amount',
      factsEvents: [
        {
          eventId: 1,
          eventType: 'lp_capital_call',
          effectiveAt: '2026-01-15T00:00:00.000Z',
          amountUsd: '-0.000001',
        },
      ] satisfies FactsCashAssemblyEventV1[],
      forecastSeries: [forecastPoint('2026-01-01', '2026-03-31', 'actual')],
    },
    {
      name: 'forecast source amount',
      factsEvents: [] satisfies FactsCashAssemblyEventV1[],
      forecastSeries: [
        forecastPoint('2026-01-01', '2026-03-31', 'actual', {
          navUsd: '-0.000001',
        }),
      ],
    },
  ])('rejects negative $name with NEGATIVE_SOURCE_MONEY', ({ factsEvents, forecastSeries }) => {
    const action = () => assemble(factsEvents, forecastSeries);

    expect(action).toThrowError(CashAssemblyEventStreamV1Error);
    expect(action).toThrowError(expect.objectContaining({ code: 'NEGATIVE_SOURCE_MONEY' }));
  });

  it('rejects decreasing cumulative forecast deployment', () => {
    const action = () =>
      assemble(
        [],
        [
          forecastPoint('2026-01-01', '2026-03-31', 'actual', {
            deployedUsd: '10.000000',
          }),
          forecastPoint('2026-04-01', '2026-06-30', 'projected', {
            deployedUsd: '9.999999',
          }),
        ]
      );

    expect(action).toThrowError(CashAssemblyEventStreamV1Error);
    expect(action).toThrowError(
      expect.objectContaining({ code: 'FORECAST_DEPLOYMENT_CUMULATIVE_DECREASE' })
    );
  });

  it('rejects prohibited post-term facts activity through the terminal matrix', () => {
    const action = () =>
      assemble(
        [
          {
            eventId: 1,
            eventType: 'realized_proceeds',
            effectiveAt: '2026-07-01T00:00:00.000Z',
            amountUsd: '1.000000',
          },
        ],
        [forecastPoint('2026-01-01', '2026-03-31', 'actual')]
      );

    expect(action).toThrowError(CashAssemblyEventStreamV1Error);
    expect(action).toThrowError(expect.objectContaining({ code: 'POST_TERM_ACTIVITY' }));
  });

  it.each(['liquidate_at_horizon', 'hold_unrealized'] as const)(
    'rejects zero and nonzero post-term actual NAV observations in %s mode',
    (terminalMode) => {
      const zeroPeriodNav = () =>
        assemble(
          [],
          [
            forecastPoint('2026-07-01', '2026-09-30', 'actual', {
              navUsd: ZERO_MONEY,
            }),
          ],
          { terminalMode }
        );
      const nonzeroNavMark = () =>
        assemble([], [], {
          terminalMode,
          factsNavMarks: [
            {
              markId: 31,
              effectiveAt: '2026-07-01',
              fairValueUsd: '1.000000',
            },
          ],
        });

      expect(zeroPeriodNav).toThrowError(expect.objectContaining({ code: 'POST_TERM_ACTIVITY' }));
      expect(nonzeroNavMark).toThrowError(expect.objectContaining({ code: 'POST_TERM_ACTIVITY' }));
    }
  );

  it('rejects a NAV mark effectiveAt formatted as a datetime instant instead of a calendar date', () => {
    // Reviewer repro: terminal is 2026-06-30. An instant-formatted mark
    // dated noon on the terminal date ('2026-06-30T12:00:00.000Z') string-
    // compares as GREATER than the bare terminalPeriodEnd date
    // ('2026-06-30'), which would falsely classify an in-term mark as
    // post-term. Reject the malformed format outright instead of letting
    // that comparison run.
    const action = () =>
      assemble([], [], {
        factsNavMarks: [
          {
            markId: 40,
            effectiveAt: '2026-06-30T12:00:00.000Z',
            fairValueUsd: '5.000000',
          },
        ],
      });

    expect(action).toThrow(/calendar date/i);
  });

  it('accepts a NAV mark dated exactly on the terminal date as in-term, not post-term', () => {
    const action = () =>
      assemble([], [], {
        factsNavMarks: [
          {
            markId: 41,
            effectiveAt: '2026-06-30',
            fairValueUsd: '5.000000',
          },
        ],
      });

    expect(action).not.toThrow();
  });

  it('rejects a period NAV observation periodEnd that is not a calendar date', () => {
    const action = () =>
      assemble([], [], {
        factsPeriodNav: [
          {
            periodEnd: '2026-06-30T00:00:00.000Z',
            navUsd: '5.000000',
          },
        ],
      });

    expect(action).toThrow(/calendar date/i);
  });

  it('rejects a positive post-term deployment delta but ignores unchanged deployment', () => {
    const baseline = [
      forecastPoint('2026-04-01', '2026-06-30', 'projected', {
        deployedUsd: '10.000000',
      }),
      forecastPoint('2026-07-01', '2026-09-30', 'projected', {
        deployedUsd: '10.000000',
      }),
    ];

    expect(() => assemble([], baseline)).not.toThrow();

    const action = () =>
      assemble(
        [],
        [
          ...baseline.slice(0, 1),
          forecastPoint('2026-07-01', '2026-09-30', 'projected', {
            deployedUsd: '10.000001',
          }),
        ]
      );

    expect(action).toThrowError(expect.objectContaining({ code: 'POST_TERM_ACTIVITY' }));
  });

  it('applies negative-money and deployment-decrease precedence before post-term activity', () => {
    const postTermFact: FactsCashAssemblyEventV1 = {
      eventId: 1,
      eventType: 'realized_proceeds',
      effectiveAt: '2026-07-01T00:00:00.000Z',
      amountUsd: '1.000000',
    };

    const negativeAction = () =>
      assemble(
        [postTermFact],
        [
          forecastPoint('2026-01-01', '2026-03-31', 'actual', {
            navUsd: '-0.000001',
          }),
        ]
      );
    expect(negativeAction).toThrowError(expect.objectContaining({ code: 'NEGATIVE_SOURCE_MONEY' }));

    const decreasingAction = () =>
      assemble(
        [postTermFact],
        [
          forecastPoint('2026-01-01', '2026-03-31', 'actual', {
            deployedUsd: '10.000000',
          }),
          forecastPoint('2026-04-01', '2026-06-30', 'projected', {
            deployedUsd: '9.000000',
          }),
        ]
      );
    expect(decreasingAction).toThrowError(
      expect.objectContaining({ code: 'FORECAST_DEPLOYMENT_CUMULATIVE_DECREASE' })
    );
  });

  it.each([
    {
      name: 'facts event identity',
      first: () =>
        assemble(
          [
            {
              eventId: 1,
              eventType: 'realized_proceeds',
              effectiveAt: '2026-01-15T00:00:00.000Z',
              amountUsd: '1.000000',
            },
            {
              eventId: 1,
              eventType: 'realized_proceeds',
              effectiveAt: '2026-03-15T00:00:00.000Z',
              amountUsd: '2.000000',
            },
            {
              eventId: 2,
              eventType: 'realized_proceeds',
              effectiveAt: '2026-02-15T00:00:00.000Z',
              amountUsd: '3.000000',
            },
          ],
          []
        ),
      reversed: () =>
        assemble(
          [
            {
              eventId: 1,
              eventType: 'realized_proceeds',
              effectiveAt: '2026-03-15T00:00:00.000Z',
              amountUsd: '2.000000',
            },
            {
              eventId: 2,
              eventType: 'realized_proceeds',
              effectiveAt: '2026-02-15T00:00:00.000Z',
              amountUsd: '3.000000',
            },
            {
              eventId: 1,
              eventType: 'realized_proceeds',
              effectiveAt: '2026-01-15T00:00:00.000Z',
              amountUsd: '1.000000',
            },
          ],
          []
        ),
    },
    {
      name: 'forecast event identity',
      first: () =>
        assemble(
          [],
          [
            forecastPoint('2026-04-01', '2026-06-30', 'projected', {
              distributionsUsd: '1.000000',
            }),
            forecastPoint('2026-04-01', '2026-06-30', 'projected', {
              distributionsUsd: '2.000000',
            }),
          ]
        ),
      reversed: () =>
        assemble(
          [],
          [
            forecastPoint('2026-04-01', '2026-06-30', 'projected', {
              distributionsUsd: '2.000000',
            }),
            forecastPoint('2026-04-01', '2026-06-30', 'projected', {
              distributionsUsd: '1.000000',
            }),
          ]
        ),
    },
  ])('rejects duplicate canonical $name for every input order', ({ first, reversed }) => {
    for (const action of [first, reversed]) {
      expect(action).toThrowError(CashAssemblyEventStreamInvariantError);
      expect(action).toThrowError(/Duplicate canonical/);
    }
  });
});
