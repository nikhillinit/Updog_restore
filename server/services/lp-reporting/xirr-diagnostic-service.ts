/**
 * LP Reporting -- XIRR Diagnostic Wrapper.
 *
 * Wraps the canonical XIRR solver in shared/lib/finance/xirr.ts and
 * surfaces a structured diagnostic that matches XirrDiagnosticSchema
 * from Phase 1.1.
 *
 * Pre-flight checks classify obvious failure modes without invoking the
 * solver (INSUFFICIENT_CASH_FLOWS, NO_SIGN_CHANGE).  Post-flight checks
 * map solver outcomes onto the contract enums (converged, bounded_high,
 * bounded_low, failed) and reasons (OUT_OF_BOUNDS_HIGH, OUT_OF_BOUNDS_LOW,
 * NUMERICAL_INSTABILITY).
 *
 * Policy: ADR-010 (Actual/365.25 day-count, rate bounds [-0.999999, 200]).
 * The MIN_RATE / MAX_RATE constants in xirr.ts are file-local and not
 * exported; we mirror their literal values here for the bound-hit check.
 *
 * @module server/services/lp-reporting/xirr-diagnostic-service
 * @see docs/adr/ADR-010-xirr-day-count-and-bounds.md
 * @see shared/lib/finance/xirr.ts
 */

import { xirrNewtonBisection, type CashFlow, type XIRRResult } from '@shared/lib/finance/xirr';
import type { XirrDiagnostic } from '@shared/contracts/lp-reporting';

// Mirror of file-local constants in shared/lib/finance/xirr.ts (ADR-010).
// xirr.ts clamps out-of-bounds rates to exactly these values; we compare
// the returned irr against the literals to detect bound hits.
const MIN_RATE = -0.999999;
const MAX_RATE = 200;

export interface XirrDiagnosticResult {
  /** Raw IRR as JS number; null when undefined or solver failed. Engine wraps. */
  irr: number | null;
  /** Structured diagnostic; matches XirrDiagnosticSchema exactly. */
  diagnostic: XirrDiagnostic;
}

/**
 * Classify an XIRR computation by running the canonical solver and
 * mapping the result onto the Phase 1.1 diagnostic contract.
 *
 * @param cashFlows - cash flows in the canonical CashFlow shape (Date + number)
 */
export function xirrDiagnostic(cashFlows: CashFlow[]): XirrDiagnosticResult {
  // Pre-flight: <2 flows -> INSUFFICIENT_CASH_FLOWS.
  if (cashFlows.length < 2) {
    return {
      irr: null,
      diagnostic: {
        convergence: 'failed',
        iterations: 0,
        method: 'none',
        boundHit: null,
        failureReason: 'INSUFFICIENT_CASH_FLOWS',
      },
    };
  }

  // Pre-flight: same-sign -> NO_SIGN_CHANGE.
  // We require both a strictly negative and strictly positive flow.  A run
  // of all-zeros also falls into this bucket (no economic content).
  const hasNegative = cashFlows.some((cf) => cf.amount < 0);
  const hasPositive = cashFlows.some((cf) => cf.amount > 0);
  if (!hasNegative || !hasPositive) {
    return {
      irr: null,
      diagnostic: {
        convergence: 'failed',
        iterations: 0,
        method: 'none',
        boundHit: null,
        failureReason: 'NO_SIGN_CHANGE',
      },
    };
  }

  const result: XIRRResult = xirrNewtonBisection(cashFlows);

  // Post-flight: solver returned irr=null after pre-flight passed -> instability.
  if (result.irr === null) {
    return {
      irr: null,
      diagnostic: {
        convergence: 'failed',
        iterations: result.iterations,
        method: result.method,
        boundHit: null,
        failureReason: 'NUMERICAL_INSTABILITY',
      },
    };
  }

  // Post-flight: bound clamps (xirr.ts clamps to exactly MAX_RATE / MIN_RATE).
  if (result.irr === MAX_RATE) {
    return {
      irr: result.irr,
      diagnostic: {
        convergence: 'bounded_high',
        iterations: result.iterations,
        method: result.method,
        boundHit: 'max',
        failureReason: 'OUT_OF_BOUNDS_HIGH',
      },
    };
  }
  if (result.irr === MIN_RATE) {
    return {
      irr: result.irr,
      diagnostic: {
        convergence: 'bounded_low',
        iterations: result.iterations,
        method: result.method,
        boundHit: 'min',
        failureReason: 'OUT_OF_BOUNDS_LOW',
      },
    };
  }

  // Converged within bounds.
  return {
    irr: result.irr,
    diagnostic: {
      convergence: 'converged',
      iterations: result.iterations,
      method: result.method,
      boundHit: null,
      failureReason: null,
    },
  };
}
