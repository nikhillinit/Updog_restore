import { describe, it, expect } from 'vitest';
import {
  calculateAmericanWaterfallLedger,
  type ContributionCF,
} from '@/lib/waterfall/american-ledger';

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
      { quarter: 2, amount: 500000 },
    ];
    const exits = [
      { quarter: 4, grossProceeds: 800000 },
      { quarter: 8, grossProceeds: 1500000 },
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
      recyclingTakePctPerEvent: 0.5, // Take 50% of available
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
    const contributions: ContributionCF[] = [];
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

describe('Fund-Level Clawback', () => {
  it('should clawback all GP carry when fund earns less than 1.0x (LP not made whole)', () => {
    // Fund earns 0.8x - LPs are not made whole, all carry should be clawed back
    const config = {
      carryPct: 0.2,
      clawbackEnabled: true,
      clawbackLpHurdleMultiple: 1.0,
    };
    const contributions = [{ quarter: 1, amount: 1000000 }];
    // Exit with 800K proceeds - fund loses money overall
    const exits = [{ quarter: 4, grossProceeds: 800000 }];

    const result = calculateAmericanWaterfallLedger(config, contributions, exits);

    expect(result.totals.paidIn).toBe(1000000);
    // No carry should be earned on a loss
    expect(result.totals.gpCarryTotal).toBe(0);
    // Clawback is 0 because there was no carry to claw back
    expect(result.totals.gpClawback).toBeUndefined();
    expect(result.totals.gpCarryNet).toBe(0);
    expect(result.totals.dpi).toBe(0.8);
  });

  it('should clawback carry when total fund profit exists but LP below floor', () => {
    // Fund with multiple exits: first exit returns some capital,
    // second exit generates carry, but total LP distributions below 1.0x
    const config = {
      carryPct: 0.2,
      clawbackEnabled: true,
      clawbackLpHurdleMultiple: 1.0,
    };
    const contributions = [{ quarter: 1, amount: 1000000 }];
    // Exit 1: 500K (capital return, no profit)
    // Exit 2: 600K (remaining 500K capital + 100K profit, GP takes 20K carry)
    // Total to LP: 500K + 580K = 1.08M? Let's trace carefully:
    // After exit 1: distributed = 500K, paidIn = 1M
    // After exit 2: outstanding = 500K, lpCapitalReturn = 500K, remaining = 100K
    //   gpCarry = 20K, lpProfitShare = 80K
    //   distributed = 500K + 500K + 80K = 1.08M
    // But gpCarryTotal = 20K
    // Total fund profit = 1.08M + 20K - 1M = 100K
    // LP floor = 1M, LP current = 1.08M > 1M, no clawback
    // Let's create a scenario where LP is actually below floor:
    const exits = [
      { quarter: 4, grossProceeds: 300000 }, // 300K capital return
      { quarter: 8, grossProceeds: 800000 }, // 700K capital + 100K profit
    ];

    const result = calculateAmericanWaterfallLedger(config, contributions, exits);

    // Exit 1: lpCapitalReturn = 300K, distributed = 300K
    // Exit 2: outstanding = 700K, gross = 800K
    //   lpCapitalReturn = 700K, remaining = 100K
    //   gpCarry = 20K, lpProfitShare = 80K
    //   distributed = 300K + 700K + 80K = 1.08M
    // Total = 1.08M to LP, 20K to GP = 1.1M total, profit = 100K
    // LP floor = 1M, LP = 1.08M > 1M, no clawback
    expect(result.totals.paidIn).toBe(1000000);
    expect(result.totals.gpCarryTotal).toBe(20000);
    expect(result.totals.gpClawback).toBeUndefined();
    expect(result.totals.distributed).toBe(1080000);
  });

  it('should not clawback when LP already at or above floor', () => {
    // Fund earns 1.2x - GP gets 20% of profit above LP floor
    const config = {
      carryPct: 0.2,
      clawbackEnabled: true,
      clawbackLpHurdleMultiple: 1.0,
    };
    const contributions = [{ quarter: 1, amount: 1000000 }];
    const exits = [{ quarter: 4, grossProceeds: 2000000 }]; // 2x return

    const result = calculateAmericanWaterfallLedger(config, contributions, exits);

    expect(result.totals.paidIn).toBe(1000000);
    // LP gets: 1M capital + 800K profit share = 1.8M
    expect(result.totals.distributed).toBe(1800000);
    // GP gets: 200K carry
    expect(result.totals.gpCarryTotal).toBe(200000);
    // No clawback needed - LP is above 1.0x
    expect(result.totals.gpClawback).toBeUndefined();
    expect(result.totals.gpCarryNet).toBe(200000);
  });

  it('should calculate partial clawback when LP slightly below floor with hurdle', () => {
    // Scenario: LP must get 1.1x (10% hurdle), fund returns less
    const config = {
      carryPct: 0.2,
      clawbackEnabled: true,
      clawbackLpHurdleMultiple: 1.1, // 10% hurdle on top of capital
    };
    const contributions = [{ quarter: 1, amount: 1000000 }];
    // Fund returns 1.15M gross
    // Without clawback: LP gets 1M + 80% of 150K = 1.12M, GP gets 30K
    // With 1.1x hurdle: LP floor = 1.1M
    // Total profit = 1.12M + 30K - 1M = 150K
    // LP shortfall = 1.1M - 1.12M = -20K (LP is above floor!)
    // Let's create a case where LP is actually below 1.1x floor:
    const exits = [{ quarter: 4, grossProceeds: 1100000 }]; // 1.1x return

    const result = calculateAmericanWaterfallLedger(config, contributions, exits);

    // Exit: lpCapitalReturn = 1M, remaining = 100K
    // gpCarry = 20K, lpProfitShare = 80K
    // distributed = 1M + 80K = 1.08M
    // LP floor = 1.1M, LP current = 1.08M
    // Total profit = 1.08M + 20K - 1M = 100K
    // LP shortfall = 1.1M - 1.08M = 20K
    // Allowed GP carry = 20% * (100K - 20K) = 20% * 80K = 16K
    // Clawback = 20K - 16K = 4K
    expect(result.totals.paidIn).toBe(1000000);
    expect(result.totals.gpCarryTotal).toBe(20000);
    expect(result.totals.gpClawback).toBe(4000);
    expect(result.totals.gpCarryNet).toBe(16000);
    // After clawback, LP gets additional 4K
    expect(result.totals.distributed).toBe(1084000);
    expect(result.totals.dpi).toBeCloseTo(1.084, 3);
  });

  it('should add synthetic clawback row to the ledger', () => {
    const config = {
      carryPct: 0.2,
      clawbackEnabled: true,
      clawbackLpHurdleMultiple: 1.1,
    };
    const contributions = [{ quarter: 1, amount: 1000000 }];
    const exits = [{ quarter: 4, grossProceeds: 1100000 }];

    const result = calculateAmericanWaterfallLedger(config, contributions, exits);

    // Should have 2 rows: original exit + clawback event
    expect(result.rows).toHaveLength(2);

    // Verify clawback row structure
    const clawbackRow = result.rows[1];
    expect(clawbackRow.quarter).toBe(4);
    expect(clawbackRow.grossProceeds).toBe(0);
    expect(clawbackRow.gpClawback).toBe(4000);
    expect(clawbackRow.gpCarry).toBe(-4000); // Negative = GP paying back
    expect(clawbackRow.lpCapitalReturn).toBe(4000); // LP receives clawback
    expect(clawbackRow.running.distributed).toBe(1084000);
  });

  it('should not trigger clawback when disabled', () => {
    const config = {
      carryPct: 0.2,
      clawbackEnabled: false, // Disabled
      clawbackLpHurdleMultiple: 1.1,
    };
    const contributions = [{ quarter: 1, amount: 1000000 }];
    const exits = [{ quarter: 4, grossProceeds: 1100000 }];

    const result = calculateAmericanWaterfallLedger(config, contributions, exits);

    // No clawback should occur
    expect(result.rows).toHaveLength(1);
    expect(result.totals.gpClawback).toBeUndefined();
    expect(result.totals.gpCarryTotal).toBe(20000);
    expect(result.totals.gpCarryNet).toBe(20000);
  });

  it('should handle clawback when fund exactly at 1.0x LP floor', () => {
    // Fund returns exactly 1.0x - LP is at floor, no profit to split
    const config = {
      carryPct: 0.2,
      clawbackEnabled: true,
      clawbackLpHurdleMultiple: 1.0,
    };
    const contributions = [{ quarter: 1, amount: 1000000 }];
    const exits = [{ quarter: 4, grossProceeds: 1000000 }];

    const result = calculateAmericanWaterfallLedger(config, contributions, exits);

    expect(result.totals.paidIn).toBe(1000000);
    expect(result.totals.distributed).toBe(1000000);
    expect(result.totals.gpCarryTotal).toBe(0); // No profit = no carry
    expect(result.totals.gpClawback).toBeUndefined();
    expect(result.totals.dpi).toBe(1.0);
  });

  it('should clawback full carry when deal-by-deal carry exceeds fund-level allowance', () => {
    // Scenario: Multiple exits where early exits generate carry,
    // but later losses mean GP should have earned less overall
    const config = {
      carryPct: 0.2,
      clawbackEnabled: true,
      clawbackLpHurdleMultiple: 1.0,
    };
    const contributions = [
      { quarter: 1, amount: 500000 },
      { quarter: 2, amount: 500000 },
    ];
    // Exit 1: 1.5x winner on full capital, generates carry
    // Exit 2: Total loss on remaining investment
    const exits = [
      { quarter: 4, grossProceeds: 1500000 }, // 1.5M gross
      { quarter: 8, grossProceeds: 0 }, // Total loss
    ];

    const result = calculateAmericanWaterfallLedger(config, contributions, exits);

    // Exit 1 at Q4: updatePaidInUpTo(4) counts Q1 + Q2 contributions (both <= Q4)
    //   paidIn = 1M
    //   outstanding = 1M, lpCapitalReturn = 1M
    //   remaining = 500K, gpCarry = 100K, lpProfitShare = 400K
    //   distributed = 1M + 400K = 1.4M
    // Exit 2 at Q8: grossProceeds = 0, nothing added
    // Final: paidIn = 1M, distributed = 1.4M, gpCarryTotal = 100K
    // Total fund profit = 1.4M + 100K - 1M = 500K
    // LP floor = 1M, LP current = 1.4M > 1M, no clawback needed
    expect(result.totals.paidIn).toBe(1000000);
    expect(result.totals.distributed).toBe(1400000);
    expect(result.totals.gpCarryTotal).toBe(100000);
    expect(result.totals.gpClawback).toBeUndefined(); // LP is above floor
    expect(result.totals.dpi).toBe(1.4);
  });

  it('should properly clawback when fund shows loss after early profits', () => {
    // Scenario where early exits look profitable but overall fund is a loss
    const config = {
      carryPct: 0.2,
      clawbackEnabled: true,
      clawbackLpHurdleMultiple: 1.0,
    };
    const contributions = [
      { quarter: 1, amount: 200000 },
      { quarter: 2, amount: 800000 },
    ];
    // Exit 1: Early small exit (Q2 contribution already counted since Q2 <= Q3)
    // Exit 2: Later, partial recovery
    const exits = [
      { quarter: 3, grossProceeds: 400000 }, // 400K gross
      { quarter: 8, grossProceeds: 500000 }, // 500K gross
    ];

    const result = calculateAmericanWaterfallLedger(config, contributions, exits);

    // Exit 1 at Q3: updatePaidInUpTo(3) counts Q1 + Q2 (both <= Q3)
    //   paidIn = 1M
    //   outstanding = 1M, lpCapitalReturn = 400K
    //   remaining = 0, gpCarry = 0, lpProfitShare = 0
    //   distributed = 400K
    // Exit 2 at Q8:
    //   outstanding = 1M - 400K = 600K
    //   lpCapitalReturn = 500K, remaining = 0
    //   gpCarry = 0, lpProfitShare = 0
    //   distributed = 400K + 500K = 900K
    // Final: paidIn = 1M, distributed = 900K, gpCarryTotal = 0
    // Fund is at 0.9x - no carry was ever earned, no clawback needed
    expect(result.totals.paidIn).toBe(1000000);
    expect(result.totals.distributed).toBe(900000);
    expect(result.totals.gpCarryTotal).toBe(0);
    expect(result.totals.gpClawback).toBeUndefined();
    expect(result.totals.dpi).toBe(0.9);
  });
});
