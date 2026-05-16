/**
 * Variance Tracking Service
 *
 * Comprehensive service for managing fund performance variance tracking,
 * baseline comparisons, and alert generation.
 */

import { db } from '../db';
import { AlertManagementService } from './variance-tracking/alert-management-service';
import { BaselineService } from './variance-tracking/baseline-service';
import {
  normalizeTriggeredAlertSeverity,
  type TriggeredAlertData,
} from './variance-tracking/alert-helpers';
import {
  buildPacingVarianceResult,
  buildReserveVarianceResult,
} from './variance-tracking/variance-diff';
import { analyzeDistributionVariances } from './variance-tracking/distribution-variance';
import { Decimal, toDecimal } from '@shared/lib/decimal-utils';
import {
  fundBaselines,
  varianceReports,
  alertRules,
  fundMetrics,
  portfolioCompanies,
  fundSnapshots,
} from '@shared/schema';
import type {
  FundBaseline,
  Investment,
  VarianceReport,
  InsertVarianceReport,
  PerformanceAlert,
} from '@shared/schema';
import type { CompanyVarianceRow } from '@shared/variance-validation';
import { eq, and, desc, lte } from 'drizzle-orm';
import {
  buildAlertRuleEvaluation,
  VarianceAlertEvaluationService,
} from './variance-alert-evaluation';
import type { VarianceSnapshot } from './variance-alert-evaluation';
import {
  recordVarianceReportGenerated,
  updateFundVarianceScore,
  updateDataQualityScore,
  recordSystemError,
  startVarianceCalculation,
} from '../metrics/variance-metrics';
import { SYSTEM_ACTOR_ID } from '@shared/constants/system-actor';

export { BaselineService };
export { AlertManagementService };
export type { BaselineCreationMode } from './variance-tracking/baseline-service';

function sumInvestmentAmounts(investmentRows: Investment[] | null | undefined): Decimal {
  if (!investmentRows?.length) {
    return new Decimal(0);
  }

  return investmentRows.reduce<Decimal>((sum, investmentRow) => {
    if (investmentRow.amount == null) {
      return sum;
    }

    return sum.plus(toDecimal(String(investmentRow.amount)));
  }, new Decimal(0));
}

function withLegacyValuationAliases(
  valuationVariance: string | null,
  valuationVariancePct: string | null
): Pick<
  CompanyVarianceRow,
  'valuationChange' | 'valuationChangePct' | 'valuationVariance' | 'valuationVariancePct'
> {
  // TODO(variance): remove valuationChange* after all consumers switch to valuationVariance*.
  return {
    valuationChange: valuationVariance,
    valuationChangePct: valuationVariancePct,
    valuationVariance,
    valuationVariancePct,
  };
}

/**
 * Variance calculation and reporting
 */
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

  private getCompanyVarianceRiskLevel(
    changePct: Decimal | null
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (changePct === null) {
      return 'medium';
    }

    const magnitude = changePct.abs();
    if (magnitude.gte(0.5)) {
      return 'critical';
    }
    if (magnitude.gte(0.25)) {
      return 'high';
    }
    if (magnitude.gte(0.1)) {
      return 'medium';
    }

    return 'low';
  }

  private extractBaselineCompanySnapshots(baseline: FundBaseline): {
    source: 'full_snapshot' | 'legacy_top_performers' | 'none';
    companies: Array<{
      portfolioCompanyId: number;
      companyId: number;
      name: string;
      sector: string;
      stage: string | null;
      status: string | null;
      currentValuation: Decimal | null;
      investedCapital: Decimal | null;
    }>;
  } {
    const rawCompanySnapshots = (
      baseline as FundBaseline & {
        companySnapshots?: unknown;
      }
    ).companySnapshots;

    if (Array.isArray(rawCompanySnapshots)) {
      const companies = rawCompanySnapshots
        .map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return null;
          }

          const record = entry as Record<string, unknown>;
          const rawPortfolioCompanyId =
            record['portfolioCompanyId'] ?? record['companyId'] ?? record['id'];
          const portfolioCompanyId =
            typeof rawPortfolioCompanyId === 'number'
              ? rawPortfolioCompanyId
              : Number(rawPortfolioCompanyId);
          if (!Number.isInteger(portfolioCompanyId) || portfolioCompanyId <= 0) {
            return null;
          }

          const rawValuation = record['currentValuation'] ?? record['valuation'];
          const rawInvestedCapital = record['investedCapital'];

          return {
            portfolioCompanyId,
            companyId: portfolioCompanyId,
            name:
              typeof record['companyName'] === 'string'
                ? record['companyName']
                : typeof record['name'] === 'string'
                  ? record['name']
                  : '',
            sector: typeof record['sector'] === 'string' ? record['sector'] : '',
            stage: typeof record['stage'] === 'string' ? record['stage'] : null,
            status: typeof record['status'] === 'string' ? record['status'] : null,
            currentValuation:
              rawValuation === null || rawValuation === undefined
                ? null
                : toDecimal(String(rawValuation)),
            investedCapital:
              rawInvestedCapital === null || rawInvestedCapital === undefined
                ? null
                : toDecimal(String(rawInvestedCapital)),
          };
        })
        .filter(
          (
            company
          ): company is {
            portfolioCompanyId: number;
            companyId: number;
            name: string;
            sector: string;
            stage: string | null;
            status: string | null;
            currentValuation: Decimal | null;
            investedCapital: Decimal | null;
          } => company !== null
        );

      if (companies.length > 0) {
        return {
          source: 'full_snapshot',
          companies,
        };
      }
    }

    const rawPerformers = baseline.topPerformers as unknown;
    let baselineCompanies: Array<{
      id: number;
      name?: string;
      sector?: string;
      stage?: string | null;
      status?: string | null;
      currentValuation?: string | number | null;
      valuation?: number | null;
      investedCapital?: string | number | null;
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
      return {
        source: 'none',
        companies: [],
      };
    }

    return {
      source: 'legacy_top_performers',
      companies: baselineCompanies
        .map((company) => {
          const rawValuation = company.currentValuation ?? company.valuation;
          return {
            portfolioCompanyId: company.id,
            companyId: company.id,
            name: company.name ?? '',
            sector: company.sector ?? '',
            stage: company.stage ?? null,
            status: company.status ?? null,
            currentValuation:
              rawValuation === null || rawValuation === undefined
                ? null
                : toDecimal(String(rawValuation)),
            investedCapital:
              company.investedCapital === null || company.investedCapital === undefined
                ? null
                : toDecimal(String(company.investedCapital)),
          };
        })
        .filter((company) => company.portfolioCompanyId > 0),
    };
  }

  private async analyzeCompanyVariances(fundId: number, baseline: FundBaseline, _asOfDate: Date) {
    const { source, companies: baselineCompanies } = this.extractBaselineCompanySnapshots(baseline);
    if (baselineCompanies.length === 0) {
      return [];
    }

    const baselineMap = new Map<
      number,
      {
        companyId: number;
        name: string;
        sector: string;
        stage: string | null;
        status: string | null;
        valuation: Decimal | null;
        investedCapital: Decimal | null;
      }
    >();

    for (const baselineCompany of baselineCompanies) {
      baselineMap.set(baselineCompany.portfolioCompanyId, {
        companyId: baselineCompany.companyId,
        name: baselineCompany.name,
        sector: baselineCompany.sector,
        stage: baselineCompany.stage,
        status: baselineCompany.status,
        valuation: baselineCompany.currentValuation,
        investedCapital: baselineCompany.investedCapital,
      });
    }

    if (baselineMap.size === 0) {
      return [];
    }

    // Query current portfolio
    const companies =
      (await db.query.portfolioCompanies.findMany({
        where: eq(portfolioCompanies.fundId, fundId),
        with: {
          investments: true,
        },
      })) ?? [];

    const variances: CompanyVarianceRow[] = [];
    const matchedCompanyIds = new Set<number>();

    for (const company of companies) {
      const baselineEntry = baselineMap.get(company.id);
      const currentInvestedCapital = sumInvestmentAmounts(company.investments);
      if (!baselineEntry) {
        if (source !== 'full_snapshot' || company.currentValuation == null) {
          continue;
        }

        const currentVal = toDecimal(String(company.currentValuation));
        variances.push({
          companyId: company.id,
          companyName: company.name,
          sector: company.sector,
          stage: company.stage,
          status: company.status ?? null,
          changeType: 'added',
          baselineValuation: null,
          currentValuation: currentVal.toString(),
          baselineInvestedCapital: null,
          currentInvestedCapital: currentInvestedCapital.toString(),
          ...withLegacyValuationAliases(currentVal.toString(), null),
          riskLevel: this.getCompanyVarianceRiskLevel(null),
        });
        continue;
      }
      if (company.currentValuation == null || baselineEntry.valuation == null) continue;

      matchedCompanyIds.add(company.id);
      const currentVal = toDecimal(String(company.currentValuation));
      const baseVal = baselineEntry.valuation;

      if (baseVal.isZero()) continue;

      const change = currentVal.minus(baseVal);
      const changePct = change.div(baseVal);

      variances.push({
        companyId: company.id,
        companyName: company.name,
        sector: company.sector,
        stage: company.stage,
        status: company.status ?? null,
        changeType: 'matched',
        baselineValuation: baseVal.toString(),
        currentValuation: currentVal.toString(),
        baselineInvestedCapital: baselineEntry.investedCapital?.toString() ?? null,
        currentInvestedCapital: currentInvestedCapital.toString(),
        ...withLegacyValuationAliases(change.toString(), changePct.toString()),
        riskLevel: this.getCompanyVarianceRiskLevel(changePct),
      });
    }

    if (source === 'full_snapshot') {
      for (const [companyId, baselineEntry] of baselineMap.entries()) {
        if (matchedCompanyIds.has(companyId) || baselineEntry.valuation == null) {
          continue;
        }

        const baseVal = baselineEntry.valuation;
        const change = baseVal.negated();
        const changePct = baseVal.isZero() ? null : new Decimal(-1);

        variances.push({
          companyId,
          companyName: baselineEntry.name,
          sector: baselineEntry.sector,
          stage: baselineEntry.stage,
          status: baselineEntry.status,
          changeType: 'removed',
          baselineValuation: baseVal.toString(),
          currentValuation: null,
          baselineInvestedCapital: baselineEntry.investedCapital?.toString() ?? null,
          currentInvestedCapital: null,
          ...withLegacyValuationAliases(change.toString(), changePct?.toString() ?? null),
          riskLevel: this.getCompanyVarianceRiskLevel(changePct),
        });
      }
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

/**
 * Main variance tracking service that coordinates all operations
 */
export class VarianceTrackingService {
  public readonly baselines: BaselineService;
  public readonly calculations: VarianceCalculationService;
  public readonly alerts: AlertManagementService;
  private readonly alertEvaluation: VarianceAlertEvaluationService;

  constructor() {
    this.baselines = new BaselineService();
    this.calculations = new VarianceCalculationService();
    this.alerts = new AlertManagementService();
    this.alertEvaluation = new VarianceAlertEvaluationService(
      this.baselines,
      this.calculations,
      this.alerts
    );
  }

  /**
   * Complete variance analysis workflow
   */
  async performCompleteVarianceAnalysis(params: {
    fundId: number;
    baselineId?: string;
    reportName?: string;
    userId: number;
    includeAlertGeneration?: boolean;
  }): Promise<{
    report: VarianceReport;
    alertsGenerated: PerformanceAlert[];
  }> {
    const {
      fundId,
      baselineId,
      reportName = 'Automated Variance Report',
      userId,
      includeAlertGeneration = true,
    } = params;
    const baseline = await this.baselines.resolveBaselineForFund(fundId, baselineId);

    // Generate variance report
    const report = await this.calculations.generateVarianceReport({
      fundId,
      baselineId: baseline.id,
      reportName,
      reportType: 'ad_hoc',
      generatedBy: userId,
    });

    if (!includeAlertGeneration) {
      return { report, alertsGenerated: [] };
    }

    const evaluationResult = await this.alertEvaluation.evaluateVarianceAlerts({
      fundId,
      baselineId: baseline.id,
      asOfDate:
        report.asOfDate instanceof Date ? report.asOfDate : new Date(String(report.asOfDate)),
      source: 'manual',
      persistAlerts: true,
    });

    return { report, alertsGenerated: evaluationResult.alertsGenerated };
  }

  async setDefaultBaselineAndCleanup(params: {
    fundId: number;
    baselineId: string;
    userId?: number;
  }): Promise<{
    baseline: FundBaseline;
    resolvedSupersededAlerts: number;
  }> {
    const { fundId, baselineId, userId = SYSTEM_ACTOR_ID } = params;
    const baseline = await this.baselines.getBaselineById(fundId, baselineId);

    if (!baseline) {
      throw new Error('Baseline not found for fund');
    }

    if (!baseline.isActive) {
      throw new Error('Cannot set an inactive baseline as default');
    }

    await this.baselines.setDefaultBaseline(baselineId, fundId);

    const resolvedSupersededAlerts = await this.alerts.resolveSupersededBaselineAlerts({
      fundId,
      currentBaselineId: baseline.id,
      currentBaselineName: baseline.name,
      resolvedBy: userId,
    });

    return {
      baseline,
      resolvedSupersededAlerts,
    };
  }

  async cleanupSupersededAlertsForCurrentDefaultBaseline(params: {
    fundId: number;
    userId?: number;
  }): Promise<{
    baseline: FundBaseline;
    resolvedSupersededAlerts: number;
  }> {
    const { fundId, userId = SYSTEM_ACTOR_ID } = params;
    const baseline = await this.baselines.resolveBaselineForFund(fundId);
    const resolvedSupersededAlerts = await this.alerts.resolveSupersededBaselineAlerts({
      fundId,
      currentBaselineId: baseline.id,
      currentBaselineName: baseline.name,
      resolvedBy: userId,
    });

    return {
      baseline,
      resolvedSupersededAlerts,
    };
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
