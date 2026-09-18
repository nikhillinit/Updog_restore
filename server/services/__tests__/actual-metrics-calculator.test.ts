/**
 * ActualMetricsCalculator XIRR tests.
 *
 * Golden values use Actual/365.25 day fractions and independently solved XNPV roots.
 */

import Decimal from 'decimal.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActualMetricsCalculator } from '../actual-metrics-calculator';

type DatedAmount = { date: Date; amount: number };

describe('ActualMetricsCalculator - XIRR Validation', () => {
  let calculator: ActualMetricsCalculator;

  beforeEach(() => {
    calculator = new ActualMetricsCalculator();
    Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function calculateIRR(
    investments: DatedAmount[],
    distributions: DatedAmount[],
    nav: number,
    asOfDate: string
  ): Promise<number | null> {
    vi.setSystemTime(new Date(asOfDate));
    const result = await (
      calculator as unknown as {
        calculateIRR: (
          investments: DatedAmount[],
          distributions: DatedAmount[],
          currentNAV: Decimal
        ) => Promise<Decimal | null>;
      }
    ).calculateIRR(investments, distributions, new Decimal(nav));

    return result?.toNumber() ?? null;
  }

  it('calculates a simple two-cash-flow XIRR', async () => {
    const irr = await calculateIRR(
      [{ date: new Date('2020-01-01'), amount: 10_000_000 }],
      [],
      25_000_000,
      '2025-01-01'
    );

    expect(irr).toBeCloseTo(0.20103407784104388, 10);
  });

  it('handles multiple investment rounds and a distribution', async () => {
    const irr = await calculateIRR(
      [
        { date: new Date('2020-01-01'), amount: 5_000_000 },
        { date: new Date('2021-01-01'), amount: 10_000_000 },
      ],
      [{ date: new Date('2023-01-01'), amount: 5_000_000 }],
      40_000_000,
      '2025-01-01'
    );

    expect(irr).toBeCloseTo(0.3088902612715162, 10);
  });

  it('handles a J-curve recovery', async () => {
    const irr = await calculateIRR(
      [{ date: new Date('2020-01-01'), amount: 20_000_000 }],
      [],
      60_000_000,
      '2025-01-01'
    );

    expect(irr).toBeCloseTo(0.24561858217716953, 10);
  });

  it('handles monthly distributions', async () => {
    const distributions = Array.from({ length: 12 }, (_, month) => ({
      date: new Date(Date.UTC(2020, month, 15)),
      amount: 100_000,
    }));
    const irr = await calculateIRR(
      [{ date: new Date('2020-01-01'), amount: 10_000_000 }],
      distributions,
      10_000_000,
      '2021-01-01'
    );

    expect(irr).toBeCloseTo(0.12729283673566572, 10);
  });

  it('returns null with no meaningful cash flows', async () => {
    const irr = await calculateIRR([], [], 0, '2025-01-01');

    expect(irr).toBeNull();
  });

  it('returns null with only one meaningful cash flow', async () => {
    const irr = await calculateIRR(
      [{ date: new Date('2020-01-01'), amount: 1_000_000 }],
      [],
      0,
      '2025-01-01'
    );

    expect(irr).toBeNull();
  });

  it('calculates a negative XIRR for a loss', async () => {
    const irr = await calculateIRR(
      [{ date: new Date('2020-01-01'), amount: 10_000_000 }],
      [],
      1_000_000,
      '2025-01-01'
    );

    expect(irr).toBeCloseTo(-0.3689233640328783, 10);
  });

  it('calculates a high-return XIRR', async () => {
    const irr = await calculateIRR(
      [{ date: new Date('2020-01-01'), amount: 1_000_000 }],
      [],
      100_000_000,
      '2022-01-01'
    );

    expect(irr).toBeCloseTo(8.984262839877616, 10);
  });

  it('handles a realistic VC fund cash-flow series', async () => {
    const irr = await calculateIRR(
      [
        { date: new Date('2020-01-01'), amount: 30_000_000 },
        { date: new Date('2021-01-01'), amount: 20_000_000 },
      ],
      [
        { date: new Date('2023-01-01'), amount: 10_000_000 },
        { date: new Date('2024-01-01'), amount: 15_000_000 },
      ],
      120_000_000,
      '2025-01-01'
    );

    expect(irr).toBeCloseTo(0.2776918106583913, 10);
  });
});

describe('ActualMetricsCalculator - Integration', () => {
  it('keeps the pre-existing integration placeholder discoverable', () => {
    // Full storage-backed behavior is covered by central ActualMetricsCalculator suites.
    expect(ActualMetricsCalculator).toBeDefined();
  });
});
