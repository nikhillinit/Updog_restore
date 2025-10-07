/**
 * Unified Metrics Layer - Type Definitions
 *
 * This file defines the canonical types for all fund metrics across the platform.
 * These types serve as the single source of truth for metric data structures,
 * ensuring consistency between:
 * - Database queries (actual data)
 * - Deterministic calculation engines (projections)
 * - Fund configuration (targets)
 * - UI display components
 *
 * @module shared/types/metrics
 */

/**
 * ActualMetrics - Real portfolio performance data
 *
 * Source: Direct calculation from database tables:
 * - portfolio_companies (valuations, status)
 * - investments (capital deployed)
 * - fund_metrics (cached calculations)
 * - capital_calls, distributions (cashflows)
 *
 * These represent the ground truth of what has actually happened in the fund.
 */
export interface ActualMetrics {
  /** ISO timestamp when these metrics were calculated */
  asOfDate: string;

  // === Capital Structure ===

  /** Total LP + GP commitments (fund size) - Source: funds.size */
  totalCommitted: number;

  /** Total capital called from LPs - Source: SUM(capital_calls.amount) */
  totalCalled: number;

  /** Total capital actually deployed into companies - Source: SUM(investments.amount) */
  totalDeployed: number;

  /** Remaining dry powder - Calculated: totalCommitted - totalCalled */
  totalUncalled: number;

  // === Portfolio Value ===

  /** Current unrealized value (Fair Market Value) - Source: SUM(portfolio_companies.current_valuation WHERE status='active') */
  currentNAV: number;

  /** Total cash returned to LPs - Source: SUM(distributions.amount) */
  totalDistributions: number;

  /** Total portfolio value - Calculated: currentNAV + totalDistributions */
  totalValue: number;

  // === Performance Metrics ===

  /** Internal Rate of Return - Calculated: XIRR(cashflows, currentNAV) */
  irr: number;

  /** Total Value to Paid-In - Calculated: totalValue / totalCalled */
  tvpi: number;

  /** Distributions to Paid-In - Calculated: totalDistributions / totalCalled
   * NOTE: null when no distributions have been recorded (early-stage funds)
   * Display as "N/A" in UI to avoid misleading 0.00x
   */
  dpi: number | null;

  /** Residual Value to Paid-In - Calculated: currentNAV / totalCalled */
  rvpi: number;

  // === Portfolio Composition ===

  /** Count of active portfolio companies - Source: COUNT(portfolio_companies WHERE status='active') */
  activeCompanies: number;

  /** Count of exited companies - Source: COUNT(portfolio_companies WHERE status='exited') */
  exitedCompanies: number;

  /** Count of written-off companies - Source: COUNT(portfolio_companies WHERE status='written-off') */
  writtenOffCompanies: number;

  /** Total company count - Calculated: activeCompanies + exitedCompanies + writtenOffCompanies */
  totalCompanies: number;

  // === Deployment Metrics ===

  /** Percentage of fund deployed - Calculated: (totalDeployed / totalCommitted) * 100 */
  deploymentRate: number;

  /** Average check size - Calculated: totalDeployed / totalCompanies */
  averageCheckSize: number;

  /** Months since fund establishment - Source: DATEDIFF(NOW(), funds.establishment_date) */
  fundAgeMonths?: number;
}

/**
 * ProjectedMetrics - Model-based forecasts from deterministic engines
 *
 * Source: Calculation engines:
 * - DeterministicReserveEngine (reserve needs, follow-on strategy)
 * - PacingEngine (deployment timing, pacing analysis)
 * - CohortEngine (cohort-based exit modeling)
 * - MonteCarloSimulation (probabilistic scenarios)
 *
 * These represent what the models expect to happen based on fund strategy and assumptions.
 */
export interface ProjectedMetrics {
  /** ISO timestamp when the source data was captured */
  asOfDate: string;

  /** ISO timestamp when these projections were computed */
  projectionDate: string;

  // === Future Cashflows (quarterly arrays, index 0 = next quarter) ===

  /** Projected capital deployment by quarter (in dollars) - Source: PacingEngine + ReserveEngine */
  projectedDeployment: number[];

  /** Projected distributions by quarter (in dollars) - Source: CohortEngine (exit model) */
  projectedDistributions: number[];

  /** Projected NAV by quarter - Source: CohortEngine (valuation progression) */
  projectedNAV: number[];

  // === Expected Performance at Fund End ===

  /** Expected Total Value to Paid-In at fund maturity - Source: CohortEngine */
  expectedTVPI: number;

  /** Expected Internal Rate of Return at fund maturity - Source: CohortEngine + XIRR calculation */
  expectedIRR: number;

  /** Expected Distributions to Paid-In at fund maturity - Source: CohortEngine */
  expectedDPI: number;

  // === Reserve Planning ===

  /** Total reserves needed for follow-on investments - Source: DeterministicReserveEngine */
  totalReserveNeeds: number;

  /** Reserves already allocated to specific companies - Source: DeterministicReserveEngine */
  allocatedReserves: number;

  /** Unallocated reserves available for new opportunities - Calculated: totalReserveNeeds - allocatedReserves */
  unallocatedReserves: number;

  /** Percentage of reserves already allocated - Calculated: (allocatedReserves / totalReserveNeeds) * 100 */
  reserveAllocationRate: number;

  // === Pacing Analysis ===

  /** Deployment pace relative to plan - Source: PacingEngine */
  deploymentPace: 'ahead' | 'on-track' | 'behind';

  /** Quarters remaining in investment period - Source: PacingEngine */
  quartersRemaining: number;

  /** Recommended deployment per quarter to meet targets - Source: PacingEngine */
  recommendedQuarterlyDeployment: number;

  /** Probability of meeting deployment targets (0-1) - Source: MonteCarloSimulation (optional) */
  deploymentProbability?: number;

  // === Scenario Analysis (optional) ===

  /** Optimistic scenario TVPI (75th percentile) - Source: MonteCarloSimulation */
  optimisticTVPI?: number;

  /** Pessimistic scenario TVPI (25th percentile) - Source: MonteCarloSimulation */
  pessimisticTVPI?: number;

  /** Expected range for IRR [min, max] - Source: MonteCarloSimulation */
  irrRange?: [number, number];
}

/**
 * TargetMetrics - Fund goals and objectives
 *
 * Source: Fund configuration (fund_configs table + fund setup wizard)
 *
 * These represent what the fund is trying to achieve (the "plan").
 */
export interface TargetMetrics {
  /** Target fund size (total commitments goal) - Source: fund_configs.target_fund_size */
  targetFundSize: number;

  /** Target net IRR to LPs - Source: fund_configs.target_irr */
  targetIRR: number;

  /** Target TVPI multiple - Source: fund_configs.target_tvpi */
  targetTVPI: number;

  /** Target DPI at fund end - Source: fund_configs.target_dpi (optional) */
  targetDPI?: number;

  /** Target number of years for initial deployment - Source: fund_configs.target_deployment_years */
  targetDeploymentYears: number;

  /** Target total number of portfolio companies - Source: fund_configs.target_company_count */
  targetCompanyCount: number;

  /** Target average check size - Calculated: targetFundSize / targetCompanyCount */
  targetAverageCheckSize: number;

  /** Target reserve ratio (% of fund for follow-ons) - Source: fund_configs.reserve_ratio */
  targetReserveRatio?: number;
}

/**
 * VarianceMetrics - Performance vs expectations
 *
 * Source: Calculated from ActualMetrics, ProjectedMetrics, and TargetMetrics
 *
 * These show how the fund is performing relative to its plan and projections.
 */
export interface VarianceMetrics {
  /** Deployment vs target variance */
  deploymentVariance: {
    /** Actual deployment amount */
    actual: number;
    /** Target deployment amount (for current fund age) */
    target: number;
    /** Absolute variance (actual - target) */
    variance: number;
    /** Percentage deviation ((variance / target) * 100) */
    percentDeviation: number;
    /** Status indicator */
    status: 'ahead' | 'on-track' | 'behind';
  };

  /** Performance vs target variance */
  performanceVariance: {
    /** Actual IRR */
    actualIRR: number;
    /** Target IRR */
    targetIRR: number;
    /** Variance in percentage points (actualIRR - targetIRR) */
    variance: number;
    /** Status indicator */
    status: 'above' | 'on-track' | 'below';
  };

  /** TVPI vs target variance */
  tvpiVariance: {
    /** Actual TVPI */
    actual: number;
    /** Expected TVPI from projections */
    projected: number;
    /** Target TVPI */
    target: number;
    /** Variance vs projection */
    varianceVsProjected: number;
    /** Variance vs target */
    varianceVsTarget: number;
  };

  /** Pacing variance */
  paceVariance: {
    /** Current pace status */
    status: 'ahead' | 'on-track' | 'behind';
    /** Months ahead/behind schedule (negative = behind) */
    monthsDeviation: number;
    /** Percentage of investment period elapsed */
    periodElapsedPercent: number;
    /** Percentage of capital deployed */
    capitalDeployedPercent: number;
  };

  /** Portfolio construction variance */
  portfolioVariance: {
    /** Actual company count */
    actualCompanies: number;
    /** Target company count */
    targetCompanies: number;
    /** Variance */
    variance: number;
    /** On track to meet target? */
    onTrack: boolean;
  };
}

/**
 * UnifiedFundMetrics - The complete metrics package
 *
 * This is the top-level type returned by the Unified Metrics API.
 * It aggregates all metric types into a single, consistent structure.
 */
export interface UnifiedFundMetrics {
  /** Fund identifier */
  fundId: number;

  /** Fund name for display */
  fundName: string;

  /** Actual metrics from database */
  actual: ActualMetrics;

  /** Projected metrics from calculation engines */
  projected: ProjectedMetrics;

  /** Target metrics from fund configuration */
  target: TargetMetrics;

  /** Variance analysis (actual vs projected vs target) */
  variance: VarianceMetrics;

  /** ISO timestamp when this unified snapshot was created */
  lastUpdated: string;

  /** Cache metadata (optional) */
  _cache?: {
    /** Was this served from cache? */
    hit: boolean;
    /** Cache key used */
    key: string;
    /** TTL remaining in seconds */
    ttl?: number;
    /** Stale-while-revalidate indicator */
    staleWhileRevalidate?: boolean;
  };

  /** Calculation status metadata (partial failure transparency) */
  _status?: {
    /** Overall calculation quality */
    quality: 'complete' | 'partial' | 'fallback';
    /** Which engines succeeded/failed */
    engines: {
      actual: 'success' | 'partial' | 'failed';
      projected: 'success' | 'partial' | 'failed' | 'skipped';
      target: 'success' | 'partial' | 'failed';
      variance: 'success' | 'partial' | 'failed';
    };
    /** Human-readable warnings */
    warnings?: string[];
    /** Computation time in milliseconds */
    computeTimeMs?: number;
  };
}

/**
 * MetricsCalculationError - Standard error type for metrics failures
 */
export interface MetricsCalculationError {
  /** Error code for programmatic handling */
  code: 'INSUFFICIENT_DATA' | 'CALCULATION_FAILED' | 'ENGINE_ERROR' | 'CACHE_ERROR';

  /** Human-readable error message */
  message: string;

  /** Which component of metrics failed */
  component: 'actual' | 'projected' | 'target' | 'variance' | 'aggregator';

  /** Original error details */
  details?: unknown;

  /** ISO timestamp of error */
  timestamp: string;
}

/**
 * MetricsSource - Metadata about where a metric value came from
 *
 * Used for audit trails and transparency in the UI
 */
export interface MetricsSource {
  /** Type of source */
  type: 'database' | 'engine' | 'config' | 'calculated';

  /** Specific source identifier (table name, engine name, etc.) */
  identifier: string;

  /** When this data was sourced */
  timestamp: string;

  /** Optional version for engine calculations */
  version?: string;
}

/**
 * MetricSource - Data provenance for individual metric values
 *
 * Distinguishes between actual data, model projections, and forecasts
 * Used for UI transparency and source badges
 */
export type MetricSource =
  | 'actual'                // Real portfolio data from database
  | 'model'                 // Monte Carlo / projection from current state
  | 'construction_forecast' // J-curve forecast (no investments yet)
  | 'forecast'              // Generic forecast
  | 'N/A';                  // No data available

/**
 * MetricValue - Wrapped metric with source tracking
 *
 * Enables UI to display source badges and appropriate messaging
 * for metrics that come from different sources (actual vs forecasted)
 */
export interface MetricValue<T = number> {
  /** The metric value */
  value: T;

  /** Where this value came from */
  source: MetricSource;

  /** Optional confidence level for model-based metrics (0-1) */
  confidence?: number;

  /** Optional timestamp when this value was calculated */
  calculatedAt?: string;
}

/**
 * Type guard to check if a value is UnifiedFundMetrics
 */
export function isUnifiedFundMetrics(value: unknown): value is UnifiedFundMetrics {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['fundId'] === 'number' &&
    typeof v['fundName'] === 'string' &&
    typeof v['actual'] === 'object' &&
    typeof v['projected'] === 'object' &&
    typeof v['target'] === 'object' &&
    typeof v['variance'] === 'object' &&
    typeof v['lastUpdated'] === 'string'
  );
}
