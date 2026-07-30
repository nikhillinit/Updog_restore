import { describe, expect, it } from 'vitest';

import { Decimal } from '@shared/lib/decimal-config';

interface ProceedsEvent {
  type: 'proceeds';
  eventId: string;
  occurredAt: string;
  amount: string;
}

interface CapitalCallEvent {
  type: 'capitalCall';
  eventId: string;
  occurredAt: string;
  amount: string;
}

type AccountingEvent = ProceedsEvent | CapitalCallEvent;

interface AllocationRow {
  eventId: string;
  occurredAt: string;
  roc: string;
  lpProfit: string;
  gpCarry: string;
}

interface AllocationResult {
  rows: AllocationRow[];
  totals: {
    proceeds: string;
    roc: string;
    lpProfit: string;
    gpCarry: string;
    endingUnreturnedCapital: string;
  };
}

function correctedNoHurdleAllocation(
  openingUnreturnedCapital: string,
  events: AccountingEvent[],
  carryPct: string
): AllocationResult {
  let unreturnedCapital = new Decimal(openingUnreturnedCapital);
  let proceedsTotal = new Decimal(0);
  let rocTotal = new Decimal(0);
  let lpProfitTotal = new Decimal(0);
  let gpCarryTotal = new Decimal(0);
  const carry = new Decimal(carryPct);
  const rows: AllocationRow[] = [];

  for (const event of events) {
    const amount = new Decimal(event.amount);

    if (event.type === 'capitalCall') {
      unreturnedCapital = unreturnedCapital.plus(amount);
      continue;
    }

    const roc = Decimal.min(unreturnedCapital, amount);
    const residual = Decimal.max(0, amount.minus(unreturnedCapital));
    const gpCarry = carry.mul(residual);
    const lpProfit = residual.minus(gpCarry);

    proceedsTotal = proceedsTotal.plus(amount);
    rocTotal = rocTotal.plus(roc);
    lpProfitTotal = lpProfitTotal.plus(lpProfit);
    gpCarryTotal = gpCarryTotal.plus(gpCarry);
    unreturnedCapital = unreturnedCapital.minus(roc);
    rows.push({
      eventId: event.eventId,
      occurredAt: event.occurredAt,
      roc: roc.toFixed(6),
      lpProfit: lpProfit.toFixed(6),
      gpCarry: gpCarry.toFixed(6),
    });
  }

  if (!rocTotal.plus(lpProfitTotal).plus(gpCarryTotal).eq(proceedsTotal)) {
    throw new Error('corrected no-hurdle oracle violated conservation');
  }

  return {
    rows,
    totals: {
      proceeds: proceedsTotal.toFixed(6),
      roc: rocTotal.toFixed(6),
      lpProfit: lpProfitTotal.toFixed(6),
      gpCarry: gpCarryTotal.toFixed(6),
      endingUnreturnedCapital: unreturnedCapital.toFixed(6),
    },
  };
}

function allocateCentsByExactWeights(totalCents: string, weights: readonly string[]): string[] {
  const total = new Decimal(totalCents);
  const exactEntitlements = weights.map((weight) => total.mul(weight));
  const allocations = exactEntitlements.map((entitlement) =>
    entitlement.toDecimalPlaces(0, Decimal.ROUND_FLOOR)
  );
  const remainders = exactEntitlements.map((entitlement, index) =>
    entitlement.minus(allocations[index]!)
  );
  const order = weights
    .map((_, index) => index)
    .sort((left, right) => remainders[right]!.cmp(remainders[left]!) || left - right);
  let shortfall = total.minus(Decimal.sum(...allocations));
  let cursor = 0;

  while (shortfall.gt(0)) {
    const winner = order[cursor % order.length]!;
    allocations[winner] = allocations[winner]!.plus(1);
    shortfall = shortfall.minus(1);
    cursor += 1;
  }

  return allocations.map((allocation) => allocation.toFixed(0));
}

describe('corrected no-hurdle quarterly aggregation contract', () => {
  it('preserves full-precision totals and conservation for fixed opening state', () => {
    const split = correctedNoHurdleAllocation(
      '100.000000',
      [
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
      '0.200000000000'
    );
    const aggregate = correctedNoHurdleAllocation(
      '100.000000',
      [
        {
          type: 'proceeds',
          eventId: 'quarterly-aggregate',
          occurredAt: '2026-03-31T00:00:00.000Z',
          amount: '110.000000',
        },
      ],
      '0.200000000000'
    );

    expect(split.totals).toEqual({
      proceeds: '110.000000',
      roc: '100.000000',
      lpProfit: '8.000000',
      gpCarry: '2.000000',
      endingUnreturnedCapital: '0.000000',
    });
    expect(split.totals).toEqual(aggregate.totals);
    expect(
      new Decimal(split.totals.roc)
        .plus(split.totals.lpProfit)
        .plus(split.totals.gpCarry)
        .toFixed(6)
    ).toBe(split.totals.proceeds);

    // Aggregate invariance covers allocation totals only, not source-row identity or timing.
    expect(split.rows).not.toEqual(aggregate.rows);
  });

  it('does not aggregate across an intervening capital call', () => {
    const split = correctedNoHurdleAllocation(
      '100.000000',
      [
        {
          type: 'proceeds',
          eventId: 'exit-before-call',
          occurredAt: '2026-03-01T00:00:00.000Z',
          amount: '120.000000',
        },
        {
          type: 'capitalCall',
          eventId: 'capital-call',
          occurredAt: '2026-03-15T00:00:00.000Z',
          amount: '50.000000',
        },
        {
          type: 'proceeds',
          eventId: 'exit-after-call',
          occurredAt: '2026-03-31T00:00:00.000Z',
          amount: '30.000000',
        },
      ],
      '0.200000000000'
    );
    const aggregateUsingQuarterOpening = correctedNoHurdleAllocation(
      '100.000000',
      [
        {
          type: 'proceeds',
          eventId: 'quarterly-aggregate',
          occurredAt: '2026-03-31T00:00:00.000Z',
          amount: '150.000000',
        },
      ],
      '0.200000000000'
    );

    expect(split.totals).toEqual({
      proceeds: '150.000000',
      roc: '130.000000',
      lpProfit: '16.000000',
      gpCarry: '4.000000',
      endingUnreturnedCapital: '20.000000',
    });
    expect(aggregateUsingQuarterOpening.totals).toEqual({
      proceeds: '150.000000',
      roc: '100.000000',
      lpProfit: '40.000000',
      gpCarry: '10.000000',
      endingUnreturnedCapital: '0.000000',
    });
    expect(split.totals).not.toEqual(aggregateUsingQuarterOpening.totals);
  });

  it('aggregates full-precision carry before canonical cent rounding', () => {
    const split = correctedNoHurdleAllocation(
      '0.000000',
      [
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
      '0.200000000000'
    );
    const aggregate = correctedNoHurdleAllocation(
      '0.000000',
      [
        {
          type: 'proceeds',
          eventId: 'quarterly-aggregate',
          occurredAt: '2026-03-31T00:00:00.000Z',
          amount: '0.060000',
        },
      ],
      '0.200000000000'
    );

    expect(split.totals.gpCarry).toBe('0.012000');
    expect(split.totals).toEqual(aggregate.totals);
    const aggregateCents = allocateCentsByExactWeights('6', ['0.800000000000', '0.200000000000']);
    const independentlyRoundedEvents = [
      allocateCentsByExactWeights('3', ['0.800000000000', '0.200000000000']),
      allocateCentsByExactWeights('3', ['0.800000000000', '0.200000000000']),
    ];

    expect(aggregateCents).toEqual(['5', '1']);
    expect(independentlyRoundedEvents).toEqual([
      ['2', '1'],
      ['2', '1'],
    ]);
    expect(aggregateCents[1]).toBe('1');
    expect(
      independentlyRoundedEvents
        .map((allocation) => new Decimal(allocation[1]!))
        .reduce((total, gpCarry) => total.plus(gpCarry), new Decimal(0))
        .toFixed(0)
    ).toBe('2');
  });
});

describe('Decimal-native largest-remainder ordering contract', () => {
  it('awards an exact remainder tie to LP at stable index zero', () => {
    expect(allocateCentsByExactWeights('1', ['0.500000000000', '0.500000000000'])).toEqual([
      '1',
      '0',
    ]);
  });

  it('awards the cent to GP when its exact remainder is larger', () => {
    expect(allocateCentsByExactWeights('1', ['0.400000000000', '0.600000000000'])).toEqual([
      '0',
      '1',
    ]);
  });

  it('preserves sub-1e-7 entitlement precision when GP has the larger exact weight', () => {
    expect(allocateCentsByExactWeights('1', ['0.49999999', '0.50000001'])).toEqual(['0', '1']);
  });
});
