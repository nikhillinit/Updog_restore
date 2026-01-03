/**
 * MetricsAggregator
 *
 * Unified Metrics Layer - Main orchestration service
 *
 * This service is the single source of truth for all fund metrics.
 * It aggregates data from:
 * 1. Database (ActualMetricsCalculator) - what has happened
 * 2. Calculation engines (ProjectedMetricsCalculator) - what is expected
 * 3. Fund configuration (TargetMetrics) - what is targeted
 * 4. Variance analysis (VarianceCalculator) - how we're doing
 *
 * @module server/services/metrics-aggregator
 */

import { storage } from '../storage';
import type { UnifiedFundMetrics, MetricsCalculationError } from '@shared/types/metrics';
import { ActualMetricsCalculator } from './actual-metrics-calculator';
import { ProjectedMetricsCalculator } from './projected-metrics-calculator';
import { VarianceCalculator } from './variance-calculator';
import { getFundAge, isConstructionPhase, type FundAge } from '@shared/lib/lifecycle-rules';
import type { Fund } from '@shared/schema';

interface CacheClient {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, options?: { ttlSeconds?: number }): Promise<void>;
  del(key: string): Promise<void>;
  setnx?(key: string, value: string, ttlSeconds?: number): Promise<boolean>;
}

// Simple in-memory cache fallback
class InMemoryCache implements CacheClient {
  private cache = new Map<string, { value: unknown; expiry: number }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry['expiry']) {
      this.cache.delete(key);
      return null;
    }
    return entry['value'] as T;
  }

  async set<T>(key: string, value: T, options?: { ttlSeconds?: number }): Promise<void> {
    const ttl = (options?.ttlSeconds || 300) * 1000;
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttl,
    });
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async setnx(key: string, value: string, ttlSeconds = 60): Promise<boolean> {
    if (this.cache.has(key)) {
      return false;
    }
    await this.set(key, value, { ttlSeconds });
    return true;
  }
}

export class MetricsAggregator {
  private actualCalculator = new ActualMetricsCalculator();
  private projectedCalculator = new ProjectedMetricsCalculator();
  private varianceCalculator = new VarianceCalculator();
  private cache: CacheClient;

  constructor(cache?: CacheClient) {
    // Use provided cache or fallback to in-memory
    this.cache = cache || new InMemoryCache();
  }

  /**
   * Get unified metrics for a fund
   *
   * This is the main entry point - returns the complete metrics package
   *
   * @param fundId - Fund identifier
   * @param options - Calculation options
   * @returns Complete UnifiedFundMetrics object
   */
  async getUnifiedMetrics(
    fundId: number,
    options: {
      skipCache?: boolean;
      skipProjections?: boolean;
    } = {}
  ): Promise<UnifiedFundMetrics> {
    // Cache key versioning: v2 includes projection flag for better granularity
    const SCHEMA_VERSION = 2;
    const projectionFlag = options.skipProjections ? 'no-proj' : 'with-proj';
    const cacheKey = `unified:v${SCHEMA_VERSION}:fund:${fundId}:${projectionFlag}`;
    const lockKey = `${cacheKey}:rebuilding`;

    // Check cache unless explicitly skipped
    if (!options.skipCache) {
      const cached = await this.cache.get<UnifiedFundMetrics>(cacheKey);
      if (cached) {
        // Add cache metadata
        return {
          ...cached,
          _cache: {
            hit: true,
            key: cacheKey,
          },
        };
      }
    }

    // Stampede prevention: if someone else is rebuilding, serve stale data
    const isRebuilding = !(await this.acquireRecomputeLock(lockKey));
    if (isRebuilding) {
      const stale = await this.cache.get<UnifiedFundMetrics>(cacheKey);
      if (stale) {
        return {
          ...stale,
          _cache: {
            hit: true,
            key: cacheKey,
            staleWhileRevalidate: true,
          },
        };
      }
      // No stale data available, wait and retry once
      await new Promise(resolve => setTimeout(resolve, 100));
      const retried = await this.cache.get<UnifiedFundMetrics>(cacheKey);
      if (retried) {
        return {
          ...retried,
          _cache: {
            hit: true,
            key: cacheKey,
            staleWhileRevalidate: true,
          },
        };
      }
      // Fall through to recompute
    }

    const startTime = Date.now();
    const warnings: string[] = [];
    let actualStatus: 'success' | 'partial' | 'failed' = 'success';
    let projectedStatus: 'success' | 'partial' | 'failed' | 'skipped' = 'success';
    let targetStatus: 'success' | 'partial' | 'failed' = 'success';
    let varianceStatus: 'success' | 'partial' | 'failed' = 'success';

    try {
      // Fetch fund data
      const fundFromDb = await storage.getFund(fundId);
      if (!fundFromDb) {
        throw this.createError(
          'INSUFFICIENT_DATA',
          `Fund ${fundId} not found`,
          'aggregator'
        );
      }

      // Adapt fund to include optional fields with null defaults
      const fund = {
        ...fundFromDb,
        establishmentDate: ('establishmentDate' in fundFromDb ? fundFromDb.establishmentDate : null) as string | null,
        isActive: ('isActive' in fundFromDb ? fundFromDb.isActive : null) as boolean | null,
      };

      // Fetch portfolio companies
      const companiesFromDb = await storage.getPortfolioCompanies(fundId);

      // Adapt companies to include optional fields with null defaults
      // ProjectedMetricsCalculator expects these Pick fields
      const companies = companiesFromDb.map(c => ({
        ...c,
        currentStage: ('currentStage' in c ? c.currentStage : null) as string | null,
        investmentDate: ('investmentDate' in c ? c.investmentDate : null) as Date | null,
        ownershipCurrentPct: ('ownershipCurrentPct' in c ? c.ownershipCurrentPct : null) as string | null,
      }));

      // Fetch fund configuration
      const config = await this.getFundConfig(fundId);

      // Calculate all metric components in parallel with error handling
      let actual, projected;

      try {
        actual = await this.actualCalculator.calculate(fundId);
      } catch (error) {
        actualStatus = 'failed';
        warnings.push(`Actual metrics calculation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw error; // Re-throw for now; could provide fallback in the future
      }

      if (options.skipProjections) {
        projected = this.getDefaultProjectedMetrics();
        projectedStatus = 'skipped';
        warnings.push('Projections skipped for performance');
      } else {
        try {
          // Check if fund is in construction phase (no investments yet)
          const hasInvestments = companies.length > 0;
          const fundStartDate = fund.establishmentDate ?? fund.createdAt;
          const fundAge: FundAge = fundStartDate ? getFundAge(fundStartDate) : { years: 0, months: 0, quarters: 0, totalMonths: 0 };
          const isConstruction = isConstructionPhase(fundAge, hasInvestments);

          if (isConstruction) {
            // Route to J-curve construction forecast
            warnings.push('Using J-curve construction forecast (no investments yet)');
            projected = await this.projectedCalculator.calculate(fund, companies, config, {
              useConstructionForecast: true
            });
          } else {
            // Use standard projection engines
            projected = await this.projectedCalculator.calculate(fund, companies, config);
          }
        } catch (error) {
          projectedStatus = 'failed';
          warnings.push(`Projected metrics calculation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          projected = this.getDefaultProjectedMetrics(); // Use fallback
        }
      }

      // Extract target metrics from config
      let target;
      try {
        target = this.extractTargetMetrics(fund, config);
      } catch (error) {
        targetStatus = 'failed';
        warnings.push(`Target metrics extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw error; // Re-throw as targets are critical
      }

      // Calculate variance
      let variance;
      try {
        variance = this.varianceCalculator.calculate(actual, projected, target);
      } catch (error) {
        varianceStatus = 'failed';
        warnings.push(`Variance calculation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw error; // Re-throw as variance is critical
      }

      // Determine overall quality
      const quality: 'complete' | 'partial' | 'fallback' =
        actualStatus === 'success' && projectedStatus === 'success' && targetStatus === 'success' && varianceStatus === 'success'
          ? 'complete'
          : projectedStatus === 'failed' || projectedStatus === 'skipped'
          ? 'partial'
          : 'fallback';

      const computeTimeMs = Date.now() - startTime;

      // Build unified metrics object
      const unifiedMetrics: UnifiedFundMetrics = {
        fundId,
        fundName: fund.name,
        actual,
        projected,
        target,
        variance,
        lastUpdated: new Date().toISOString(),
        _cache: {
          hit: false,
          key: cacheKey,
        },
        _status: {
          quality,
          engines: {
            actual: actualStatus,
            projected: projectedStatus,
            target: targetStatus,
            variance: varianceStatus,
          },
          ...(warnings.length > 0 && { warnings }),
          computeTimeMs,
        },
      };

      // Cache the result (TTL: 5 minutes)
      await this.cache.set(cacheKey, unifiedMetrics, { ttlSeconds: 300 });

      return unifiedMetrics;
    } catch (error) {
      console.error('Metrics aggregation failed:', error);

      // Re-throw if it's already a MetricsCalculationError
      if (this.isMetricsError(error)) {
        throw error;
      }

      // Wrap other errors
      throw this.createError(
        'CALCULATION_FAILED',
        error instanceof Error ? error.message : 'Unknown error during metrics calculation',
        'aggregator',
        error
      );
    } finally {
      // Release the recompute lock
      await this.releaseRecomputeLock(lockKey);
    }
  }

  /**
   * Invalidate cached metrics for a fund
   *
   * Call this when fund data changes (new investment, valuation update, etc.)
   * Invalidates both projection variants to ensure consistency
   */
  async invalidateCache(fundId: number): Promise<void> {
    const SCHEMA_VERSION = 2;
    // Invalidate both cache variants (with-proj and no-proj)
    await Promise.all([
      this.cache.del(`unified:v${SCHEMA_VERSION}:fund:${fundId}:with-proj`),
      this.cache.del(`unified:v${SCHEMA_VERSION}:fund:${fundId}:no-proj`),
    ]);
  }

  /**
   * Get fund configuration with defaults
   */
  private async getFundConfig(_fundId: number): Promise<{
    targetIRR: number;
    targetTVPI: number;
    targetDPI?: number;
    investmentPeriodYears: number;
    fundTermYears: number;
    reserveRatio: number;
    graduationMatrix?: unknown;
  }> {
    // TODO: Fetch from fund_configs table when available
    // For now, use reasonable defaults
    return {
      targetIRR: 0.25, // 25%
      targetTVPI: 2.5, // 2.5x
      investmentPeriodYears: 3,
      fundTermYears: 10,
      reserveRatio: 0.5, // 50% reserves
    };
  }

  /**
   * Extract target metrics from fund and config
   */
  private extractTargetMetrics(
    fund: Fund,
    config: {
      targetIRR: number;
      targetTVPI: number;
      targetDPI?: number;
      investmentPeriodYears: number;
      fundTermYears: number;
      reserveRatio?: number;
    }
  ) {
    const targetFundSize = parseFloat(fund.size.toString());
    const targetCompanyCount = 20; // TODO: Get from config

    return {
      targetFundSize,
      targetIRR: config.targetIRR,
      targetTVPI: config.targetTVPI,
      ...(config.targetDPI != null && { targetDPI: config.targetDPI }),
      targetDeploymentYears: config.investmentPeriodYears,
      targetCompanyCount,
      targetAverageCheckSize: targetFundSize / targetCompanyCount,
      ...(config.reserveRatio != null && { targetReserveRatio: config.reserveRatio }),
    };
  }

  /**
   * Get default projected metrics (fallback when engines fail)
   */
  private getDefaultProjectedMetrics() {
    return {
      asOfDate: new Date().toISOString(),
      projectionDate: new Date().toISOString(),
      projectedDeployment: Array(12).fill(0),
      projectedDistributions: Array(12).fill(0),
      projectedNAV: Array(12).fill(0),
      expectedTVPI: 2.5,
      expectedIRR: 0.25,
      expectedDPI: 1.0,
      totalReserveNeeds: 0,
      allocatedReserves: 0,
      unallocatedReserves: 0,
      reserveAllocationRate: 0,
      deploymentPace: 'on-track' as const,
      quartersRemaining: 0,
      recommendedQuarterlyDeployment: 0,
    };
  }

  /**
   * Create a standardized metrics error
   */
  private createError(
    code: MetricsCalculationError['code'],
    message: string,
    component: MetricsCalculationError['component'],
    details?: unknown
  ): MetricsCalculationError {
    return {
      code,
      message,
      component,
      details,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Type guard for MetricsCalculationError
   */
  private isMetricsError(error: unknown): error is MetricsCalculationError {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      'component' in error
    );
  }

  /**
   * Acquire recompute lock (stampede prevention)
   * Returns true if lock acquired, false if already locked
   */
  private async acquireRecomputeLock(lockKey: string): Promise<boolean> {
    if (!this.cache.setnx) {
      return true; // No SETNX support, allow recompute
    }
    return this.cache.setnx(lockKey, '1', 60); // 60s TTL
  }

  /**
   * Release recompute lock
   */
  private async releaseRecomputeLock(lockKey: string): Promise<void> {
    await this.cache.del(lockKey);
  }
}

// Export singleton instance
export const metricsAggregator = new MetricsAggregator();
