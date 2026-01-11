/**
 * Version Comparison Service
 *
 * Compares snapshot versions to compute diffs and metric deltas.
 * Supports ephemeral comparisons with Redis caching (5min TTL).
 *
 * @module server/services/version-comparison-service
 */

import { v4 as uuid } from 'uuid';
import { SnapshotVersionService, VersionNotFoundError } from './snapshot-version-service';
import { computeDiff, getDiffSummary, type DiffResult } from '@shared/utils/diff';
import { redisGetJSON, redisSetJSON } from '../db/index.js';
import { toDecimal } from '@shared/lib/decimal-utils';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Metric delta entry for version comparison
 */
export interface MetricDelta {
  metricName: string;
  displayName: string;
  baseValue: number | null;
  comparisonValue: number | null;
  absoluteDelta: number | null;
  percentageDelta: number | null;
  isBetter: boolean | null;
  trend: 'higher_is_better' | 'lower_is_better' | 'neutral';
}

/**
 * Version comparison result
 */
export interface VersionComparisonResult {
  id: string;
  baseVersionId: string;
  comparisonVersionId: string;
  baseVersionNumber: number;
  comparisonVersionNumber: number;
  stateDiff: DiffResult;
  diffSummary: string;
  metricDeltas: MetricDelta[];
  createdAt: string;
  expiresAt: string;
}

/**
 * Compare request
 */
export interface CompareVersionsRequest {
  baseVersionId: string;
  comparisonVersionId: string;
  metrics?: string[];
}

/**
 * Metric configuration - determines trend direction
 */
export const METRIC_TRENDS: Record<string, 'higher_is_better' | 'lower_is_better' | 'neutral'> = {
  // Financial metrics (higher is better)
  moic: 'higher_is_better',
  irr: 'higher_is_better',
  tvpi: 'higher_is_better',
  dpi: 'higher_is_better',
  gross_multiple: 'higher_is_better',
  net_irr: 'higher_is_better',
  gross_irr: 'higher_is_better',
  exit_proceeds: 'higher_is_better',
  total_to_lps: 'higher_is_better',
  projected_fund_value: 'higher_is_better',
  // Cost metrics (lower is better)
  total_investment: 'lower_is_better',
  follow_ons: 'lower_is_better',
  management_fees: 'lower_is_better',
  // Neutral metrics
  reserve_ratio: 'neutral',
  deployment_pace: 'neutral',
};

/**
 * Display names for metrics
 */
export const METRIC_DISPLAY_NAMES: Record<string, string> = {
  moic: 'MOIC',
  irr: 'IRR',
  tvpi: 'TVPI',
  dpi: 'DPI',
  gross_multiple: 'Gross Multiple',
  net_irr: 'Net IRR',
  gross_irr: 'Gross IRR',
  exit_proceeds: 'Exit Proceeds',
  total_to_lps: 'Total to LPs',
  projected_fund_value: 'Projected Fund Value',
  total_investment: 'Total Investment',
  follow_ons: 'Follow-on Capital',
  management_fees: 'Management Fees',
  reserve_ratio: 'Reserve Ratio',
  deployment_pace: 'Deployment Pace',
};

// ============================================================================
// SERVICE CLASS
// ============================================================================

/**
 * VersionComparisonService
 *
 * Compares snapshot versions and caches results.
 */
export class VersionComparisonService {
  private readonly versionService: SnapshotVersionService;
  private readonly CACHE_TTL = 300; // 5 minutes in seconds
  private readonly CACHE_KEY_PREFIX = 'version_comparison:';

  constructor(versionService?: SnapshotVersionService) {
    this.versionService = versionService ?? new SnapshotVersionService();
  }

  /**
   * Compare two versions
   */
  async compareVersions(request: CompareVersionsRequest): Promise<VersionComparisonResult> {
    const { baseVersionId, comparisonVersionId, metrics } = request;

    // Check cache first
    const cacheKey = this.buildCacheKey(baseVersionId, comparisonVersionId);
    const cached = await this.getCached(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch both versions
    const [baseVersion, comparisonVersion] = await Promise.all([
      this.versionService.getVersion(baseVersionId),
      this.versionService.getVersion(comparisonVersionId),
    ]);

    // Compute state diff
    const baseState = baseVersion.stateSnapshot as Record<string, unknown>;
    const comparisonState = comparisonVersion.stateSnapshot as Record<string, unknown>;
    const stateDiff = computeDiff(baseState, comparisonState);
    const diffSummary = getDiffSummary(stateDiff);

    // Compute metric deltas
    const baseMetrics = (baseVersion.calculatedMetrics as Record<string, unknown>) ?? {};
    const comparisonMetrics =
      (comparisonVersion.calculatedMetrics as Record<string, unknown>) ?? {};
    const metricDeltas = this.computeMetricDeltas(baseMetrics, comparisonMetrics, metrics);

    // Build result
    const comparisonId = uuid();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.CACHE_TTL * 1000);

    const result: VersionComparisonResult = {
      id: comparisonId,
      baseVersionId,
      comparisonVersionId,
      baseVersionNumber: baseVersion.versionNumber,
      comparisonVersionNumber: comparisonVersion.versionNumber,
      stateDiff,
      diffSummary,
      metricDeltas,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    // Cache result (ignore errors)
    await this.cacheResult(cacheKey, result);

    return result;
  }

  /**
   * Get cached comparison
   */
  async getCached(cacheKey: string): Promise<VersionComparisonResult | null> {
    try {
      return await redisGetJSON<VersionComparisonResult>(`${this.CACHE_KEY_PREFIX}${cacheKey}`);
    } catch {
      return null;
    }
  }

  /**
   * Get comparison by ID (from cache)
   */
  async getComparison(comparisonId: string): Promise<VersionComparisonResult | null> {
    try {
      return await redisGetJSON<VersionComparisonResult>(
        `${this.CACHE_KEY_PREFIX}id:${comparisonId}`
      );
    } catch {
      return null;
    }
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Build cache key from version IDs
   */
  private buildCacheKey(baseVersionId: string, comparisonVersionId: string): string {
    // Sort IDs for consistent cache key regardless of order
    const ids = [baseVersionId, comparisonVersionId].sort();
    return `${ids[0]}:${ids[1]}`;
  }

  /**
   * Cache comparison result
   */
  private async cacheResult(cacheKey: string, result: VersionComparisonResult): Promise<void> {
    try {
      // Cache by key pair
      await redisSetJSON(`${this.CACHE_KEY_PREFIX}${cacheKey}`, result, this.CACHE_TTL);
      // Also cache by ID for retrieval
      await redisSetJSON(`${this.CACHE_KEY_PREFIX}id:${result.id}`, result, this.CACHE_TTL);
    } catch (err) {
      console.warn('[version-comparison] Cache failed:', (err as Error).message);
    }
  }

  /**
   * Compute metric deltas between versions
   */
  private computeMetricDeltas(
    baseMetrics: Record<string, unknown>,
    comparisonMetrics: Record<string, unknown>,
    requestedMetrics?: string[]
  ): MetricDelta[] {
    const deltas: MetricDelta[] = [];

    // Collect all metric keys from both versions
    const allKeys = new Set([...Object.keys(baseMetrics), ...Object.keys(comparisonMetrics)]);

    // Filter to requested metrics if specified
    const keysToCompare = requestedMetrics
      ? [...allKeys].filter((k) => requestedMetrics.includes(k))
      : [...allKeys];

    for (const key of keysToCompare) {
      const baseValue = this.extractNumericValue(baseMetrics[key]);
      const comparisonValue = this.extractNumericValue(comparisonMetrics[key]);

      const delta = this.computeSingleDelta(key, baseValue, comparisonValue);
      deltas.push(delta);
    }

    return deltas;
  }

  /**
   * Compute a single metric delta
   */
  private computeSingleDelta(
    metricName: string,
    baseValue: number | null,
    comparisonValue: number | null
  ): MetricDelta {
    const trend = METRIC_TRENDS[metricName] ?? 'neutral';
    const displayName = METRIC_DISPLAY_NAMES[metricName] ?? this.formatMetricName(metricName);

    // Compute absolute delta
    let absoluteDelta: number | null = null;
    if (baseValue !== null && comparisonValue !== null) {
      absoluteDelta = comparisonValue - baseValue;
    }

    // Compute percentage delta
    let percentageDelta: number | null = null;
    if (baseValue !== null && baseValue !== 0 && comparisonValue !== null) {
      percentageDelta = ((comparisonValue - baseValue) / Math.abs(baseValue)) * 100;
    }

    // Determine if change is better based on trend
    let isBetter: boolean | null = null;
    if (absoluteDelta !== null && trend !== 'neutral') {
      isBetter = trend === 'higher_is_better' ? absoluteDelta > 0 : absoluteDelta < 0;
    }

    return {
      metricName,
      displayName,
      baseValue,
      comparisonValue,
      absoluteDelta,
      percentageDelta,
      isBetter,
      trend,
    };
  }

  /**
   * Extract numeric value from unknown type
   */
  private extractNumericValue(value: unknown): number | null {
    if (typeof value === 'number' && !isNaN(value)) {
      return value;
    }
    if (typeof value === 'string') {
      try {
        const parsed = toDecimal(value).toNumber();
        return isNaN(parsed) ? null : parsed;
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Format metric name for display (snake_case to Title Case)
   */
  private formatMetricName(name: string): string {
    return name
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}

// Export error class for re-use
export { VersionNotFoundError };
