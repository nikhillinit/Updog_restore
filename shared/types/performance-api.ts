/**
 * Performance API Type Definitions
 *
 * Types for the Portfolio Performance Dashboard API endpoints:
 * - GET /api/funds/:fundId/performance/timeseries
 * - GET /api/funds/:fundId/performance/breakdown
 * - GET /api/funds/:fundId/performance/comparison
 *
 * @module shared/types/performance-api
 */

import type { ActualMetrics, ProjectedMetrics, VarianceMetrics } from './metrics';

// ============================================================================
// TIMESERIES TYPES
// ============================================================================

export type Granularity = 'daily' | 'weekly' | 'monthly' | 'quarterly';

export type DataSource = 'database' | 'interpolated' | 'calculated';

export interface TimeseriesPoint {
  /** ISO date string */
  date: string;
  /** Actual metrics from database */
  actual: Partial<ActualMetrics>;
  /** Projected metrics (optional) */
  projected?: Partial<ProjectedMetrics>;
  /** Data source indicator */
  _source: DataSource;
}

export interface TimeseriesQuery {
  startDate: string;
  endDate: string;
  granularity: Granularity;
  metrics?: string[];
  skipCache?: boolean;
}

export interface TimeseriesResponse {
  fundId: number;
  fundName: string;
  granularity: Granularity;
  timeseries: TimeseriesPoint[];
  meta: {
    startDate: string;
    endDate: string;
    dataPoints: number;
    cacheHit: boolean;
    computeTimeMs: number;
  };
}

// ============================================================================
// BREAKDOWN TYPES
// ============================================================================

export type GroupByDimension = 'sector' | 'stage' | 'company';

export interface BreakdownGroup {
  /** Group name (sector, stage, or company name) */
  group: string;
  /** Number of companies in this group */
  companyCount: number;
  /** Total capital deployed to this group */
  totalDeployed: number;
  /** Current value of holdings in this group */
  currentValue: number;
  /** Multiple on Invested Capital */
  moic: number;
  /** Internal Rate of Return */
  irr: number;
  /** Unrealized gain (currentValue - totalDeployed) */
  unrealizedGain: number;
  /** Percentage of total portfolio deployment */
  percentOfPortfolio: number;
}

export interface BreakdownTotals {
  companyCount: number;
  totalDeployed: number;
  currentValue: number;
  averageMOIC: number;
  portfolioIRR: number;
}

export interface BreakdownQuery {
  asOfDate?: string;
  groupBy: GroupByDimension;
  includeExited?: boolean;
  skipCache?: boolean;
}

export interface BreakdownResponse {
  fundId: number;
  fundName: string;
  asOfDate: string;
  groupBy: GroupByDimension;
  breakdown: BreakdownGroup[];
  totals: BreakdownTotals;
  meta: {
    cacheHit: boolean;
    computeTimeMs: number;
  };
}

// ============================================================================
// COMPARISON TYPES
// ============================================================================

export type MetricTrend = 'improving' | 'stable' | 'declining';

export interface MetricComparison {
  date: string;
  actual: Partial<ActualMetrics>;
  projected?: Partial<ProjectedMetrics>;
  variance?: Partial<VarianceMetrics>;
}

export interface MetricDelta {
  /** Metric name */
  metric: string;
  /** Values for each date */
  values: number[];
  /** Absolute change (last - first) */
  absoluteChange: number;
  /** Percentage change */
  percentChange: number;
  /** Trend direction */
  trend: MetricTrend;
}

export interface ComparisonQuery {
  dates: string[];
  metrics?: string[];
  skipCache?: boolean;
}

export interface ComparisonResponse {
  fundId: number;
  fundName: string;
  comparisons: MetricComparison[];
  deltas: MetricDelta[];
  meta: {
    dates: string[];
    cacheHit: boolean;
    computeTimeMs: number;
  };
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export interface PerformanceApiError {
  error: string;
  message: string;
  field?: string;
  timestamp: string;
  requestId?: string;
}
