/**
 * Variance Tracking API Routes
 *
 * RESTful endpoints for fund performance variance tracking,
 * baseline management, and alert operations.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { idempotency } from '../middleware/idempotency';
import { varianceTrackingService } from '../services/variance-tracking';
import { toNumber, NumberParseError } from '@shared/number';
import { positiveInt } from '@shared/schema-helpers';
import type { VarianceReport as DbVarianceReport } from '@shared/schema';
import type { ApiError } from '@shared/types';
import { firstString } from '../lib/request-values';

// === RESPONSE SHAPE MAPPER ===

/** Shape the client expects from useVarianceData.ts */
interface ClientVarianceReport {
  id: string;
  fundId: number;
  baselineId: string;
  reportName: string;
  reportType: 'periodic' | 'milestone' | 'ad_hoc' | 'alert_triggered';
  reportPeriod?: 'monthly' | 'quarterly' | 'annual';
  asOfDate: string;
  generatedBy?: number;
  generatedAt: string;
  summary: {
    totalVariances: number;
    significantVariances: number;
    criticalVariances: number;
  };
  variances: Array<{ metric: string; value: string | null; pct: string | null }>;
  portfolioVariances?: Record<string, unknown>;
  sectorVariances?: Record<string, unknown>;
  stageVariances?: Record<string, unknown>;
  reserveVariances?: Record<string, unknown>;
  pacingVariances?: Record<string, unknown>;
}

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
function toClientReport(row: DbVarianceReport): ClientVarianceReport {
  // Build the per-metric variances array, only including non-null entries
  const variances: ClientVarianceReport['variances'] = [];
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
    reportType: row['reportType'] as ClientVarianceReport['reportType'],
    ...(row['reportPeriod'] != null && {
      reportPeriod: row['reportPeriod'] as NonNullable<ClientVarianceReport['reportPeriod']>,
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
      portfolioVariances: row['portfolioVariances'] as Record<string, unknown>,
    }),
    ...(row['sectorVariances'] != null && {
      sectorVariances: row['sectorVariances'] as Record<string, unknown>,
    }),
    ...(row['stageVariances'] != null && {
      stageVariances: row['stageVariances'] as Record<string, unknown>,
    }),
    ...(row['reserveVariances'] != null && {
      reserveVariances: row['reserveVariances'] as Record<string, unknown>,
    }),
    ...(row['pacingVariances'] != null && {
      pacingVariances: row['pacingVariances'] as Record<string, unknown>,
    }),
  };
}

const router = Router();

// === VALIDATION SCHEMAS ===

const CreateBaselineSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  baselineType: z.enum(['initial', 'quarterly', 'annual', 'milestone', 'custom']),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  tags: z.array(z.string().max(50)).max(10).default([]),
});

const CreateVarianceReportSchema = z.object({
  baselineId: z.string().uuid().optional(),
  reportName: z.string().min(1).max(100),
  reportType: z.enum(['periodic', 'milestone', 'ad_hoc', 'alert_triggered']),
  reportPeriod: z.enum(['monthly', 'quarterly', 'annual']).optional(),
  asOfDate: z.string().datetime().optional(),
});

const CreateAlertRuleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  ruleType: z.enum(['threshold', 'trend', 'deviation', 'pattern']),
  metricName: z.string().min(1),
  operator: z.enum(['gt', 'lt', 'eq', 'gte', 'lte', 'between']),
  thresholdValue: z.number(),
  secondaryThreshold: z.number().optional(),
  severity: z.enum(['info', 'warning', 'critical', 'urgent']).default('warning'),
  category: z.enum(['performance', 'risk', 'operational', 'compliance']).default('performance'),
  checkFrequency: z.enum(['realtime', 'hourly', 'daily', 'weekly']).default('daily'),
  suppressionPeriod: positiveInt().default(60),
  notificationChannels: z.array(z.enum(['email', 'slack', 'webhook'])).default(['email']),
});

const AlertActionSchema = z.object({
  notes: z.string().max(1000).optional(),
});

const VarianceAnalysisSchema = z.object({
  baselineId: z.string().uuid().optional(),
  reportName: z.string().min(1).max(100).optional(),
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
    const validation = CreateBaselineSchema.safeParse(req.body);
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
    const baselineType = req.query['baselineType'] as string;
    const isDefault =
      req.query['isDefault'] === 'true'
        ? true
        : req.query['isDefault'] === 'false'
          ? false
          : undefined;
    const limit = req.query['limit'] ? parseInt(req.query['limit'] as string) : undefined;

    const baselines = await varianceTrackingService.baselines.getBaselines(fundId, {
      ...(baselineType && { baselineType }),
      ...(isDefault !== undefined && { isDefault }),
      ...(limit && { limit }),
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

      await varianceTrackingService.baselines.setDefaultBaseline(baselineId, fundId);

      res['json']({
        success: true,
        message: 'Default baseline updated successfully',
      });
    } catch (error) {
      console.error('Set default baseline error:', error);
      const apiError: ApiError = {
        error: 'Failed to set default baseline',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      res['status'](500)['json'](apiError);
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

      const validation = CreateVarianceReportSchema.safeParse(req.body);
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

    const validation = CreateAlertRuleSchema.safeParse(req.body);
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
    const severity = req.query['severity']
      ? (req.query['severity'] as string).split(',')
      : undefined;
    const category = req.query['category']
      ? (req.query['category'] as string).split(',')
      : undefined;
    const limit = req.query['limit'] ? parseInt(req.query['limit'] as string) : undefined;

    const alerts = await varianceTrackingService.alerts.getActiveAlerts(fundId, {
      ...(severity && { severity }),
      ...(category && { category }),
      ...(limit && { limit }),
    });

    res['json']({
      success: true,
      data: alerts,
      count: alerts.length,
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

    const validation = AlertActionSchema.safeParse(req.body);
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

    const validation = AlertActionSchema.safeParse(req.body);
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

      const validation = VarianceAnalysisSchema.safeParse(req.body);
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

      const result = await varianceTrackingService.performCompleteVarianceAnalysis({
        fundId,
        ...(data.baselineId && { baselineId: data.baselineId }),
        ...(data.reportName && { reportName: data.reportName }),
        userId,
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
      varianceTrackingService.alerts.getActiveAlerts(fundId, { limit: 10 }),
      varianceTrackingService.calculations.getVarianceReports(fundId, { limit: 1 }),
    ]);

    const defaultBaseline = baselines.find((b) => b.isDefault);
    const latestReport = latestReports[0];

    res['json']({
      success: true,
      data: {
        defaultBaseline,
        recentBaselines: baselines.slice(0, 3),
        activeAlerts,
        alertsByseverity: {
          critical: activeAlerts.filter((a) => a.severity === 'critical').length,
          warning: activeAlerts.filter((a) => a.severity === 'warning').length,
          info: activeAlerts.filter((a) => a.severity === 'info').length,
        },
        summary: {
          totalBaselines: baselines.length,
          totalActiveAlerts: activeAlerts.length,
          lastAnalysisDate: latestReport?.createdAt ?? null,
        },
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
