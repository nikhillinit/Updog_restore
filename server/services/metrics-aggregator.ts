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
import type {
  ActualMetrics,
  MetricsCalculationError,
  ProjectedMetrics,
  UnifiedFundMetrics,
} from '@shared/types/metrics';
import type {
  DualForecastActualsFacts,
  DualForecastActualsFactsCompany,
  DualForecastConfigMetadata,
  DualForecastCurrentProjection,
  DualForecastMetrics,
  DualForecastNavAnchor,
  DualForecastNavAnchorCompany,
  DualForecastNavAnchoring,
  DualForecastPoint,
  DualForecastResponse,
} from '@shared/contracts/dual-forecast/dual-forecast-response.contract';
import { buildFundCompanyActualsFacts } from './fund-actuals/fund-company-actuals-facts-service';
import { ActualMetricsCalculator, isLivePortfolioCompany } from './actual-metrics-calculator';
import { ProjectedMetricsCalculator } from './projected-metrics-calculator';
import { VarianceCalculator } from './variance-calculator';
import {
  ConstructionForecastCalculator,
  type ConstructionForecast,
} from './construction-forecast-calculator';
import { getFundAge, isConstructionPhase, type FundAge } from '@shared/lib/lifecycle-rules';
import { funds, type Fund, type PortfolioCompany } from '@shared/schema';
import { toDecimal, type Decimal } from '@shared/lib/decimal-utils';
import { FundDraftWriteV1Schema } from '@shared/contracts/fund-draft-write-v1.contract';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

interface CacheClient {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, options?: { ttlSeconds?: number }): Promise<void>;
  del(key: string): Promise<void>;
  setnx?(key: string, value: string, ttlSeconds?: number): Promise<boolean>;
}

interface MetricsFundConfig {
  fundSizeOverride?: number;
  targetIRR: number;
  targetTVPI: number;
  targetDPI?: number;
  investmentPeriodYears: number;
  fundTermYears: number;
  reserveRatio?: number;
  targetCompanyCount: number;
}

interface ResolvedFundConfig {
  config: MetricsFundConfig;
  warnings: string[];
  metadata: DualForecastConfigMetadata;
}

type MetricsFund = Fund & {
  establishmentDate: string | Date | null;
  isActive: boolean | null;
};

type MetricsPortfolioCompany = PortfolioCompany & {
  currentStage: string | null;
  investmentDate: Date | null;
  ownershipCurrentPct: string | null;
};

const LEGACY_DEFAULT_TARGETS: MetricsFundConfig = {
  targetIRR: 0.25,
  targetTVPI: 2.5,
  investmentPeriodYears: 3,
  fundTermYears: 10,
  reserveRatio: 0.5,
  targetCompanyCount: 20,
};

const MetricsTargetExtractionSchema = z
  .object({
    fundSize: FundDraftWriteV1Schema.shape.fundSize,
    fundLife: FundDraftWriteV1Schema.shape.fundLife,
    investmentPeriod: FundDraftWriteV1Schema.shape.investmentPeriod,
    targetMetrics: FundDraftWriteV1Schema.shape.targetMetrics,
  })
  .passthrough();

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
      await new Promise((resolve) => setTimeout(resolve, 100));
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
      const fundFromDb = await this.getFundForMetrics(fundId);
      if (!fundFromDb) {
        throw this.createError('INSUFFICIENT_DATA', `Fund ${fundId} not found`, 'aggregator');
      }
      // Ensure fund object has optional nullable fields for projected calculator
      const fund = fundFromDb as MetricsFund;

      // Fetch portfolio companies
      const companiesFromDb = await storage.getPortfolioCompanies(fundId);
      // Type assert companies to include optional fields needed by projected calculator
      const companies = companiesFromDb as MetricsPortfolioCompany[];

      // Fetch fund configuration
      const { config, warnings: configWarnings } = await this.resolveFundConfig(fundId);
      warnings.push(...configWarnings);
      const effectiveFund: MetricsFund =
        config.fundSizeOverride != null ? { ...fund, size: String(config.fundSizeOverride) } : fund;

      // Calculate all metric components in parallel with error handling
      let actual, projected;

      try {
        actual = await this.actualCalculator.calculate(fundId);
      } catch (error) {
        actualStatus = 'failed';
        warnings.push(
          `Actual metrics calculation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        throw error; // Re-throw for now; could provide fallback in the future
      }

      if (options.skipProjections) {
        projected = this.getDefaultProjectedMetrics(config);
        projectedStatus = 'skipped';
        warnings.push('Projections skipped for performance');
      } else {
        try {
          projected = await this.calculateProjectedMetrics(
            fund,
            effectiveFund,
            companies,
            config,
            warnings
          );
        } catch (error) {
          projectedStatus = 'failed';
          warnings.push(
            `Projected metrics calculation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
          projected = this.getDefaultProjectedMetrics(config); // Use fallback
        }
      }

      // Extract target metrics from config
      let target;
      try {
        target = this.extractTargetMetrics(effectiveFund, config);
      } catch (error) {
        targetStatus = 'failed';
        warnings.push(
          `Target metrics extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        throw error; // Re-throw as targets are critical
      }

      // Calculate variance
      let variance;
      try {
        variance = this.varianceCalculator.calculate(actual, projected, target);
      } catch (error) {
        varianceStatus = 'failed';
        warnings.push(
          `Variance calculation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        throw error; // Re-throw as variance is critical
      }

      // Determine overall quality
      const quality: 'complete' | 'partial' | 'fallback' =
        actualStatus === 'success' &&
        projectedStatus === 'success' &&
        targetStatus === 'success' &&
        varianceStatus === 'success'
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
   * Get a dashboard-ready Construction Plan vs Current Forecast time series.
   */
  async getDualForecast(fundId: number): Promise<DualForecastResponse> {
    const warnings: string[] = [];

    try {
      const fundFromDb = await this.getFundForMetrics(fundId);
      if (!fundFromDb) {
        throw this.createError('INSUFFICIENT_DATA', `Fund ${fundId} not found`, 'aggregator');
      }

      const fund = fundFromDb as MetricsFund;
      const companiesFromDb = await storage.getPortfolioCompanies(fundId);
      const companies = companiesFromDb as MetricsPortfolioCompany[];
      const { config, warnings: configWarnings, metadata } = await this.resolveFundConfig(fundId);
      warnings.push(...configWarnings);

      const effectiveFund: MetricsFund =
        config.fundSizeOverride != null ? { ...fund, size: String(config.fundSizeOverride) } : fund;

      const actual = await this.actualCalculator.calculate(fundId);
      const actualsFacts = await this.fetchActualsFactsBlock(fundId, actual.asOfDate, warnings);
      // PR-2 blend (ADR-029/030/032): a null facts block means no blend - the
      // series keeps the legacy calculator NAV, disclosed via warnings.
      const navAnchoring = this.buildNavAnchoring(companies, actualsFacts);
      const anchoredActual = navAnchoring ? this.applyNavAnchoring(actual, navAnchoring) : actual;
      const constructionStartIndex = this.getElapsedQuarterIndex(
        effectiveFund.establishmentDate ?? effectiveFund.createdAt,
        actual.asOfDate
      );
      const usesConstructionProjection = this.usesConstructionForecast(fund, companies);

      let projected: ProjectedMetrics;
      let currentProjectionStartIndex = 0;
      let currentProjection: DualForecastCurrentProjection = {
        status: 'projected',
        fallbackReason: null,
      };
      try {
        projected = await this.calculateProjectedMetrics(
          fund,
          effectiveFund,
          companies,
          config,
          warnings
        );
        currentProjectionStartIndex = usesConstructionProjection ? constructionStartIndex + 1 : 0;
      } catch (error) {
        const fallbackReason = error instanceof Error ? error.message : 'Unknown error';
        warnings.push(`Projected metrics calculation failed: ${fallbackReason}`);
        projected = this.getDefaultProjectedMetrics(config);
        currentProjection = { status: 'fallback_default', fallbackReason };
      }

      const constructionForecast = this.buildConstructionForecast(effectiveFund, config);
      const series = this.buildDualForecastSeries(
        anchoredActual,
        projected,
        constructionForecast,
        toDecimal(effectiveFund.size),
        config,
        constructionStartIndex,
        currentProjectionStartIndex
      );

      return {
        fundId,
        fundName: fund.name,
        asOfDate: actual.asOfDate,
        series,
        sources: {
          construction: 'construction_forecast_jcurve',
          current: 'projected_metrics_calculator',
          actual: 'actual_metrics_calculator',
        },
        config: metadata,
        actualsFacts,
        navAnchoring,
        currentProjection,
        warnings,
      };
    } catch (error) {
      console.error('Dual forecast aggregation failed:', error);

      if (this.isMetricsError(error)) {
        throw error;
      }

      throw this.createError(
        'CALCULATION_FAILED',
        error instanceof Error ? error.message : 'Unknown error during dual forecast calculation',
        'aggregator',
        error
      );
    }
  }

  /**
   * PR-1 shadow read (ADR-031): fetch Round/FMV actuals facts through the
   * sanctioned service seam and surface provenance only - the numeric series
   * are unchanged until the PR-2 blend. A facts failure discloses through the
   * warnings array and never blocks the read surface (ADR-028).
   */
  private async fetchActualsFactsBlock(
    fundId: number,
    asOfDateTime: string,
    warnings: string[]
  ): Promise<DualForecastActualsFacts | null> {
    try {
      const facts = await buildFundCompanyActualsFacts({
        fundId,
        asOfDate: asOfDateTime.slice(0, 10),
      });
      return {
        asOfDate: facts.asOfDate,
        generatedAt: facts.generatedAt,
        inputHash: facts.inputHash,
        companies: facts.facts.map((fact) => ({
          companyId: fact.companyId,
          companyName: fact.companyName,
          trustState: fact.provenance.trustState,
          planningFmvStatus: fact.planningFmvStatus,
          currency: fact.currency,
          currencyStatus: fact.currencyStatus,
          latestRoundDate: fact.latestRoundDate,
          latestRoundValuation: fact.latestRoundValuation,
          latestPlanningFmvDate: fact.latestPlanningFmvDate,
          latestPlanningFmvValue: fact.latestPlanningFmvValue,
          warnings: fact.warnings,
        })),
        warnings: facts.facts.flatMap((fact) => fact.warnings),
      };
    } catch (error) {
      warnings.push(
        `Actuals facts unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return null;
    }
  }

  /**
   * PR-2 blend disclosure (ADR-029/030/032): per-company anchor attribution
   * over the FULL portfolio read plus the ADR-030 per-trust-state count map
   * over the facts companies. The NAV universe is exactly the live-company
   * universe the legacy calculator uses (`isLivePortfolioCompany`); exited and
   * written-off companies stay disclosed but contribute nothing.
   */
  private buildNavAnchoring(
    companies: MetricsPortfolioCompany[],
    actualsFacts: DualForecastActualsFacts | null
  ): DualForecastNavAnchoring | null {
    if (!actualsFacts) {
      return null;
    }

    const countsByTrustState = { LIVE: 0, PARTIAL: 0, UNAVAILABLE: 0, FAILED: 0 };
    for (const factCompany of actualsFacts.companies) {
      countsByTrustState[factCompany.trustState] += 1;
    }

    const factsByCompanyId = new Map(
      actualsFacts.companies.map((factCompany) => [factCompany.companyId, factCompany])
    );
    const portfolioCompanyIds = new Set(companies.map((company) => company.id));

    let blendedNav = toDecimal(0);
    const entries: DualForecastNavAnchorCompany[] = companies.map((company) => {
      const fact = factsByCompanyId.get(company.id) ?? null;
      if (!isLivePortfolioCompany(company)) {
        return {
          companyId: company.id,
          companyName: company.name,
          inNavUniverse: false,
          trustState: fact?.trustState ?? null,
          anchor: null,
          contribution: null,
        };
      }

      const { anchor, contribution } = this.resolveNavAnchor(company, fact);
      blendedNav = blendedNav.plus(contribution);
      return {
        companyId: company.id,
        companyName: company.name,
        inNavUniverse: true,
        trustState: fact?.trustState ?? null,
        anchor,
        contribution: contribution.toFixed(6),
      };
    });

    // Facts can carry companies the portfolio read no longer returns; disclose
    // them outside the NAV universe instead of dropping them silently.
    for (const factCompany of actualsFacts.companies) {
      if (!portfolioCompanyIds.has(factCompany.companyId)) {
        entries.push({
          companyId: factCompany.companyId,
          companyName: factCompany.companyName,
          inNavUniverse: false,
          trustState: factCompany.trustState,
          anchor: null,
          contribution: null,
        });
      }
    }

    return {
      blendedNav: blendedNav.toFixed(6),
      countsByTrustState,
      companies: entries,
    };
  }

  /**
   * ADR-029 anchor ladder. UNAVAILABLE/FAILED envelopes and currency-blocked
   * companies contribute no facts-derived money (ADR-030/ADR-032) and descend
   * to the legacy rungs. `latestRoundValuation` (pre-money) NEVER enters NAV.
   */
  private resolveNavAnchor(
    company: MetricsPortfolioCompany,
    fact: DualForecastActualsFactsCompany | null
  ): { anchor: DualForecastNavAnchor; contribution: Decimal } {
    const factsMoneyUsable =
      fact !== null &&
      fact.trustState !== 'UNAVAILABLE' &&
      fact.trustState !== 'FAILED' &&
      fact.currencyStatus !== 'mismatch_blocked';

    if (factsMoneyUsable && fact.latestPlanningFmvValue !== null) {
      if (fact.planningFmvStatus === 'active') {
        return { anchor: 'planning_fmv', contribution: toDecimal(fact.latestPlanningFmvValue) };
      }
      if (fact.planningFmvStatus === 'stale') {
        return {
          anchor: 'planning_fmv_stale',
          contribution: toDecimal(fact.latestPlanningFmvValue),
        };
      }
    }

    if (company.currentValuation != null) {
      return {
        anchor: 'legacy_current_valuation',
        contribution: toDecimal(company.currentValuation),
      };
    }

    return { anchor: 'none', contribution: toDecimal(0) };
  }

  /**
   * Re-anchor the as-of Current/Actual point on the blended NAV (ADR-029).
   * TVPI/RVPI mirror ActualMetricsCalculator semantics (0, not null, when no
   * capital is called). DPI and IRR are cash-flow-derived and unchanged by a
   * NAV re-anchor; IRR keeps the legacy calculator's terminal-value basis.
   */
  private applyNavAnchoring(
    actual: ActualMetrics,
    navAnchoring: DualForecastNavAnchoring
  ): ActualMetrics {
    const nav = toDecimal(navAnchoring.blendedNav);
    const totalCalled = toDecimal(actual.totalCalled);
    const totalValue = nav.plus(toDecimal(actual.totalDistributions));
    const tvpi = totalCalled.gt(0) ? totalValue.div(totalCalled) : toDecimal(0);
    const rvpi = totalCalled.gt(0) ? nav.div(totalCalled) : toDecimal(0);

    return {
      ...actual,
      currentNAV: nav.toNumber(),
      totalValue: totalValue.toNumber(),
      tvpi: tvpi.toNumber(),
      rvpi: rvpi.toNumber(),
    };
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

  private async getFundForMetrics(fundId: number): Promise<Fund | undefined> {
    const storedFund = await storage.getFund(fundId);
    if (storedFund) {
      return {
        ...storedFund,
        establishmentDate: (storedFund as Partial<Fund>).establishmentDate ?? null,
        isActive: (storedFund as Partial<Fund>).isActive ?? true,
      } as Fund;
    }

    const [persistedFund] = await db.select().from(funds).where(eq(funds.id, fundId));
    return persistedFund
      ? ({
          ...persistedFund,
          establishmentDate: (persistedFund as Partial<Fund>).establishmentDate ?? null,
          isActive: (persistedFund as Partial<Fund>).isActive ?? true,
        } as Fund)
      : undefined;
  }

  private async calculateProjectedMetrics(
    fund: MetricsFund,
    effectiveFund: MetricsFund,
    companies: MetricsPortfolioCompany[],
    config: MetricsFundConfig,
    warnings: string[]
  ): Promise<ProjectedMetrics> {
    if (this.usesConstructionForecast(fund, companies)) {
      warnings.push('Using J-curve construction forecast (no investments yet)');
      return this.projectedCalculator.calculate(effectiveFund, companies, config, {
        useConstructionForecast: true,
      });
    }

    return this.projectedCalculator.calculate(effectiveFund, companies, config);
  }

  private usesConstructionForecast(
    fund: MetricsFund,
    companies: MetricsPortfolioCompany[]
  ): boolean {
    const hasInvestments = companies.length > 0;
    const fundStartDate = fund.establishmentDate ?? fund.createdAt;
    const fundAge: FundAge = fundStartDate
      ? getFundAge(fundStartDate)
      : { years: 0, months: 0, quarters: 0, totalMonths: 0 };

    return isConstructionPhase(fundAge, hasInvestments);
  }

  private buildConstructionForecast(
    fund: MetricsFund,
    config: MetricsFundConfig
  ): ConstructionForecast {
    return ConstructionForecastCalculator.generateForecast({
      fundSize: toDecimal(fund.size.toString()),
      establishmentDate: fund.establishmentDate ?? fund.createdAt ?? new Date(),
      targetTVPI: config.targetTVPI,
      investmentPeriodYears: config.investmentPeriodYears,
      fundLifeYears: config.fundTermYears,
      navCalculationMode: 'standard',
      finalDistributionCoefficient: 0.7,
    });
  }

  private buildDualForecastSeries(
    actual: ActualMetrics,
    projected: ProjectedMetrics,
    constructionForecast: ConstructionForecast,
    fundSize: ReturnType<typeof toDecimal>,
    config: MetricsFundConfig,
    constructionStartIndex: number,
    currentProjectionStartIndex: number
  ): DualForecastPoint[] {
    const constructionLength = Math.min(
      constructionForecast.jCurvePath.nav.length,
      constructionForecast.jCurvePath.tvpi.length,
      constructionForecast.jCurvePath.calls.length
    );
    const projectedFutureLength = Math.max(
      projected.projectedNAV.length,
      projected.projectedDeployment.length,
      projected.projectedDistributions.length
    );
    const constructionRemainingLength = Math.max(1, constructionLength - constructionStartIndex);
    const horizon = Math.max(1, Math.min(constructionRemainingLength, projectedFutureLength + 1));

    return Array.from({ length: horizon }, (_, quarterIndex) => {
      const actualPoint = quarterIndex === 0 ? this.mapActualMetrics(actual) : null;
      const construction = this.mapConstructionMetrics(
        constructionForecast,
        fundSize,
        config,
        constructionStartIndex + quarterIndex
      );
      const current =
        actualPoint ??
        this.mapCurrentForecastMetrics(
          actual,
          projected,
          quarterIndex,
          currentProjectionStartIndex
        );

      return {
        quarterIndex,
        label: quarterIndex === 0 ? 'As of' : `Q+${quarterIndex}`,
        date: this.addQuarters(actual.asOfDate, quarterIndex),
        construction,
        actual: actualPoint,
        currentMode: quarterIndex === 0 ? 'actual' : 'forecast',
        current,
        variance: this.mapVariance(current, construction),
      };
    });
  }

  /**
   * PR-2 per-quarter Construction-vs-Current variance: `current` minus
   * `construction`, null-propagating on the nullable ratios. Both inputs are
   * already number-typed series values, so this is plain number arithmetic -
   * no decimal strings are involved at this seam.
   */
  private mapVariance(
    current: DualForecastMetrics,
    construction: DualForecastMetrics
  ): DualForecastMetrics {
    return {
      nav: current.nav - construction.nav,
      calledCapital: current.calledCapital - construction.calledCapital,
      distributions: current.distributions - construction.distributions,
      tvpi: this.nullableDelta(current.tvpi, construction.tvpi),
      dpi: this.nullableDelta(current.dpi, construction.dpi),
      rvpi: this.nullableDelta(current.rvpi, construction.rvpi),
      irr: this.nullableDelta(current.irr, construction.irr),
    };
  }

  private nullableDelta(current: number | null, construction: number | null): number | null {
    return current == null || construction == null ? null : current - construction;
  }

  private mapActualMetrics(actual: ActualMetrics): DualForecastMetrics {
    return {
      nav: actual.currentNAV,
      calledCapital: actual.totalCalled,
      distributions: actual.totalDistributions,
      tvpi: actual.tvpi,
      dpi: actual.dpi,
      rvpi: actual.rvpi,
      irr: actual.irr,
    };
  }

  private mapConstructionMetrics(
    forecast: ConstructionForecast,
    fundSize: ReturnType<typeof toDecimal>,
    config: MetricsFundConfig,
    quarterIndex: number
  ): DualForecastMetrics {
    const safeIndex = Math.min(
      quarterIndex,
      Math.max(
        0,
        Math.min(
          forecast.jCurvePath.nav.length,
          forecast.jCurvePath.dpi.length,
          forecast.jCurvePath.tvpi.length,
          forecast.jCurvePath.calls.length
        ) - 1
      )
    );
    const calledCapital = fundSize
      .times(this.cumulativeDecimal(forecast.jCurvePath.calls, safeIndex))
      .toNumber();
    const nav = fundSize.times(forecast.jCurvePath.nav[safeIndex] ?? 0).toNumber();
    const distributions = fundSize.times(forecast.jCurvePath.dpi[safeIndex] ?? 0).toNumber();

    return {
      nav,
      calledCapital,
      distributions,
      tvpi: forecast.jCurvePath.tvpi[safeIndex]?.toNumber() ?? null,
      dpi: this.safeRatio(distributions, calledCapital),
      rvpi: this.safeRatio(nav, calledCapital),
      irr: config.targetIRR,
    };
  }

  private mapCurrentForecastMetrics(
    actual: ActualMetrics,
    projected: ProjectedMetrics,
    quarterIndex: number,
    projectionStartIndex: number
  ): DualForecastMetrics {
    if (quarterIndex === 0) {
      return this.mapActualMetrics(actual);
    }

    const projectionIndex = projectionStartIndex + quarterIndex - 1;
    const nav = this.valueAtOrLast(projected.projectedNAV, projectionIndex, actual.currentNAV);
    const calledCapital =
      actual.totalCalled +
      this.cumulativeNumberFrom(
        projected.projectedDeployment,
        projectionStartIndex,
        projectionIndex
      );
    const distributions =
      actual.totalDistributions +
      this.cumulativeNumberFrom(
        projected.projectedDistributions,
        projectionStartIndex,
        projectionIndex
      );

    return {
      nav,
      calledCapital,
      distributions,
      tvpi: this.safeRatio(nav + distributions, calledCapital),
      dpi: this.safeRatio(distributions, calledCapital),
      rvpi: this.safeRatio(nav, calledCapital),
      irr: projected.expectedIRR,
    };
  }

  private addQuarters(asOfDate: string, quarterIndex: number): string {
    const date = new Date(asOfDate);
    const baseDate = Number.isNaN(date.getTime()) ? new Date() : date;
    baseDate.setUTCMonth(baseDate.getUTCMonth() + quarterIndex * 3);
    return baseDate.toISOString();
  }

  private getElapsedQuarterIndex(
    startDateValue: Date | string | null | undefined,
    asOfDateValue: string
  ): number {
    if (!startDateValue) {
      return 0;
    }

    const startDate = new Date(startDateValue);
    const asOfDate = new Date(asOfDateValue);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(asOfDate.getTime())) {
      return 0;
    }

    const elapsedMonths =
      (asOfDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12 +
      (asOfDate.getUTCMonth() - startDate.getUTCMonth());
    const adjustedElapsedMonths =
      asOfDate.getUTCDate() < startDate.getUTCDate() ? elapsedMonths - 1 : elapsedMonths;

    return Math.max(0, Math.floor(adjustedElapsedMonths / 3));
  }

  private cumulativeDecimal(values: ReturnType<typeof toDecimal>[], index: number) {
    return values.slice(0, index + 1).reduce((sum, value) => sum.plus(value), toDecimal(0));
  }

  private cumulativeNumber(values: number[], index: number): number {
    return values.slice(0, index + 1).reduce((sum, value) => sum + this.safeNumber(value), 0);
  }

  private cumulativeNumberFrom(values: number[], startIndex: number, endIndex: number): number {
    const safeStart = Math.max(0, startIndex);
    const safeEnd = Math.min(endIndex, values.length - 1);

    if (safeEnd < safeStart) {
      return 0;
    }

    return values
      .slice(safeStart, safeEnd + 1)
      .reduce((sum, value) => sum + this.safeNumber(value), 0);
  }

  private valueAtOrLast(values: number[], index: number, fallback: number): number {
    if (values.length === 0) {
      return fallback;
    }

    return this.safeNumber(values[Math.min(index, values.length - 1)] ?? fallback);
  }

  private safeRatio(numerator: number, denominator: number): number | null {
    if (!Number.isFinite(denominator) || denominator <= 0) {
      return null;
    }

    const ratio = numerator / denominator;
    return Number.isFinite(ratio) ? ratio : null;
  }

  private safeNumber(value: number): number {
    return Number.isFinite(value) ? value : 0;
  }

  private formatPublishedAt(value: Date | string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  /**
   * Resolve published config into the metrics-target shape, with explicit
   * legacy fallback warnings when target fields are unavailable.
   */
  private async resolveFundConfig(fundId: number): Promise<ResolvedFundConfig> {
    const publishedConfig = await storage.getFundConfig(fundId);
    if (!publishedConfig) {
      const fallbackReason = 'No published fund config is available.';
      return {
        config: { ...LEGACY_DEFAULT_TARGETS },
        warnings: ['Using legacy generic targets because no published fund config is available.'],
        metadata: {
          source: 'legacy_default_no_published_config',
          version: null,
          publishedAt: null,
          fallbackReason,
        },
      };
    }

    const parsedConfig = MetricsTargetExtractionSchema.safeParse(publishedConfig.config);
    if (!parsedConfig.success) {
      const fallbackReason = `Published config version ${publishedConfig.version} is invalid for target extraction.`;
      return {
        config: { ...LEGACY_DEFAULT_TARGETS },
        warnings: [
          `Using legacy generic targets because published config version ${publishedConfig.version} is invalid for target extraction.`,
        ],
        metadata: {
          source: 'legacy_default_invalid_config',
          version: publishedConfig.version,
          publishedAt: this.formatPublishedAt(publishedConfig.publishedAt),
          fallbackReason,
        },
      };
    }

    const draftConfig = parsedConfig.data;
    if (!draftConfig.targetMetrics) {
      const fallbackReason = `Published config version ${publishedConfig.version} has no targetMetrics block.`;
      return {
        config: {
          ...LEGACY_DEFAULT_TARGETS,
          ...(draftConfig.fundSize != null && { fundSizeOverride: draftConfig.fundSize }),
          ...(draftConfig.investmentPeriod != null && {
            investmentPeriodYears: draftConfig.investmentPeriod,
          }),
          ...(draftConfig.fundLife != null && { fundTermYears: draftConfig.fundLife }),
        },
        warnings: [
          `Using legacy generic targets because published config version ${publishedConfig.version} has no targetMetrics block.`,
        ],
        metadata: {
          source: 'legacy_default_missing_target_metrics',
          version: publishedConfig.version,
          publishedAt: this.formatPublishedAt(publishedConfig.publishedAt),
          fallbackReason,
        },
      };
    }

    return {
      config: {
        ...(draftConfig.fundSize != null && { fundSizeOverride: draftConfig.fundSize }),
        targetIRR: draftConfig.targetMetrics.targetIRR,
        targetTVPI: draftConfig.targetMetrics.targetTVPI,
        ...(draftConfig.targetMetrics.targetDPI != null && {
          targetDPI: draftConfig.targetMetrics.targetDPI,
        }),
        investmentPeriodYears:
          draftConfig.investmentPeriod ?? LEGACY_DEFAULT_TARGETS.investmentPeriodYears,
        fundTermYears: draftConfig.fundLife ?? LEGACY_DEFAULT_TARGETS.fundTermYears,
        ...(draftConfig.targetMetrics.targetReserveRatio != null && {
          reserveRatio: draftConfig.targetMetrics.targetReserveRatio,
        }),
        targetCompanyCount: draftConfig.targetMetrics.targetCompanyCount,
      },
      warnings: [],
      metadata: {
        source: 'published',
        version: publishedConfig.version,
        publishedAt: this.formatPublishedAt(publishedConfig.publishedAt),
        fallbackReason: null,
      },
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
      targetCompanyCount: number;
    }
  ) {
    const targetFundSize = toDecimal(fund.size.toString()).toNumber();

    return {
      targetFundSize,
      targetIRR: config.targetIRR,
      targetTVPI: config.targetTVPI,
      ...(config.targetDPI != null && { targetDPI: config.targetDPI }),
      targetDeploymentYears: config.investmentPeriodYears,
      targetCompanyCount: config.targetCompanyCount,
      targetAverageCheckSize: targetFundSize / config.targetCompanyCount,
      ...(config.reserveRatio != null && { targetReserveRatio: config.reserveRatio }),
    };
  }

  /**
   * Get default projected metrics (fallback when engines fail)
   */
  private getDefaultProjectedMetrics(
    config?: Pick<MetricsFundConfig, 'targetIRR' | 'targetTVPI' | 'targetDPI'>
  ) {
    return {
      asOfDate: new Date().toISOString(),
      projectionDate: new Date().toISOString(),
      projectedDeployment: Array(12).fill(0),
      projectedDistributions: Array(12).fill(0),
      projectedNAV: Array(12).fill(0),
      expectedTVPI: config?.targetTVPI ?? 2.5,
      expectedIRR: config?.targetIRR ?? 0.25,
      expectedDPI: config?.targetDPI ?? 1.0,
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
    return typeof error === 'object' && error !== null && 'code' in error && 'component' in error;
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
