/**
 * Variance Tracking Service
 *
 * Comprehensive service for managing fund performance variance tracking,
 * baseline comparisons, and alert generation.
 */

import { db } from '../db';
import { AlertManagementService } from './variance-tracking/alert-management-service';
import { BaselineService } from './variance-tracking/baseline-service';
import { VarianceCalculationService } from './variance-tracking/calculation-service';
import { fundMetrics } from '@shared/schema';
import type { FundBaseline, PerformanceAlert, VarianceReport } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { VarianceAlertEvaluationService } from './variance-alert-evaluation';
import { SYSTEM_ACTOR_ID } from '@shared/constants/system-actor';

export { BaselineService };
export { AlertManagementService };
export { VarianceCalculationService };
export type { BaselineCreationMode } from './variance-tracking/baseline-service';

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
