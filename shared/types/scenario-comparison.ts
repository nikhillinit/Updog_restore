/**
 * Scenario Comparison Tool Types
 *
 * Shared types for the scenario comparison feature, enabling side-by-side
 * comparison of 2-6 scenarios (deal-level or portfolio-level) with visual diffs.
 */

// ============================================================================
// Enums and Constants
// ============================================================================

export type ComparisonType = 'deal_level' | 'portfolio_level' | 'mixed';

export type ComparisonStatus = 'computing' | 'ready' | 'stale' | 'error';

export type DisplayLayout = 'side_by_side' | 'stacked' | 'grid';

export type DeltaMode = 'absolute' | 'percentage' | 'both';

export type ColorScheme = 'traffic_light' | 'heatmap' | 'grayscale';

export type AccessType = 'view' | 'refresh' | 'export' | 'share';

export type MetricTrend = 'higher_is_better' | 'lower_is_better';

export const COMPARISON_METRICS = [
  'moic',
  'irr',
  'tvpi',
  'dpi',
  'total_investment',
  'follow_ons',
  'exit_proceeds',
  'exit_valuation',
  'gross_multiple',
  'net_irr',
  'gross_irr',
  'total_to_lps',
  'projected_fund_value',
  'weighted_summary',
] as const;

export type ComparisonMetric = (typeof COMPARISON_METRICS)[number];

// ============================================================================
// Delta Configuration
// ============================================================================

export interface DeltaConfig {
  /** Show absolute delta values */
  showAbsolute: boolean;
  /** Show percentage delta values */
  showPercentage: boolean;
  /** Scenario to use as baseline for deltas (null = first scenario) */
  baselineScenarioId: string | null;
  /** Threshold for visual highlight (0.1 = 10% change triggers highlight) */
  highlightThreshold: number;
}

export const DEFAULT_DELTA_CONFIG: DeltaConfig = {
  showAbsolute: true,
  showPercentage: true,
  baselineScenarioId: null,
  highlightThreshold: 0.1,
};

// ============================================================================
// Scenario Types for Comparison
// ============================================================================

export interface ScenarioMixTypes {
  /** UUIDs of deal-level scenarios */
  deal_scenarios?: string[];
  /** UUIDs of portfolio-level scenarios */
  portfolio_scenarios?: string[];
}

export interface ScenarioSnapshot {
  id: string;
  name: string;
  scenarioType: string;
  isBase: boolean;
  /** Computed weighted summary (for deal-level scenarios) */
  weightedSummary?: WeightedSummarySnapshot;
  /** Number of cases in the scenario */
  caseCount?: number;
  /** Last update timestamp */
  lastUpdated?: string;
}

export interface WeightedSummarySnapshot {
  moic: number | null;
  investment: number;
  follow_ons: number;
  exit_proceeds: number;
  exit_valuation: number;
  months_to_exit?: number;
}

// ============================================================================
// Delta Metrics
// ============================================================================

export interface DeltaMetric {
  /** Name of the metric being compared */
  metricName: ComparisonMetric;
  /** Display name for UI */
  displayName: string;
  /** Scenario ID this delta is for */
  scenarioId: string;
  /** Value in the base scenario */
  baseValue: number;
  /** Value in the comparison scenario */
  comparisonValue: number;
  /** Absolute delta (comparison - base) */
  absoluteDelta: number;
  /** Percentage delta ((comparison - base) / base * 100) */
  percentageDelta: number | null;
  /** Weighted delta (if weight scheme applied) */
  weightedDelta?: number;
  /** Whether this change is favorable */
  isBetter: boolean;
  /** Trend direction for this metric */
  trend: MetricTrend;
}

// ============================================================================
// Aggregate Summary
// ============================================================================

export interface AggregateSummary {
  /** Total number of scenarios compared */
  totalScenariosCompared: number;
  /** List of metrics that were computed */
  metricsComputed: ComparisonMetric[];
  /** Average absolute delta across all metrics */
  averageAbsoluteDelta: number;
  /** Maximum absolute delta across all metrics */
  maxAbsoluteDelta: number;
  /** Minimum absolute delta across all metrics */
  minAbsoluteDelta: number;
  /** Distribution of deltas by range */
  deltaDistribution?: Record<string, number>;
}

// ============================================================================
// Comparison Results
// ============================================================================

export interface ComparisonResults {
  /** Delta metrics for each scenario/metric combination */
  deltaMetrics: DeltaMetric[];
  /** Scenario summaries with key data */
  scenarios: ScenarioSnapshot[];
  /** Aggregate statistics */
  aggregateSummary?: AggregateSummary;
  /** When the comparison was computed */
  computedAt: string;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface CreateComparisonRequest {
  /** Fund ID for access control */
  fundId: number;
  /** Base scenario for comparison */
  baseScenarioId: string;
  /** Scenarios to compare against base (1-5) */
  comparisonScenarioIds: string[];
  /** Type of comparison */
  comparisonType: ComparisonType;
  /** Metrics to compute */
  comparisonMetrics?: ComparisonMetric[];
  /** Optional weight scheme for metrics */
  weightScheme?: Record<string, number>;
  /** Include detailed breakdown */
  includeDetails?: boolean;
}

export interface ComparisonResponse {
  id: string;
  fundId: number;
  comparisonName: string;
  description?: string;
  baseScenarioId: string;
  comparisonScenarioIds: string[];
  comparisonType: ComparisonType;
  comparisonMetrics: ComparisonMetric[];
  status: ComparisonStatus;
  results: ComparisonResults | null;
  error?: string;
  createdBy?: number;
  createdAt: string;
  updatedAt: string;
  lastAccessed?: string;
  cacheExpiresAt?: string;
}

export interface ComparisonListResponse {
  success: boolean;
  data: ComparisonResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// ============================================================================
// Saved Configuration Types
// ============================================================================

export interface SavedComparisonConfig {
  id: string;
  fundId: number;
  configName: string;
  description?: string;
  /** Scenario IDs to compare (2-6) */
  scenarioIds: string[];
  /** Type of each scenario */
  scenarioTypes: Record<string, 'deal' | 'portfolio'>;
  /** Display layout preference */
  displayLayout: DisplayLayout;
  /** Metrics to compare */
  metricsToCompare: ComparisonMetric[];
  /** Sort order preference */
  sortOrder?: string;
  /** Show delta values */
  showDeltas: boolean;
  /** Delta display mode */
  deltaMode: DeltaMode;
  /** Baseline scenario for deltas */
  baselineScenarioId?: string;
  /** Highlight threshold */
  highlightThreshold: number;
  /** Color scheme for visualizations */
  colorScheme: ColorScheme;
  /** Show better/worse indicators */
  betterWorseIndicators: boolean;
  /** Usage tracking */
  useCount: number;
  lastUsedAt?: string;
  /** Visibility settings */
  isPublic: boolean;
  createdBy: number;
  sharedWith: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateSavedConfigRequest {
  fundId: number;
  configName: string;
  description?: string;
  scenarioIds: string[];
  scenarioTypes: Record<string, 'deal' | 'portfolio'>;
  displayLayout?: DisplayLayout;
  metricsToCompare: ComparisonMetric[];
  deltaMode?: DeltaMode;
  baselineScenarioId?: string;
  highlightThreshold?: number;
}

// ============================================================================
// Access Tracking Types
// ============================================================================

export interface ComparisonAccessRecord {
  id: string;
  comparisonId?: string;
  configurationId?: string;
  fundId: number;
  accessType: AccessType;
  scenariosCompared: string[];
  metricsViewed?: string[];
  userId?: number;
  sessionId?: string;
  loadTimingMs?: number;
  cacheHit: boolean;
  dataFreshnessHours?: number;
  accessSource: string;
  accessedAt: string;
}

// ============================================================================
// Export Types
// ============================================================================

export type ExportFormat = 'csv' | 'pdf' | 'json' | 'xlsx';

export interface ExportOptions {
  format: ExportFormat;
  includeCharts?: boolean;
  includeRawData?: boolean;
  filename?: string;
}

// ============================================================================
// Real-time Update Types
// ============================================================================

export interface ComparisonUpdateEvent {
  comparisonId: string;
  status: ComparisonStatus;
  results?: ComparisonResults;
  error?: string;
  timestamp: string;
}

// ============================================================================
// Validation Helpers
// ============================================================================

export function isValidScenarioCount(count: number): boolean {
  return count >= 2 && count <= 6;
}

export function isValidMetric(metric: string): metric is ComparisonMetric {
  return COMPARISON_METRICS.includes(metric as ComparisonMetric);
}
