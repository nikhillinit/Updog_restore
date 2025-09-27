export interface AmericanWaterfallConfig {
  carryPct: number;              // e.g., 0.20
  hurdleRate?: number;           // optional pref; if unset, treated as 0
  // Optional recycling (if you decide to expose later — defaults harmless):
  recyclingEnabled?: boolean;
  recyclingCapPctOfCommitted?: number;  // e.g., 0.15 (15% of committed)
  recyclingWindowQuarters?: number;     // e.g., 12 (Q1..Q12)
  recyclingTakePctPerEvent?: number;    // conservative skim of LP proceeds (e.g., 0.5)
}

export interface ContributionCF {
  quarter: number;
  amount: number; // positive; capital paid-in by LPs
}
export interface ExitCF {
  quarter: number;
  grossProceeds: number; // positive; distributable gross exit proceeds
}

// One row per exit event:
export interface WaterfallRow {
  quarter: number;
  grossProceeds: number;
  lpCapitalReturn: number;
  lpProfitShare: number; // LP share of profits after carry
  gpCarry: number;
  recycledAmount: number; // reinvested (treated as reducing distributions this event)
  running: {
    paidIn: number;       // cumulative contributions
    distributed: number;  // cumulative distributions to LP (net of recycling)
    recycled: number;     // cumulative recycled amount
    unrealizedCapital: number; // max(paidIn - distributed, 0)
    dpi: number;          // distributed / paidIn
    tvpi: number;         // (distributed + unrealized) / paidIn
  };
}

export interface AmericanWaterfallResult {
  rows: WaterfallRow[];
  totals: {
    paidIn: number;
    distributed: number;
    recycled: number;
    unrealizedCapital: number;
    dpi: number;
    tvpi: number;
    gpCarryTotal: number;
  };
}

/**
 * Pure American waterfall (deal- or event-level) over a sequence of exits.
 * Assumptions:
 *   - Capital calls provided as contributions[] (positive amounts).
 *   - gross exits provided in exits[], chronological by quarter.
 *   - Waterfall: return remaining LP paid-in first (capital return), then split profits into LP and GP carry.
 *   - Optional recycling skims part of LP payouts (up to cap within window).
 */
export function calculateAmericanWaterfallLedger(
  cfg: AmericanWaterfallConfig,
  contributions: ContributionCF[],
  exits: ExitCF[]
): AmericanWaterfallResult {
  const carry = Math.max(0, Math.min(1, cfg.carryPct));
  const hurdleRate = cfg.hurdleRate ?? 0;
  const recycleOn = !!cfg.recyclingEnabled;
  const recycleCap = Math.max(0, cfg.recyclingCapPctOfCommitted ?? 0);
  const recycleWindow = cfg.recyclingWindowQuarters ?? 0;
  const recycleTakePct = Math.max(0, Math.min(1, cfg.recyclingTakePctPerEvent ?? 0.5));

  // Precompute cumulative paid-in per quarter
  const contribByQuarter = new Map<number, number>();
  for (const c of contributions) {
    contribByQuarter.set(c.quarter, (contribByQuarter.get(c.quarter) ?? 0) + Math.max(0, c.amount));
  }

  // Determine committed (for recycle cap)
  const committed = contributions.reduce((s, c) => s + Math.max(0, c.amount), 0);

  let paidIn = 0;
  let distributed = 0;
  let recycled = 0;
  let gpCarryTotal = 0;

  // Helper to recompute DPI/TVPI on the fly
  const mkRunning = (): { unrealized: number; dpi: number; tvpi: number } => {
    const unrealized = Math.max(0, paidIn - distributed);
    const dpi = paidIn > 0 ? distributed / paidIn : 0;
    const tvpi = paidIn > 0 ? (distributed + unrealized) / paidIn : 0;
    return { unrealized, dpi, tvpi };
  };

  // Update paid-in for quarters with exits (and any earlier quarters if sparse)
  const updatePaidInUpTo = (quarter: number) => {
    for (const [q, amt] of contribByQuarter) {
      if (q <= quarter && amt > 0) {
        paidIn += amt;
        contribByQuarter.set(q, 0);
      }
    }
  };

  const rows: WaterfallRow[] = [];
  for (const ev of exits) {
    const q = ev.quarter;
    const gross = Math.max(0, ev.grossProceeds);

    // Pull in contributions up to this quarter
    updatePaidInUpTo(q);

    // Step 1: LP capital return (limited by outstanding)
    const outstandingCapital = Math.max(0, paidIn - distributed);
    const lpCapitalReturn = Math.min(gross, outstandingCapital);
    let remaining = gross - lpCapitalReturn;

    // Step 2: profits split after any hurdle logic
    // For simplicity, treat hurdle as a minimum return above paid-in at event time.
    // With deal-by-deal American carry, a typical pattern is: capital return first (done),
    // then carry on the remaining profit. If you require a stricter time-based pref,
    // you can parameterize/extend this block.
    const excessProfit = Math.max(0, remaining - (hurdleRate > 0 ? outstandingCapital * hurdleRate : 0));
    const gpCarry = excessProfit * carry;
    const lpProfitShare = remaining - gpCarry;
    gpCarryTotal += gpCarry;

    // Step 3: optional recycling (skim from LP proceeds this event)
    let recycledAmount = 0;
    if (recycleOn && q <= recycleWindow && recycleCap > 0) {
      const maxCapDollars = committed * recycleCap;
      const room = Math.max(0, maxCapDollars - recycled);
      const availableForRecycling = lpCapitalReturn + lpProfitShare;
      recycledAmount = Math.min(availableForRecycling * recycleTakePct, room);
    }

    // Step 4: update distributed + recycled
    distributed += (lpCapitalReturn + lpProfitShare - recycledAmount);
    recycled += recycledAmount;

    const run = mkRunning();
    rows.push({
      quarter: q,
      grossProceeds: gross,
      lpCapitalReturn,
      lpProfitShare,
      gpCarry,
      recycledAmount,
      running: {
        paidIn,
        distributed,
        recycled,
        unrealizedCapital: run.unrealized,
        dpi: run.dpi,
        tvpi: run.tvpi,
      },
    });
  }

  const run = mkRunning();
  return {
    rows,
    totals: {
      paidIn,
      distributed,
      recycled,
      unrealizedCapital: run.unrealized,
      dpi: run.dpi,
      tvpi: run.tvpi,
      gpCarryTotal,
    },
  };
}