import { describe, test, expect } from 'vitest';
import { calculateAmericanLedger } from '../american-ledger';
import cases from './fixtures/ledger-cases.json';

describe('American Waterfall Golden Vectors', () => {
  (test as any).each(cases)('$name', ({ cfg, proceeds, expect: expected }: any) => {
    // Convert test case data to proper function arguments
    const contributions = [{ quarter: 1, amount: cfg.totalCommitted }];
    const exits = [{ quarter: 10, grossProceeds: proceeds }];
    const waterfallCfg = {
      carryPct: cfg.carryPercent,
      hurdleRate: cfg.preferredReturn,
      recyclingEnabled: cfg.recycleLimit > 0,
      recyclingCapPctOfCommitted: cfg.recycleLimit / cfg.totalCommitted
    };

    const result = calculateAmericanLedger(waterfallCfg, contributions, exits);

    // Check metrics from totals
    if (expected.dpi !== undefined) {
      expect(result.totals.dpi).toBeCloseTo(expected.dpi, 3);
    }
    if (expected.tvpi !== undefined) {
      expect(result.totals.tvpi).toBeCloseTo(expected.tvpi, 3);
    }

    // Check recycling if applicable
    if (expected.recycled !== undefined) {
      expect(result.totals.recycled).toBeCloseTo(expected.recycled, 2);
    }

    // Check GP carry total
    if (expected.gpCarryAccrued !== undefined) {
      expect(result.totals.gpCarryTotal).toBeCloseTo(expected.gpCarryAccrued, 2);
    }
  });

  test('handles negative proceeds gracefully', () => {
    const cfg = {
      totalCommitted: 10000000,
      lpCommitted: 9000000,
      gpCommitted: 1000000,
      preferredReturn: 0.08,
      carryPercent: 0.20,
      catchUpPercent: 0.80,
      recycleLimit: 0
    };

    const contributions = [{ quarter: 1, amount: cfg.totalCommitted }];
    const exits = [{ quarter: 10, grossProceeds: -1000000 }];
    const waterfallCfg = {
      carryPct: cfg.carryPercent,
      hurdleRate: cfg.preferredReturn
    };
    const result = calculateAmericanLedger(waterfallCfg, contributions, exits);
    expect(result.totals.distributed).toBe(0);
    expect(result.totals.dpi).toBe(0);
  });

  test('handles zero committed capital', () => {
    const cfg = {
      totalCommitted: 0,
      lpCommitted: 0,
      gpCommitted: 0,
      preferredReturn: 0.08,
      carryPercent: 0.20,
      catchUpPercent: 0.80,
      recycleLimit: 0
    };

    const contributions: any[] = [];
    const exits = [{ quarter: 10, grossProceeds: 1000000 }];
    const waterfallCfg = {
      carryPct: cfg.carryPercent,
      hurdleRate: cfg.preferredReturn
    };
    const result = calculateAmericanLedger(waterfallCfg, contributions, exits);
    expect(result.totals.distributed).toBe(0);
    expect(result.totals.paidIn).toBe(0);
  });
});