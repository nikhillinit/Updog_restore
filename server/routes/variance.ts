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
import { toNumber } from '@shared/number';
import type { ApiError } from '@shared/types';
import {
  AlertActionRequestSchema,
  CreateAlertRuleRequestSchema,
  CreateBaselineRequestSchema,
  CreateVarianceReportRequestSchema,
  GetAlertsQuerySchema,
  GetBaselinesQuerySchema,
  VarianceAnalysisRequestSchema,
  type VarianceDashboardResponse as VarianceDashboardRouteResponse,
} from '@shared/variance-validation';
import { firstString, getUserId } from '../lib/request-values';
import { enforceProvidedFundScope } from '../lib/auth/provided-fund-scope';
import { getRouteErrorMessage } from '../lib/errorHandling';
import { handleNumberParseError } from '../lib/number-parse-error';
import {
  buildAlertCounts,
  toClientAlert,
  toDashboardRecentReport,
  toVarianceReportClientResponse,
} from './variance/response-adapters';

function toIsoTimestamp(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : String(value);
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
  res.json({
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
      if (handleNumberParseError(err, res, 'Invalid fund ID')) {
        return;
      }
      throw err;
    }

    if (!(await enforceProvidedFundScope(req, res, fundId))) {
      return;
    }

    // Validate request body
    const validation = CreateBaselineRequestSchema.safeParse(req.body);
    if (!validation.success) {
      const error: ApiError = {
        error: 'Validation failed',
        message: 'Invalid baseline data',
        details: validation.error.flatten(),
      };
      return res.status(400).json(error);
    }

    const data = validation.data;
    const userId = getUserId(req);

    if (!userId) {
      const error: ApiError = {
        error: 'Authentication required',
        message: 'User must be authenticated to create baselines',
      };
      return res.status(401).json(error);
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

    res.status(201).json({
      success: true,
      data: baseline,
      message: 'Baseline created successfully',
    });
  } catch (error) {
    console.error('Baseline creation error:', error);
    const apiError: ApiError = {
      error: 'Failed to create baseline',
      message: getRouteErrorMessage(error),
    };
    res.status(500).json(apiError);
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
      if (handleNumberParseError(err, res, 'Invalid fund ID')) {
        return;
      }
      throw err;
    }

    if (!(await enforceProvidedFundScope(req, res, fundId))) {
      return;
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
      return res.status(400).json(error);
    }

    const { baselineType, isDefault, limit } = queryValidation.data;

    const baselines = await varianceTrackingService.baselines.getBaselines(fundId, {
      ...(baselineType !== undefined && { baselineType }),
      ...(isDefault !== undefined && { isDefault }),
      ...(limit !== undefined && { limit }),
    });

    res.json({
      success: true,
      data: baselines,
      count: baselines.length,
    });
  } catch (error) {
    console.error('Baselines fetch error:', error);
    const apiError: ApiError = {
      error: 'Failed to fetch baselines',
      message: getRouteErrorMessage(error),
    };
    res.status(500).json(apiError);
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
        if (handleNumberParseError(err, res, 'Invalid fund ID')) {
          return;
        }
        throw err;
      }

      const baselineId = firstString(req.params['baselineId']);
      if (!baselineId) {
        const error: ApiError = {
          error: 'Invalid baseline ID',
          message: 'Baseline ID is required',
        };
        return res.status(400).json(error);
      }

      const userId = req.user?.id ? parseInt(String(req.user.id), 10) : undefined;
      const result = await varianceTrackingService.setDefaultBaselineAndCleanup({
        fundId,
        baselineId,
        ...(userId !== undefined ? { userId } : {}),
      });

      res.json({
        success: true,
        message: 'Default baseline updated successfully',
        data: {
          baselineId: result.baseline.id,
          resolvedSupersededAlerts: result.resolvedSupersededAlerts,
        },
      });
    } catch (error) {
      console.error('Set default baseline error:', error);
      const message = getRouteErrorMessage(error);
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
      res.status(statusCode).json(apiError);
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
      return res.status(400).json(error);
    }

    await varianceTrackingService.baselines.deactivateBaseline(baselineId);

    res.json({
      success: true,
      message: 'Baseline deactivated successfully',
    });
  } catch (error) {
    console.error('Baseline deactivation error:', error);
    const apiError: ApiError = {
      error: 'Failed to deactivate baseline',
      message: getRouteErrorMessage(error),
    };
    res.status(500).json(apiError);
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
        if (handleNumberParseError(err, res, 'Invalid fund ID')) {
          return;
        }
        throw err;
      }

      if (!(await enforceProvidedFundScope(req, res, fundId))) {
        return;
      }

      const validation = CreateVarianceReportRequestSchema.safeParse(req.body);
      if (!validation.success) {
        const error: ApiError = {
          error: 'Validation failed',
          message: 'Invalid variance report data',
          details: validation.error.flatten(),
        };
        return res.status(400).json(error);
      }

      const data = validation.data;
      const userId = getUserId(req);

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
        return res.status(404).json(error);
      }
      if (!resolvedBaselineId) {
        const error: ApiError = {
          error: 'No baseline available',
          message: 'No default baseline found. Create a baseline first.',
        };
        return res.status(400).json(error);
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

      res.status(201).json({
        success: true,
        data: toVarianceReportClientResponse(report),
        message: 'Variance report generated successfully',
      });
    } catch (error) {
      console.error('Variance report generation error:', error);
      const apiError: ApiError = {
        error: 'Failed to generate variance report',
        message: getRouteErrorMessage(error),
      };
      res.status(500).json(apiError);
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
      if (handleNumberParseError(err, res, 'Invalid fund ID')) {
        return;
      }
      throw err;
    }

    if (!(await enforceProvidedFundScope(req, res, fundId))) {
      return;
    }

    const reports = await varianceTrackingService.calculations.getVarianceReports(fundId);

    res.json({
      success: true,
      data: reports.map(toVarianceReportClientResponse),
      count: reports.length,
    });
  } catch (error) {
    console.error('Variance reports fetch error:', error);
    const apiError: ApiError = {
      error: 'Failed to fetch variance reports',
      message: getRouteErrorMessage(error),
    };
    res.status(500).json(apiError);
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
      if (handleNumberParseError(err, res, 'Invalid fund ID')) {
        return;
      }
      throw err;
    }

    const reportId = firstString(req.params['reportId']);
    if (!reportId) {
      const error: ApiError = {
        error: 'Invalid report ID',
        message: 'Report ID is required',
      };
      return res.status(400).json(error);
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
      return res.status(404).json(error);
    }

    res.json({
      success: true,
      data: toVarianceReportClientResponse(report),
    });
  } catch (error) {
    console.error('Variance report fetch error:', error);
    const apiError: ApiError = {
      error: 'Failed to fetch variance report',
      message: getRouteErrorMessage(error),
    };
    res.status(500).json(apiError);
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
      if (handleNumberParseError(err, res, 'Invalid fund ID')) {
        return;
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
      return res.status(400).json(error);
    }

    const data = validation.data;
    const userId = getUserId(req);

    if (!userId) {
      const error: ApiError = {
        error: 'Authentication required',
        message: 'User must be authenticated to create alert rules',
      };
      return res.status(401).json(error);
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

    res.status(201).json({
      success: true,
      data: rule,
      message: 'Alert rule created successfully',
    });
  } catch (error) {
    console.error('Alert rule creation error:', error);
    const apiError: ApiError = {
      error: 'Failed to create alert rule',
      message: getRouteErrorMessage(error),
    };
    res.status(500).json(apiError);
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
      if (handleNumberParseError(err, res, 'Invalid fund ID')) {
        return;
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
      return res.status(400).json(error);
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

    res.json({
      success: true,
      data: clientAlerts,
      count: clientAlerts.length,
    });
  } catch (error) {
    console.error('Alerts fetch error:', error);
    const apiError: ApiError = {
      error: 'Failed to fetch alerts',
      message: getRouteErrorMessage(error),
    };
    res.status(500).json(apiError);
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
      return res.status(400).json(error);
    }

    const validation = AlertActionRequestSchema.safeParse(req.body);
    if (!validation.success) {
      const error: ApiError = {
        error: 'Validation failed',
        message: 'Invalid alert action data',
        details: validation.error.flatten(),
      };
      return res.status(400).json(error);
    }

    const userId = getUserId(req);
    if (!userId) {
      const error: ApiError = {
        error: 'Authentication required',
        message: 'User must be authenticated to acknowledge alerts',
      };
      return res.status(401).json(error);
    }

    await varianceTrackingService.alerts.acknowledgeAlert(alertId, userId, validation.data.notes);

    res.json({
      success: true,
      message: 'Alert acknowledged successfully',
    });
  } catch (error) {
    console.error('Alert acknowledgment error:', error);
    const apiError: ApiError = {
      error: 'Failed to acknowledge alert',
      message: getRouteErrorMessage(error),
    };
    res.status(500).json(apiError);
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
      return res.status(400).json(error);
    }

    const validation = AlertActionRequestSchema.safeParse(req.body);
    if (!validation.success) {
      const error: ApiError = {
        error: 'Validation failed',
        message: 'Invalid alert action data',
        details: validation.error.flatten(),
      };
      return res.status(400).json(error);
    }

    const userId = getUserId(req);
    if (!userId) {
      const error: ApiError = {
        error: 'Authentication required',
        message: 'User must be authenticated to resolve alerts',
      };
      return res.status(401).json(error);
    }

    await varianceTrackingService.alerts.resolveAlert(alertId, userId, validation.data.notes);

    res.json({
      success: true,
      message: 'Alert resolved successfully',
    });
  } catch (error) {
    console.error('Alert resolution error:', error);
    const apiError: ApiError = {
      error: 'Failed to resolve alert',
      message: getRouteErrorMessage(error),
    };
    res.status(500).json(apiError);
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
      if (handleNumberParseError(err, res, 'Invalid fund ID')) {
        return;
      }
      throw err;
    }

    const userId = getUserId(req);
    if (!userId) {
      const error: ApiError = {
        error: 'Authentication required',
        message: 'User must be authenticated to clean up superseded alerts',
      };
      return res.status(401).json(error);
    }

    const result = await varianceTrackingService.cleanupSupersededAlertsForCurrentDefaultBaseline({
      fundId,
      userId,
    });

    res.json({
      success: true,
      data: {
        baselineId: result.baseline.id,
        resolvedSupersededAlerts: result.resolvedSupersededAlerts,
      },
      message: 'Superseded alerts cleaned up successfully',
    });
  } catch (error) {
    console.error('Superseded alert cleanup error:', error);
    const message = getRouteErrorMessage(error);
    const statusCode = message === 'No default baseline found for fund' ? 404 : 500;
    const apiError: ApiError = {
      error: 'Failed to clean up superseded alerts',
      message,
    };
    res.status(statusCode).json(apiError);
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
        if (handleNumberParseError(err, res, 'Invalid fund ID')) {
          return;
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
        return res.status(400).json(error);
      }

      const data = validation.data;
      const userId = getUserId(req);

      if (!userId) {
        const error: ApiError = {
          error: 'Authentication required',
          message: 'User must be authenticated to perform variance analysis',
        };
        return res.status(401).json(error);
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
          return res.status(404).json(error);
        }
      }

      const result = await varianceTrackingService.performCompleteVarianceAnalysis({
        fundId,
        ...(data.baselineId && { baselineId: data.baselineId }),
        ...(data.reportName && { reportName: data.reportName }),
        userId,
        includeAlertGeneration: data.includeAlertGeneration,
      });
      const clientAlerts = result.alertsGenerated.map((alert) => toClientAlert(alert, fundId));

      res.status(201).json({
        success: true,
        data: {
          report: toVarianceReportClientResponse(result.report),
          alertsGenerated: clientAlerts,
          alertCount: clientAlerts.length,
        },
        message: 'Variance analysis completed successfully',
      });
    } catch (error) {
      console.error('Variance analysis error:', error);
      const apiError: ApiError = {
        error: 'Failed to perform variance analysis',
        message: getRouteErrorMessage(error),
      };
      res.status(500).json(apiError);
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
      if (handleNumberParseError(err, res, 'Invalid fund ID')) {
        return;
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
    const recentReports = latestReports.slice(0, 5).map(toDashboardRecentReport);

    res.json({
      success: true,
      data: {
        defaultBaseline,
        recentBaselines: baselines.slice(0, 5),
        activeAlerts: clientAlerts,
        alertsBySeverity,
        // Preserve the historical misspelled field without reusing the same object reference.
        alertsByseverity: { ...alertsBySeverity },
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
      message: getRouteErrorMessage(error),
    };
    res.status(500).json(apiError);
  }
});

export default router;
