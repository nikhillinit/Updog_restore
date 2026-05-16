import { db } from '../../db';
import { buildPacingVarianceResult, buildReserveVarianceResult } from './variance-diff';
import { analyzeDistributionVariances } from './distribution-variance';
import { analyzeCompanyVarianceRows, sumInvestmentAmounts } from './company-variance';
import { normalizeTriggeredAlertSeverity, type TriggeredAlertData } from './alert-helpers';
import { Decimal, toDecimal } from '@shared/lib/decimal-utils';
import {
  alertRules,
  fundBaselines,
  fundMetrics,
  fundSnapshots,
  portfolioCompanies,
  varianceReports,
} from '@shared/schema';
import type { FundBaseline, InsertVarianceReport, VarianceReport } from '@shared/schema';
import { and, desc, eq, lte } from 'drizzle-orm';
import { buildAlertRuleEvaluation } from '../variance-alert-evaluation';
import type { VarianceSnapshot } from '../variance-alert-evaluation';
import {
  recordSystemError,
  recordVarianceReportGenerated,
  startVarianceCalculation,
  updateDataQualityScore,
  updateFundVarianceScore,
} from '../../metrics/variance-metrics';

export class VarianceCalculationService {
  private readonly currentStatePortfolioAnalysisToleranceMs = 60_000;

  async computeVarianceSnapshot(params: {
    fundId: number;
    baselineId: string;
    asOfDate?: Date;
    runId?: number;
  }): Promise<VarianceSnapshot> {
    const { fundId, baselineId, asOfDate = new Date(), runId } = params;
    const canUseCurrentStatePortfolioAnalysis = this.canUseCurrentStatePortfolioAnalysis(asOfDate);

    const baseline = await db.query.fundBaselines.findFirst({
      where: and(eq(fundBaselines.fundId, fundId), eq(fundBaselines.id, baselineId)),
    });

    if (!baseline) {
      throw new Error('Baseline not found');
    }

    const currentMetrics = await this.getCurrentMetrics(fundId, asOfDate, runId);
    const baselineMetrics = this.extractBaselineMetrics(baseline);
    const variances = this.calculateVariances(currentMetrics, baselineMetrics);
    const portfolioVariances = canUseCurrentStatePortfolioAnalysis
      ? await this.analyzePortfolioVariances(fundId, baseline, asOfDate)
      : null;
    const insights = this.generateVarianceInsights(variances, portfolioVariances ?? {});

    return {
      baseline,
      asOfDate,
      currentMetrics,
      baselineMetrics,
      variances,
      portfolioVariances,
      insights,
    };
  }

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
      const snapshot = await this.computeVarianceSnapshot({
        fundId,
        baselineId,
        asOfDate,
      });
      const { baseline, currentMetrics, baselineMetrics, variances, portfolioVariances, insights } =
        snapshot;
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
        totalValueVariance: variances['totalValueVariance']?.toString() ?? null,
        totalValueVariancePct: variances['totalValueVariancePct']?.toString() ?? null,
        irrVariance: variances['irrVariance']?.toString() ?? null,
        multipleVariance: variances['multipleVariance']?.toString() ?? null,
        dpiVariance: variances['dpiVariance']?.toString() ?? null,
        tvpiVariance: variances['tvpiVariance']?.toString() ?? null,
        // Persist portfolio sub-analyses to dedicated schema columns
        portfolioVariances: portfolioVariances
          ? {
              companyVariances: portfolioVariances['companyVariances'],
              portfolioCountVariance: portfolioVariances['portfolioCountVariance'],
            }
          : null,
        sectorVariances: portfolioVariances?.['sectorVariances'] ?? null,
        stageVariances: portfolioVariances?.['stageVariances'] ?? null,
        reserveVariances: portfolioVariances?.['reserveVariances'] ?? null,
        pacingVariances: portfolioVariances?.['pacingVariances'] ?? null,
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
  private async getCurrentMetrics(fundId: number, asOfDate: Date, runId?: number) {
    const latestMetrics =
      runId != null
        ? await db.query.fundMetrics.findFirst({
            where: and(eq(fundMetrics.fundId, fundId), eq(fundMetrics.runId, runId)),
            orderBy: desc(fundMetrics.metricDate),
          })
        : await db.query.fundMetrics.findFirst({
            where: and(eq(fundMetrics.fundId, fundId), lte(fundMetrics.metricDate, asOfDate)),
            orderBy: desc(fundMetrics.metricDate),
          });

    if (!latestMetrics) {
      if (runId != null) {
        throw new Error(`No attributed metrics available for calc run ${runId}`);
      }

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
      const evaluation = buildAlertRuleEvaluation(rule, variances);
      if (evaluation?.triggered) {
        triggeredAlerts.push({
          ruleId: rule.id,
          ruleName: rule.name,
          metricName: evaluation.metric.metricKey,
          thresholdValue: evaluation.threshold.toNumber(),
          actualValue: evaluation.metric.actualValue.toNumber(),
          severity: normalizeTriggeredAlertSeverity(rule.severity),
        });
      }
    }

    return triggeredAlerts;
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
      const investments = Array.isArray(company.investments) ? company.investments : [];
      return sum.plus(sumInvestmentAmounts(investments));
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
    const companies =
      (await db.query.portfolioCompanies.findMany({
        where: eq(portfolioCompanies.fundId, fundId),
        with: {
          investments: true,
        },
      })) ?? [];

    return analyzeCompanyVarianceRows(
      companies.map((company) => ({
        id: company.id,
        name: company.name,
        sector: company.sector,
        stage: company.stage,
        status: company.status,
        currentValuation: company.currentValuation,
        investments: Array.isArray(company.investments) ? company.investments : [],
      })),
      baseline
    );
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
  ) {
    return analyzeDistributionVariances(current, baseline);
  }

  private analyzeStageVariances(current: Record<string, number>, baseline: Record<string, number>) {
    return analyzeDistributionVariances(current, baseline);
  }

  private async calculateReserveVariances(fundId: number, baseline: FundBaseline) {
    const currentReserves = (await this.getReserveSnapshot(fundId)) as Record<string, unknown>;
    const baselineReserves = (baseline.reserveAllocation ?? {}) as Record<string, unknown>;

    return buildReserveVarianceResult(currentReserves, baselineReserves);
  }

  private async calculatePacingVariances(fundId: number, baseline: FundBaseline) {
    const currentPacing = (await this.getPacingSnapshot(fundId)) as Record<string, unknown>;
    const baselinePacing = (baseline.pacingMetrics ?? {}) as Record<string, unknown>;

    return buildPacingVarianceResult(currentPacing, baselinePacing);
  }
}
