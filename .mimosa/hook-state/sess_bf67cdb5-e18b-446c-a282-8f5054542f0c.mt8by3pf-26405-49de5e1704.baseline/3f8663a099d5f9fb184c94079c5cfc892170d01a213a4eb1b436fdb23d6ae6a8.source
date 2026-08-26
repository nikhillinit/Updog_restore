/**
 * Cohort Analysis Module
 *
 * Exports all cohort analysis functionality including:
 * - CohortEngine (legacy Exit Cohort Model surface for exit/value progression)
 * - Resolvers (sector and vintage resolution)
 * - Company cohorts (company-level cohort key computation)
 * - Cash flows (lots-based cash flow events)
 * - Metrics (DPI, TVPI, IRR calculation)
 */

// Legacy Exit Cohort Model surface
export { CohortEngine, generateCohortSummary, compareCohorts } from './CohortEngine';

// Analysis Cohort pipeline (client shim over shared/core/cohorts/analysis)
export { analyzeCohorts, type AnalyzeCohortInput } from './advanced-engine';

// Resolvers
export { getResolvedInvestments, getUnmappedSectors, type ResolutionInput } from './resolvers';

// Company cohorts
export { computeCompanyCohortKeys, getShiftedCompanies, countCompanies } from './company-cohorts';

// Cash flows
export {
  getCashFlowEvents,
  groupEventsByCohortSector,
  aggregateCashFlowsByDate,
  calculateCashFlowTotals,
  hasResidualValue,
  type LotData,
  type CashFlowInput,
} from './cash-flows';

// Metrics
export {
  calculateXIRR,
  calculateDPI,
  calculateTVPI,
  calculateMetricsFromEvents,
  generateCohortRow,
  type CohortMetrics,
  type CohortRowInput,
} from './metrics';
