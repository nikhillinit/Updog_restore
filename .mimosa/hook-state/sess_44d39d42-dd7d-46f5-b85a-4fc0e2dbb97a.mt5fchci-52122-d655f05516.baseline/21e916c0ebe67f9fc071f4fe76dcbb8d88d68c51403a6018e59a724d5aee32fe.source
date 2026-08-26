/**
 * XIRR (Extended Internal Rate of Return) Calculator
 *
 * This file re-exports from the canonical shared implementation.
 * Import from '@shared/lib/finance/xirr' for new code.
 *
 * @module client/lib/finance/xirr
 */

// Re-export everything from shared for backward compatibility
export {
  xirrNewtonBisection,
  safeXIRR,
  buildCashflowSchedule,
  calculateIRRFromPeriods,
  type CashFlow,
  type CashFlowEvent,
  type XIRRResult,
  type SafeXIRRResult,
} from '@shared/lib/finance/xirr';

// Also re-export brent solver for any direct users
export { brent, type BrentOptions, type BrentResult } from '@shared/lib/finance/brent-solver';
