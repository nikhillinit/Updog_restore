/**
 * Waterfall-Ledger Truth Case Adapter
 *
 * Maps truth case JSON structure to production function signatures.
 * Production function: calculateAmericanWaterfallLedger() in client/src/lib/waterfall/american-ledger.ts
 *
 * @see docs/waterfall-ledger.truth-cases.json
 * @see client/src/lib/waterfall/american-ledger.ts
 */

import type {
  AmericanWaterfallConfig,
  ContributionCF,
  ExitCF,
  AmericanWaterfallResult,
} from '../../../client/src/lib/waterfall/american-ledger';

/**
 * Truth case structure from docs/waterfall-ledger.truth-cases.json
 */
export interface WaterfallLedgerTruthCase {
  scenario: string;
  tags: string[];
  notes: string;
  source?: string;
  input: {
    config: {
      carryPct: number;
      hurdleRate?: number;
      recyclingEnabled?: boolean;
      recyclingCapPctOfCommitted?: number;
      recyclingWindowQuarters?: number;
      recyclingTakePctPerEvent?: number;
      clawbackEnabled?: boolean;
      clawbackLpHurdleMultiple?: number;
    };
    contributions: Array<{ quarter: number; amount: number }>;
    exits: Array<{ quarter: number; grossProceeds: number }>;
  };
  expected: {
    totals: {
      paidIn?: number;
      distributed?: number;
      gpCarryTotal?: number;
      gpClawback?: number | null;
      gpCarryNet?: number;
      dpi?: number;
      tvpi?: number;
      recycled_min?: number;
      recycled_max?: number;
      notes?: string;
    };
    rows?: Array<{
      quarter: number;
      lpCapitalReturn?: number;
      gpCarry?: number;
      gpClawback?: number;
      notes?: string;
    }>;
    rows_count?: number;
    clawback_row?: {
      quarter?: number;
      grossProceeds?: number;
      gpClawback: number;
      gpCarry: number;
      lpCapitalReturn: number;
    };
  };
}

/**
 * Adapts truth case JSON to production function input.
 * Maps directly since truth case structure mirrors production API.
 */
export function adaptWaterfallLedgerTruthCase(tc: WaterfallLedgerTruthCase): {
  config: AmericanWaterfallConfig;
  contributions: ContributionCF[];
  exits: ExitCF[];
} {
  const { config, contributions, exits } = tc.input;

  return {
    config: {
      carryPct: config.carryPct,
      hurdleRate: config.hurdleRate,
      recyclingEnabled: config.recyclingEnabled,
      recyclingCapPctOfCommitted: config.recyclingCapPctOfCommitted,
      recyclingWindowQuarters: config.recyclingWindowQuarters,
      recyclingTakePctPerEvent: config.recyclingTakePctPerEvent,
      clawbackEnabled: config.clawbackEnabled,
      clawbackLpHurdleMultiple: config.clawbackLpHurdleMultiple,
    },
    contributions: contributions.map((c) => ({
      quarter: c.quarter,
      amount: c.amount,
    })),
    exits: exits.map((e) => ({
      quarter: e.quarter,
      grossProceeds: e.grossProceeds,
    })),
  };
}

/**
 * Validates waterfall-ledger result against expected values.
 * Handles partial expected values (not all fields required in truth case).
 *
 * @param result - Production function output
 * @param expected - Expected values from truth case
 * @param tolerance - Numeric tolerance for floating point comparisons
 * @returns Validation result with pass/fail status and details
 */
export function validateWaterfallLedgerResult(
  result: AmericanWaterfallResult,
  expected: WaterfallLedgerTruthCase['expected'],
  tolerance = 0.01
): { pass: boolean; failures: string[] } {
  const failures: string[] = [];

  const { totals } = expected;

  // Validate totals (only check fields present in expected)
  if (totals.paidIn !== undefined) {
    if (Math.abs(result.totals.paidIn - totals.paidIn) > tolerance) {
      failures.push(`paidIn: expected ${totals.paidIn}, got ${result.totals.paidIn}`);
    }
  }

  if (totals.distributed !== undefined) {
    if (Math.abs(result.totals.distributed - totals.distributed) > tolerance) {
      failures.push(
        `distributed: expected ${totals.distributed}, got ${result.totals.distributed}`
      );
    }
  }

  if (totals.gpCarryTotal !== undefined) {
    if (Math.abs(result.totals.gpCarryTotal - totals.gpCarryTotal) > tolerance) {
      failures.push(
        `gpCarryTotal: expected ${totals.gpCarryTotal}, got ${result.totals.gpCarryTotal}`
      );
    }
  }

  // Handle gpClawback: null means "not triggered", undefined means "not specified"
  if (totals.gpClawback !== undefined) {
    if (totals.gpClawback === null) {
      // Expected: no clawback triggered
      if (result.totals.gpClawback !== undefined && result.totals.gpClawback > 0) {
        failures.push(`gpClawback: expected null (no clawback), got ${result.totals.gpClawback}`);
      }
    } else {
      // Expected: specific clawback amount
      const actualClawback = result.totals.gpClawback ?? 0;
      if (Math.abs(actualClawback - totals.gpClawback) > tolerance) {
        failures.push(`gpClawback: expected ${totals.gpClawback}, got ${actualClawback}`);
      }
    }
  }

  if (totals.gpCarryNet !== undefined) {
    const actualNet = result.totals.gpCarryNet ?? result.totals.gpCarryTotal;
    if (Math.abs(actualNet - totals.gpCarryNet) > tolerance) {
      failures.push(`gpCarryNet: expected ${totals.gpCarryNet}, got ${actualNet}`);
    }
  }

  if (totals.dpi !== undefined) {
    if (Math.abs(result.totals.dpi - totals.dpi) > tolerance) {
      failures.push(`dpi: expected ${totals.dpi}, got ${result.totals.dpi}`);
    }
  }

  if (totals.tvpi !== undefined) {
    if (Math.abs(result.totals.tvpi - totals.tvpi) > tolerance) {
      failures.push(`tvpi: expected ${totals.tvpi}, got ${result.totals.tvpi}`);
    }
  }

  // Handle recycled range checks
  if (totals.recycled_min !== undefined || totals.recycled_max !== undefined) {
    const actualRecycled = result.totals.recycled ?? 0;
    if (totals.recycled_min !== undefined && actualRecycled < totals.recycled_min) {
      failures.push(`recycled: expected >= ${totals.recycled_min}, got ${actualRecycled}`);
    }
    if (totals.recycled_max !== undefined && actualRecycled > totals.recycled_max) {
      failures.push(`recycled: expected <= ${totals.recycled_max}, got ${actualRecycled}`);
    }
  }

  // Validate row count if specified
  if (expected.rows_count !== undefined) {
    if (result.rows.length !== expected.rows_count) {
      failures.push(`rows_count: expected ${expected.rows_count}, got ${result.rows.length}`);
    }
  }

  // Validate specific rows if specified
  if (expected.rows) {
    expected.rows.forEach((expectedRow) => {
      const resultRow = result.rows.find((r) => r.quarter === expectedRow.quarter);
      if (!resultRow) {
        failures.push(`row[q=${expectedRow.quarter}]: not found in result`);
        return;
      }

      if (
        expectedRow.lpCapitalReturn !== undefined &&
        Math.abs(resultRow.lpCapitalReturn - expectedRow.lpCapitalReturn) > tolerance
      ) {
        failures.push(
          `row[q=${expectedRow.quarter}].lpCapitalReturn: expected ${expectedRow.lpCapitalReturn}, got ${resultRow.lpCapitalReturn}`
        );
      }

      if (
        expectedRow.gpCarry !== undefined &&
        Math.abs(resultRow.gpCarry - expectedRow.gpCarry) > tolerance
      ) {
        failures.push(
          `row[q=${expectedRow.quarter}].gpCarry: expected ${expectedRow.gpCarry}, got ${resultRow.gpCarry}`
        );
      }
    });
  }

  // Validate clawback row if specified
  if (expected.clawback_row) {
    const clawbackRow = result.rows.find((r) => r.gpClawback && r.gpClawback > 0);
    if (!clawbackRow) {
      failures.push('clawback_row: expected clawback row not found');
    } else {
      const cr = expected.clawback_row;
      if (
        cr.gpClawback !== undefined &&
        Math.abs((clawbackRow.gpClawback ?? 0) - cr.gpClawback) > tolerance
      ) {
        failures.push(
          `clawback_row.gpClawback: expected ${cr.gpClawback}, got ${clawbackRow.gpClawback}`
        );
      }
      if (cr.gpCarry !== undefined && Math.abs(clawbackRow.gpCarry - cr.gpCarry) > tolerance) {
        failures.push(`clawback_row.gpCarry: expected ${cr.gpCarry}, got ${clawbackRow.gpCarry}`);
      }
      if (
        cr.lpCapitalReturn !== undefined &&
        Math.abs(clawbackRow.lpCapitalReturn - cr.lpCapitalReturn) > tolerance
      ) {
        failures.push(
          `clawback_row.lpCapitalReturn: expected ${cr.lpCapitalReturn}, got ${clawbackRow.lpCapitalReturn}`
        );
      }
    }
  }

  return {
    pass: failures.length === 0,
    failures,
  };
}
