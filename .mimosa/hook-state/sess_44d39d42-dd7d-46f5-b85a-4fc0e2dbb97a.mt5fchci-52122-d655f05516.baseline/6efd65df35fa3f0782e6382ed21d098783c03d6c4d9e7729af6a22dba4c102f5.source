/**
 * Selector Exports
 *
 * Barrel file for all KPI selectors and utilities.
 * Import from this file for cleaner imports.
 *
 * @example
 * ```typescript
 * import { selectAllKPIs, safeXIRR } from '@/core/selectors';
 * ```
 */

// Type exports
export type {
  Fund,
  FundData,
  Investment,
  Valuation,
  CapitalCall,
  Distribution,
  FeeExpense,
  CashFlowEvent,
  FundKPIs,
  AsOfOptions,
  KPIResult,
} from '../types/fund-domain';

// Selector exports
export {
  selectCommitted,
  selectCalled,
  selectUncalled,
  selectInvested,
  selectDistributions,
  selectNAV,
  selectDPI,
  selectTVPI,
  selectIRR,
  selectAllKPIs,
  formatKPI,
} from './fund-kpis';

// XIRR utility exports (from canonical implementation)
export {
  xirrNewtonBisection,
  safeXIRR,
  buildCashflowSchedule,
  calculateIRRFromPeriods,
  type CashFlow,
  type CashFlowEvent as XIRRCashFlowEvent,
  type XIRRResult,
  type SafeXIRRResult,
} from '@/lib/finance/xirr';

// Type guards
export { isFund, isFundData } from '../types/fund-domain';
