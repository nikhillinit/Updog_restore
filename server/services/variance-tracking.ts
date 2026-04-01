/**
 * Variance Tracking Service
 *
 * Comprehensive service for managing fund performance variance tracking,
 * baseline comparisons, and alert generation.
 */

import { db } from '../db';
import { Decimal, toDecimal } from '@shared/lib/decimal-utils';
import { isDeepStrictEqual } from 'node:util';
import {
  fundBaselines,
  varianceReports,
  performanceAlerts,
  alertRules,
  fundMetrics,
  portfolioCompanies,
  investments,
  fundSnapshots,
  calcRuns,
} from '@shared/schema';
import type {
  FundBaseline,
  InsertFundBaseline,
  VarianceReport,
  InsertVarianceReport,
  PerformanceAlert,
  InsertPerformanceAlert,
  AlertRule,
  InsertAlertRule,
} from '@shared/schema';
import { eq, and, desc, lte, inArray } from 'drizzle-orm';
import {
  recordVarianceReportGenerated,
  recordBaselineOperation,
  recordAlertGenerated,
  recordAlertAction,
  updateFundVarianceScore,
  updateDataQualityScore,
  recordSystemError,
  startVarianceCalculation,
} from '../metrics/variance-metrics';
import { SYSTEM_ACTOR_ID } from '@shared/constants/system-actor';

interface TriggeredAlertData {
  ruleId: string;
  ruleName?: string;
  metricName: string;
  thresholdValue: number;
  actualValue: number | null;
  severity: 'info' | 'warning' | 'critical' | 'urgent';
}

function isTriggeredAlertSeverity(value: unknown): value is TriggeredAlertData['severity'] {
  return value === 'info' || value === 'warning' || value === 'critical' || value === 'urgent';
}

function normalizeTriggeredAlertSeverity(value: unknown): TriggeredAlertData['severity'] {
  return isTriggeredAlertSeverity(value) ? value : 'warning';
}

function isTriggeredAlertData(value: unknown): value is TriggeredAlertData {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['ruleId'] === 'string' &&
    typeof candidate['metricName'] === 'string' &&
    typeof candidate['thresholdValue'] === 'number' &&
    (typeof candidate['actualValue'] === 'number' || candidate['actualValue'] === null) &&
    isTriggeredAlertSeverity(candidate['severity']) &&
    (candidate['ruleName'] === undefined || typeof candidate['ruleName'] === 'string')
  );
}

function isUniqueConstraintViolation(error: unknown, constraintName: string): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { code?: string; constraint?: string; message?: string };
  return (
    candidate.code === '23505' &&
    (candidate.constraint === constraintName ||
      candidate.message?.includes(constraintName) === true)
  );
}

function ensureOrderedPeriod(start: Date, end: Date): Date {
  if (end.getTime() > start.getTime()) {
    return end;
  }

  return new Date(start.getTime() + 1000);
}

/**
 * Baseline creation and management
 */
export class BaselineService {
  /**
   * Create a new baseline from current fund state
   */
  async createBaseline(params: {
    fundId: number;
    name: string;
    description?: string;
    baselineType: 'initial' | 'quarterly' | 'annual' | 'milestone' | 'custom';
    periodStart: Date;
    periodEnd: Date;
    createdBy?: number;
    sourceRunId?: number;
    tags?: string[];
  }): Promise<FundBaseline> {
    const startTime = Date.now();
    const {
      fundId,
      name,
      description,
      baselineType,
      periodStart,
      periodEnd,
      createdBy,
      sourceRunId,
      tags = [],
    } = params;
    const actorId = createdBy ?? SYSTEM_ACTOR_ID;

    try {
      const baseline = await db.transaction(async (tx) => {
        if (sourceRunId != null) {
          const existingBaseline = await tx.query.fundBaselines.findFirst({
            where: and(
              eq(fundBaselines.fundId, fundId),
              eq(fundBaselines.sourceRunId, sourceRunId)
            ),
          });

          if (existingBaseline) {
            return existingBaseline;
          }
        }

        const latestMetrics = await this.getBaselineMetrics(tx, fundId, sourceRunId);
        if (!latestMetrics) {
          recordSystemError('baseline-service', 'missing_fund_metrics');
          throw new Error('No fund metrics available to create baseline');
        }

        const portfolioData = await this.getPortfolioComposition(tx, fundId);
        const reserveData = await this.getReserveSnapshot(tx, fundId);
        const pacingData = await this.getPacingSnapshot(tx, fundId);

        const existingDefault = await tx.query.fundBaselines.findFirst({
          where: and(
            eq(fundBaselines.fundId, fundId),
            eq(fundBaselines.isDefault, true),
            eq(fundBaselines.isActive, true)
          ),
        });

        const baselineData: InsertFundBaseline = {
          fundId,
          name,
          baselineType,
          periodStart,
          periodEnd,
          snapshotDate: new Date(),
          totalValue: latestMetrics.totalValue,
          deployedCapital: portfolioData.deployedCapital,
          irr: latestMetrics.irr,
          multiple: latestMetrics.multiple,
          dpi: latestMetrics.dpi,
          tvpi: latestMetrics.tvpi,
          portfolioCount: portfolioData.portfolioCount,
          averageInvestment: portfolioData.averageInvestment,
          topPerformers: portfolioData.topPerformers,
          sectorDistribution: portfolioData.sectorDistribution,
          stageDistribution: portfolioData.stageDistribution,
          reserveAllocation: reserveData,
          pacingMetrics: pacingData,
          createdBy: actorId,
          isDefault: !existingDefault,
          description,
          sourceRunId,
          tags,
        };

        const [createdBaseline] = await tx.insert(fundBaselines).values(baselineData).returning();

        if (!createdBaseline) {
          throw new Error('Failed to create baseline');
        }

        return createdBaseline;
      });

      // Record metrics
      const duration = (Date.now() - startTime) / 1000;
      recordBaselineOperation(fundId.toString(), 'create', baselineType, duration);

      return baseline;
    } catch (error: unknown) {
      if (
        sourceRunId != null &&
        (isUniqueConstraintViolation(error, 'fund_baselines_source_run_unique') ||
          isUniqueConstraintViolation(error, 'fund_baselines_default_unique'))
      ) {
        const existingBaseline = await db.query.fundBaselines.findFirst({
          where: and(eq(fundBaselines.fundId, fundId), eq(fundBaselines.sourceRunId, sourceRunId)),
        });

        if (existingBaseline) {
          return existingBaseline;
        }
      }

      recordSystemError('baseline-service', 'creation_failed');
      throw error;
    }
  }

  async createBaselineFromCalcRun(runId: number): Promise<FundBaseline> {
    const run = await db.query.calcRuns.findFirst({
      where: eq(calcRuns.id, runId),
    });

    if (!run) {
      throw new Error(`Calc run ${runId} not found`);
    }

    const periodStart = run.requestedAt;
    const periodEnd = ensureOrderedPeriod(periodStart, run.completedAt ?? new Date());

    return await this.createBaseline({
      fundId: run.fundId,
      name: `Automated Baseline v${run.configVersion}`,
      description: `Auto-created from calc run ${run.id} for config version ${run.configVersion}`,
      baselineType: 'milestone',
      periodStart,
      periodEnd,
      createdBy: SYSTEM_ACTOR_ID,
      sourceRunId: run.id,
      tags: ['automatic', 'calc-run'],
    });
  }

  /**
   * Get active baselines for a fund
   */
  async getBaselines(
    fundId: number,
    options?: {
      baselineType?: string;
      isDefault?: boolean;
      limit?: number;
    }
  ): Promise<FundBaseline[]> {
    const conditions = [eq(fundBaselines.fundId, fundId), eq(fundBaselines.isActive, true)];

    if (options?.baselineType) {
      conditions.push(eq(fundBaselines.baselineType, options.baselineType));
    }

    if (options?.isDefault !== undefined) {
      conditions.push(eq(fundBaselines.isDefault, options.isDefault));
    }

    const query = db.query.fundBaselines.findMany({
      where: and(...conditions),
      orderBy: desc(fundBaselines.createdAt),
      limit: options?.limit || 50,
    });

    return await query;
  }

  /**
   * Get a specific baseline owned by a fund.
   * This intentionally does not filter on isActive so historical/inactive
   * baselines can still be referenced explicitly.
   */
  async getBaselineById(fundId: number, baselineId: string): Promise<FundBaseline | undefined> {
    return await db.query.fundBaselines.findFirst({
      where: and(eq(fundBaselines.fundId, fundId), eq(fundBaselines.id, baselineId)),
    });
  }

  /**
   * Set a baseline as default
   */
  async setDefaultBaseline(baselineId: string, fundId: number): Promise<void> {
    await db.transaction(async (tx) => {
      // Clear existing defaults
      await tx
        .update(fundBaselines)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(and(eq(fundBaselines.fundId, fundId), eq(fundBaselines.isDefault, true)));

      // Set new default
      await tx
        .update(fundBaselines)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(fundBaselines.id, baselineId));
    });
  }

  /**
   * Deactivate a baseline
   */
  async deactivateBaseline(baselineId: string): Promise<void> {
    await db
      .update(fundBaselines)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(fundBaselines.id, baselineId));
  }

  private async getBaselineMetrics(
    reader: {
      query: {
        fundMetrics: {
          findFirst: typeof db.query.fundMetrics.findFirst;
        };
      };
    },
    fundId: number,
    sourceRunId?: number
  ) {
    if (sourceRunId != null) {
      const attributedMetrics = await reader.query.fundMetrics.findFirst({
        where: and(eq(fundMetrics.fundId, fundId), eq(fundMetrics.runId, sourceRunId)),
        orderBy: desc(fundMetrics.metricDate),
      });

      if (attributedMetrics) {
        return attributedMetrics;
      }
    }

    return await reader.query.fundMetrics.findFirst({
      where: eq(fundMetrics.fundId, fundId),
      orderBy: desc(fundMetrics.metricDate),
    });
  }

  /**
   * Get portfolio composition for baseline creation
   */
  private async getPortfolioComposition(
    reader: {
      query: {
        portfolioCompanies: {
          findMany: typeof db.query.portfolioCompanies.findMany;
        };
        investments?: {
          findMany: typeof db.query.investments.findMany;
        };
      };
    },
    fundId: number
  ) {
    const companies = await reader.query.portfolioCompanies.findMany({
      where: eq(portfolioCompanies.fundId, fundId),
    });

    const companiesWithInvestments = companies as Array<
      (typeof companies)[number] & {
        investments?: Array<{ amount: string | number }>;
      }
    >;

    const companyIds = companiesWithInvestments.map((company) => company.id);
    const shouldLookupInvestments =
      companyIds.length > 0 &&
      companiesWithInvestments.some((company) => !Array.isArray(company.investments));

    const investmentLookup = new Map<number, Array<{ amount: string | number }>>();

    if (shouldLookupInvestments && reader.query.investments) {
      const companyInvestments = await reader.query.investments.findMany({
        where: and(
          eq(investments.fundId, fundId),
          inArray(
            investments.companyId,
            companyIds.filter((companyId): companyId is number => typeof companyId === 'number')
          )
        ),
      });

      for (const investment of companyInvestments) {
        const companyId = investment.companyId;
        if (companyId == null) {
          continue;
        }

        const existing = investmentLookup.get(companyId) ?? [];
        existing.push({ amount: investment.amount });
        investmentLookup.set(companyId, existing);
      }
    }

    const totalInvestments = companiesWithInvestments.reduce((sum: Decimal, company) => {
      const companyInvestments = Array.isArray(company.investments)
        ? company.investments
        : (investmentLookup.get(company.id) ?? []);

      const normalizedInvestments = Array.isArray(companyInvestments) ? companyInvestments : [];

      const companyInvestment = normalizedInvestments.reduce(
        (compSum: Decimal, inv) => compSum.plus(toDecimal(String(inv.amount))),
        new Decimal(0)
      );
      return sum.plus(companyInvestment);
    }, new Decimal(0));

    const portfolioCount = companiesWithInvestments.length;
    const averageInvestment =
      portfolioCount > 0 ? totalInvestments.div(portfolioCount) : new Decimal(0);

    // Get sector distribution
    const sectorCounts = companiesWithInvestments.reduce(
      (acc, company) => {
        acc[company.sector] = (acc[company.sector] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    // Get stage distribution
    const stageCounts = companiesWithInvestments.reduce(
      (acc, company) => {
        acc[company.stage] = (acc[company.stage] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    // Identify top performers (top 20% by current valuation)
    const sortedCompanies = companiesWithInvestments
      .filter((c) => c.currentValuation)
      .sort((a, b) =>
        toDecimal(b.currentValuation!.toString()).comparedTo(
          toDecimal(a.currentValuation!.toString())
        )
      );

    const topPerformersCount = Math.ceil(sortedCompanies.length * 0.2);
    const topPerformers = sortedCompanies.slice(0, topPerformersCount).map((c) => ({
      id: c.id,
      name: c.name,
      sector: c.sector,
      currentValuation: c.currentValuation,
    }));

    return {
      deployedCapital: totalInvestments.toString(),
      portfolioCount,
      averageInvestment: averageInvestment.toString(),
      topPerformers,
      sectorDistribution: sectorCounts,
      stageDistribution: stageCounts,
    };
  }

  /**
   * Get reserve allocation snapshot
   */
  private async getReserveSnapshot(
    reader: {
      query: {
        fundSnapshots: {
          findFirst: typeof db.query.fundSnapshots.findFirst;
        };
      };
    },
    fundId: number
  ) {
    const snapshot = await reader.query.fundSnapshots.findFirst({
      where: and(eq(fundSnapshots.fundId, fundId), eq(fundSnapshots.type, 'RESERVE')),
      orderBy: desc(fundSnapshots.createdAt),
    });

    return snapshot?.payload || {};
  }

  /**
   * Get pacing metrics snapshot
   */
  private async getPacingSnapshot(
    reader: {
      query: {
        fundSnapshots: {
          findFirst: typeof db.query.fundSnapshots.findFirst;
        };
      };
    },
    fundId: number
  ) {
    const snapshot = await reader.query.fundSnapshots.findFirst({
      where: and(eq(fundSnapshots.fundId, fundId), eq(fundSnapshots.type, 'PACING')),
      orderBy: desc(fundSnapshots.createdAt),
    });

    return snapshot?.payload || {};
  }
}

/**
 * Variance calculation and reporting
 */
export class VarianceCalculationService {
  private readonly currentStatePortfolioAnalysisToleranceMs = 60_000;

  /**
   * Generate variance report comparing current state to baseline
   */
  async generateVarianceReport(params: {
    fundId: number;
    baselineId: string;
    reportName: string;
    reportType: 'periodic' | 'milestone' | 'ad_hoc' | 'alert_triggered';
    reportPeriod?: string;
    asOfDate?: Date;
    generatedBy?: number;
  }): Promise<VarianceReport> {
    const {
      fundId,
      baselineId,
      reportName,
      reportType,
      reportPeriod,
      asOfDate = new Date(),
      generatedBy,
    } = params;

    const finishCalculation = startVarianceCalculation('report_generation');
    const startTime = Date.now();

    try {
      const canUseCurrentStatePortfolioAnalysis =
        this.canUseCurrentStatePortfolioAnalysis(asOfDate);

      // Get baseline data
      const baseline = await db.query.fundBaselines.findFirst({
        where: eq(fundBaselines.id, baselineId),
      });

      if (!baseline) {
        throw new Error('Baseline not found');
      }

      // Get current metrics
      const currentMetrics = await this.getCurrentMetrics(fundId, asOfDate);
      const baselineMetrics = this.extractBaselineMetrics(baseline);

      // Calculate variances
      const variances = this.calculateVariances(currentMetrics, baselineMetrics);

      // Analyze portfolio variances
      const portfolioVariances = canUseCurrentStatePortfolioAnalysis
        ? await this.analyzePortfolioVariances(fundId, baseline, asOfDate)
        : null;

      // Generate insights and risk assessment
      const insights = this.generateVarianceInsights(variances, portfolioVariances ?? {});

      // Check for alert triggers
      const alertsTriggered = await this.checkAlertTriggers(fundId, variances);

      const _calculationDuration = Date.now() - startTime;

      const reportData: InsertVarianceReport = {
        fundId,
        baselineId,
        reportName,
        reportType,
        analysisStart: baseline.periodStart,
        analysisEnd: baseline.periodEnd,
        asOfDate,
        currentMetrics,
        baselineMetrics,
        totalValueVariance: variances.totalValueVariance?.toString() ?? null,
        totalValueVariancePct: variances.totalValueVariancePct?.toString() ?? null,
        irrVariance: variances.irrVariance?.toString() ?? null,
        multipleVariance: variances.multipleVariance?.toString() ?? null,
        dpiVariance: variances.dpiVariance?.toString() ?? null,
        tvpiVariance: variances.tvpiVariance?.toString() ?? null,
        // Persist portfolio sub-analyses to dedicated schema columns
        portfolioVariances: portfolioVariances
          ? {
              companyVariances: portfolioVariances.companyVariances,
              portfolioCountVariance: portfolioVariances.portfolioCountVariance,
            }
          : null,
        sectorVariances: portfolioVariances?.sectorVariances ?? null,
        stageVariances: portfolioVariances?.stageVariances ?? null,
        reserveVariances: portfolioVariances?.reserveVariances ?? null,
        pacingVariances: portfolioVariances?.pacingVariances ?? null,
        significantVariances: insights.significantVariances,
        varianceFactors: insights.factors,
        thresholdBreaches: insights.thresholdBreaches,
        riskLevel: insights.riskLevel,
        alertsTriggered,
        generatedBy,
        reportPeriod,
      };

      const [report] = await db.insert(varianceReports).values(reportData).returning();

      if (!report) {
        throw new Error('Failed to create variance report');
      }

      // Record metrics
      const duration = (Date.now() - startTime) / 1000;
      recordVarianceReportGenerated(fundId.toString(), reportType, 'completed', duration);

      // Update variance score
      if (insights.overallScore) {
        updateFundVarianceScore(
          fundId.toString(),
          baselineId,
          toDecimal(insights.overallScore).toNumber()
        );
      }

      // Update data quality score
      if (insights.dataQualityScore) {
        updateDataQualityScore(
          fundId.toString(),
          'variance_calculation',
          toDecimal(insights.dataQualityScore).toNumber()
        );
      }

      finishCalculation();
      return report;
    } catch (error: unknown) {
      finishCalculation();
      recordSystemError('variance-calculation', 'report_generation_failed');
      throw error;
    }
  }

  /**
   * Get variance reports for a fund, newest first.
   */
  async getVarianceReports(
    fundId: number,
    options?: {
      limit?: number;
    }
  ): Promise<VarianceReport[]> {
    return await db.query.varianceReports.findMany({
      where: eq(varianceReports.fundId, fundId),
      orderBy: desc(varianceReports.createdAt),
      limit: options?.limit || 50,
    });
  }

  /**
   * Get a specific variance report owned by a fund.
   */
  async getVarianceReportById(
    fundId: number,
    reportId: string
  ): Promise<VarianceReport | undefined> {
    return await db.query.varianceReports.findFirst({
      where: and(eq(varianceReports.fundId, fundId), eq(varianceReports.id, reportId)),
    });
  }

  /**
   * Get current fund metrics
   */
  private async getCurrentMetrics(fundId: number, asOfDate: Date) {
    const latestMetrics = await db.query.fundMetrics.findFirst({
      where: and(eq(fundMetrics.fundId, fundId), lte(fundMetrics.metricDate, asOfDate)),
      orderBy: desc(fundMetrics.metricDate),
    });

    if (!latestMetrics) {
      throw new Error('No current metrics available');
    }

    if (!this.canUseCurrentStatePortfolioAnalysis(asOfDate)) {
      return {
        ...latestMetrics,
        asOfDate,
      };
    }

    // Get additional portfolio data
    const portfolioData = await this.getCurrentPortfolioMetrics(fundId, asOfDate);

    return {
      ...latestMetrics,
      ...portfolioData,
      asOfDate,
    };
  }

  /**
   * Historical fund-level metrics are queryable, but portfolio companies and
   * reserve/pacing snapshots do not currently support point-in-time reads.
   * Only include those current-state analyses when the requested as-of time is
   * effectively "now"; otherwise omit them from the report to avoid mixing
   * historical top-line metrics with present-day portfolio state.
   */
  private canUseCurrentStatePortfolioAnalysis(asOfDate: Date, now = new Date()) {
    return (
      Math.abs(now.getTime() - asOfDate.getTime()) <= this.currentStatePortfolioAnalysisToleranceMs
    );
  }

  /**
   * Extract baseline metrics for comparison
   */
  private extractBaselineMetrics(baseline: FundBaseline) {
    return {
      totalValue: baseline.totalValue,
      deployedCapital: baseline.deployedCapital,
      irr: baseline.irr,
      multiple: baseline.multiple,
      dpi: baseline.dpi,
      tvpi: baseline.tvpi,
      portfolioCount: baseline.portfolioCount,
      averageInvestment: baseline.averageInvestment,
      topPerformers: baseline.topPerformers,
      sectorDistribution: baseline.sectorDistribution,
      stageDistribution: baseline.stageDistribution,
      snapshotDate: baseline.snapshotDate,
    };
  }

  /**
   * Calculate variance between current and baseline metrics
   */
  private calculateVariances(current: Record<string, unknown>, baseline: Record<string, unknown>) {
    const calculations = {
      totalValueVariance: null as Decimal | null,
      totalValueVariancePct: null as Decimal | null,
      irrVariance: null as Decimal | null,
      multipleVariance: null as Decimal | null,
      dpiVariance: null as Decimal | null,
      tvpiVariance: null as Decimal | null,
    };

    // Total value variance
    if (current['totalValue'] && baseline['totalValue']) {
      const currentVal = toDecimal(current['totalValue'].toString());
      const baselineVal = toDecimal(baseline['totalValue'].toString());
      const totalVariance = currentVal.minus(baselineVal);
      calculations.totalValueVariance = totalVariance;
      calculations.totalValueVariancePct = baselineVal.isZero()
        ? null
        : totalVariance.div(baselineVal);
    }

    // IRR variance
    if (current['irr'] && baseline['irr']) {
      calculations.irrVariance = toDecimal(current['irr'].toString()).minus(
        toDecimal(baseline['irr'].toString())
      );
    }

    // Multiple variance
    if (current['multiple'] && baseline['multiple']) {
      calculations.multipleVariance = toDecimal(current['multiple'].toString()).minus(
        toDecimal(baseline['multiple'].toString())
      );
    }

    // DPI variance
    if (current['dpi'] && baseline['dpi']) {
      calculations.dpiVariance = toDecimal(current['dpi'].toString()).minus(
        toDecimal(baseline['dpi'].toString())
      );
    }

    // TVPI variance
    if (current['tvpi'] && baseline['tvpi']) {
      calculations.tvpiVariance = toDecimal(current['tvpi'].toString()).minus(
        toDecimal(baseline['tvpi'].toString())
      );
    }

    return calculations;
  }

  /**
   * Analyze portfolio-level variances
   */
  private async analyzePortfolioVariances(fundId: number, baseline: FundBaseline, asOfDate: Date) {
    const currentPortfolio = await this.getCurrentPortfolioMetrics(fundId, asOfDate);

    // Company-level analysis
    const companyVariances = await this.analyzeCompanyVariances(fundId, baseline, asOfDate);

    // Sector-level analysis
    const sectorVariances = this.analyzeSectorVariances(
      currentPortfolio.sectorDistribution || {},
      (baseline.sectorDistribution as Record<string, number>) || {}
    );

    // Stage-level analysis
    const stageVariances = this.analyzeStageVariances(
      currentPortfolio.stageDistribution || {},
      (baseline.stageDistribution as Record<string, number>) || {}
    );

    // Reserve and pacing variance analysis
    const reserveVariances = await this.calculateReserveVariances(fundId, baseline);
    const pacingVariances = await this.calculatePacingVariances(fundId, baseline);

    return {
      companyVariances,
      sectorVariances,
      stageVariances,
      reserveVariances,
      pacingVariances,
      portfolioCountVariance: currentPortfolio.portfolioCount - baseline.portfolioCount,
    };
  }

  /**
   * Generate variance insights and risk assessment
   */
  private generateVarianceInsights(
    variances: Record<string, unknown>,
    portfolioVariances: Record<string, unknown>
  ) {
    const significantVariances: Array<Record<string, unknown>> = [];
    const factors: Array<Record<string, unknown>> = [];
    const thresholdBreaches: Array<Record<string, unknown>> = [];
    let riskLevel = 'low';
    let overallScore = '0';

    const totalValueVariance = variances['totalValueVariance'] as Decimal | null;
    const totalValueVariancePct = variances['totalValueVariancePct'] as Decimal | null;

    // Analyze total value variance
    if (totalValueVariancePct && totalValueVariancePct.abs().gt(0.1)) {
      significantVariances.push({
        metric: 'totalValue',
        variance: totalValueVariance ? totalValueVariance.toNumber() : null,
        variancePct: totalValueVariancePct.toNumber(),
        severity: totalValueVariancePct.abs().gt(0.2) ? 'high' : 'medium',
      });
    }

    const irrVariance = variances['irrVariance'] as Decimal | null;

    // Analyze IRR variance
    if (irrVariance && irrVariance.abs().gt(0.05)) {
      significantVariances.push({
        metric: 'irr',
        variance: irrVariance.toNumber(),
        severity: irrVariance.abs().gt(0.1) ? 'high' : 'medium',
      });
    }

    // Determine overall risk level
    const highSeverityCount = significantVariances.filter((v) => v['severity'] === 'high').length;
    if (highSeverityCount > 0) {
      riskLevel = highSeverityCount >= 2 ? 'critical' : 'high';
    } else if (significantVariances.length > 0) {
      riskLevel = 'medium';
    }

    // Calculate overall variance score
    overallScore = this.calculateOverallVarianceScore(variances, portfolioVariances);

    return {
      significantVariances,
      factors,
      thresholdBreaches,
      riskLevel,
      overallScore,
      dataQualityScore: '0.95', // Placeholder for now
    };
  }

  /**
   * Calculate overall variance score
   */
  private calculateOverallVarianceScore(
    variances: Record<string, unknown>,
    _portfolioVariances: Record<string, unknown>
  ): string {
    let score = new Decimal(0);
    let weightSum = new Decimal(0);

    // Weight different variance types
    const weights = {
      totalValue: 0.3,
      irr: 0.25,
      multiple: 0.2,
      dpi: 0.15,
      tvpi: 0.1,
    };

    // Calculate weighted variance score
    Object.entries(weights).forEach(([metric, weight]) => {
      const varianceKey = `${metric}Variance${metric === 'totalValue' ? 'Pct' : ''}`;
      const variance = variances[varianceKey];

      if (variance !== null && variance !== undefined) {
        const varianceDecimal = toDecimal(variance as Decimal | number | string);
        const absVariance = varianceDecimal.abs();
        const normalizedVariance = absVariance.gt(1) ? new Decimal(1) : absVariance; // Cap at 100%
        score = score.plus(normalizedVariance.times(weight));
        weightSum = weightSum.plus(weight);
      }
    });

    return weightSum.gt(0) ? score.div(weightSum).toFixed(2) : '0.00';
  }

  /**
   * Check for alert triggers based on variance calculations
   */
  private async checkAlertTriggers(
    fundId: number,
    variances: Record<string, unknown>
  ): Promise<TriggeredAlertData[]> {
    const activeRules = await db.query.alertRules.findMany({
      where: and(eq(alertRules.fundId, fundId), eq(alertRules.isEnabled, true)),
    });

    const triggeredAlerts: TriggeredAlertData[] = [];

    for (const rule of activeRules) {
      const metricValue = variances[`${rule.metricName}Variance`];
      const triggered = this.evaluateAlertRule(rule, variances);
      if (triggered) {
        triggeredAlerts.push({
          ruleId: rule.id,
          ruleName: rule.name,
          metricName: rule.metricName,
          thresholdValue: toDecimal(rule.thresholdValue?.toString() || '0').toNumber(),
          actualValue:
            metricValue === null || metricValue === undefined
              ? null
              : toDecimal(metricValue as Decimal | number | string).toNumber(),
          severity: normalizeTriggeredAlertSeverity(rule.severity),
        });
      }
    }

    return triggeredAlerts;
  }

  /**
   * Evaluate if an alert rule should trigger
   */
  private evaluateAlertRule(rule: AlertRule, variances: Record<string, unknown>): boolean {
    const metricValue = variances[`${rule.metricName}Variance`];
    if (metricValue === null || metricValue === undefined) {
      return false;
    }

    // Check if threshold is null or undefined
    if (rule.thresholdValue === null || rule.thresholdValue === undefined) {
      return false;
    }

    const threshold = toDecimal(rule.thresholdValue.toString());
    const value = toDecimal(metricValue as Decimal | number | string);

    switch (rule.operator) {
      case 'gt':
        return value.gt(threshold);
      case 'lt':
        return value.lt(threshold);
      case 'gte':
        return value.gte(threshold);
      case 'lte':
        return value.lte(threshold);
      case 'eq':
        return value.minus(threshold).abs().lt(toDecimal(0.001));
      default:
        return false;
    }
  }

  // NOTE: This method returns current-state portfolio data only. Historical
  // callers should be gated by canUseCurrentStatePortfolioAnalysis() before
  // reaching this path.
  private async getCurrentPortfolioMetrics(fundId: number, _asOfDate: Date) {
    const companies =
      (await db.query.portfolioCompanies.findMany({
        where: eq(portfolioCompanies.fundId, fundId),
        with: {
          investments: true,
        },
      })) ?? [];

    const portfolioCount = companies.length;

    if (portfolioCount === 0) {
      return {
        portfolioCount: 0,
        deployedCapital: '0',
        averageInvestment: '0',
        sectorDistribution: {} as Record<string, number>,
        stageDistribution: {} as Record<string, number>,
      };
    }

    const totalInvestments = companies.reduce((sum: Decimal, company) => {
      const invArr = Array.isArray(company.investments)
        ? (company.investments as Array<{ amount: string | number }>)
        : [];
      const companyTotal = invArr.reduce(
        (s: Decimal, inv) => s.plus(toDecimal(String(inv.amount))),
        new Decimal(0)
      );
      return sum.plus(companyTotal);
    }, new Decimal(0));

    const averageInvestment = totalInvestments.div(portfolioCount);

    const sectorDistribution = companies.reduce(
      (acc, c) => {
        const key = c.sector || 'Unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const stageDistribution = companies.reduce(
      (acc, c) => {
        const key = c.stage || 'Unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      portfolioCount,
      deployedCapital: totalInvestments.toString(),
      averageInvestment: averageInvestment.toString(),
      sectorDistribution,
      stageDistribution,
    };
  }

  private async analyzeCompanyVariances(fundId: number, baseline: FundBaseline, _asOfDate: Date) {
    // Extract top performers from baseline JSONB (handles both array and { companies: [...] } shapes)
    const rawPerformers = baseline.topPerformers as unknown;
    let baselineCompanies: Array<{
      id: number;
      name?: string;
      sector?: string;
      currentValuation?: string | number | null;
      valuation?: number | null;
    }> = [];

    if (Array.isArray(rawPerformers)) {
      baselineCompanies = rawPerformers as typeof baselineCompanies;
    } else if (
      rawPerformers &&
      typeof rawPerformers === 'object' &&
      Array.isArray((rawPerformers as Record<string, unknown>)['companies'])
    ) {
      baselineCompanies = (rawPerformers as Record<string, unknown>)[
        'companies'
      ] as typeof baselineCompanies;
    }

    if (baselineCompanies.length === 0) {
      return [];
    }

    // Build lookup keyed by company id
    const baselineMap = new Map<number, { name: string; sector: string; valuation: Decimal }>();
    for (const bc of baselineCompanies) {
      const rawVal = bc.currentValuation ?? bc.valuation;
      if (rawVal == null) continue;
      baselineMap.set(bc.id, {
        name: bc.name ?? '',
        sector: bc.sector ?? '',
        valuation: toDecimal(String(rawVal)),
      });
    }

    if (baselineMap.size === 0) {
      return [];
    }

    // Query current portfolio
    const companies =
      (await db.query.portfolioCompanies.findMany({
        where: eq(portfolioCompanies.fundId, fundId),
      })) ?? [];

    const variances: Array<{
      companyId: number;
      companyName: string;
      sector: string;
      valuationChange: string;
      valuationChangePct: string;
    }> = [];

    for (const company of companies) {
      const baselineEntry = baselineMap.get(company.id);
      if (!baselineEntry) continue;
      if (company.currentValuation == null) continue;

      const currentVal = toDecimal(String(company.currentValuation));
      const baseVal = baselineEntry.valuation;

      if (baseVal.isZero()) continue;

      const change = currentVal.minus(baseVal);
      const changePct = change.div(baseVal);

      variances.push({
        companyId: company.id,
        companyName: company.name,
        sector: company.sector,
        valuationChange: change.toString(),
        valuationChangePct: changePct.toString(),
      });
    }

    return variances;
  }

  /** Get latest reserve snapshot for a fund */
  private async getReserveSnapshot(fundId: number) {
    const snapshot = await db.query.fundSnapshots.findFirst({
      where: and(eq(fundSnapshots.fundId, fundId), eq(fundSnapshots.type, 'RESERVE')),
      orderBy: desc(fundSnapshots.createdAt),
    });
    return snapshot?.payload || {};
  }

  /** Get latest pacing snapshot for a fund */
  private async getPacingSnapshot(fundId: number) {
    const snapshot = await db.query.fundSnapshots.findFirst({
      where: and(eq(fundSnapshots.fundId, fundId), eq(fundSnapshots.type, 'PACING')),
      orderBy: desc(fundSnapshots.createdAt),
    });
    return snapshot?.payload || {};
  }

  private analyzeSectorVariances(
    current: Record<string, number>,
    baseline: Record<string, number>
  ): Record<string, { current: number; baseline: number; delta: number; deltaPct: number | null }> {
    return this.analyzeDistributionVariances(current, baseline);
  }

  private analyzeStageVariances(
    current: Record<string, number>,
    baseline: Record<string, number>
  ): Record<string, { current: number; baseline: number; delta: number; deltaPct: number | null }> {
    return this.analyzeDistributionVariances(current, baseline);
  }

  /** Shared logic for sector/stage distribution variance */
  private analyzeDistributionVariances(
    current: Record<string, number>,
    baseline: Record<string, number>
  ): Record<string, { current: number; baseline: number; delta: number; deltaPct: number | null }> {
    const allKeys = new Set([...Object.keys(current), ...Object.keys(baseline)]);
    const result: Record<
      string,
      { current: number; baseline: number; delta: number; deltaPct: number | null }
    > = {};

    for (const key of allKeys) {
      const cur = current[key] ?? 0;
      const base = baseline[key] ?? 0;
      const delta = cur - base;
      const deltaPct = base !== 0 ? delta / base : null;
      result[key] = { current: cur, baseline: base, delta, deltaPct };
    }

    return result;
  }

  private async calculateReserveVariances(fundId: number, baseline: FundBaseline) {
    const currentReserves = (await this.getReserveSnapshot(fundId)) as Record<string, unknown>;
    const baselineReserves = (baseline.reserveAllocation ?? {}) as Record<string, unknown>;

    const hasData =
      Object.keys(currentReserves).length > 0 && Object.keys(baselineReserves).length > 0;
    if (!hasData) {
      return { hasData: false, currentReserves: {}, baselineReserves: {}, changes: {} };
    }

    const changes: Record<string, unknown> = {};
    const allKeys = new Set([...Object.keys(currentReserves), ...Object.keys(baselineReserves)]);
    for (const key of allKeys) {
      const cur = currentReserves[key];
      const base = baselineReserves[key];
      if (!isDeepStrictEqual(cur, base)) {
        changes[key] = { current: cur ?? null, baseline: base ?? null };
      }
    }

    return { hasData: true, currentReserves, baselineReserves, changes };
  }

  private async calculatePacingVariances(fundId: number, baseline: FundBaseline) {
    const currentPacing = (await this.getPacingSnapshot(fundId)) as Record<string, unknown>;
    const baselinePacing = (baseline.pacingMetrics ?? {}) as Record<string, unknown>;

    const hasData = Object.keys(currentPacing).length > 0 && Object.keys(baselinePacing).length > 0;
    if (!hasData) {
      return { hasData: false, currentPacing: {}, baselinePacing: {}, changes: {} };
    }

    const changes: Record<string, unknown> = {};
    const allKeys = new Set([...Object.keys(currentPacing), ...Object.keys(baselinePacing)]);
    for (const key of allKeys) {
      const cur = currentPacing[key];
      const base = baselinePacing[key];
      if (!isDeepStrictEqual(cur, base)) {
        changes[key] = { current: cur ?? null, baseline: base ?? null };
      }
    }

    return { hasData: true, currentPacing, baselinePacing, changes };
  }
}

/**
 * Alert management service
 */
export class AlertManagementService {
  /**
   * Create a new alert rule
   */
  async createAlertRule(params: {
    fundId?: number;
    name: string;
    description?: string;
    ruleType: 'threshold' | 'trend' | 'deviation' | 'pattern';
    metricName: string;
    operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'between';
    thresholdValue: number;
    secondaryThreshold?: number;
    severity?: string;
    category?: string;
    checkFrequency?: string;
    suppressionPeriod?: number;
    notificationChannels?: string[];
    createdBy: number;
  }): Promise<AlertRule> {
    const ruleData: InsertAlertRule = {
      fundId: params.fundId,
      name: params.name,
      description: params.description,
      ruleType: params.ruleType,
      metricName: params.metricName,
      operator: params.operator,
      thresholdValue: params.thresholdValue.toString(),
      secondaryThreshold: params.secondaryThreshold?.toString(),
      severity: params.severity || 'warning',
      category: params.category || 'performance',
      checkFrequency: params.checkFrequency || 'daily',
      suppressionPeriod: params.suppressionPeriod,
      notificationChannels: params.notificationChannels,
      createdBy: params.createdBy,
    };

    const [rule] = await db.insert(alertRules).values(ruleData).returning();

    if (!rule) {
      throw new Error('Failed to create alert rule');
    }

    return rule;
  }

  /**
   * Create a performance alert
   */
  async createAlert(params: {
    fundId: number;
    baselineId?: string;
    varianceReportId?: string;
    alertType: string;
    severity: string;
    category: string;
    title: string;
    description: string;
    metricName: string;
    thresholdValue?: number;
    actualValue?: number;
    varianceAmount?: number;
    variancePercentage?: number;
    ruleId?: string;
  }): Promise<PerformanceAlert> {
    const alertData: InsertPerformanceAlert = {
      fundId: params.fundId,
      alertType: params.alertType,
      severity: params.severity,
      category: params.category,
      title: params.title,
      description: params.description,
      metricName: params.metricName,
      triggeredAt: new Date(),
    };

    const [alert] = await db.insert(performanceAlerts).values(alertData).returning();

    if (!alert) {
      throw new Error('Failed to create performance alert');
    }

    // Record metrics
    recordAlertGenerated(
      params.fundId.toString(),
      params.alertType,
      params.severity,
      params.category
    );

    return alert;
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, userId: number, notes?: string): Promise<void> {
    // Get alert info for metrics
    const alert = await db.query.performanceAlerts.findFirst({
      where: eq(performanceAlerts.id, alertId),
    });

    await db
      .update(performanceAlerts)
      .set({
        status: 'acknowledged',
        acknowledgedBy: userId,
        acknowledgedAt: new Date(),
        resolutionNotes: notes,
        updatedAt: new Date(),
      })
      .where(eq(performanceAlerts.id, alertId));

    // Record metrics
    if (alert) {
      recordAlertAction('acknowledge', alert.severity);
    }
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string, userId: number, notes?: string): Promise<void> {
    // Get alert info for metrics
    const alert = await db.query.performanceAlerts.findFirst({
      where: eq(performanceAlerts.id, alertId),
    });

    const resolveTime = new Date();
    await db
      .update(performanceAlerts)
      .set({
        status: 'resolved',
        resolvedBy: userId,
        resolvedAt: resolveTime,
        resolutionNotes: notes,
        updatedAt: new Date(),
      })
      .where(eq(performanceAlerts.id, alertId));

    // Record metrics
    if (alert) {
      const resolutionTime = (resolveTime.getTime() - alert.triggeredAt.getTime()) / 1000;
      recordAlertAction('resolve', alert.severity, resolutionTime);
    }
  }

  /**
   * Get active alerts for a fund
   */
  async getActiveAlerts(
    fundId: number,
    options?: {
      severity?: string[];
      category?: string[];
      limit?: number;
    }
  ): Promise<PerformanceAlert[]> {
    const conditions = [
      eq(performanceAlerts.fundId, fundId),
      eq(performanceAlerts.status, 'active'),
    ];

    if (options?.severity?.length) {
      conditions.push(inArray(performanceAlerts.severity, options.severity));
    }

    if (options?.category?.length) {
      conditions.push(inArray(performanceAlerts.category, options.category));
    }

    return await db.query.performanceAlerts.findMany({
      where: and(...conditions),
      orderBy: desc(performanceAlerts.triggeredAt),
      limit: options?.limit || 50,
    });
  }
}

/**
 * Main variance tracking service that coordinates all operations
 */
export class VarianceTrackingService {
  public readonly baselines: BaselineService;
  public readonly calculations: VarianceCalculationService;
  public readonly alerts: AlertManagementService;

  constructor() {
    this.baselines = new BaselineService();
    this.calculations = new VarianceCalculationService();
    this.alerts = new AlertManagementService();
  }

  /**
   * Complete variance analysis workflow
   */
  async performCompleteVarianceAnalysis(params: {
    fundId: number;
    baselineId?: string;
    reportName?: string;
    userId: number;
  }): Promise<{
    report: VarianceReport;
    alertsGenerated: PerformanceAlert[];
  }> {
    const { fundId, baselineId, reportName = 'Automated Variance Report', userId } = params;

    // Get default baseline if none specified
    let finalBaselineId = baselineId;
    if (!finalBaselineId) {
      const defaultBaseline = await this.baselines.getBaselines(fundId, { isDefault: true });
      const baseline = defaultBaseline[0];
      if (!baseline) {
        throw new Error('No default baseline found for fund');
      }
      finalBaselineId = baseline.id;
    }

    // Generate variance report
    const report = await this.calculations.generateVarianceReport({
      fundId,
      baselineId: finalBaselineId,
      reportName,
      reportType: 'ad_hoc',
      generatedBy: userId,
    });

    // Generate alerts if any thresholds are breached
    const alertsGenerated: PerformanceAlert[] = [];
    const triggeredAlerts = Array.isArray(report.alertsTriggered)
      ? report.alertsTriggered.filter(isTriggeredAlertData)
      : [];
    for (const alertData of triggeredAlerts) {
      const alert = await this.alerts.createAlert({
        fundId,
        baselineId: finalBaselineId,
        varianceReportId: report.id,
        alertType: 'variance_threshold',
        severity: alertData.severity,
        category: 'performance',
        title: `Variance Alert: ${alertData.metricName}`,
        description: `${alertData.metricName} variance exceeded threshold`,
        metricName: alertData.metricName,
        thresholdValue: toDecimal(alertData.thresholdValue?.toString() || '0').toNumber(),
        actualValue: toDecimal(alertData.actualValue?.toString() || '0').toNumber(),
        ruleId: alertData.ruleId,
      });
      alertsGenerated.push(alert);
    }

    return { report, alertsGenerated };
  }
}

// Export singleton instance
export const varianceTrackingService = new VarianceTrackingService();

/**
 * Standalone helper to fetch fund-level KPIs attributed to a specific calc-run.
 *
 * Resolution order:
 *  1. If runId is provided AND attributed metrics exist -> return them.
 *  2. If runId is provided but no attributed metrics -> fall back to latest.
 *  3. If runId is omitted -> return latest fundMetrics row.
 *
 * Returns null only when the fund has no metrics at all.
 */
export async function getAttributedKPIs(
  fundId: number,
  runId?: number
): Promise<{
  totalValue: string;
  irr: string | null;
  multiple: string | null;
  dpi: string | null;
  tvpi: string | null;
} | null> {
  if (runId != null) {
    const attributed = await db.query.fundMetrics.findFirst({
      where: and(eq(fundMetrics.fundId, fundId), eq(fundMetrics.runId, runId)),
      orderBy: desc(fundMetrics.metricDate),
    });

    if (attributed) {
      return {
        totalValue: attributed.totalValue,
        irr: attributed.irr,
        multiple: attributed.multiple,
        dpi: attributed.dpi,
        tvpi: attributed.tvpi,
      };
    }
  }

  const latest = await db.query.fundMetrics.findFirst({
    where: eq(fundMetrics.fundId, fundId),
    orderBy: desc(fundMetrics.metricDate),
  });

  if (!latest) {
    return null;
  }

  return {
    totalValue: latest.totalValue,
    irr: latest.irr,
    multiple: latest.multiple,
    dpi: latest.dpi,
    tvpi: latest.tvpi,
  };
}
