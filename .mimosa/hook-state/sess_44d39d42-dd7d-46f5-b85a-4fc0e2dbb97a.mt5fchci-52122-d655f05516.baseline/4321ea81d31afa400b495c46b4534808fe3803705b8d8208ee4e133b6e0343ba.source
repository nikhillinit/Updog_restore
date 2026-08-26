import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Decimal from 'decimal.js';
import { ActualMetricsCalculator } from '../../../server/services/actual-metrics-calculator';

describe('ActualMetricsCalculator residual XIRR follow-through', () => {
  let calculator: ActualMetricsCalculator;

  beforeEach(() => {
    calculator = new ActualMetricsCalculator();
    Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses canonical XIRR behavior for a simple two-cashflow scenario', async () => {
    const irr = await (calculator as any).calculateIRR(
      [{ date: new Date('2020-01-01'), amount: 10000000 }],
      [],
      new Decimal(25000000)
    );

    expect(irr).not.toBeNull();
    expect(irr.toNumber()).toBeCloseTo(0.2011, 3);
  });

  it('returns null when there are not enough meaningful cash flows to converge', async () => {
    const irr = await (calculator as any).calculateIRR(
      [{ date: new Date('2020-01-01'), amount: 1000000 }],
      [],
      new Decimal(0)
    );

    expect(irr).toBeNull();
  });
});
