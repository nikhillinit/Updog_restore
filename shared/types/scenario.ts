/**
 * Scenario Analysis Types
 *
 * Shared types for Construction vs Actual vs Current portfolio analysis
 * and deal-level scenario modeling with weighted cases
 */

// ============================================================================
// Portfolio-Level Analysis Types
// ============================================================================

export type AnalysisMetric =
  | 'num_investments'
  | 'initial_checks'
  | 'follow_on_reserves'
  | 'round_sizes'
  | 'pre_money_valuations'
  | 'total_capital';

export type ForecastView = 'construction' | 'current' | 'actual';

export type TimeBucket = 'entry_round' | 'quarter' | 'year' | 'stage';

/**
 * Row in the Construction vs Actual vs Current comparison table
 */
export interface ComparisonRow {
  /** Grouping key (e.g., "Pre-seed", "Seed", "Series A") */
  entry_round: string;

  /** Original plan value */
  construction_value: number;

  /** Actual realized value */
  actual_value: number;

  /** Current forecast (actuals + remaining plan on remaining capital) */
  forecast_value?: number;

  /** Calculated delta: actual - construction */
  delta_absolute?: number;

  /** Calculated delta %: (actual - construction) / construction */
  delta_percentage?: number | null; // null if construction = 0
}

/**
 * Summary metrics for portfolio comparison
 */
export interface PortfolioComparisonSummary {
  metric: AnalysisMetric;
  construction: number;
  actual: number;
  current: number;
  delta_absolute: number;
  delta_percentage: number | null;
}

// ============================================================================
// Deal-Level Scenario Types
// ============================================================================

/**
 * Individual scenario case with probability weighting
 */
export interface ScenarioCase {
  id?: string;
  case_name: string;
  description?: string;

  /** Probability weight (0..1, sum should = 1.0) */
  probability: number;

  /** Total investment required (initial + follow-ons) */
  investment: number;

  /** Follow-on capital required */
  follow_ons: number;

  /** Exit proceeds in this scenario */
  exit_proceeds: number;

  /** Exit valuation in this scenario */
  exit_valuation: number;

  /** Calculated MOIC: exit_proceeds / investment */
  moic?: number;

  /** Months to exit (optional) */
  months_to_exit?: number;

  /** Ownership % at exit (optional) */
  ownership_at_exit?: number;
}

/**
 * Weighted summary row (bottom of scenario table)
 * Calculated as Σ(value × probability) for each column
 */
export interface WeightedSummary {
  /** Weighted MOIC */
  moic: number | null;

  /** Weighted investment */
  investment: number;

  /** Weighted follow-ons */
  follow_ons: number;

  /** Weighted exit proceeds */
  exit_proceeds: number;

  /** Weighted exit valuation */
  exit_valuation: number;

  /** Weighted months to exit (optional) */
  months_to_exit?: number;
}

/**
 * Complete scenario configuration for a company
 */
export interface Scenario {
  id: string;
  company_id: string;
  name: string;
  description?: string;

  /** Version for optimistic locking (Phase 2) */
  version: number;

  /** Is this the default/baseline scenario? */
  is_default: boolean;

  /** When scenario was locked (prevents edits) */
  locked_at?: Date;

  /** User who created the scenario */
  created_by?: string;

  created_at: Date;
  updated_at: Date;

  /** Scenario cases */
  cases?: ScenarioCase[];
}

// ============================================================================
// Investment Round Types (for timeline)
// ============================================================================

export interface InvestmentRound {
  id: string;
  company_id: string;
  round_name: string;
  round_date: Date;

  /** "actual" or "projected" */
  status: 'actual' | 'projected';

  /** Investment amount */
  amount: number;

  /** Pre-money valuation */
  pre_money_valuation?: number;

  /** Post-money valuation */
  post_money_valuation?: number;

  /** Ownership % after this round */
  ownership_pct?: number;

  /** Fair market value (for liquidation scenarios) */
  fmv?: number;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Request for portfolio-level comparison
 */
export interface PortfolioAnalysisRequest {
  fund_id: string;
  metric: AnalysisMetric;
  forecast_view: ForecastView;
  time_bucket: TimeBucket;
}

/**
 * Response for portfolio-level comparison
 */
export interface PortfolioAnalysisResponse {
  fund_id: string;
  metric: AnalysisMetric;
  rows: ComparisonRow[];
  summary: PortfolioComparisonSummary;
  generated_at: Date;
}

/**
 * Request for deal-level scenario analysis
 */
export interface ScenarioAnalysisRequest {
  company_id: string;
  scenario_id?: string;
  include?: ('rounds' | 'cases' | 'weighted_summary')[];
}

/**
 * Response for deal-level scenario analysis
 */
export interface ScenarioAnalysisResponse {
  company_name: string;
  company_id: string;
  scenario?: Scenario;
  rounds?: InvestmentRound[];
  cases?: ScenarioCase[];
  weighted_summary?: WeightedSummary;
}

/**
 * Request to update scenario cases
 */
export interface UpdateScenarioCasesRequest {
  scenario_id: string;
  cases: Omit<ScenarioCase, 'id'>[];

  /** Auto-normalize probabilities to sum = 1.0 */
  normalize?: boolean;

  /** Version for optimistic locking (Phase 2) */
  version?: number;
}

/**
 * Response when updating scenario cases
 */
export interface UpdateScenarioCasesResponse {
  scenario_id: string;
  cases: ScenarioCase[];
  weighted_summary: WeightedSummary;

  /** New version after update */
  version: number;

  /** Warning if probabilities were normalized */
  normalized?: boolean;
  original_sum?: number;
}

// ============================================================================
// Audit Logging Types (Simplified)
// ============================================================================

export interface ScenarioAuditLog {
  id: string;
  user_id: string;
  entity_type: 'scenario' | 'scenario_case';
  entity_id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';

  /** JSONB diff of changes */
  diff?: Record<string, unknown>;

  timestamp: Date;
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Probability validation result
 */
export interface ProbabilityValidation {
  is_valid: boolean;
  sum: number;

  /** Recommended action */
  message: string;

  /** Severity: 'error' | 'warning' | 'info' */
  severity: 'error' | 'warning' | 'info';
}
