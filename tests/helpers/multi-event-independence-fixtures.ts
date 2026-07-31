export interface MultiEventProceedsFixture {
  type: 'proceeds';
  eventId: string;
  occurredAt: string;
  amount: string;
}

export interface MultiEventCapitalCallFixture {
  type: 'capitalCall';
  eventId: string;
  occurredAt: string;
  amount: string;
}

export type MultiEventAccountingFixture = MultiEventProceedsFixture | MultiEventCapitalCallFixture;

export interface MultiEventIndependenceFixture {
  description: string;
  events: MultiEventAccountingFixture[];
  expectedTotals: {
    proceeds: string;
    roc: string;
    lpProfit: string;
    gpCarry: string;
    endingUnreturnedCapital: string;
  };
}

export const MULTI_EVENT_INDEPENDENCE_FIXTURES: MultiEventIndependenceFixture[] = [
  {
    description: 'interleaved capital calls and proceeds preserving chronology',
    events: [
      {
        type: 'capitalCall',
        eventId: 'call-1',
        occurredAt: '2026-01-15T00:00:00.000Z',
        amount: '100.000000',
      },
      {
        type: 'proceeds',
        eventId: 'exit-1',
        occurredAt: '2026-02-15T00:00:00.000Z',
        amount: '120.000000',
      },
      {
        type: 'capitalCall',
        eventId: 'call-2',
        occurredAt: '2026-03-15T00:00:00.000Z',
        amount: '50.000000',
      },
      {
        type: 'proceeds',
        eventId: 'exit-2',
        occurredAt: '2026-03-31T00:00:00.000Z',
        amount: '30.000000',
      },
    ],
    expectedTotals: {
      proceeds: '150.000000',
      roc: '130.000000',
      lpProfit: '16.000000',
      gpCarry: '4.000000',
      endingUnreturnedCapital: '20.000000',
    },
  },
  {
    description: 'multiple proceeds in the same quarter aggregating correctly',
    events: [
      {
        type: 'capitalCall',
        eventId: 'call-1',
        occurredAt: '2026-01-01T00:00:00.000Z',
        amount: '100.000000',
      },
      {
        type: 'proceeds',
        eventId: 'exit-1',
        occurredAt: '2026-03-01T00:00:00.000Z',
        amount: '40.000000',
      },
      {
        type: 'proceeds',
        eventId: 'exit-2',
        occurredAt: '2026-03-31T00:00:00.000Z',
        amount: '70.000000',
      },
    ],
    expectedTotals: {
      proceeds: '110.000000',
      roc: '100.000000',
      lpProfit: '8.000000',
      gpCarry: '2.000000',
      endingUnreturnedCapital: '0.000000',
    },
  },
  {
    description: 'carry rounding independence across fractional proceeds',
    events: [
      {
        type: 'proceeds',
        eventId: 'residual-1',
        occurredAt: '2026-03-01T00:00:00.000Z',
        amount: '0.030000',
      },
      {
        type: 'proceeds',
        eventId: 'residual-2',
        occurredAt: '2026-03-31T00:00:00.000Z',
        amount: '0.030000',
      },
    ],
    expectedTotals: {
      proceeds: '0.060000',
      roc: '0.000000',
      lpProfit: '0.048000',
      gpCarry: '0.012000',
      endingUnreturnedCapital: '0.000000',
    },
  },
];
