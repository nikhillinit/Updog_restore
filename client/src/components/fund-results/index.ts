/**
 * Fund Results Components - Barrel Export
 *
 * @module client/components/fund-results
 */

export { FundModelScorecard } from './FundModelScorecard';
export { ReserveAllocationBreakdown } from './ReserveAllocationBreakdown';
export {
  ScenarioComparisonTable,
  SCENARIO_COMPARISON_METRIC_KEYS,
} from './ScenarioComparisonTable';
export {
  CrossSetScenarioComparisonTable,
  isComparableEconomicsComparison,
} from './CrossSetScenarioComparisonTable';
export { ScenarioSetsSummary } from './ScenarioSetsSummary';
export { EngineMetricsGrid } from './EngineMetricsGrid';
export { DecisionStateBadge } from './DecisionStateBadge';
export { FinancialEvidenceDrawer } from './FinancialEvidenceDrawer';
export { ForecastBasisControl, ScenarioOverlayControl } from './FundForecastModeSelector';
export {
  createFundResultsViewState,
  evidenceFromDualForecast,
  evidenceFromMoicBasis,
  evidenceFromScenarioComparison,
} from './financial-evidence';

export type { FundModelScorecardProps } from './FundModelScorecard';
export type { ReserveAllocationBreakdownProps } from './ReserveAllocationBreakdown';
export type { ScenarioComparisonTableProps } from './ScenarioComparisonTable';
export type { CrossSetScenarioComparisonTableProps } from './CrossSetScenarioComparisonTable';
export type { FundScenarioComparisonV1 } from '@shared/contracts/fund-scenario-comparison-v1.contract';
export type { ScenarioSetsSummaryProps } from './ScenarioSetsSummary';
export type { EngineMetricsGridProps } from './EngineMetricsGrid';
export type { DecisionState, DecisionStateBadgeProps } from './DecisionStateBadge';
export type {
  FinancialEvidenceDrawerProps,
  FinancialEvidenceDrawerStatus,
} from './FinancialEvidenceDrawer';
export type {
  ForecastBasisControlProps,
  ScenarioOverlayControlProps,
} from './FundForecastModeSelector';
export type {
  FinancialEvidence,
  ForecastBasis,
  FundResultsViewState,
  MoicBasisEvidenceSource,
  ScenarioOverlay,
} from './financial-evidence';
