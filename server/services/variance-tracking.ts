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
  Investment,
  InsertFundBaseline,
  VarianceReport,
  InsertVarianceReport,
  PerformanceAlert,
  InsertPerformanceAlert,
  AlertRule,
  InsertAlertRule,
} from '@shared/schema';
import type { CompanyVarianceRow } from '@shared/variance-validation';
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

type SupportedAlertMetricName =
  | 'irrVariance'
  | 'multipleVariance'
  | 'dpiVariance'
  | 'tvpiVariance'
  | 'totalValueVariance'
  | 'totalValueVariancePct';

type AlertQueryStatus = 'active' | 'acknowledged' | 'investigating' | 'resolved' | 'dismissed';

type AlertEvaluationStatus = 'triggered' | 'not_triggered' | 'suppressed' | 'unsupported';

interface SupportedAlertMetricValue {
  metricKey: SupportedAlertMetricName;
  metricLabel: string;
  actualValue: Decimal;
  varianceAmount: Decimal | null;
  variancePercentage: Decimal | null;
}

interface AlertRuleEvaluationResult {
  ruleId: string;
  ruleName: string;
  status: AlertEvaluationStatus;
  metricName: string;
  metricKey?: SupportedAlertMetricName;
  actualValue?: number | null;
  thresholdValue?: number | null;
  varianceAmount?: number | null;
  variancePercentage?: number | null;
  reason?: string;
  alert?: PerformanceAlert;
}

interface VarianceSnapshot {
  baseline: FundBaseline;
  asOfDate: Date;
  currentMetrics: Record<string, unknown>;
  baselineMetrics: Record<string, unknown>;
  variances: Record<string, Decimal | null>;
  portfolioVariances: Record<string, unknown> | null;
  insights: {
    overallScore: string;
    significantVariances: unknown[];
    factors: unknown[];
    riskLevel: string;
    thresholdBreaches: unknown[];
    dataQualityScore: string;
  };
}

const ALERT_METRIC_ALIASES: Record<string, SupportedAlertMetricName> = {
  irr: 'irrVariance',
  irrVariance: 'irrVariance',
  multiple: 'multipleVariance',
  multipleVariance: 'multipleVariance',
  dpi: 'dpiVariance',
  dpiVariance: 'dpiVariance',
  tvpi: 'tvpiVariance',
  tvpiVariance: 'tvpiVariance',
  totalValue: 'totalValueVariance',
  totalValueVariance: 'totalValueVariance',
  totalValuePct: 'totalValueVariancePct',
  totalValueVariancePct: 'totalValueVariancePct',
};

const ALERT_METRIC_LABELS: Record<SupportedAlertMetricName, string> = {
  irrVariance: 'IRR variance',
  multipleVariance: 'Multiple variance',
  dpiVariance: 'DPI variance',
  tvpiVariance: 'TVPI variance',
  totalValueVariance: 'Total value variance',
  totalValueVariancePct: 'Total value variance percent',
};

const OPEN_INCIDENT_STATUSES: AlertQueryStatus[] = ['active', 'acknowledged', 'investigating'];

function isTriggeredAlertSeverity(value: unknown): value is TriggeredAlertData['severity'] {
  return value === 'info' || value === 'warning' || value === 'critical' || value === 'urgent';
}

function normalizeTriggeredAlertSeverity(value: unknown): TriggeredAlertData['severity'] {
  return isTriggeredAlertSeverity(value) ? value : 'warning';
}

function hasReturningQuery(
  value: unknown
): value is { returning: () => Promise<PerformanceAlert[]> } {
  return (
    value != null &&
    typeof value === 'object' &&
    'returning' in value &&
    typeof (value as { returning?: unknown }).returning === 'function'
  );
}

function hasExecuteQuery(value: unknown): value is { execute: () => Promise<PerformanceAlert[]> } {
  return (
    value != null &&
    typeof value === 'object' &&
    'execute' in value &&
    typeof (value as { execute?: unknown }).execute === 'function'
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

function normalizeAlertMetricName(
  metricName: string | null | undefined
): SupportedAlertMetricName | null {
  if (!metricName) {
    return null;
  }

  return ALERT_METRIC_ALIASES[metricName] ?? null;
}

function toNullableDecimalString(
  value: Decimal | string | number | null | undefined
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return value instanceof Decimal ? value.toString() : String(value);
}

function toNullableNumber(value: Decimal | null | undefined): number | null {
  return value == null ? null : value.toNumber();
}

function isEmptyConfigPayload(value: unknown): boolean {
  if (value == null) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length === 0;
  }

  return false;
}

function getSupportedAlertMetricValue(
  metricName: string | null | undefined,
  variances: Record<string, unknown>
): SupportedAlertMetricValue | null {
  const metricKey = normalizeAlertMetricName(metricName);
  if (!metricKey) {
    return null;
  }

  const rawValue = variances[metricKey];
  if (rawValue == null) {
    return null;
  }

  const actualValue = toDecimal(rawValue as Decimal | string | number);
  const varianceAmount =
    metricKey === 'totalValueVariancePct'
      ? variances['totalValueVariance'] == null
        ? null
        : toDecimal(variances['totalValueVariance'] as Decimal | string | number)
      : actualValue;
  const variancePercentage =
    metricKey === 'totalValueVariance'
      ? variances['totalValueVariancePct'] == null
        ? null
        : toDecimal(variances['totalValueVariancePct'] as Decimal | string | number)
      : metricKey === 'totalValueVariancePct'
        ? actualValue
        : null;

  return {
    metricKey,
    metricLabel: ALERT_METRIC_LABELS[metricKey],
    actualValue,
    varianceAmount,
    variancePercentage,
  };
}

function evaluateAlertOperator(
  operator: AlertRule['operator'],
  value: Decimal,
  threshold: Decimal,
  secondaryThreshold?: Decimal | null
): boolean {
  switch (operator) {
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
    case 'between': {
      if (secondaryThreshold == null) {
        return false;
      }

      const lowerBound = threshold.lte(secondaryThreshold) ? threshold : secondaryThreshold;
      const upperBound = threshold.gte(secondaryThreshold) ? threshold : secondaryThreshold;
      return value.gte(lowerBound) && value.lte(upperBound);
    }
    default:
      return false;
  }
}

function ensureOrderedPeriod(start: Date, end: Date): Date {
  if (end.getTime() > start.getTime()) {
    return end;
  }

  return new Date(start.getTime() + 1000);
}

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
          companySnapshots: portfolioData.companySnapshots,
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

  async resolveBaselineForFund(fundId: number, baselineId?: string): Promise<FundBaseline> {
    if (baselineId) {
      const baseline = await this.getBaselineById(fundId, baselineId);
      if (!baseline) {
        throw new Error('Baseline not found for fund');
      }

      return baseline;
    }

    const defaultBaselines = await this.getBaselines(fundId, { isDefault: true, limit: 1 });
    const defaultBaseline = defaultBaselines[0];
    if (!defaultBaseline) {
      throw new Error('No default baseline found for fund');
    }

    return defaultBaseline;
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

    const companyInvestedCapital = new Map<number, Decimal>();

    const totalInvestments = companiesWithInvestments.reduce((sum: Decimal, company) => {
      const companyInvestments = Array.isArray(company.investments)
        ? company.investments
        : (investmentLookup.get(company.id) ?? []);

      const normalizedInvestments = Array.isArray(companyInvestments) ? companyInvestments : [];

      const companyInvestment = normalizedInvestments.reduce(
        (compSum: Decimal, inv) => compSum.plus(toDecimal(String(inv.amount))),
        new Decimal(0)
      );
      companyInvestedCapital.set(company.id, companyInvestment);
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

    const companySnapshots = companiesWithInvestments.map((company) => ({
      portfolioCompanyId: company.id,
      companyId: company.id,
      companyName: company.name,
      sector: company.sector || '',
      stage: company.stage ?? null,
      status: company.status ?? null,
      investedCapital: (companyInvestedCapital.get(company.id) ?? new Decimal(0)).toString(),
      currentValuation: company.currentValuation == null ? null : String(company.currentValuation),
    }));

    return {
      deployedCapital: totalInvestments.toString(),
      portfolioCount,
      averageInvestment: averageInvestment.toString(),
      topPerformers,
      companySnapshots,
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
      const evaluation = this.buildAlertRuleEvaluation(rule, variances);
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

  /**
   * Evaluate if an alert rule should trigger
   */
  private evaluateAlertRule(rule: AlertRule, variances: Record<string, unknown>): boolean {
    return this.buildAlertRuleEvaluation(rule, variances)?.triggered ?? false;
  }

  private buildAlertRuleEvaluation(rule: AlertRule, variances: Record<string, unknown>) {
    if (rule.ruleType != null && rule.ruleType !== 'threshold') {
      return null;
    }

    const metric = getSupportedAlertMetricValue(rule.metricName, variances);
    if (!metric || rule.thresholdValue == null) {
      return null;
    }

    const threshold = toDecimal(rule.thresholdValue.toString());
    const secondaryThreshold =
      rule.secondaryThreshold == null ? null : toDecimal(rule.secondaryThreshold.toString());

    return {
      metric,
      threshold,
      secondaryThreshold,
      triggered: evaluateAlertOperator(
        rule.operator,
        metric.actualValue,
        threshold,
        secondaryThreshold
      ),
    };
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
  ): Record<
    string,
    {
      current: number;
      baseline: number;
      delta: number;
      deltaPct: number | null;
      currentCountShare: number;
      baselineCountShare: number;
      countShareDelta: number;
      countShareDeltaPct: number | null;
    }
  > {
    return this.analyzeDistributionVariances(current, baseline);
  }

  private analyzeStageVariances(
    current: Record<string, number>,
    baseline: Record<string, number>
  ): Record<
    string,
    {
      current: number;
      baseline: number;
      delta: number;
      deltaPct: number | null;
      currentCountShare: number;
      baselineCountShare: number;
      countShareDelta: number;
      countShareDeltaPct: number | null;
    }
  > {
    return this.analyzeDistributionVariances(current, baseline);
  }

  /** Shared logic for sector/stage distribution variance */
  private analyzeDistributionVariances(
    current: Record<string, number>,
    baseline: Record<string, number>
  ): Record<
    string,
    {
      current: number;
      baseline: number;
      delta: number;
      deltaPct: number | null;
      currentCountShare: number;
      baselineCountShare: number;
      countShareDelta: number;
      countShareDeltaPct: number | null;
    }
  > {
    const allKeys = new Set([...Object.keys(current), ...Object.keys(baseline)]);
    const currentTotal = Object.values(current).reduce((sum, value) => sum + value, 0);
    const baselineTotal = Object.values(baseline).reduce((sum, value) => sum + value, 0);
    const result: Record<
      string,
      {
        current: number;
        baseline: number;
        delta: number;
        deltaPct: number | null;
        currentCountShare: number;
        baselineCountShare: number;
        countShareDelta: number;
        countShareDeltaPct: number | null;
      }
    > = {};

    for (const key of allKeys) {
      const cur = current[key] ?? 0;
      const base = baseline[key] ?? 0;
      const delta = cur - base;
      const deltaPct = base !== 0 ? delta / base : null;
      const currentCountShare = currentTotal > 0 ? cur / currentTotal : 0;
      const baselineCountShare = baselineTotal > 0 ? base / baselineTotal : 0;
      const countShareDelta = currentCountShare - baselineCountShare;
      const countShareDeltaPct =
        baselineCountShare !== 0 ? countShareDelta / baselineCountShare : null;

      result[key] = {
        current: cur,
        baseline: base,
        delta,
        deltaPct,
        currentCountShare,
        baselineCountShare,
        countShareDelta,
        countShareDeltaPct,
      };
    }

    return result;
  }

  private coerceFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  private buildStructuredMetricChanges(
    currentValues: Record<string, unknown>,
    baselineValues: Record<string, unknown>
  ) {
    const metricDeltas: Record<
      string,
      {
        current: number;
        baseline: number;
        delta: number;
        deltaPct: number | null;
      }
    > = {};
    const changes: Record<string, { current: unknown; baseline: unknown }> = {};
    const allKeys = new Set([...Object.keys(currentValues), ...Object.keys(baselineValues)]);

    for (const key of allKeys) {
      const cur = currentValues[key];
      const base = baselineValues[key];
      if (isDeepStrictEqual(cur, base)) {
        continue;
      }

      const curNumber = this.coerceFiniteNumber(cur);
      const baseNumber = this.coerceFiniteNumber(base);
      if (curNumber !== null && baseNumber !== null) {
        const delta = curNumber - baseNumber;
        metricDeltas[key] = {
          current: curNumber,
          baseline: baseNumber,
          delta,
          deltaPct: baseNumber !== 0 ? delta / baseNumber : null,
        };
        continue;
      }

      changes[key] = { current: cur ?? null, baseline: base ?? null };
    }

    return { metricDeltas, changes };
  }

  private async calculateReserveVariances(fundId: number, baseline: FundBaseline) {
    const currentReserves = (await this.getReserveSnapshot(fundId)) as Record<string, unknown>;
    const baselineReserves = (baseline.reserveAllocation ?? {}) as Record<string, unknown>;

    const hasData =
      Object.keys(currentReserves).length > 0 && Object.keys(baselineReserves).length > 0;
    if (!hasData) {
      return {
        hasData: false,
        currentReserves: {},
        baselineReserves: {},
        metricDeltas: {},
        changes: {},
      };
    }

    const { metricDeltas, changes } = this.buildStructuredMetricChanges(
      currentReserves,
      baselineReserves
    );

    return { hasData: true, currentReserves, baselineReserves, metricDeltas, changes };
  }

  private async calculatePacingVariances(fundId: number, baseline: FundBaseline) {
    const currentPacing = (await this.getPacingSnapshot(fundId)) as Record<string, unknown>;
    const baselinePacing = (baseline.pacingMetrics ?? {}) as Record<string, unknown>;

    const hasData = Object.keys(currentPacing).length > 0 && Object.keys(baselinePacing).length > 0;
    if (!hasData) {
      return {
        hasData: false,
        currentPacing: {},
        baselinePacing: {},
        metricDeltas: {},
        changes: {},
      };
    }

    const { metricDeltas, changes } = this.buildStructuredMetricChanges(
      currentPacing,
      baselinePacing
    );

    return { hasData: true, currentPacing, baselinePacing, metricDeltas, changes };
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
    escalationRules?: unknown;
    conditions?: unknown;
    filters?: unknown;
    createdBy: number;
  }): Promise<AlertRule> {
    if (params.ruleType !== 'threshold') {
      throw new Error('Unsupported alert rule type for Phase 1C.1');
    }

    const normalizedMetricName = normalizeAlertMetricName(params.metricName);
    if (!normalizedMetricName) {
      throw new Error(`Unsupported alert metric: ${params.metricName}`);
    }

    if (!isEmptyConfigPayload(params.escalationRules)) {
      throw new Error('escalationRules are not supported in Phase 1C.1');
    }

    if (!isEmptyConfigPayload(params.conditions)) {
      throw new Error('conditions are not supported in Phase 1C.1');
    }

    if (!isEmptyConfigPayload(params.filters)) {
      throw new Error('filters are not supported in Phase 1C.1');
    }

    const ruleData: InsertAlertRule = {
      fundId: params.fundId,
      name: params.name,
      description: params.description,
      ruleType: params.ruleType,
      metricName: normalizedMetricName,
      operator: params.operator,
      thresholdValue: params.thresholdValue.toString(),
      secondaryThreshold: params.secondaryThreshold?.toString(),
      severity: params.severity || 'warning',
      category: params.category || 'performance',
      checkFrequency: params.checkFrequency || 'daily',
      suppressionPeriod: params.suppressionPeriod ?? 60,
      notificationChannels: params.notificationChannels ?? ['email'],
      escalationRules: params.escalationRules,
      conditions: params.conditions,
      filters: params.filters,
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
    ruleVersion?: string;
    contextData?: Record<string, unknown>;
    triggeredAt?: Date;
    firstOccurrence?: Date;
    lastOccurrence?: Date;
    occurrenceCount?: number;
    status?: AlertQueryStatus;
  }): Promise<PerformanceAlert> {
    const triggeredAt = params.triggeredAt ?? new Date();
    const alertData: InsertPerformanceAlert = {
      fundId: params.fundId,
      baselineId: params.baselineId,
      varianceReportId: params.varianceReportId,
      alertType: params.alertType,
      severity: params.severity,
      category: params.category,
      title: params.title,
      description: params.description,
      metricName: params.metricName,
      thresholdValue: toNullableDecimalString(params.thresholdValue),
      actualValue: toNullableDecimalString(params.actualValue),
      varianceAmount: toNullableDecimalString(params.varianceAmount),
      variancePercentage: toNullableDecimalString(params.variancePercentage),
      triggeredAt,
      firstOccurrence: params.firstOccurrence ?? triggeredAt,
      lastOccurrence: params.lastOccurrence ?? triggeredAt,
      occurrenceCount: params.occurrenceCount ?? 1,
      status: params.status,
      contextData: params.contextData,
      ruleId: params.ruleId,
      ruleVersion: params.ruleVersion,
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

  async upsertTriggeredAlertIncident(params: {
    fundId: number;
    baseline: FundBaseline;
    rule: AlertRule;
    metric: SupportedAlertMetricValue;
    source: 'manual' | 'calc_run_completion' | 'scheduler';
    triggeredAt?: Date;
  }): Promise<{ alert: PerformanceAlert; suppressed: boolean }> {
    const triggeredAt = params.triggeredAt ?? new Date();
    const thresholdValue =
      params.rule.thresholdValue == null ? null : toDecimal(params.rule.thresholdValue.toString());
    const contextData = {
      ruleName: params.rule.name,
      metricKey: params.metric.metricKey,
      metricLabel: params.metric.metricLabel,
      baselineName: params.baseline.name,
      baselinePeriodStart: params.baseline.periodStart.toISOString(),
      baselinePeriodEnd: params.baseline.periodEnd.toISOString(),
      evaluationSource: params.source,
      suppressed: false,
      suppressionPeriodMinutes: params.rule.suppressionPeriod ?? null,
      actualValue: params.metric.actualValue.toNumber(),
      thresholdValue: thresholdValue?.toNumber() ?? null,
      varianceAmount: toNullableNumber(params.metric.varianceAmount),
      variancePercentage: toNullableNumber(params.metric.variancePercentage),
    } satisfies Record<string, unknown>;
    const description = this.buildIncidentDescription(
      params.rule,
      params.metric,
      thresholdValue?.toNumber() ?? null
    );

    let createdNewAlert = false;

    const result = await db.transaction(async (tx) => {
      const existingAlert = await tx.query.performanceAlerts.findFirst({
        where: and(
          eq(performanceAlerts.fundId, params.fundId),
          eq(performanceAlerts.baselineId, params.baseline.id),
          eq(performanceAlerts.ruleId, params.rule.id),
          inArray(performanceAlerts.status, OPEN_INCIDENT_STATUSES)
        ),
      });

      const previousOccurrence =
        existingAlert?.lastOccurrence ?? existingAlert?.triggeredAt ?? null;
      const suppressed =
        previousOccurrence != null &&
        (params.rule.suppressionPeriod ?? 0) > 0 &&
        triggeredAt.getTime() - new Date(previousOccurrence).getTime() <
          (params.rule.suppressionPeriod ?? 0) * 60_000;
      const contextWithSuppression = { ...contextData, suppressed };

      if (existingAlert) {
        const updateQuery: unknown = tx
          .update(performanceAlerts)
          .set({
            title: params.rule.name,
            description,
            metricName: params.metric.metricKey,
            thresholdValue: toNullableDecimalString(thresholdValue),
            actualValue: toNullableDecimalString(params.metric.actualValue),
            varianceAmount: toNullableDecimalString(params.metric.varianceAmount),
            variancePercentage: toNullableDecimalString(params.metric.variancePercentage),
            lastOccurrence: triggeredAt,
            occurrenceCount: (existingAlert.occurrenceCount ?? 1) + 1,
            contextData: contextWithSuppression,
            ruleVersion: params.rule.version,
            updatedAt: new Date(),
          })
          .where(eq(performanceAlerts.id, existingAlert.id));
        const updatedAlerts: PerformanceAlert[] = Array.isArray(updateQuery)
          ? (updateQuery as PerformanceAlert[])
          : hasReturningQuery(updateQuery)
            ? await updateQuery.returning()
            : hasExecuteQuery(updateQuery)
              ? await updateQuery.execute()
              : [];
        const updatedAlert = updatedAlerts[0] as PerformanceAlert | undefined;

        await tx
          .update(alertRules)
          .set({
            lastTriggered: triggeredAt,
            triggerCount: (params.rule.triggerCount ?? 0) + 1,
            updatedAt: new Date(),
          })
          .where(eq(alertRules.id, params.rule.id));

        if (!updatedAlert) {
          throw new Error('Failed to update performance alert incident');
        }

        return { alert: updatedAlert, suppressed };
      }

      const createdAlerts = (await tx
        .insert(performanceAlerts)
        .values({
          fundId: params.fundId,
          baselineId: params.baseline.id,
          alertType: 'variance_threshold',
          severity: params.rule.severity,
          category: params.rule.category,
          title: params.rule.name,
          description,
          metricName: params.metric.metricKey,
          thresholdValue: toNullableDecimalString(thresholdValue),
          actualValue: toNullableDecimalString(params.metric.actualValue),
          varianceAmount: toNullableDecimalString(params.metric.varianceAmount),
          variancePercentage: toNullableDecimalString(params.metric.variancePercentage),
          triggeredAt,
          firstOccurrence: triggeredAt,
          lastOccurrence: triggeredAt,
          occurrenceCount: 1,
          contextData: contextWithSuppression,
          ruleId: params.rule.id,
          ruleVersion: params.rule.version,
        })
        .returning()) as PerformanceAlert[];
      const createdAlert = createdAlerts[0] as PerformanceAlert | undefined;

      await tx
        .update(alertRules)
        .set({
          lastTriggered: triggeredAt,
          triggerCount: (params.rule.triggerCount ?? 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(alertRules.id, params.rule.id));

      if (!createdAlert) {
        throw new Error('Failed to create performance alert incident');
      }

      createdNewAlert = true;
      return { alert: createdAlert, suppressed };
    });

    if (createdNewAlert) {
      recordAlertGenerated(
        params.fundId.toString(),
        result.alert.alertType,
        result.alert.severity,
        result.alert.category
      );
    }

    return result;
  }

  private buildIncidentDescription(
    rule: AlertRule,
    metric: SupportedAlertMetricValue,
    thresholdValue: number | null
  ) {
    const thresholdText =
      thresholdValue == null
        ? 'an undefined threshold'
        : rule.operator === 'between' && rule.secondaryThreshold != null
          ? `${thresholdValue} and ${rule.secondaryThreshold}`
          : `${rule.operator} ${thresholdValue}`;

    return `${metric.metricLabel} breached ${thresholdText}. Current value: ${metric.actualValue.toString()}.`;
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
      status?: AlertQueryStatus[];
      limit?: number;
    }
  ): Promise<PerformanceAlert[]> {
    const statuses = options?.status?.length ? options.status : OPEN_INCIDENT_STATUSES;
    const conditions = [
      eq(performanceAlerts.fundId, fundId),
      inArray(performanceAlerts.status, statuses),
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

export class VarianceAlertEvaluationService {
  constructor(
    private readonly baselines: BaselineService,
    private readonly calculations: VarianceCalculationService,
    private readonly alerts: AlertManagementService
  ) {}

  async evaluateVarianceAlerts(params: {
    fundId: number;
    baselineId?: string;
    runId?: number;
    asOfDate?: Date;
    source: 'manual' | 'calc_run_completion' | 'scheduler';
    persistAlerts: boolean;
  }): Promise<{
    baseline: FundBaseline;
    asOfDate: Date;
    evaluations: AlertRuleEvaluationResult[];
    alertsGenerated: PerformanceAlert[];
  }> {
    const baseline = await this.baselines.resolveBaselineForFund(params.fundId, params.baselineId);
    const snapshot = await this.calculations.computeVarianceSnapshot({
      fundId: params.fundId,
      baselineId: baseline.id,
      ...(params.runId !== undefined ? { runId: params.runId } : {}),
      ...(params.asOfDate !== undefined ? { asOfDate: params.asOfDate } : {}),
    });

    const rules = await db.query.alertRules.findMany({
      where: and(eq(alertRules.fundId, params.fundId), eq(alertRules.isEnabled, true)),
    });

    const evaluations: AlertRuleEvaluationResult[] = [];
    const alertsGenerated: PerformanceAlert[] = [];

    for (const rule of rules) {
      const evaluation = await this.evaluateRule(rule, snapshot, params);
      evaluations.push(evaluation);

      if (evaluation.alert) {
        alertsGenerated.push(evaluation.alert);
      }
    }

    return {
      baseline,
      asOfDate: snapshot.asOfDate,
      evaluations,
      alertsGenerated,
    };
  }

  private async evaluateRule(
    rule: AlertRule,
    snapshot: VarianceSnapshot,
    params: {
      fundId: number;
      source: 'manual' | 'calc_run_completion' | 'scheduler';
      persistAlerts: boolean;
    }
  ): Promise<AlertRuleEvaluationResult> {
    const ruleName = rule.name ?? rule.metricName ?? 'Unnamed alert rule';
    const metricKey = normalizeAlertMetricName(rule.metricName);

    if (rule.ruleType != null && rule.ruleType !== 'threshold') {
      return {
        ruleId: rule.id,
        ruleName,
        status: 'unsupported',
        metricName: rule.metricName,
        reason: `Unsupported rule type: ${rule.ruleType}`,
      };
    }

    if (!metricKey) {
      return {
        ruleId: rule.id,
        ruleName,
        status: 'unsupported',
        metricName: rule.metricName,
        reason: `Unsupported metric: ${rule.metricName}`,
      };
    }

    if (rule.thresholdValue == null) {
      return {
        ruleId: rule.id,
        ruleName,
        status: 'unsupported',
        metricName: rule.metricName,
        metricKey,
        reason: 'thresholdValue is required',
      };
    }

    if (rule.operator === 'between' && rule.secondaryThreshold == null) {
      return {
        ruleId: rule.id,
        ruleName,
        status: 'unsupported',
        metricName: rule.metricName,
        metricKey,
        reason: 'secondaryThreshold is required for between rules',
      };
    }

    const metric = getSupportedAlertMetricValue(rule.metricName, snapshot.variances);
    if (!metric) {
      return {
        ruleId: rule.id,
        ruleName,
        status: 'not_triggered',
        metricName: rule.metricName,
        metricKey,
        reason: 'Metric not available in computed variance snapshot',
      };
    }

    const threshold = toDecimal(rule.thresholdValue.toString());
    const secondaryThreshold =
      rule.secondaryThreshold == null ? null : toDecimal(rule.secondaryThreshold.toString());
    const triggered = evaluateAlertOperator(
      rule.operator,
      metric.actualValue,
      threshold,
      secondaryThreshold
    );

    if (!triggered) {
      return {
        ruleId: rule.id,
        ruleName,
        status: 'not_triggered',
        metricName: rule.metricName,
        metricKey: metric.metricKey,
        actualValue: metric.actualValue.toNumber(),
        thresholdValue: threshold.toNumber(),
        varianceAmount: toNullableNumber(metric.varianceAmount),
        variancePercentage: toNullableNumber(metric.variancePercentage),
      };
    }

    if (!params.persistAlerts) {
      return {
        ruleId: rule.id,
        ruleName,
        status: 'triggered',
        metricName: rule.metricName,
        metricKey: metric.metricKey,
        actualValue: metric.actualValue.toNumber(),
        thresholdValue: threshold.toNumber(),
        varianceAmount: toNullableNumber(metric.varianceAmount),
        variancePercentage: toNullableNumber(metric.variancePercentage),
      };
    }

    const persisted = await this.alerts.upsertTriggeredAlertIncident({
      fundId: params.fundId,
      baseline: snapshot.baseline,
      rule,
      metric,
      source: params.source,
      triggeredAt: snapshot.asOfDate,
    });

    return {
      ruleId: rule.id,
      ruleName,
      status: persisted.suppressed ? 'suppressed' : 'triggered',
      metricName: rule.metricName,
      metricKey: metric.metricKey,
      actualValue: metric.actualValue.toNumber(),
      thresholdValue: threshold.toNumber(),
      varianceAmount: toNullableNumber(metric.varianceAmount),
      variancePercentage: toNullableNumber(metric.variancePercentage),
      alert: persisted.alert,
    };
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
