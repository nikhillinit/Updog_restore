/**
 * Selector Exports
 *
 * Barrel file for all KPI selectors and utilities.
 * Import from this file for cleaner imports.
 *
 * @example
 * ```typescript
 * import { selectAllKPIs, calculateXIRR } from '@/core/selectors';
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

// XIRR utility exports
export {
  calculateXIRR,
  calculateSimpleIRR,
  verifyNPV,
  formatIRR,
  XIRRCalculationError,
} from './xirr';

// Type guards
export { isFund, isFundData } from '../types/fund-domain';
