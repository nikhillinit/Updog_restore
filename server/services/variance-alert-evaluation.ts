import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import type { Decimal } from '@shared/lib/decimal-utils';
import { toDecimal } from '@shared/lib/decimal-utils';
import { alertRules } from '@shared/schema';
import type { AlertRule, FundBaseline, PerformanceAlert } from '@shared/schema';

export type SupportedAlertMetricName =
  | 'irrVariance'
  | 'multipleVariance'
  | 'dpiVariance'
  | 'tvpiVariance'
  | 'totalValueVariance'
  | 'totalValueVariancePct';

export type AlertQueryStatus =
  | 'active'
  | 'acknowledged'
  | 'investigating'
  | 'resolved'
  | 'dismissed';

export type AlertEvaluationStatus = 'triggered' | 'not_triggered' | 'suppressed' | 'unsupported';

export interface SupportedAlertMetricValue {
  metricKey: SupportedAlertMetricName;
  metricLabel: string;
  actualValue: Decimal;
  varianceAmount: Decimal | null;
  variancePercentage: Decimal | null;
}

export interface AlertRuleEvaluationResult {
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
  deduped?: boolean;
}

export interface VarianceSnapshot {
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

export const OPEN_INCIDENT_STATUSES: AlertQueryStatus[] = [
  'active',
  'acknowledged',
  'investigating',
];

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

export function normalizeAlertMetricName(
  metricName: string | null | undefined
): SupportedAlertMetricName | null {
  if (!metricName) {
    return null;
  }

  return ALERT_METRIC_ALIASES[metricName] ?? null;
}

export function toNullableNumber(value: Decimal | null | undefined): number | null {
  return value == null ? null : value.toNumber();
}

export function getSupportedAlertMetricValue(
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

export function evaluateAlertOperator(
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

export function buildAlertRuleEvaluation(
  rule: AlertRule,
  variances: Record<string, unknown>
): {
  metric: SupportedAlertMetricValue;
  threshold: Decimal;
  secondaryThreshold: Decimal | null;
  triggered: boolean;
} | null {
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

interface BaselineResolver {
  resolveBaselineForFund(fundId: number, baselineId?: string): Promise<FundBaseline>;
}

interface SnapshotCalculator {
  computeVarianceSnapshot(params: {
    fundId: number;
    baselineId: string;
    asOfDate?: Date;
    runId?: number;
  }): Promise<VarianceSnapshot>;
}

interface AlertIncidentWriter {
  upsertTriggeredAlertIncident(params: {
    fundId: number;
    baseline: FundBaseline;
    rule: AlertRule;
    metric: SupportedAlertMetricValue;
    source: 'manual' | 'calc_run_completion' | 'scheduler';
    triggeredAt?: Date;
    executionKey?: string;
    runId?: number;
    frequency?: 'realtime' | 'hourly' | 'daily' | 'weekly';
    windowStart?: Date;
  }): Promise<{ alert: PerformanceAlert; suppressed: boolean; deduped?: boolean }>;
}

export class VarianceAlertEvaluationService {
  constructor(
    private readonly baselines: BaselineResolver,
    private readonly calculations: SnapshotCalculator,
    private readonly alerts: AlertIncidentWriter
  ) {}

  async evaluateVarianceAlerts(params: {
    fundId: number;
    baselineId?: string;
    runId?: number;
    asOfDate?: Date;
    source: 'manual' | 'calc_run_completion' | 'scheduler';
    persistAlerts: boolean;
    rules?: AlertRule[];
    checkFrequency?: 'realtime' | 'hourly' | 'daily' | 'weekly';
    executionKey?: string;
    windowStart?: Date;
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

    const rules =
      params.rules ??
      (await db.query.alertRules.findMany({
        where: and(
          eq(alertRules.fundId, params.fundId),
          eq(alertRules.isEnabled, true),
          ...(params.checkFrequency ? [eq(alertRules.checkFrequency, params.checkFrequency)] : [])
        ),
      }));

    const evaluations: AlertRuleEvaluationResult[] = [];
    const alertsGenerated: PerformanceAlert[] = [];

    for (const rule of rules) {
      const ruleExecutionKey =
        params.executionKey == null
          ? undefined
          : rules.length === 1
            ? params.executionKey
            : `${params.executionKey}:${rule.id}`;
      const evaluation = await this.evaluateRule(rule, snapshot, {
        fundId: params.fundId,
        source: params.source,
        persistAlerts: params.persistAlerts,
        ...(ruleExecutionKey != null && { executionKey: ruleExecutionKey }),
        ...(params.runId != null && { runId: params.runId }),
        ...(params.checkFrequency != null && { checkFrequency: params.checkFrequency }),
        ...(params.windowStart != null && { windowStart: params.windowStart }),
      });
      evaluations.push(evaluation);

      if (evaluation.alert && !evaluation.deduped) {
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
      executionKey?: string;
      runId?: number;
      checkFrequency?: 'realtime' | 'hourly' | 'daily' | 'weekly';
      windowStart?: Date;
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

    const evaluation = buildAlertRuleEvaluation(rule, snapshot.variances);
    if (!evaluation) {
      return {
        ruleId: rule.id,
        ruleName,
        status: 'not_triggered',
        metricName: rule.metricName,
        metricKey,
        reason: 'Metric not available in computed variance snapshot',
      };
    }

    if (!evaluation.triggered) {
      return {
        ruleId: rule.id,
        ruleName,
        status: 'not_triggered',
        metricName: rule.metricName,
        metricKey: evaluation.metric.metricKey,
        actualValue: evaluation.metric.actualValue.toNumber(),
        thresholdValue: evaluation.threshold.toNumber(),
        varianceAmount: toNullableNumber(evaluation.metric.varianceAmount),
        variancePercentage: toNullableNumber(evaluation.metric.variancePercentage),
      };
    }

    if (!params.persistAlerts) {
      return {
        ruleId: rule.id,
        ruleName,
        status: 'triggered',
        metricName: rule.metricName,
        metricKey: evaluation.metric.metricKey,
        actualValue: evaluation.metric.actualValue.toNumber(),
        thresholdValue: evaluation.threshold.toNumber(),
        varianceAmount: toNullableNumber(evaluation.metric.varianceAmount),
        variancePercentage: toNullableNumber(evaluation.metric.variancePercentage),
      };
    }

    const persisted = await this.alerts.upsertTriggeredAlertIncident({
      fundId: params.fundId,
      baseline: snapshot.baseline,
      rule,
      metric: evaluation.metric,
      source: params.source,
      triggeredAt: snapshot.asOfDate,
      ...(params.executionKey ? { executionKey: params.executionKey } : {}),
      ...(params.runId !== undefined ? { runId: params.runId } : {}),
      ...(params.checkFrequency ? { frequency: params.checkFrequency } : {}),
      ...(params.windowStart ? { windowStart: params.windowStart } : {}),
    });

    return {
      ruleId: rule.id,
      ruleName,
      status: persisted.suppressed ? 'suppressed' : 'triggered',
      metricName: rule.metricName,
      metricKey: evaluation.metric.metricKey,
      actualValue: evaluation.metric.actualValue.toNumber(),
      thresholdValue: evaluation.threshold.toNumber(),
      varianceAmount: toNullableNumber(evaluation.metric.varianceAmount),
      variancePercentage: toNullableNumber(evaluation.metric.variancePercentage),
      alert: persisted.alert,
      deduped: persisted.deduped ?? false,
    };
  }
}
