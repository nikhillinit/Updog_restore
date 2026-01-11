/**
 * Variance Tracking Service
 *
 * Comprehensive service for managing fund performance variance tracking,
 * baseline comparisons, and alert generation.
 */

import { db } from '../db';
import { Decimal, toDecimal } from '@shared/lib/decimal-utils';
import {
  fundBaselines,
  varianceReports,
  performanceAlerts,
  alertRules,
  fundMetrics,
  portfolioCompanies,
  fundSnapshots
} from '@shared/schema';
import type {
  FundBaseline,
  InsertFundBaseline,
  VarianceReport,
  InsertVarianceReport,
  PerformanceAlert,
  InsertPerformanceAlert,
  AlertRule,
  InsertAlertRule
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
  startVarianceCalculation
} from '../metrics/variance-metrics';

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
    createdBy: number;
    tags?: string[];
  }): Promise<FundBaseline> {
    const startTime = Date.now();
    const { fundId, name, description, baselineType, periodStart, periodEnd, createdBy, tags = [] } = params;

    try {
      // Get current fund metrics
      const latestMetrics = await db.query.fundMetrics.findFirst({
        where: eq(fundMetrics.fundId, fundId),
        orderBy: desc(fundMetrics.metricDate)
      });

      if (!latestMetrics) {
        recordSystemError('baseline-service', 'missing_fund_metrics');
        throw new Error('No fund metrics available to create baseline');
      }

    // Get portfolio composition
    const portfolioData = await this.getPortfolioComposition(fundId);

    // Get reserve and pacing data (kept for future use)
    const _reserveData = await this.getReserveSnapshot(fundId);
    const _pacingData = await this.getPacingSnapshot(fundId);

    // Check if this should be the default baseline
    const existingDefaults = await db.query.fundBaselines.findMany({
      where: and(
        eq(fundBaselines.fundId, fundId),
        eq(fundBaselines.isDefault, true),
        eq(fundBaselines.isActive, true)
      )
    });

    const isDefault = existingDefaults.length === 0;

    const baselineData: InsertFundBaseline = {
      fundId,
      name,
      baselineType,
      periodStart,
      periodEnd,
      snapshotDate: new Date(),
      totalValue: latestMetrics.totalValue,
      deployedCapital: portfolioData.deployedCapital,
      createdBy,
      isDefault,
      description,
      tags
    };

      const [baseline] = await db.insert(fundBaselines)
        .values(baselineData)
        .returning();

      if (!baseline) {
        throw new Error('Failed to create baseline');
      }

      // Record metrics
      const duration = (Date.now() - startTime) / 1000;
      recordBaselineOperation(fundId.toString(), 'create', baselineType, duration);

      return baseline;
    } catch (error: unknown) {
      recordSystemError('baseline-service', 'creation_failed');
      throw error;
    }
  }

  /**
   * Get active baselines for a fund
   */
  async getBaselines(fundId: number, options?: {
    baselineType?: string;
    isDefault?: boolean;
    limit?: number;
  }): Promise<FundBaseline[]> {
    const conditions = [
      eq(fundBaselines.fundId, fundId),
      eq(fundBaselines.isActive, true)
    ];

    if (options?.baselineType) {
      conditions.push(eq(fundBaselines.baselineType, options.baselineType));
    }

    if (options?.isDefault !== undefined) {
      conditions.push(eq(fundBaselines.isDefault, options.isDefault));
    }

    const query = db.query.fundBaselines.findMany({
      where: and(...conditions),
      orderBy: desc(fundBaselines.createdAt),
      limit: options?.limit || 50
    });

    return await query;
  }

  /**
   * Set a baseline as default
   */
  async setDefaultBaseline(baselineId: string, fundId: number): Promise<void> {
    await db.transaction(async (tx) => {
      // Clear existing defaults
      await tx.update(fundBaselines).set({ isDefault: false, updatedAt: new Date() })
        .where(and(
          eq(fundBaselines.fundId, fundId),
          eq(fundBaselines.isDefault, true)
        ));

      // Set new default
      await tx.update(fundBaselines).set({ isDefault: true, updatedAt: new Date() })
        .where(eq(fundBaselines.id, baselineId));
    });
  }

  /**
   * Deactivate a baseline
   */
  async deactivateBaseline(baselineId: string): Promise<void> {
    await db.update(fundBaselines).set({ isActive: false, updatedAt: new Date() })
      .where(eq(fundBaselines.id, baselineId));
  }

  /**
   * Get portfolio composition for baseline creation
   */
  private async getPortfolioComposition(fundId: number) {
    const companies = await db.query.portfolioCompanies.findMany({
      where: eq(portfolioCompanies.fundId, fundId),
      with: {
        investments: true
      }
    });

    const totalInvestments = companies.reduce((sum: Decimal, company) => {
      const investments = Array.isArray(company.investments)
        ? (company.investments as Array<{ amount: string | number }>)
        : [];

      const companyInvestment = investments.reduce(
        (compSum: Decimal, inv) => compSum.plus(toDecimal(String(inv.amount))),
        new Decimal(0)
      );
      return sum.plus(companyInvestment);
    }, new Decimal(0));

    const portfolioCount = companies.length;
    const averageInvestment = portfolioCount > 0 ? totalInvestments.div(portfolioCount) : new Decimal(0);

    // Get sector distribution
    const sectorCounts = companies.reduce((acc, company) => {
      acc[company.sector] = (acc[company.sector] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Get stage distribution
    const stageCounts = companies.reduce((acc, company) => {
      acc[company.stage] = (acc[company.stage] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Identify top performers (top 20% by current valuation)
    const sortedCompanies = companies
      .filter((c) => c.currentValuation)
      .sort((a, b) =>
        toDecimal(b.currentValuation!.toString()).comparedTo(toDecimal(a.currentValuation!.toString()))
      );

    const topPerformersCount = Math.ceil(sortedCompanies.length * 0.2);
    const topPerformers = sortedCompanies.slice(0, topPerformersCount).map((c) => ({
      id: c.id,
      name: c.name,
      sector: c.sector,
      currentValuation: c.currentValuation
    }));

    return {
      deployedCapital: totalInvestments.toString(),
      portfolioCount,
      averageInvestment: averageInvestment.toString(),
      topPerformers,
      sectorDistribution: sectorCounts,
      stageDistribution: stageCounts
    };
  }

  /**
   * Get reserve allocation snapshot
   */
  private async getReserveSnapshot(fundId: number) {
    const snapshot = await db.query.fundSnapshots.findFirst({
      where: and(
        eq(fundSnapshots.fundId, fundId),
        eq(fundSnapshots.type, 'RESERVE')
      ),
      orderBy: desc(fundSnapshots.createdAt)
    });

    return snapshot?.payload || {};
  }

  /**
   * Get pacing metrics snapshot
   */
  private async getPacingSnapshot(fundId: number) {
    const snapshot = await db.query.fundSnapshots.findFirst({
      where: and(
        eq(fundSnapshots.fundId, fundId),
        eq(fundSnapshots.type, 'PACING')
      ),
      orderBy: desc(fundSnapshots.createdAt)
    });

    return snapshot?.payload || {};
  }
}

/**
 * Variance calculation and reporting
 */
export class VarianceCalculationService {
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
    const { fundId, baselineId, reportName, reportType, reportPeriod, asOfDate = new Date(), generatedBy } = params;

    const finishCalculation = startVarianceCalculation('report_generation');
    const startTime = Date.now();

    try {

    // Get baseline data
    const baseline = await db.query.fundBaselines.findFirst({
      where: eq(fundBaselines.id, baselineId)
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
    const portfolioVariances = await this.analyzePortfolioVariances(fundId, baseline, asOfDate);

    // Generate insights and risk assessment
    const insights = this.generateVarianceInsights(variances, portfolioVariances);

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
      portfolioVariances,
      significantVariances: insights.significantVariances,
      varianceFactors: insights.factors,
      thresholdBreaches: insights.thresholdBreaches,
      riskLevel: insights.riskLevel,
      alertsTriggered,
      generatedBy,
      reportPeriod
    };

      const [report] = await db.insert(varianceReports)
        .values(reportData)
        .returning();

      if (!report) {
        throw new Error('Failed to create variance report');
      }

      // Record metrics
      const duration = (Date.now() - startTime) / 1000;
      recordVarianceReportGenerated(fundId.toString(), reportType, 'completed', duration);

      // Update variance score
      if (insights.overallScore) {
        updateFundVarianceScore(fundId.toString(), baselineId, toDecimal(insights.overallScore).toNumber());
      }

      // Update data quality score
      if (insights.dataQualityScore) {
        updateDataQualityScore(fundId.toString(), 'variance_calculation', toDecimal(insights.dataQualityScore).toNumber());
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
   * Get current fund metrics
   */
  private async getCurrentMetrics(fundId: number, asOfDate: Date) {
    const latestMetrics = await db.query.fundMetrics.findFirst({
      where: and(
        eq(fundMetrics.fundId, fundId),
        lte(fundMetrics.metricDate, asOfDate)
      ),
      orderBy: desc(fundMetrics.metricDate)
    });

    if (!latestMetrics) {
      throw new Error('No current metrics available');
    }

    // Get additional portfolio data
    const portfolioData = await this.getCurrentPortfolioMetrics(fundId, asOfDate);

    return {
      ...latestMetrics,
      ...portfolioData,
      asOfDate
    };
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
      snapshotDate: baseline.snapshotDate
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
      tvpiVariance: null as Decimal | null
    };

    // Total value variance
    if (current['totalValue'] && baseline['totalValue']) {
      const currentVal = toDecimal(current['totalValue'].toString());
      const baselineVal = toDecimal(baseline['totalValue'].toString());
      const totalVariance = currentVal.minus(baselineVal);
      calculations.totalValueVariance = totalVariance;
      calculations.totalValueVariancePct = baselineVal.isZero() ? null : totalVariance.div(baselineVal);
    }

    // IRR variance
    if (current['irr'] && baseline['irr']) {
      calculations.irrVariance = toDecimal(current['irr'].toString()).minus(toDecimal(baseline['irr'].toString()));
    }

    // Multiple variance
    if (current['multiple'] && baseline['multiple']) {
      calculations.multipleVariance = toDecimal(current['multiple'].toString()).minus(toDecimal(baseline['multiple'].toString()));
    }

    // DPI variance
    if (current['dpi'] && baseline['dpi']) {
      calculations.dpiVariance = toDecimal(current['dpi'].toString()).minus(toDecimal(baseline['dpi'].toString()));
    }

    // TVPI variance
    if (current['tvpi'] && baseline['tvpi']) {
      calculations.tvpiVariance = toDecimal(current['tvpi'].toString()).minus(toDecimal(baseline['tvpi'].toString()));
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
      baseline.sectorDistribution as Record<string, number> || {}
    );

    // Stage-level analysis
    const stageVariances = this.analyzeStageVariances(
      currentPortfolio.stageDistribution || {},
      baseline.stageDistribution as Record<string, number> || {}
    );

    return {
      companyVariances,
      sectorVariances,
      stageVariances,
      portfolioCountVariance: currentPortfolio.portfolioCount - baseline.portfolioCount
    };
  }

  /**
   * Generate variance insights and risk assessment
   */
  private generateVarianceInsights(variances: Record<string, unknown>, portfolioVariances: Record<string, unknown>) {
    const significantVariances: Array<Record<string, unknown>> = [];
    const factors: Array<Record<string, unknown>> = [];
    const thresholdBreaches: Array<Record<string, unknown>> = [];
    let riskLevel = 'low';
    let overallScore = "0";

    const totalValueVariance = variances['totalValueVariance'] as Decimal | null;
    const totalValueVariancePct = variances['totalValueVariancePct'] as Decimal | null;

    // Analyze total value variance
    if (totalValueVariancePct && totalValueVariancePct.abs().gt(0.1)) {
      significantVariances.push({
        metric: 'totalValue',
        variance: totalValueVariance ? totalValueVariance.toNumber() : null,
        variancePct: totalValueVariancePct.toNumber(),
        severity: totalValueVariancePct.abs().gt(0.2) ? 'high' : 'medium'
      });
    }

    const irrVariance = variances['irrVariance'] as Decimal | null;

    // Analyze IRR variance
    if (irrVariance && irrVariance.abs().gt(0.05)) {
      significantVariances.push({
        metric: 'irr',
        variance: irrVariance.toNumber(),
        severity: irrVariance.abs().gt(0.1) ? 'high' : 'medium'
      });
    }

    // Determine overall risk level
    const highSeverityCount = significantVariances.filter(v => v['severity'] === 'high').length;
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
      dataQualityScore: "0.95" // Placeholder for now
    };
  }

  /**
   * Calculate overall variance score
   */
  private calculateOverallVarianceScore(variances: Record<string, unknown>, _portfolioVariances: Record<string, unknown>): string {
    let score = new Decimal(0);
    let weightSum = new Decimal(0);

    // Weight different variance types
    const weights = {
      totalValue: 0.3,
      irr: 0.25,
      multiple: 0.2,
      dpi: 0.15,
      tvpi: 0.1
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

    return weightSum.gt(0) ? score.div(weightSum).toFixed(2) : "0.00";
  }

  /**
   * Check for alert triggers based on variance calculations
   */
  private async checkAlertTriggers(fundId: number, variances: Record<string, unknown>): Promise<Array<Record<string, unknown>>> {
    const activeRules = await db.query.alertRules.findMany({
      where: and(
        eq(alertRules.fundId, fundId),
        eq(alertRules.isEnabled, true)
      )
    });

    const triggeredAlerts: Array<Record<string, unknown>> = [];

    for (const rule of activeRules) {
      const metricValue = variances[`${rule.metricName}Variance`];
      const triggered = this.evaluateAlertRule(rule, variances);
      if (triggered) {
        triggeredAlerts.push({
          ruleId: rule.id,
          ruleName: rule.name,
          metricName: rule.metricName,
          thresholdValue: toDecimal(rule.thresholdValue?.toString() || '0').toNumber(),
          actualValue: metricValue === null || metricValue === undefined
            ? null
            : toDecimal(metricValue as Decimal | number | string).toNumber(),
          severity: rule.severity
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

  // Additional helper methods would be implemented here...
  private async getCurrentPortfolioMetrics(_fundId: number, _asOfDate: Date) {
    // Implementation for getting current portfolio metrics
    return {
      portfolioCount: 0,
      sectorDistribution: {},
      stageDistribution: {}
    };
  }

  private async analyzeCompanyVariances(_fundId: number, _baseline: FundBaseline, _asOfDate: Date) {
    // Implementation for company-level variance analysis
    return [];
  }

  private analyzeSectorVariances(_current: Record<string, number>, _baseline: Record<string, number>) {
    // Implementation for sector variance analysis
    return {};
  }

  private analyzeStageVariances(_current: Record<string, number>, _baseline: Record<string, number>) {
    // Implementation for stage variance analysis
    return {};
  }

  private async calculateReserveVariances(_fundId: number, _baseline: FundBaseline) {
    // Implementation for reserve variance calculation
    return {};
  }

  private async calculatePacingVariances(_fundId: number, _baseline: FundBaseline) {
    // Implementation for pacing variance calculation
    return {};
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
      createdBy: params.createdBy
    };

    const [rule] = await db.insert(alertRules)
      .values(ruleData)
      .returning();

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
      triggeredAt: new Date()
    };

    const [alert] = await db.insert(performanceAlerts)
      .values(alertData)
      .returning();

    if (!alert) {
      throw new Error('Failed to create performance alert');
    }

    // Record metrics
    recordAlertGenerated(params.fundId.toString(), params.alertType, params.severity, params.category);

    return alert;
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, userId: number, notes?: string): Promise<void> {
    // Get alert info for metrics
    const alert = await db.query.performanceAlerts.findFirst({
      where: eq(performanceAlerts.id, alertId)
    });

    await db.update(performanceAlerts).set({
        status: 'acknowledged',
        acknowledgedBy: userId,
        acknowledgedAt: new Date(),
        resolutionNotes: notes,
        updatedAt: new Date()
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
      where: eq(performanceAlerts.id, alertId)
    });

    const resolveTime = new Date();
    await db.update(performanceAlerts).set({
        status: 'resolved',
        resolvedBy: userId,
        resolvedAt: resolveTime,
        resolutionNotes: notes,
        updatedAt: new Date()
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
  async getActiveAlerts(fundId: number, options?: {
    severity?: string[];
    category?: string[];
    limit?: number;
  }): Promise<PerformanceAlert[]> {
    const conditions = [
      eq(performanceAlerts.fundId, fundId),
      eq(performanceAlerts.status, 'active')
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
      limit: options?.limit || 50
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
      generatedBy: userId
    });

    // Generate alerts if any thresholds are breached
    const alertsGenerated: PerformanceAlert[] = [];
    if (report.alertsTriggered && Array.isArray(report.alertsTriggered)) {
      for (const alertData of report.alertsTriggered) {
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
          ruleId: alertData.ruleId
        });
        alertsGenerated.push(alert);
      }
    }

    return { report, alertsGenerated };
  }
}

// Export singleton instance
export const varianceTrackingService = new VarianceTrackingService();