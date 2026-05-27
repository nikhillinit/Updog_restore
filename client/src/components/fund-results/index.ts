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
export { ScenarioSetsSummary } from './ScenarioSetsSummary';
export { EngineMetricsGrid } from './EngineMetricsGrid';

export type { FundModelScorecardProps } from './FundModelScorecard';
export type { ReserveAllocationBreakdownProps } from './ReserveAllocationBreakdown';
export type { ScenarioComparisonTableProps } from './ScenarioComparisonTable';
export type { FundScenarioComparisonV1 } from '@shared/contracts/fund-scenario-comparison-v1.contract';
export type { ScenarioSetsSummaryProps } from './ScenarioSetsSummary';
export type { EngineMetricsGridProps } from './EngineMetricsGrid';
