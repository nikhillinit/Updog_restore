/**
 * LP Reporting -- XIRR diagnostic formatter.
 *
 * Maps the locked `(convergence, boundHit, failureReason)` tuple from
 * `XirrDiagnosticSchema` to a deterministic display tuple of label,
 * tone, and human-readable description. Pure function -- no
 * formatting state, no side effects.
 *
 * @module client/lib/format/lp-reporting/xirr
 * @see shared/contracts/lp-reporting/lp-metric-run.contract.ts
 * @see docs/adr/ADR-010-xirr-day-count-and-bounds.md
 */

import type { XirrDiagnostic, XirrFailureReason } from '@shared/contracts/lp-reporting';

export type XirrFormatTone = 'ok' | 'warn' | 'fail';

export interface FormattedXirrConvergence {
  label: string;
  tone: XirrFormatTone;
  description: string;
}

const FAILURE_DESCRIPTIONS: Record<XirrFailureReason, string> = {
  INSUFFICIENT_CASH_FLOWS: 'XIRR requires at least one positive and one negative cash flow.',
  NO_SIGN_CHANGE: 'No sign change in the cash-flow series; XIRR has no real root.',
  MULTIPLE_ROOTS: 'Multiple sign changes in the cash-flow series produced ambiguous roots.',
  OUT_OF_BOUNDS_HIGH: 'Search exceeded the upper IRR bound.',
  OUT_OF_BOUNDS_LOW: 'Search exceeded the lower IRR bound.',
  NUMERICAL_INSTABILITY: 'Solver did not converge within the iteration / tolerance budget.',
};

/**
 * Map a locked XIRR diagnostic to a deterministic display tuple.
 *
 * - `convergence === 'converged'` always returns `tone = 'ok'`.
 * - `'bounded_high' | 'bounded_low'` returns `tone = 'warn'`.
 * - `'failed'` returns `tone = 'fail'` with a description derived
 *   from `failureReason` when present.
 */
export function formatXirrConvergence(diagnostic: XirrDiagnostic): FormattedXirrConvergence {
  switch (diagnostic.convergence) {
    case 'converged':
      return {
        label: 'Converged',
        tone: 'ok',
        description: `Solver converged in ${diagnostic.iterations} iteration${
          diagnostic.iterations === 1 ? '' : 's'
        } via ${diagnostic.method}.`,
      };
    case 'bounded_high':
      return {
        label: 'Bounded high',
        tone: 'warn',
        description:
          'IRR pinned to the upper search bound; reported value is a lower-bound estimate.',
      };
    case 'bounded_low':
      return {
        label: 'Bounded low',
        tone: 'warn',
        description:
          'IRR pinned to the lower search bound; reported value is an upper-bound estimate.',
      };
    case 'failed': {
      const reason = diagnostic.failureReason;
      const description =
        reason !== null
          ? FAILURE_DESCRIPTIONS[reason]
          : 'Solver failed without a structured failure reason.';
      return {
        label: 'Failed',
        tone: 'fail',
        description,
      };
    }
  }
}
