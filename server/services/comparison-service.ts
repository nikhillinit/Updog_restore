/**
 * Scenario Comparison Service
 *
 * Business logic for comparing performance metrics across multiple scenarios.
 * Supports ephemeral comparisons with Redis caching (5min TTL).
 *
 * Phase 1: Stateless computations only (no database writes)
 * Phase 2: Add persistence for saved configurations (future PR)
 */

import { v4 as uuid } from 'uuid';
import type { RedisClientType } from 'redis';
import Decimal from 'decimal.js';
import type {
  ComparisonMetric,
  DeltaMetric,
  MetricTrend,
  ScenarioSnapshot,
  WeightedSummarySnapshot,
} from '../../shared/types/scenario-comparison.js';
import { calculateWeightedSummary, addMOICToCases } from '../../shared/utils/scenario-math.js';

// Configure decimal.js for financial precision (consistent with scenario-math.ts)
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

// ============================================================================
// Metric Configuration
// ============================================================================

/**
 * Metric trend configuration - determines if higher or lower is better
 * Matches test file lines 19-33 from comparison-service.test.ts
 */
export const METRIC_TRENDS: Record<ComparisonMetric, MetricTrend> = {
  moic: 'higher_is_better',
  irr: 'higher_is_better',
  tvpi: 'higher_is_better',
  dpi: 'higher_is_better',
  total_investment: 'lower_is_better',
  follow_ons: 'lower_is_better',
  exit_proceeds: 'higher_is_better',
  exit_valuation: 'higher_is_better',
  gross_multiple: 'higher_is_better',
  net_irr: 'higher_is_better',
  gross_irr: 'higher_is_better',
  total_to_lps: 'higher_is_better',
  projected_fund_value: 'higher_is_better',
  weighted_summary: 'higher_is_better',
};

/**
 * Display names for metrics (UI rendering)
 * Matches test file lines 212-227 from comparison-service.test.ts
 */
export const METRIC_DISPLAY_NAMES: Record<ComparisonMetric, string> = {
  moic: 'MOIC',
  irr: 'IRR',
  tvpi: 'TVPI',
  dpi: 'DPI',
  total_investment: 'Total Investment',
  follow_ons: 'Follow-on Capital',
  exit_proceeds: 'Exit Proceeds',
  exit_valuation: 'Exit Valuation',
  gross_multiple: 'Gross Multiple',
  net_irr: 'Net IRR',
  gross_irr: 'Gross IRR',
  total_to_lps: 'Total to LPs',
  projected_fund_value: 'Projected Fund Value',
  weighted_summary: 'Weighted Summary',
};

// ============================================================================
// Service Interface
// ============================================================================

export interface CompareRequest {
  fundId: number;
  baseScenarioId: string;
  comparisonScenarioIds: string[];
  comparisonMetrics: ComparisonMetric[];
}

export interface CompareResponse {
  id: string;
  status: 'ready' | 'error';
  scenarios: ScenarioSnapshot[];
  deltaMetrics: DeltaMetric[];
  comparisonMetrics: ComparisonMetric[];
  createdAt: string;
  expiresAt: string;
}

export interface ScenarioDatabaseRow {
  id: string;
  name: string;
  scenario_type: string;
  cases: Array<{
    probability: number;
    investment: number;
    follow_ons: number;
    exit_proceeds: number;
    exit_valuation: number;
    months_to_exit?: number;
  }>;
}

// ============================================================================
// Comparison Service Class
// ============================================================================

export class ComparisonService {
  private redis: RedisClientType | null;
  private readonly CACHE_TTL = 300; // 5 minutes in seconds
  private readonly CACHE_KEY_PREFIX = 'comparison:';

  constructor(redis: RedisClientType | null) {
    this.redis = redis;
  }

  /**
   * Compare scenarios and return delta metrics
   * Caches result in Redis with 5min TTL
   */
  async compareScenarios(
    request: CompareRequest,
    scenariosFromDb: ScenarioDatabaseRow[]
  ): Promise<CompareResponse> {
    // Build scenario snapshots with weighted summaries
    const snapshots = this.buildScenarioSnapshots(scenariosFromDb, request.baseScenarioId);

    // Compute delta metrics for each comparison scenario
    const deltaMetrics = this.computeAllDeltas(snapshots, request.comparisonMetrics);

    // Build response
    const comparisonId = uuid();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.CACHE_TTL * 1000);

    const response: CompareResponse = {
      id: comparisonId,
      status: 'ready',
      scenarios: snapshots,
      deltaMetrics,
      comparisonMetrics: request.comparisonMetrics,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    // Cache in Redis (ignore errors - degrade gracefully)
    await this.cacheComparison(comparisonId, response);

    return response;
  }

  /**
   * Retrieve cached comparison from Redis
   * Returns null if expired or not found
   */
  async getComparison(comparisonId: string): Promise<CompareResponse | null> {
    if (!this.redis) return null;

    try {
      const cached = await this.redis.get(`${this.CACHE_KEY_PREFIX}${comparisonId}`);
      if (!cached) return null;
      return JSON.parse(cached) as CompareResponse;
    } catch (err) {
      console.warn('[comparison-service] Redis get failed:', (err as Error).message);
      return null;
    }
  }

  /**
   * Cache comparison result in Redis
   * Gracefully degrades if Redis unavailable
   */
  private async cacheComparison(comparisonId: string, response: CompareResponse): Promise<void> {
    if (!this.redis) return;

    try {
      await this.redis.setEx(
        `${this.CACHE_KEY_PREFIX}${comparisonId}`,
        this.CACHE_TTL,
        JSON.stringify(response)
      );
    } catch (err) {
      console.warn('[comparison-service] Redis cache failed:', (err as Error).message);
    }
  }

  /**
   * Build scenario snapshots with weighted summaries
   * Marks first scenario as base
   */
  private buildScenarioSnapshots(
    scenarios: ScenarioDatabaseRow[],
    baseScenarioId: string
  ): ScenarioSnapshot[] {
    return scenarios.map((scenario) => {
      const weightedSummary = this.computeWeightedSummary(scenario.cases);

      return {
        id: scenario.id,
        name: scenario.name,
        scenarioType: scenario.scenario_type,
        isBase: scenario.id === baseScenarioId,
        weightedSummary,
        caseCount: scenario.cases.length,
      };
    });
  }

  /**
   * Compute weighted summary for scenario cases
   * Reuses calculateWeightedSummary from scenario-math.ts
   */
  private computeWeightedSummary(cases: ScenarioDatabaseRow['cases']): WeightedSummarySnapshot {
    // Add MOIC to each case (required for weighted calculation)
    // Map to ScenarioCase type (add required case_name field)
    const scenarioCases = cases.map((c) => ({
      ...c,
      case_name: 'Case', // Temporary name for calculation purposes
    }));
    const casesWithMoic = addMOICToCases(scenarioCases);

    // Calculate weighted summary
    const summary = calculateWeightedSummary(casesWithMoic);

    return {
      moic: summary.moic,
      investment: summary.investment,
      follow_ons: summary.follow_ons,
      exit_proceeds: summary.exit_proceeds,
      exit_valuation: summary.exit_valuation,
      ...(summary.months_to_exit !== undefined
        ? { months_to_exit: summary.months_to_exit }
        : {}),
    };
  }

  /**
   * Compute deltas for all comparison scenarios against base
   */
  private computeAllDeltas(
    snapshots: ScenarioSnapshot[],
    metrics: ComparisonMetric[]
  ): DeltaMetric[] {
    const baseSnapshot = snapshots.find((s) => s.isBase);
    const comparisonSnapshots = snapshots.filter((s) => !s.isBase);

    if (!baseSnapshot) {
      throw new Error('Base scenario not found in snapshots');
    }

    const deltas: DeltaMetric[] = [];

    for (const comparisonSnapshot of comparisonSnapshots) {
      for (const metric of metrics) {
        const baseValue = this.extractMetricValue(metric, baseSnapshot.weightedSummary);
        const comparisonValue = this.extractMetricValue(metric, comparisonSnapshot.weightedSummary);

        const delta = this.computeDelta(
          baseValue,
          comparisonValue,
          METRIC_TRENDS[metric],
          metric,
          comparisonSnapshot.id
        );

        deltas.push(delta);
      }
    }

    return deltas;
  }

  /**
   * Compute single delta metric
   * Implements logic from test file lines 57-71
   */
  private computeDelta(
    baseValue: number,
    comparisonValue: number,
    trend: MetricTrend,
    metricName: ComparisonMetric,
    scenarioId: string
  ): DeltaMetric {
    const absoluteDelta = comparisonValue - baseValue;

    // Percentage delta: null if base is 0 (avoid divide-by-zero)
    const percentageDelta =
      baseValue !== 0 ? ((comparisonValue - baseValue) / Math.abs(baseValue)) * 100 : null;

    // Determine if delta is improvement based on trend
    const isBetter = trend === 'higher_is_better' ? absoluteDelta > 0 : absoluteDelta < 0;

    return {
      metricName,
      displayName: METRIC_DISPLAY_NAMES[metricName],
      scenarioId,
      baseValue,
      comparisonValue,
      absoluteDelta,
      percentageDelta,
      isBetter,
      trend,
    };
  }

  /**
   * Extract metric value from weighted summary
   * Implements logic from test file lines 113-130
   */
  private extractMetricValue(
    metric: ComparisonMetric,
    summary: WeightedSummarySnapshot | undefined
  ): number {
    if (!summary) return 0;

    switch (metric) {
      case 'moic':
        return summary.moic ?? 0;
      case 'total_investment':
        return summary.investment ?? 0;
      case 'follow_ons':
        return summary.follow_ons ?? 0;
      case 'exit_proceeds':
        return summary.exit_proceeds ?? 0;
      case 'exit_valuation':
        return summary.exit_valuation ?? 0;
      // Other metrics not yet supported in MVP (IRR, TVPI, DPI require additional data)
      default:
        return 0;
    }
  }

  /**
   * Check if percentage change is significant
   * Implements logic from test file lines 254-256
   */
  isSignificantChange(percentageDelta: number | null, thresholdPercent: number): boolean {
    if (percentageDelta === null) return false;
    return Math.abs(percentageDelta) >= thresholdPercent;
  }
}
