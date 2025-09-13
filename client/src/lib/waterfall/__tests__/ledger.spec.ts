import { describe, test, expect } from 'vitest';
import { calculateAmericanLedger } from '../american-ledger';
import cases from './fixtures/ledger-cases.json';

describe('American Waterfall Golden Vectors', () => {
  test.each(cases)('$name', ({ cfg, proceeds, expect: expected }) => {
    const result = calculateAmericanLedger(cfg, proceeds);

    // Check capital returns
    if (expected.lpCapitalReturned !== undefined) {
      expect(result.lpCapitalReturned).toBeCloseTo(expected.lpCapitalReturned, 2);
    }
    if (expected.gpCapitalReturned !== undefined) {
      expect(result.gpCapitalReturned).toBeCloseTo(expected.gpCapitalReturned, 2);
    }

    // Check preferred returns
    if (expected.lpPreferredReturn !== undefined) {
      expect(result.lpPreferredReturn).toBeCloseTo(expected.lpPreferredReturn, 2);
    }
    if (expected.gpPreferredReturn !== undefined) {
      expect(result.gpPreferredReturn).toBeCloseTo(expected.gpPreferredReturn, 2);
    }

    // Check catch-up and carry
    if (expected.gpCatchUp !== undefined) {
      expect(result.gpCatchUp).toBeCloseTo(expected.gpCatchUp, 2);
    }
    if (expected.gpCarryAccrued !== undefined) {
      expect(result.gpCarryAccrued).toBeCloseTo(expected.gpCarryAccrued, 2);
    }

    // Check metrics
    if (expected.dpi !== undefined) {
      expect(result.dpi).toBeCloseTo(expected.dpi, 3);
    }
    if (expected.tvpi !== undefined) {
      expect(result.tvpi).toBeCloseTo(expected.tvpi, 3);
    }

    // Check recycling if applicable
    if (expected.recycled !== undefined) {
      expect(result.recycled).toBeCloseTo(expected.recycled, 2);
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

    const result = calculateAmericanLedger(cfg, -1000000);
    expect(result.lpCapitalReturned).toBe(0);
    expect(result.gpCapitalReturned).toBe(0);
    expect(result.dpi).toBe(0);
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

    const result = calculateAmericanLedger(cfg, 1000000);
    expect(result.lpCapitalReturned).toBe(0);
    expect(result.gpCapitalReturned).toBe(0);
  });
});