/**
 * Variance Tracking API Routes
 *
 * RESTful endpoints for fund performance variance tracking,
 * baseline management, and alert operations.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { idempotency } from '../middleware/idempotency';
import { varianceTrackingService } from '../services/variance-tracking';
import { varianceAlertAutomationService } from '../services/variance-alert-automation';
import { toNumber, NumberParseError } from '@shared/number';
import type { PerformanceAlert, VarianceReport as DbVarianceReport } from '@shared/schema';
import type { ApiError } from '@shared/types';
import {
  AlertActionRequestSchema,
  CreateAlertRuleRequestSchema,
  CreateBaselineRequestSchema,
  CreateVarianceReportRequestSchema,
  GetAlertsQuerySchema,
  GetBaselinesQuerySchema,
  VarianceAnalysisRequestSchema,
  type ClientAlertResponse,
  type VarianceDashboardResponse as VarianceDashboardRouteResponse,
  type VarianceReportClientResponse,
} from '@shared/variance-validation';
import { firstString } from '../lib/request-values';

// === RESPONSE SHAPE MAPPER ===

/** Variance columns we inspect for the summary + variances array */
const VARIANCE_COLS = [
  { metric: 'totalValue', value: 'totalValueVariance', pct: 'totalValueVariancePct' },
  { metric: 'irr', value: 'irrVariance', pct: null },
  { metric: 'multiple', value: 'multipleVariance', pct: null },
  { metric: 'dpi', value: 'dpiVariance', pct: null },
  { metric: 'tvpi', value: 'tvpiVariance', pct: null },
] as const;

/**
 * Transform a raw DB variance report row into the shape the client expects.
 * Handles null/undefined fields gracefully.
 */
function toClientReport(row: DbVarianceReport): VarianceReportClientResponse {
  // Build the per-metric variances array, only including non-null entries
  const variances: VarianceReportClientResponse['variances'] = [];
  let totalVariances = 0;

  for (const col of VARIANCE_COLS) {
    const val = row[col['value']] as string | null | undefined;
    if (val != null) {
      totalVariances++;
      variances.push({
        metric: col['metric'],
        value: val,
        pct: col['pct'] ? ((row[col['pct']] as string | null | undefined) ?? null) : null,
      });
    }
  }

  // significantVariances is a jsonb array in the DB
  const sigArr = Array.isArray(row['significantVariances']) ? row['significantVariances'] : [];
  const criticalCount = sigArr.filter(
    (item: unknown) =>
      item != null &&
      typeof item === 'object' &&
      'severity' in (item as Record<string, unknown>) &&
      ((item as Record<string, unknown>)['severity'] === 'critical' ||
        (item as Record<string, unknown>)['severity'] === 'high')
  ).length;

  return {
    id: row['id'],
    fundId: row['fundId'],
    baselineId: row['baselineId'],
    reportName: row['reportName'],
    reportType: row['reportType'] as VarianceReportClientResponse['reportType'],
    ...(row['reportPeriod'] != null && {
      reportPeriod: row['reportPeriod'] as NonNullable<
        VarianceReportClientResponse['reportPeriod']
      >,
    }),
    asOfDate:
      row['asOfDate'] instanceof Date ? row['asOfDate'].toISOString() : String(row['asOfDate']),
    ...(row['generatedBy'] != null && { generatedBy: row['generatedBy'] }),
    generatedAt:
      row['createdAt'] instanceof Date
        ? row['createdAt'].toISOString()
        : String(row['createdAt'] ?? ''),
    summary: {
      totalVariances,
      significantVariances: sigArr.length,
      criticalVariances: criticalCount,
    },
    variances,
    ...(row['portfolioVariances'] != null && {
      portfolioVariances: row['portfolioVariances'] as NonNullable<
        VarianceReportClientResponse['portfolioVariances']
      >,
    }),
    ...(row['sectorVariances'] != null && {
      sectorVariances: row['sectorVariances'] as NonNullable<
        VarianceReportClientResponse['sectorVariances']
      >,
    }),
    ...(row['stageVariances'] != null && {
      stageVariances: row['stageVariances'] as NonNullable<
        VarianceReportClientResponse['stageVariances']
      >,
    }),
    ...(row['reserveVariances'] != null && {
      reserveVariances: row['reserveVariances'] as NonNullable<
        VarianceReportClientResponse['reserveVariances']
      >,
    }),
    ...(row['pacingVariances'] != null && {
      pacingVariances: row['pacingVariances'] as NonNullable<
        VarianceReportClientResponse['pacingVariances']
      >,
    }),
  };
}

function toIsoTimestamp(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : String(value);
}

function buildAlertCounts(
  activeAlerts: Array<{
    severity?: 'info' | 'warning' | 'critical' | 'urgent' | string | null;
  }>
): VarianceDashboardRouteResponse['alertsBySeverity'] {
  return {
    critical: activeAlerts.filter((alert) => alert.severity === 'critical').length,
    warning: activeAlerts.filter((alert) => alert.severity === 'warning').length,
    info: activeAlerts.filter((alert) => alert.severity === 'info').length,
    urgent: activeAlerts.filter((alert) => alert.severity === 'urgent').length,
  };
}

function normalizeAlertSeverity(value: string | null): ClientAlertResponse['severity'] {
  return value === 'info' || value === 'warning' || value === 'critical' || value === 'urgent'
    ? value
    : 'warning';
}

function normalizeAlertCategory(value: string | null): ClientAlertResponse['category'] {
  return value === 'performance' ||
    value === 'risk' ||
    value === 'compliance' ||
    value === 'operational'
    ? value
    : 'performance';
}

function normalizeAlertStatus(value: string | null): ClientAlertResponse['status'] {
  return value === 'active' ||
    value === 'acknowledged' ||
    value === 'investigating' ||
    value === 'resolved' ||
    value === 'dismissed'
    ? value
    : 'active';
}

function toClientAlert(alert: PerformanceAlert, fundId: number): ClientAlertResponse {
  const contextData =
    alert.contextData && typeof alert.contextData === 'object'
      ? (alert.contextData as Record<string, unknown>)
      : {};
  const contextRuleName =
    typeof contextData['ruleName'] === 'string' ? contextData['ruleName'] : null;
  const contextBaselineName =
    typeof contextData['baselineName'] === 'string' ? contextData['baselineName'] : null;

  return {
    id: alert.id,
    fundId: alert.fundId ?? fundId,
    baselineId: alert.baselineId ?? null,
    baselineName: contextBaselineName,
    ruleId: alert.ruleId ?? null,
    ruleName: contextRuleName ?? alert.title,
    severity: normalizeAlertSeverity(alert.severity),
    category: normalizeAlertCategory(alert.category),
    message: alert.description,
    details: contextData,
    status: normalizeAlertStatus(alert.status),
    triggeredAt: toIsoTimestamp(alert.triggeredAt) ?? '',
    acknowledgedAt: toIsoTimestamp(alert.acknowledgedAt) ?? null,
    acknowledgedBy: alert.acknowledgedBy ?? null,
    resolvedAt: toIsoTimestamp(alert.resolvedAt) ?? null,
    resolvedBy: alert.resolvedBy ?? null,
    notes: alert.resolutionNotes ?? null,
  };
}

function deriveTrendDirection(
  reports: Array<{ overallVarianceScore?: string | null }>
): VarianceDashboardRouteResponse['summary']['trendDirection'] {
  if (reports.length < 2) {
    return 'stable';
  }

  const latest = Number(reports[0]?.overallVarianceScore ?? NaN);
  const previous = Number(reports[1]?.overallVarianceScore ?? NaN);
  if (Number.isNaN(latest) || Number.isNaN(previous)) {
    return 'stable';
  }

  const diff = latest - previous;
  if (Math.abs(diff) < 0.05) {
    return 'stable';
  }

  return diff < 0 ? 'improving' : 'declining';
}

const router = Router();

router['get']('/api/internal/alert-automation/health', (_req: Request, res: Response) => {
  res['json']({
    success: true,
    data: varianceAlertAutomationService.getHealth(),
  });
});

// === BASELINE MANAGEMENT ROUTES ===

/**
 * Create a new baseline for a fund
 * POST /api/funds/:id/baselines
 */
router['post']('/api/funds/:id/baselines', idempotency, async (req: Request, res: Response) => {
  try {
    // Parse and validate fund ID
    let fundId: number;
    try {
      fundId = toNumber(req.params['id'], 'fund ID', { integer: true, min: 1 });
    } catch (err) {
      if (err instanceof NumberParseError) {
        const error: ApiError = {
          error: 'Invalid fund ID',
          message: err.message,
        };
        return res['status'](400)['json'](error);
      }
      throw err;
    }

    // Validate request body
    const validation = CreateBaselineRequestSchema.safeParse(req.body);
    if (!validation.success) {
      const error: ApiError = {
        error: 'Validation failed',
        message: 'Invalid baseline data',
        details: validation.error.flatten(),
      };
      return res['status'](400)['json'](error);
    }

    const data = validation.data;
    const userId = req.user?.id ? parseInt(String(req.user.id), 10) : 0;

    if (!userId) {
      const error: ApiError = {
        error: 'Authentication required',
        message: 'User must be authenticated to create baselines',
      };
      return res['status'](401)['json'](error);
    }

    // Create baseline
    const baseline = await varianceTrackingService.baselines.createBaseline({
      fundId,
      name: data.name,
      ...(data.description && { description: data.description }),
      baselineType: data.baselineType,
      periodStart: new Date(data.periodStart),
      periodEnd: new Date(data.periodEnd),
      createdBy: userId,
      ...(data.tags && { tags: data.tags }),
    });

    res['status'](201)['json']({
      success: true,
      data: baseline,
      message: 'Baseline created successfully',
    });
  } catch (error) {
    console.error('Baseline creation error:', error);
    const apiError: ApiError = {
      error: 'Failed to create baseline',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    res['status'](500)['json'](apiError);
  }
});

/**
 * Get baselines for a fund
 * GET /api/funds/:id/baselines
 */
router['get']('/api/funds/:id/baselines', async (req: Request, res: Response) => {
  try {
    let fundId: number;
    try {
      fundId = toNumber(req.params['id'], 'fund ID', { integer: true, min: 1 });
    } catch (err) {
      if (err instanceof NumberParseError) {
        const error: ApiError = {
          error: 'Invalid fund ID',
          message: err.message,
        };
        return res['status'](400)['json'](error);
      }
      throw err;
    }

    // Parse query parameters
    const queryValidation = GetBaselinesQuerySchema.safeParse({
      baselineType: firstString(req.query['baselineType']),
      isDefault: firstString(req.query['isDefault']),
      limit: firstString(req.query['limit']),
    });
    if (!queryValidation.success) {
      const error: ApiError = {
        error: 'Validation failed',
        message: 'Invalid baseline query parameters',
        details: queryValidation.error.flatten(),
      };
      return res['status'](400)['json'](error);
    }

    const { baselineType, isDefault, limit } = queryValidation.data;

    const baselines = await varianceTrackingService.baselines.getBaselines(fundId, {
      ...(baselineType !== undefined && { baselineType }),
      ...(isDefault !== undefined && { isDefault }),
      ...(limit !== undefined && { limit }),
    });

    res['json']({
      success: true,
      data: baselines,
      count: baselines.length,
    });
  } catch (error) {
    console.error('Baselines fetch error:', error);
    const apiError: ApiError = {
      error: 'Failed to fetch baselines',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    res['status'](500)['json'](apiError);
  }
});

/**
 * Set default baseline for a fund
 * POST /api/funds/:id/baselines/:baselineId/set-default
 */
router['post'](
  '/api/funds/:id/baselines/:baselineId/set-default',
  async (req: Request, res: Response) => {
    try {
      let fundId: number;
      try {
        fundId = toNumber(req.params['id'], 'fund ID', { integer: true, min: 1 });
      } catch (err) {
        if (err instanceof NumberParseError) {
          const error: ApiError = {
            error: 'Invalid fund ID',
            message: err.message,
          };
          return res['status'](400)['json'](error);
        }
        throw err;
      }

      const baselineId = firstString(req.params['baselineId']);
      if (!baselineId) {
        const error: ApiError = {
          error: 'Invalid baseline ID',
          message: 'Baseline ID is required',
        };
        return res['status'](400)['json'](error);
      }

      const userId = req.user?.id ? parseInt(String(req.user.id), 10) : undefined;
      const result = await varianceTrackingService.setDefaultBaselineAndCleanup({
        fundId,
        baselineId,
        ...(userId !== undefined ? { userId } : {}),
      });

      res['json']({
        success: true,
        message: 'Default baseline updated successfully',
        data: {
          baselineId: result.baseline.id,
          resolvedSupersededAlerts: result.resolvedSupersededAlerts,
        },
      });
    } catch (error) {
      console.error('Set default baseline error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      const statusCode =
        message === 'Baseline not found for fund'
          ? 404
          : message === 'Cannot set an inactive baseline as default'
            ? 400
            : 500;
      const apiError: ApiError = {
        error: 'Failed to set default baseline',
        message,
      };
      res['status'](statusCode)['json'](apiError);
    }
  }
);

/**
 * Deactivate a baseline
 * DELETE /api/funds/:id/baselines/:baselineId
 */
router['delete']('/api/funds/:id/baselines/:baselineId', async (req: Request, res: Response) => {
  try {
    const baselineId = firstString(req.params['baselineId']);
    if (!baselineId) {
      const error: ApiError = {
        error: 'Invalid baseline ID',
        message: 'Baseline ID is required',
      };
      return res['status'](400)['json'](error);
    }

    await varianceTrackingService.baselines.deactivateBaseline(baselineId);

    res['json']({
      success: true,
      message: 'Baseline deactivated successfully',
    });
  } catch (error) {
    console.error('Baseline deactivation error:', error);
    const apiError: ApiError = {
      error: 'Failed to deactivate baseline',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    res['status'](500)['json'](apiError);
  }
});

// === VARIANCE REPORT ROUTES ===

/**
 * Generate variance report
 * POST /api/funds/:id/variance-reports
 */
router['post'](
  '/api/funds/:id/variance-reports',
  idempotency,
  async (req: Request, res: Response) => {
    try {
      let fundId: number;
      try {
        fundId = toNumber(req.params['id'], 'fund ID', { integer: true, min: 1 });
      } catch (err) {
        if (err instanceof NumberParseError) {
          const error: ApiError = {
            error: 'Invalid fund ID',
            message: err.message,
          };
          return res['status'](400)['json'](error);
        }
        throw err;
      }

      const validation = CreateVarianceReportRequestSchema.safeParse(req.body);
      if (!validation.success) {
        const error: ApiError = {
          error: 'Validation failed',
          message: 'Invalid variance report data',
          details: validation.error.flatten(),
        };
        return res['status'](400)['json'](error);
      }

      const data = validation.data;
      const userId = req.user?.id ? parseInt(String(req.user.id), 10) : 0;

      // Resolve baseline: use explicit baselineId or fall back to fund's default
      const resolvedBaselineId = await (async () => {
        if (data.baselineId) {
          const owned = await varianceTrackingService.baselines.getBaselineById(
            fundId,
            data.baselineId
          );
          if (!owned) {
            return null; // ownership failure sentinel
          }
          return data.baselineId;
        }
        const defaults = await varianceTrackingService.baselines.getBaselines(fundId, {
          isDefault: true,
        });
        return defaults[0]?.id;
      })();

      if (data.baselineId && !resolvedBaselineId) {
        const error: ApiError = {
          error: 'Baseline not found',
          message: 'The specified baseline does not belong to this fund.',
        };
        return res['status'](404)['json'](error);
      }
      if (!resolvedBaselineId) {
        const error: ApiError = {
          error: 'No baseline available',
          message: 'No default baseline found. Create a baseline first.',
        };
        return res['status'](400)['json'](error);
      }

      const report = await varianceTrackingService.calculations.generateVarianceReport({
        fundId,
        baselineId: resolvedBaselineId,
        reportName: data.reportName,
        reportType: data.reportType,
        ...(data.reportPeriod && { reportPeriod: data.reportPeriod }),
        ...(data.asOfDate && { asOfDate: new Date(data.asOfDate) }),
        ...(userId && { generatedBy: userId }),
      });

      res['status'](201)['json']({
        success: true,
        data: toClientReport(report),
        message: 'Variance report generated successfully',
      });
    } catch (error) {
      console.error('Variance report generation error:', error);
      const apiError: ApiError = {
        error: 'Failed to generate variance report',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      res['status'](500)['json'](apiError);
    }
  }
);

/**
 * Get variance reports for a fund
 * GET /api/funds/:id/variance-reports
 */
router['get']('/api/funds/:id/variance-reports', async (req: Request, res: Response) => {
  try {
    let fundId: number;
    try {
      fundId = toNumber(req.params['id'], 'fund ID', { integer: true, min: 1 });
    } catch (err) {
      if (err instanceof NumberParseError) {
        const error: ApiError = {
          error: 'Invalid fund ID',
          message: err.message,
        };
        return res['status'](400)['json'](error);
      }
      throw err;
    }

    const reports = await varianceTrackingService.calculations.getVarianceReports(fundId);

    res['json']({
      success: true,
      data: reports.map(toClientReport),
      count: reports.length,
    });
  } catch (error) {
    console.error('Variance reports fetch error:', error);
    const apiError: ApiError = {
      error: 'Failed to fetch variance reports',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    res['status'](500)['json'](apiError);
  }
});

/**
 * Get specific variance report
 * GET /api/funds/:id/variance-reports/:reportId
 */
router['get']('/api/funds/:id/variance-reports/:reportId', async (req: Request, res: Response) => {
  try {
    let fundId: number;
    try {
      fundId = toNumber(req.params['id'], 'fund ID', { integer: true, min: 1 });
    } catch (err) {
      if (err instanceof NumberParseError) {
        const error: ApiError = {
          error: 'Invalid fund ID',
          message: err.message,
        };
        return res['status'](400)['json'](error);
      }
      throw err;
    }

    const reportId = firstString(req.params['reportId']);
    if (!reportId) {
      const error: ApiError = {
        error: 'Invalid report ID',
        message: 'Report ID is required',
      };
      return res['status'](400)['json'](error);
    }

    const report = await varianceTrackingService.calculations.getVarianceReportById(
      fundId,
      reportId
    );
    if (!report) {
      const error: ApiError = {
        error: 'Variance report not found',
        message: 'The specified variance report does not belong to this fund.',
      };
      return res['status'](404)['json'](error);
    }

    res['json']({
      success: true,
      data: toClientReport(report),
    });
  } catch (error) {
    console.error('Variance report fetch error:', error);
    const apiError: ApiError = {
      error: 'Failed to fetch variance report',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    res['status'](500)['json'](apiError);
  }
});

// === ALERT MANAGEMENT ROUTES ===

/**
 * Create alert rule
 * POST /api/funds/:id/alert-rules
 */
router['post']('/api/funds/:id/alert-rules', async (req: Request, res: Response) => {
  try {
    let fundId: number;
    try {
      fundId = toNumber(req.params['id'], 'fund ID', { integer: true, min: 1 });
    } catch (err) {
      if (err instanceof NumberParseError) {
        const error: ApiError = {
          error: 'Invalid fund ID',
          message: err.message,
        };
        return res['status'](400)['json'](error);
      }
      throw err;
    }

    const validation = CreateAlertRuleRequestSchema.safeParse(req.body);
    if (!validation.success) {
      const error: ApiError = {
        error: 'Validation failed',
        message: 'Invalid alert rule data',
        details: validation.error.flatten(),
      };
      return res['status'](400)['json'](error);
    }

    const data = validation.data;
    const userId = req.user?.id ? parseInt(String(req.user.id), 10) : 0;

    if (!userId) {
      const error: ApiError = {
        error: 'Authentication required',
        message: 'User must be authenticated to create alert rules',
      };
      return res['status'](401)['json'](error);
    }

    const rule = await varianceTrackingService.alerts.createAlertRule({
      fundId,
      name: data.name,
      ...(data.description && { description: data.description }),
      ruleType: data.ruleType,
      metricName: data.metricName,
      operator: data.operator,
      thresholdValue: data.thresholdValue,
      ...(data.secondaryThreshold !== undefined && { secondaryThreshold: data.secondaryThreshold }),
      severity: data.severity,
      category: data.category,
      checkFrequency: data.checkFrequency,
      suppressionPeriod: data.suppressionPeriod,
      notificationChannels: data.notificationChannels,
      ...(data.escalationRules !== undefined && { escalationRules: data.escalationRules }),
      ...(data.conditions !== undefined && { conditions: data.conditions }),
      ...(data.filters !== undefined && { filters: data.filters }),
      createdBy: userId,
    });

    res['status'](201)['json']({
      success: true,
      data: rule,
      message: 'Alert rule created successfully',
    });
  } catch (error) {
    console.error('Alert rule creation error:', error);
    const apiError: ApiError = {
      error: 'Failed to create alert rule',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    res['status'](500)['json'](apiError);
  }
});

/**
 * Get active alerts for a fund
 * GET /api/funds/:id/alerts
 */
router['get']('/api/funds/:id/alerts', async (req: Request, res: Response) => {
  try {
    let fundId: number;
    try {
      fundId = toNumber(req.params['id'], 'fund ID', { integer: true, min: 1 });
    } catch (err) {
      if (err instanceof NumberParseError) {
        const error: ApiError = {
          error: 'Invalid fund ID',
          message: err.message,
        };
        return res['status'](400)['json'](error);
      }
      throw err;
    }

    // Parse query parameters
    const queryValidation = GetAlertsQuerySchema.safeParse({
      severity: firstString(req.query['severity']),
      category: firstString(req.query['category']),
      status: firstString(req.query['status']),
      baselineScope: firstString(req.query['baselineScope']),
      limit: firstString(req.query['limit']),
    });
    if (!queryValidation.success) {
      const error: ApiError = {
        error: 'Validation failed',
        message: 'Invalid alert query parameters',
        details: queryValidation.error.flatten(),
      };
      return res['status'](400)['json'](error);
    }

    const { severity, category, status, baselineScope, limit } = queryValidation.data;

    const alerts = await varianceTrackingService.alerts.getActiveAlerts(fundId, {
      ...(severity !== undefined && { severity }),
      ...(category !== undefined && { category }),
      ...(status !== undefined && { status }),
      ...(baselineScope === 'current' && { currentBaselineOnly: true }),
      ...(limit !== undefined && { limit }),
    });
    const clientAlerts = alerts.map((alert) => toClientAlert(alert, fundId));

    res['json']({
      success: true,
      data: clientAlerts,
      count: clientAlerts.length,
    });
  } catch (error) {
    console.error('Alerts fetch error:', error);
    const apiError: ApiError = {
      error: 'Failed to fetch alerts',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    res['status'](500)['json'](apiError);
  }
});

/**
 * Acknowledge an alert
 * POST /api/alerts/:alertId/acknowledge
 */
router['post']('/api/alerts/:alertId/acknowledge', async (req: Request, res: Response) => {
  try {
    const alertId = firstString(req.params['alertId']);
    if (!alertId) {
      const error: ApiError = {
        error: 'Invalid alert ID',
        message: 'Alert ID is required',
      };
      return res['status'](400)['json'](error);
    }

    const validation = AlertActionRequestSchema.safeParse(req.body);
    if (!validation.success) {
      const error: ApiError = {
        error: 'Validation failed',
        message: 'Invalid alert action data',
        details: validation.error.flatten(),
      };
      return res['status'](400)['json'](error);
    }

    const userId = req.user?.id ? parseInt(String(req.user.id), 10) : 0;
    if (!userId) {
      const error: ApiError = {
        error: 'Authentication required',
        message: 'User must be authenticated to acknowledge alerts',
      };
      return res['status'](401)['json'](error);
    }

    await varianceTrackingService.alerts.acknowledgeAlert(alertId, userId, validation.data.notes);

    res['json']({
      success: true,
      message: 'Alert acknowledged successfully',
    });
  } catch (error) {
    console.error('Alert acknowledgment error:', error);
    const apiError: ApiError = {
      error: 'Failed to acknowledge alert',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    res['status'](500)['json'](apiError);
  }
});

/**
 * Resolve an alert
 * POST /api/alerts/:alertId/resolve
 */
router['post']('/api/alerts/:alertId/resolve', async (req: Request, res: Response) => {
  try {
    const alertId = firstString(req.params['alertId']);
    if (!alertId) {
      const error: ApiError = {
        error: 'Invalid alert ID',
        message: 'Alert ID is required',
      };
      return res['status'](400)['json'](error);
    }

    const validation = AlertActionRequestSchema.safeParse(req.body);
    if (!validation.success) {
      const error: ApiError = {
        error: 'Validation failed',
        message: 'Invalid alert action data',
        details: validation.error.flatten(),
      };
      return res['status'](400)['json'](error);
    }

    const userId = req.user?.id ? parseInt(String(req.user.id), 10) : 0;
    if (!userId) {
      const error: ApiError = {
        error: 'Authentication required',
        message: 'User must be authenticated to resolve alerts',
      };
      return res['status'](401)['json'](error);
    }

    await varianceTrackingService.alerts.resolveAlert(alertId, userId, validation.data.notes);

    res['json']({
      success: true,
      message: 'Alert resolved successfully',
    });
  } catch (error) {
    console.error('Alert resolution error:', error);
    const apiError: ApiError = {
      error: 'Failed to resolve alert',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    res['status'](500)['json'](apiError);
  }
});

/**
 * Resolve older open incidents that no longer match the fund's current default baseline
 * POST /api/funds/:id/alerts/cleanup-superseded
 */
router['post']('/api/funds/:id/alerts/cleanup-superseded', async (req: Request, res: Response) => {
  try {
    let fundId: number;
    try {
      fundId = toNumber(req.params['id'], 'fund ID', { integer: true, min: 1 });
    } catch (err) {
      if (err instanceof NumberParseError) {
        const error: ApiError = {
          error: 'Invalid fund ID',
          message: err.message,
        };
        return res['status'](400)['json'](error);
      }
      throw err;
    }

    const userId = req.user?.id ? parseInt(String(req.user.id), 10) : 0;
    if (!userId) {
      const error: ApiError = {
        error: 'Authentication required',
        message: 'User must be authenticated to clean up superseded alerts',
      };
      return res['status'](401)['json'](error);
    }

    const result = await varianceTrackingService.cleanupSupersededAlertsForCurrentDefaultBaseline({
      fundId,
      userId,
    });

    res['json']({
      success: true,
      data: {
        baselineId: result.baseline.id,
        resolvedSupersededAlerts: result.resolvedSupersededAlerts,
      },
      message: 'Superseded alerts cleaned up successfully',
    });
  } catch (error) {
    console.error('Superseded alert cleanup error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const statusCode = message === 'No default baseline found for fund' ? 404 : 500;
    const apiError: ApiError = {
      error: 'Failed to clean up superseded alerts',
      message,
    };
    res['status'](statusCode)['json'](apiError);
  }
});

// === COMPREHENSIVE VARIANCE ANALYSIS ROUTES ===

/**
 * Perform complete variance analysis
 * POST /api/funds/:id/variance-analysis
 */
router['post'](
  '/api/funds/:id/variance-analysis',
  idempotency,
  async (req: Request, res: Response) => {
    try {
      let fundId: number;
      try {
        fundId = toNumber(req.params['id'], 'fund ID', { integer: true, min: 1 });
      } catch (err) {
        if (err instanceof NumberParseError) {
          const error: ApiError = {
            error: 'Invalid fund ID',
            message: err.message,
          };
          return res['status'](400)['json'](error);
        }
        throw err;
      }

      const validation = VarianceAnalysisRequestSchema.safeParse(req.body);
      if (!validation.success) {
        const error: ApiError = {
          error: 'Validation failed',
          message: 'Invalid variance analysis data',
          details: validation.error.flatten(),
        };
        return res['status'](400)['json'](error);
      }

      const data = validation.data;
      const userId = req.user?.id ? parseInt(String(req.user.id), 10) : 0;

      if (!userId) {
        const error: ApiError = {
          error: 'Authentication required',
          message: 'User must be authenticated to perform variance analysis',
        };
        return res['status'](401)['json'](error);
      }

      if (data.baselineId) {
        const baseline = await varianceTrackingService.baselines.getBaselineById(
          fundId,
          data.baselineId
        );
        if (!baseline) {
          const error: ApiError = {
            error: 'Baseline not found',
            message: 'The specified baseline does not belong to this fund.',
          };
          return res['status'](404)['json'](error);
        }
      }

      const result = await varianceTrackingService.performCompleteVarianceAnalysis({
        fundId,
        ...(data.baselineId && { baselineId: data.baselineId }),
        ...(data.reportName && { reportName: data.reportName }),
        userId,
        includeAlertGeneration: data.includeAlertGeneration,
      });

      res['status'](201)['json']({
        success: true,
        data: {
          report: result.report,
          alertsGenerated: result.alertsGenerated,
          alertCount: result.alertsGenerated.length,
        },
        message: 'Variance analysis completed successfully',
      });
    } catch (error) {
      console.error('Variance analysis error:', error);
      const apiError: ApiError = {
        error: 'Failed to perform variance analysis',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      res['status'](500)['json'](apiError);
    }
  }
);

/**
 * Get variance tracking dashboard data
 * GET /api/funds/:id/variance-dashboard
 */
router['get']('/api/funds/:id/variance-dashboard', async (req: Request, res: Response) => {
  try {
    let fundId: number;
    try {
      fundId = toNumber(req.params['id'], 'fund ID', { integer: true, min: 1 });
    } catch (err) {
      if (err instanceof NumberParseError) {
        const error: ApiError = {
          error: 'Invalid fund ID',
          message: err.message,
        };
        return res['status'](400)['json'](error);
      }
      throw err;
    }

    // Get summary data for dashboard
    const [baselines, activeAlerts, latestReports] = await Promise.all([
      varianceTrackingService.baselines.getBaselines(fundId, { limit: 5 }),
      varianceTrackingService.alerts.getActiveAlerts(fundId, {
        limit: 10,
        currentBaselineOnly: true,
      }),
      varianceTrackingService.calculations.getVarianceReports(fundId, { limit: 5 }),
    ]);

    const defaultBaseline = baselines.find((b) => b.isDefault) ?? null;
    const latestReport = latestReports[0];
    const clientAlerts = activeAlerts.map((alert) => toClientAlert(alert, fundId));
    const alertsBySeverity = buildAlertCounts(clientAlerts);
    const recentReports = latestReports.slice(0, 5).map((report) => ({
      id: report.id,
      name: report.reportName,
      riskLevel: report.riskLevel ?? 'low',
      createdAt: toIsoTimestamp(report.createdAt) ?? new Date(0).toISOString(),
      overallVarianceScore: report.overallVarianceScore ?? null,
    }));

    res['json']({
      success: true,
      data: {
        defaultBaseline,
        recentBaselines: baselines.slice(0, 5),
        activeAlerts: clientAlerts,
        alertsBySeverity,
        alertsByseverity: alertsBySeverity,
        summary: {
          totalBaselines: baselines.length,
          totalActiveAlerts: activeAlerts.length,
          lastAnalysisDate: toIsoTimestamp(latestReport?.createdAt) ?? null,
          overallRiskLevel:
            latestReport?.riskLevel === 'medium' ||
            latestReport?.riskLevel === 'high' ||
            latestReport?.riskLevel === 'critical'
              ? latestReport.riskLevel
              : 'low',
          trendDirection: deriveTrendDirection(latestReports),
        },
        recentReports,
      },
    });
  } catch (error) {
    console.error('Variance dashboard error:', error);
    const apiError: ApiError = {
      error: 'Failed to fetch variance dashboard data',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    res['status'](500)['json'](apiError);
  }
});

export default router;
