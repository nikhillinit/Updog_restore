/**
 * Cohort Analysis Module
 *
 * Exports all cohort analysis functionality including:
 * - CohortEngine (main entry point)
 * - Resolvers (sector and vintage resolution)
 * - Company cohorts (company-level cohort key computation)
 * - Cash flows (lots-based cash flow events)
 * - Metrics (DPI, TVPI, IRR calculation)
 */

// Main engine
export { CohortEngine, generateCohortSummary, compareCohorts } from './CohortEngine';

// Advanced cohort analysis
export { analyzeCohorts, type AnalyzeCohortInput } from './advanced-engine';

// Resolvers
export { getResolvedInvestments, getUnmappedSectors, type ResolutionInput } from './resolvers';

// Company cohorts
export {
  computeCompanyCohortKeys,
  getShiftedCompanies,
  countCompanies,
} from './company-cohorts';

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
