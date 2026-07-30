import { describe, expect, it } from 'vitest';

import {
  INTERNAL_ECONOMICS_EVENT_CLASS_PRIORITY,
  INTERNAL_ECONOMICS_EVENT_ORDERING_VERSION,
  InternalEconomicsEventOrderKeyV1Schema,
  InternalEconomicsEventTypeV1Schema,
  buildFactsStableSourceId,
  buildForecastStableSourceId,
  compareEventOrderKeys,
  deriveFactsEventOrderKey,
} from '../../../shared/contracts/internal-economics/event-ordering-v1.contract';

describe('internal economics event ordering v1 contract', () => {
  it('exports the versioned methodology identifier and exact event priority table', () => {
    expect(INTERNAL_ECONOMICS_EVENT_ORDERING_VERSION).toBe(
      'internal-economics-event-ordering/1.0.0'
    );
    expect(INTERNAL_ECONOMICS_EVENT_CLASS_PRIORITY).toEqual({
      lp_capital_call: 1,
      portfolio_investment: 2,
      fund_expense: 3,
      realized_proceeds: 4,
      lp_distribution: 5,
      recallable_distribution: 6,
    });
  });

  it('accepts only event classes governed by this methodology', () => {
    expect(InternalEconomicsEventTypeV1Schema.options).toEqual([
      'lp_capital_call',
      'portfolio_investment',
      'fund_expense',
      'realized_proceeds',
      'lp_distribution',
      'recallable_distribution',
    ]);
    expect(() => InternalEconomicsEventTypeV1Schema.parse('reversal')).toThrow();
    expect(() => InternalEconomicsEventTypeV1Schema.parse('unknown')).toThrow();
  });

  it('builds exact canonical stable source IDs', () => {
    expect(buildFactsStableSourceId(23, 41)).toBe('facts:23:cash_flow_event:41');
    expect(buildForecastStableSourceId(17, '2027-03-31', 'realized_proceeds')).toBe(
      'forecast:17:quarter:2027-03-31:realized_proceeds'
    );
  });

  it.each([
    ['facts snapshot ID zero', () => buildFactsStableSourceId(0, 1)],
    ['facts event ID fractional', () => buildFactsStableSourceId(1, 1.5)],
    [
      'forecast snapshot ID negative',
      () => buildForecastStableSourceId(-1, '2027-03-31', 'fund_expense'),
    ],
    [
      'forecast period end malformed',
      () => buildForecastStableSourceId(1, '2027-3-31', 'fund_expense'),
    ],
    [
      'forecast period end impossible',
      () => buildForecastStableSourceId(1, '2027-02-29', 'fund_expense'),
    ],
    [
      'forecast event class unknown',
      () => buildForecastStableSourceId(1, '2027-03-31', 'reversal' as 'fund_expense'),
    ],
  ])('rejects malformed %s', (_name, build) => {
    expect(build).toThrow();
  });

  it('derives a canonical facts order key without adding fields to persisted facts', () => {
    expect(
      deriveFactsEventOrderKey({
        factsSnapshotId: 23,
        eventId: 41,
        eventType: 'portfolio_investment',
        effectiveAt: '2027-01-15T10:30:00.000Z',
      })
    ).toEqual({
      effectiveAt: '2027-01-15T10:30:00.000Z',
      eventClassPriority: 2,
      stableSourceId: 'facts:23:cash_flow_event:41',
    });
  });

  it('rejects unknown classes, malformed IDs, malformed instants, and extra persisted fields', () => {
    const valid = {
      factsSnapshotId: 23,
      eventId: 41,
      eventType: 'portfolio_investment',
      effectiveAt: '2027-01-15T10:30:00.000Z',
    };

    expect(() =>
      deriveFactsEventOrderKey({ ...valid, eventType: 'reversal' as 'portfolio_investment' })
    ).toThrow();
    expect(() => deriveFactsEventOrderKey({ ...valid, eventId: 0 })).toThrow();
    expect(() =>
      deriveFactsEventOrderKey({ ...valid, effectiveAt: '2027-01-15T10:30:00-08:00' })
    ).toThrow();
    expect(() =>
      deriveFactsEventOrderKey({ ...valid, stableSourceId: 'persisted-duplicate' } as typeof valid)
    ).toThrow();
  });

  it('validates the strict canonical order-key shape', () => {
    const key = {
      effectiveAt: '2027-01-15T10:30:00.000Z',
      eventClassPriority: 4,
      stableSourceId: 'facts:23:cash_flow_event:41',
    };

    expect(InternalEconomicsEventOrderKeyV1Schema.parse(key)).toEqual(key);
    expect(() =>
      InternalEconomicsEventOrderKeyV1Schema.parse({ ...key, eventClassPriority: 7 })
    ).toThrow();
    expect(() =>
      InternalEconomicsEventOrderKeyV1Schema.parse({ ...key, redundantObservation: true })
    ).toThrow();
  });

  it('orders same-instant events by class priority', () => {
    const effectiveAt = '2027-01-15T10:30:00.000Z';
    const keys = [
      deriveFactsEventOrderKey({
        factsSnapshotId: 1,
        eventId: 6,
        eventType: 'recallable_distribution',
        effectiveAt,
      }),
      deriveFactsEventOrderKey({
        factsSnapshotId: 1,
        eventId: 4,
        eventType: 'realized_proceeds',
        effectiveAt,
      }),
      deriveFactsEventOrderKey({
        factsSnapshotId: 1,
        eventId: 1,
        eventType: 'lp_capital_call',
        effectiveAt,
      }),
      deriveFactsEventOrderKey({
        factsSnapshotId: 1,
        eventId: 5,
        eventType: 'lp_distribution',
        effectiveAt,
      }),
      deriveFactsEventOrderKey({
        factsSnapshotId: 1,
        eventId: 3,
        eventType: 'fund_expense',
        effectiveAt,
      }),
      deriveFactsEventOrderKey({
        factsSnapshotId: 1,
        eventId: 2,
        eventType: 'portfolio_investment',
        effectiveAt,
      }),
    ];

    expect(keys.sort(compareEventOrderKeys).map((key) => key.eventClassPriority)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });

  it('orders same-class same-instant events by stable source ID', () => {
    const effectiveAt = '2027-01-15T10:30:00.000Z';
    const keys = [2, 10, 1].map((eventId) =>
      deriveFactsEventOrderKey({
        factsSnapshotId: 1,
        eventId,
        eventType: 'realized_proceeds',
        effectiveAt,
      })
    );

    expect(keys.sort(compareEventOrderKeys).map((key) => key.stableSourceId)).toEqual([
      'facts:1:cash_flow_event:1',
      'facts:1:cash_flow_event:10',
      'facts:1:cash_flow_event:2',
    ]);
  });

  it('produces one canonical order for every input permutation', () => {
    const canonical = [
      {
        effectiveAt: '2027-01-01T00:00:00.000Z',
        eventClassPriority: 6 as const,
        stableSourceId: 'facts:1:cash_flow_event:3',
      },
      {
        effectiveAt: '2027-01-01T00:00:00.000Z',
        eventClassPriority: 1 as const,
        stableSourceId: 'facts:1:cash_flow_event:2',
      },
      {
        effectiveAt: '2026-12-31T23:59:59.999Z',
        eventClassPriority: 5 as const,
        stableSourceId: 'facts:1:cash_flow_event:1',
      },
    ];
    const permutations = [
      [canonical[0]!, canonical[1]!, canonical[2]!],
      [canonical[0]!, canonical[2]!, canonical[1]!],
      [canonical[1]!, canonical[0]!, canonical[2]!],
      [canonical[1]!, canonical[2]!, canonical[0]!],
      [canonical[2]!, canonical[0]!, canonical[1]!],
      [canonical[2]!, canonical[1]!, canonical[0]!],
    ];
    const expected = [
      'facts:1:cash_flow_event:1',
      'facts:1:cash_flow_event:2',
      'facts:1:cash_flow_event:3',
    ];

    for (const permutation of permutations) {
      expect([...permutation].sort(compareEventOrderKeys).map((key) => key.stableSourceId)).toEqual(
        expected
      );
    }
  });
});
