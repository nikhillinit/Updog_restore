import { describe, expect, it } from 'vitest';
import {
  convertFundDataToCashFlows,
  generateSampleExitSchedule,
  generateWaterfallInputs,
} from '@/lib/cashflow/generate';

describe('cashflow/generate', () => {
  it('parses committed capital strings and falls back from blank lifeYears to fundLife', () => {
    const flows = convertFundDataToCashFlows({
      totalCommittedCapital: '1,250,000',
      size: '900,000',
      startDate: '2025-01-15T00:00:00.000Z',
      lifeYears: '',
      fundLife: '7',
    });

    expect(flows[0]).toEqual({
      date: new Date('2025-01-15T00:00:00.000Z'),
      amount: -1250000,
    });
    expect(flows).toHaveLength(6);
    expect(flows[flows.length - 1]?.date.toISOString()).toBe('2032-01-15T00:00:00.000Z');
    expect(flows.slice(1).every((flow) => flow.amount >= 0)).toBe(true);
  });

  it('truncates generated exits to the requested fund life', () => {
    const schedule = generateSampleExitSchedule(1_000_000, 7, 2);

    expect(schedule.map((entry) => entry.monthOffset)).toEqual([36, 48, 60, 72, 84]);
    expect(schedule.reduce((sum, entry) => sum + entry.amount, 0)).toBe(1_460_000);
  });

  it('parses waterfall inputs without parseFloat-style partial parsing', () => {
    const result = generateWaterfallInputs({
      size: '2,500,000',
      carryPercentage: '25',
      preferredReturnRate: '8',
      lifeYears: '',
      fundLife: '8',
      exitRecycling: {
        enabled: true,
        recyclePercentage: 50,
        recycleWindowMonths: 18,
      },
    });

    expect(result.contributions).toEqual([
      { quarter: 1, amount: 625000 },
      { quarter: 2, amount: 625000 },
      { quarter: 3, amount: 625000 },
      { quarter: 4, amount: 625000 },
    ]);
    expect(result.config).toEqual({
      carryPct: 0.25,
      hurdleRate: 0.08,
      recyclingEnabled: true,
      recyclingCapPctOfCommitted: 0.5,
      recyclingWindowQuarters: 6,
      recyclingTakePctPerEvent: 0.5,
    });
    expect(result.exits[0]).toEqual({
      quarter: 12,
      grossProceeds: 312500,
    });
    expect(result.exits[result.exits.length - 1]?.quarter).toBe(32);
  });
});
