import { db } from '../../db';
import {
  alertEvaluationExecutions,
  alertRules,
  fundBaselines,
  performanceAlerts,
} from '@shared/schema';
import type {
  AlertRule,
  FundBaseline,
  InsertAlertRule,
  InsertPerformanceAlert,
  PerformanceAlert,
} from '@shared/schema';
import { and, desc, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import {
  normalizeAlertMetricName,
  OPEN_INCIDENT_STATUSES,
  toNullableNumber,
} from '../variance-alert-evaluation';
import type { AlertQueryStatus, SupportedAlertMetricValue } from '../variance-alert-evaluation';
import { toDecimal } from '@shared/lib/decimal-utils';
import { SYSTEM_ACTOR_ID } from '@shared/constants/system-actor';
import { recordAlertAction, recordAlertGenerated } from '../../metrics/variance-metrics';
import { isUniqueConstraintViolation } from './db-error-helpers';
import {
  hasExecuteQuery,
  hasReturningQuery,
  isEmptyConfigPayload,
  toNullableDecimalString,
} from './alert-helpers';

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
    executionKey?: string;
    runId?: number;
    frequency?: 'realtime' | 'hourly' | 'daily' | 'weekly';
    windowStart?: Date;
  }): Promise<{ alert: PerformanceAlert; suppressed: boolean; deduped?: boolean }> {
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
    let deduped = false;

    const result = await db.transaction(async (tx) => {
      const findOpenIncident = async () =>
        tx.query.performanceAlerts.findFirst({
          where: and(
            eq(performanceAlerts.fundId, params.fundId),
            eq(performanceAlerts.baselineId, params.baseline.id),
            eq(performanceAlerts.ruleId, params.rule.id),
            inArray(performanceAlerts.status, OPEN_INCIDENT_STATUSES)
          ),
        });

      const updateRuleTrigger = async () => {
        await tx
          .update(alertRules)
          .set({
            lastTriggered: triggeredAt,
            triggerCount: (params.rule.triggerCount ?? 0) + 1,
            updatedAt: new Date(),
          })
          .where(eq(alertRules.id, params.rule.id));
      };

      const attachExecutionToAlert = async (alertId: string) => {
        if (!params.executionKey) {
          return;
        }

        await tx
          .update(alertEvaluationExecutions)
          .set({
            appliedAlertId: alertId,
          })
          .where(eq(alertEvaluationExecutions.executionKey, params.executionKey));
      };

      const updateExistingIncident = async (
        existingAlert: PerformanceAlert
      ): Promise<{ alert: PerformanceAlert; suppressed: boolean; deduped?: boolean }> => {
        const previousOccurrence =
          existingAlert.lastOccurrence ?? existingAlert.triggeredAt ?? null;
        const suppressed =
          previousOccurrence != null &&
          (params.rule.suppressionPeriod ?? 0) > 0 &&
          triggeredAt.getTime() - new Date(previousOccurrence).getTime() <
            (params.rule.suppressionPeriod ?? 0) * 60_000;
        const contextWithSuppression = { ...contextData, suppressed };

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

        await updateRuleTrigger();

        if (!updatedAlert) {
          throw new Error('Failed to update performance alert incident');
        }

        await attachExecutionToAlert(updatedAlert.id);

        return { alert: updatedAlert, suppressed };
      };

      if (params.executionKey) {
        const executionInsert = await tx
          .insert(alertEvaluationExecutions)
          .values({
            executionKey: params.executionKey,
            source: params.source,
            fundId: params.fundId,
            baselineId: params.baseline.id,
            ruleId: params.rule.id,
            ...(params.runId !== undefined ? { runId: params.runId } : {}),
            ...(params.frequency ? { frequency: params.frequency } : {}),
            ...(params.windowStart ? { windowStart: params.windowStart } : {}),
          })
          .onConflictDoNothing()
          .returning();

        if (!executionInsert[0]) {
          deduped = true;
          const existingAlert = await findOpenIncident();
          if (existingAlert) {
            const existingContext =
              existingAlert.contextData && typeof existingAlert.contextData === 'object'
                ? (existingAlert.contextData as Record<string, unknown>)
                : {};
            return {
              alert: existingAlert,
              suppressed: existingContext['suppressed'] === true,
              deduped: true,
            };
          }

          const latestAlert = await tx.query.performanceAlerts.findFirst({
            where: and(
              eq(performanceAlerts.fundId, params.fundId),
              eq(performanceAlerts.baselineId, params.baseline.id),
              eq(performanceAlerts.ruleId, params.rule.id)
            ),
            orderBy: desc(performanceAlerts.triggeredAt),
          });

          if (!latestAlert) {
            throw new Error(
              `Alert evaluation ${params.executionKey} already recorded without a matching alert`
            );
          }

          return { alert: latestAlert, suppressed: false, deduped: true };
        }
      }

      const existingAlert = await findOpenIncident();
      if (existingAlert) {
        return updateExistingIncident(existingAlert);
      }

      const contextWithSuppression = { ...contextData, suppressed: false };

      try {
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

        await updateRuleTrigger();

        if (!createdAlert) {
          throw new Error('Failed to create performance alert incident');
        }

        createdNewAlert = true;
        await attachExecutionToAlert(createdAlert.id);

        return { alert: createdAlert, suppressed: false };
      } catch (error) {
        if (!isUniqueConstraintViolation(error, 'performance_alerts_open_incident_unique')) {
          throw error;
        }

        const concurrentAlert = await findOpenIncident();
        if (!concurrentAlert) {
          throw error;
        }

        return updateExistingIncident(concurrentAlert);
      }
    });

    if (createdNewAlert && !deduped) {
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

  async resolveSupersededBaselineAlerts(params: {
    fundId: number;
    currentBaselineId: string;
    currentBaselineName?: string | null;
    resolvedBy?: number;
    resolvedAt?: Date;
  }): Promise<number> {
    const {
      fundId,
      currentBaselineId,
      currentBaselineName = null,
      resolvedBy = SYSTEM_ACTOR_ID,
      resolvedAt = new Date(),
    } = params;

    const staleAlerts = await db.query.performanceAlerts.findMany({
      where: and(
        eq(performanceAlerts.fundId, fundId),
        inArray(performanceAlerts.status, OPEN_INCIDENT_STATUSES),
        isNotNull(performanceAlerts.baselineId),
        ne(performanceAlerts.baselineId, currentBaselineId)
      ),
    });

    if (staleAlerts.length === 0) {
      return 0;
    }

    const staleAlertIds = staleAlerts.map((alert) => alert.id);
    const resolutionSuffix = currentBaselineName
      ? ` Current default baseline: ${currentBaselineName}.`
      : '';
    const resolutionNotes = `Superseded by default baseline rotation.${resolutionSuffix}`;

    await db
      .update(performanceAlerts)
      .set({
        status: 'resolved',
        resolvedBy,
        resolvedAt,
        resolutionNotes,
        updatedAt: resolvedAt,
      })
      .where(inArray(performanceAlerts.id, staleAlertIds));

    for (const alert of staleAlerts) {
      const resolutionTime = (resolvedAt.getTime() - alert.triggeredAt.getTime()) / 1000;
      recordAlertAction('resolve', alert.severity, resolutionTime);
    }

    return staleAlerts.length;
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
      currentBaselineOnly?: boolean;
      limit?: number;
    }
  ): Promise<PerformanceAlert[]> {
    const statuses = options?.status?.length ? options.status : OPEN_INCIDENT_STATUSES;
    const conditions = [
      eq(performanceAlerts.fundId, fundId),
      inArray(performanceAlerts.status, statuses),
    ];

    if (options?.currentBaselineOnly) {
      const defaultBaseline = await db.query.fundBaselines.findFirst({
        where: and(
          eq(fundBaselines.fundId, fundId),
          eq(fundBaselines.isDefault, true),
          eq(fundBaselines.isActive, true)
        ),
        columns: {
          id: true,
        },
      });

      if (!defaultBaseline) {
        return [];
      }

      conditions.push(eq(performanceAlerts.baselineId, defaultBaseline.id));
    }

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
