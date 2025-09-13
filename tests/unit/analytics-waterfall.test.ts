import { describe, it, expect } from 'vitest';
import { calculateAmericanWaterfallLedger } from '@/lib/waterfall/american-ledger';

describe('American Waterfall Ledger', () => {
  it('should calculate basic waterfall with no carry', () => {
    const config = { carryPct: 0 };
    const contributions = [{ quarter: 1, amount: 1000000 }];
    const exits = [{ quarter: 4, grossProceeds: 1000000 }];
    
    const result = calculateAmericanWaterfallLedger(config, contributions, exits);
    
    expect(result.totals.paidIn).toBe(1000000);
    expect(result.totals.distributed).toBe(1000000);
    expect(result.totals.gpCarryTotal).toBe(0);
    expect(result.totals.dpi).toBe(1.0);
    expect(result.totals.tvpi).toBe(1.0);
  });

  it('should calculate carry on profits', () => {
    const config = { carryPct: 0.2 }; // 20% carry
    const contributions = [{ quarter: 1, amount: 1000000 }];
    const exits = [{ quarter: 4, grossProceeds: 2000000 }]; // 2x return
    
    const result = calculateAmericanWaterfallLedger(config, contributions, exits);
    
    expect(result.totals.paidIn).toBe(1000000);
    // LP gets: capital return (1M) + 80% of profits (800K) = 1.8M
    expect(result.totals.distributed).toBe(1800000);
    // GP gets: 20% of profits (200K)
    expect(result.totals.gpCarryTotal).toBe(200000);
    expect(result.totals.dpi).toBe(1.8);
  });

  it('should handle multiple exits correctly', () => {
    const config = { carryPct: 0.2 };
    const contributions = [
      { quarter: 1, amount: 500000 },
      { quarter: 2, amount: 500000 }
    ];
    const exits = [
      { quarter: 4, grossProceeds: 800000 },
      { quarter: 8, grossProceeds: 1500000 }
    ];
    
    const result = calculateAmericanWaterfallLedger(config, contributions, exits);
    
    expect(result.totals.paidIn).toBe(1000000);
    expect(result.rows).toHaveLength(2);
    
    // First exit: returns 800K of capital (no carry yet)
    expect(result.rows[0].lpCapitalReturn).toBe(800000);
    expect(result.rows[0].gpCarry).toBe(0);
    
    // Second exit: returns remaining 200K capital + profits with carry
    expect(result.rows[1].lpCapitalReturn).toBe(200000);
    expect(result.rows[1].gpCarry).toBe(260000); // 20% of 1.3M profit
  });

  it('should correctly calculate TVPI with unrealized capital', () => {
    const config = { carryPct: 0.2 };
    const contributions = [{ quarter: 1, amount: 1000000 }];
    const exits = [{ quarter: 4, grossProceeds: 500000 }]; // Only partial exit
    
    const result = calculateAmericanWaterfallLedger(config, contributions, exits);
    
    expect(result.totals.paidIn).toBe(1000000);
    expect(result.totals.distributed).toBe(500000);
    expect(result.totals.unrealizedCapital).toBe(500000);
    expect(result.totals.dpi).toBe(0.5);
    expect(result.totals.tvpi).toBe(1.0); // (500K distributed + 500K unrealized) / 1M = 1.0
  });

  it('should handle recycling when enabled', () => {
    const config = {
      carryPct: 0.2,
      recyclingEnabled: true,
      recyclingCapPctOfCommitted: 0.15, // 15% cap
      recyclingWindowQuarters: 12,
      recyclingTakePctPerEvent: 0.5 // Take 50% of available
    };
    const contributions = [{ quarter: 1, amount: 1000000 }];
    const exits = [{ quarter: 4, grossProceeds: 500000 }];
    
    const result = calculateAmericanWaterfallLedger(config, contributions, exits);
    
    expect(result.totals.recycled).toBeGreaterThan(0);
    expect(result.totals.recycled).toBeLessThanOrEqual(150000); // 15% cap
  });
});

describe('Waterfall Edge Cases', () => {
  it('should handle zero contributions gracefully', () => {
    const config = { carryPct: 0.2 };
    const contributions: any[] = [];
    const exits = [{ quarter: 4, grossProceeds: 1000000 }];
    
    const result = calculateAmericanWaterfallLedger(config, contributions, exits);
    
    expect(result.totals.paidIn).toBe(0);
    expect(result.totals.dpi).toBe(0);
    expect(result.totals.tvpi).toBe(0);
  });

  it('should handle negative amounts by treating as zero', () => {
    const config = { carryPct: 0.2 };
    const contributions = [{ quarter: 1, amount: -1000000 }]; // Invalid negative
    const exits = [{ quarter: 4, grossProceeds: -500000 }]; // Invalid negative
    
    const result = calculateAmericanWaterfallLedger(config, contributions, exits);
    
    expect(result.totals.paidIn).toBe(0);
    expect(result.totals.distributed).toBe(0);
  });
});