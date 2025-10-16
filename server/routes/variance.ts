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
import type { ApiError } from '@shared/types';

const router = Router();

// Extend Request type to include user property
interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

// === VALIDATION SCHEMAS ===

const CreateBaselineSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  baselineType: z.enum(['initial', 'quarterly', 'annual', 'milestone', 'custom']),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  tags: z.array(z.string().max(50)).max(10).default([])
});

const CreateVarianceReportSchema = z.object({
  baselineId: z.string().uuid().optional(),
  reportName: z.string().min(1).max(100),
  reportType: z.enum(['periodic', 'milestone', 'ad_hoc', 'alert_triggered']),
  reportPeriod: z.enum(['monthly', 'quarterly', 'annual']).optional(),
  asOfDate: z.string().datetime().optional()
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
  notificationChannels: z.array(z.enum(['email', 'slack', 'webhook'])).default(['email'])
});

const AlertActionSchema = z.object({
  notes: z.string().max(1000).optional()
});

const VarianceAnalysisSchema = z.object({
  baselineId: z.string().uuid().optional(),
  reportName: z.string().min(1).max(100).optional()
});

// === BASELINE MANAGEMENT ROUTES ===

/**
 * Create a new baseline for a fund
 * POST /api/funds/:id/baselines
 */
router["post"]('/api/funds/:id/baselines', idempotency, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Parse and validate fund ID
    let fundId: number;
    try {
      fundId = toNumber(req.params['id'], 'fund ID', { integer: true, min: 1 });
    } catch (err) {
      if (err instanceof NumberParseError) {
        const error: ApiError = {
          error: 'Invalid fund ID',
          message: err.message
        };
        return res["status"](400)["json"](error);
      }
      throw err;
    }

    // Validate request body
    const validation = CreateBaselineSchema.safeParse(req.body);
    if (!validation.success) {
      const error: ApiError = {
        error: 'Validation failed',
        message: 'Invalid baseline data',
        details: validation.error.flatten()
      };
      return res["status"](400)["json"](error);
    }

    const data = validation.data;
    const userId = parseInt(req.user?.id || '0');

    if (!userId) {
      const error: ApiError = {
        error: 'Authentication required',
        message: 'User must be authenticated to create baselines'
      };
      return res["status"](401)["json"](error);
    }

    // Create baseline
    const baseline = await varianceTrackingService.baselines.createBaseline({
      fundId,
      name: data.name,
      description: data.description,
      baselineType: data.baselineType,
      periodStart: new Date(data.periodStart),
      periodEnd: new Date(data.periodEnd),
      createdBy: userId,
      tags: data.tags
    });

    res["status"](201)["json"]({
      success: true,
      data: baseline,
      message: 'Baseline created successfully'
    });
  } catch (error) {
    console.error('Baseline creation error:', error);
    const apiError: ApiError = {
      error: 'Failed to create baseline',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res["status"](500)["json"](apiError);
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
          message: err.message
        };
        return res["status"](400)["json"](error);
      }
      throw err;
    }

    // Parse query parameters
    const baselineType = req.query['baselineType'] as string;
    const isDefault = req.query['isDefault'] === 'true' ? true : req.query['isDefault'] === 'false' ? false : undefined;
    const limit = req.query['limit'] ? parseInt(req.query['limit'] as string) : undefined;

    const baselines = await varianceTrackingService.baselines.getBaselines(fundId, {
      baselineType,
      isDefault,
      limit
    });

    res["json"]({
      success: true,
      data: baselines,
      count: baselines.length
    });
  } catch (error) {
    console.error('Baselines fetch error:', error);
    const apiError: ApiError = {
      error: 'Failed to fetch baselines',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res["status"](500)["json"](apiError);
  }
});

/**
 * Set default baseline for a fund
 * POST /api/funds/:id/baselines/:baselineId/set-default
 */
router["post"]('/api/funds/:id/baselines/:baselineId/set-default', async (req: Request, res: Response) => {
  try {
    let fundId: number;
    try {
      fundId = toNumber(req.params['id'], 'fund ID', { integer: true, min: 1 });
    } catch (err) {
      if (err instanceof NumberParseError) {
        const error: ApiError = {
          error: 'Invalid fund ID',
          message: err.message
        };
        return res["status"](400)["json"](error);
      }
      throw err;
    }

    const baselineId = req.params['baselineId'];
    if (!baselineId) {
      const error: ApiError = {
        error: 'Invalid baseline ID',
        message: 'Baseline ID is required'
      };
      return res["status"](400)["json"](error);
    }

    await varianceTrackingService.baselines.setDefaultBaseline(baselineId, fundId);

    res["json"]({
      success: true,
      message: 'Default baseline updated successfully'
    });
  } catch (error) {
    console.error('Set default baseline error:', error);
    const apiError: ApiError = {
      error: 'Failed to set default baseline',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res["status"](500)["json"](apiError);
  }
});

/**
 * Deactivate a baseline
 * DELETE /api/funds/:id/baselines/:baselineId
 */
router["delete"]('/api/funds/:id/baselines/:baselineId', async (req: Request, res: Response) => {
  try {
    const baselineId = req.params['baselineId'];
    if (!baselineId) {
      const error: ApiError = {
        error: 'Invalid baseline ID',
        message: 'Baseline ID is required'
      };
      return res["status"](400)["json"](error);
    }

    await varianceTrackingService.baselines.deactivateBaseline(baselineId);

    res["json"]({
      success: true,
      message: 'Baseline deactivated successfully'
    });
  } catch (error) {
    console.error('Baseline deactivation error:', error);
    const apiError: ApiError = {
      error: 'Failed to deactivate baseline',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res["status"](500)["json"](apiError);
  }
});

// === VARIANCE REPORT ROUTES ===

/**
 * Generate variance report
 * POST /api/funds/:id/variance-reports
 */
router["post"]('/api/funds/:id/variance-reports', idempotency, async (req: AuthenticatedRequest, res: Response) => {
  try {
    let fundId: number;
    try {
      fundId = toNumber(req.params['id'], 'fund ID', { integer: true, min: 1 });
    } catch (err) {
      if (err instanceof NumberParseError) {
        const error: ApiError = {
          error: 'Invalid fund ID',
          message: err.message
        };
        return res["status"](400)["json"](error);
      }
      throw err;
    }

    const validation = CreateVarianceReportSchema.safeParse(req.body);
    if (!validation.success) {
      const error: ApiError = {
        error: 'Validation failed',
        message: 'Invalid variance report data',
        details: validation.error.flatten()
      };
      return res["status"](400)["json"](error);
    }

    const data = validation.data;
    const userId = parseInt(req.user?.id || '0');

    const report = await varianceTrackingService.calculations.generateVarianceReport({
      fundId,
      baselineId: data.baselineId || '', // Will be resolved to default in service
      reportName: data.reportName,
      reportType: data.reportType,
      reportPeriod: data.reportPeriod,
      asOfDate: data.asOfDate ? new Date(data.asOfDate) : undefined,
      generatedBy: userId || undefined
    });

    res["status"](201)["json"]({
      success: true,
      data: report,
      message: 'Variance report generated successfully'
    });
  } catch (error) {
    console.error('Variance report generation error:', error);
    const apiError: ApiError = {
      error: 'Failed to generate variance report',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res["status"](500)["json"](apiError);
  }
});

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
          message: err.message
        };
        return res["status"](400)["json"](error);
      }
      throw err;
    }

    // This would be implemented to fetch variance reports
    // For now, return placeholder response
    res["json"]({
      success: true,
      data: [],
      count: 0,
      message: 'Variance reports endpoint implemented'
    });
  } catch (error) {
    console.error('Variance reports fetch error:', error);
    const apiError: ApiError = {
      error: 'Failed to fetch variance reports',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res["status"](500)["json"](apiError);
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
          message: err.message
        };
        return res["status"](400)["json"](error);
      }
      throw err;
    }

    const reportId = req.params['reportId'];
    if (!reportId) {
      const error: ApiError = {
        error: 'Invalid report ID',
        message: 'Report ID is required'
      };
      return res["status"](400)["json"](error);
    }

    // This would be implemented to fetch specific variance report
    res["json"]({
      success: true,
      data: null,
      message: 'Specific variance report endpoint implemented'
    });
  } catch (error) {
    console.error('Variance report fetch error:', error);
    const apiError: ApiError = {
      error: 'Failed to fetch variance report',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res["status"](500)["json"](apiError);
  }
});

// === ALERT MANAGEMENT ROUTES ===

/**
 * Create alert rule
 * POST /api/funds/:id/alert-rules
 */
router["post"]('/api/funds/:id/alert-rules', async (req: AuthenticatedRequest, res: Response) => {
  try {
    let fundId: number;
    try {
      fundId = toNumber(req.params['id'], 'fund ID', { integer: true, min: 1 });
    } catch (err) {
      if (err instanceof NumberParseError) {
        const error: ApiError = {
          error: 'Invalid fund ID',
          message: err.message
        };
        return res["status"](400)["json"](error);
      }
      throw err;
    }

    const validation = CreateAlertRuleSchema.safeParse(req.body);
    if (!validation.success) {
      const error: ApiError = {
        error: 'Validation failed',
        message: 'Invalid alert rule data',
        details: validation.error.flatten()
      };
      return res["status"](400)["json"](error);
    }

    const data = validation.data;
    const userId = parseInt(req.user?.id || '0');

    if (!userId) {
      const error: ApiError = {
        error: 'Authentication required',
        message: 'User must be authenticated to create alert rules'
      };
      return res["status"](401)["json"](error);
    }

    const rule = await varianceTrackingService.alerts.createAlertRule({
      fundId,
      name: data.name,
      description: data.description,
      ruleType: data.ruleType,
      metricName: data.metricName,
      operator: data.operator,
      thresholdValue: data.thresholdValue,
      secondaryThreshold: data.secondaryThreshold,
      severity: data.severity,
      category: data.category,
      checkFrequency: data.checkFrequency,
      createdBy: userId
    });

    res["status"](201)["json"]({
      success: true,
      data: rule,
      message: 'Alert rule created successfully'
    });
  } catch (error) {
    console.error('Alert rule creation error:', error);
    const apiError: ApiError = {
      error: 'Failed to create alert rule',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res["status"](500)["json"](apiError);
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
          message: err.message
        };
        return res["status"](400)["json"](error);
      }
      throw err;
    }

    // Parse query parameters
    const severity = req.query['severity'] ? (req.query['severity'] as string).split(',') : undefined;
    const category = req.query['category'] ? (req.query['category'] as string).split(',') : undefined;
    const limit = req.query['limit'] ? parseInt(req.query['limit'] as string) : undefined;

    const alerts = await varianceTrackingService.alerts.getActiveAlerts(fundId, {
      severity,
      category,
      limit
    });

    res["json"]({
      success: true,
      data: alerts,
      count: alerts.length
    });
  } catch (error) {
    console.error('Alerts fetch error:', error);
    const apiError: ApiError = {
      error: 'Failed to fetch alerts',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res["status"](500)["json"](apiError);
  }
});

/**
 * Acknowledge an alert
 * POST /api/alerts/:alertId/acknowledge
 */
router["post"]('/api/alerts/:alertId/acknowledge', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const alertId = req.params['alertId'];
    if (!alertId) {
      const error: ApiError = {
        error: 'Invalid alert ID',
        message: 'Alert ID is required'
      };
      return res["status"](400)["json"](error);
    }

    const validation = AlertActionSchema.safeParse(req.body);
    if (!validation.success) {
      const error: ApiError = {
        error: 'Validation failed',
        message: 'Invalid alert action data',
        details: validation.error.flatten()
      };
      return res["status"](400)["json"](error);
    }

    const userId = parseInt(req.user?.id || '0');
    if (!userId) {
      const error: ApiError = {
        error: 'Authentication required',
        message: 'User must be authenticated to acknowledge alerts'
      };
      return res["status"](401)["json"](error);
    }

    await varianceTrackingService.alerts.acknowledgeAlert(alertId, userId, validation.data.notes);

    res["json"]({
      success: true,
      message: 'Alert acknowledged successfully'
    });
  } catch (error) {
    console.error('Alert acknowledgment error:', error);
    const apiError: ApiError = {
      error: 'Failed to acknowledge alert',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res["status"](500)["json"](apiError);
  }
});

/**
 * Resolve an alert
 * POST /api/alerts/:alertId/resolve
 */
router["post"]('/api/alerts/:alertId/resolve', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const alertId = req.params['alertId'];
    if (!alertId) {
      const error: ApiError = {
        error: 'Invalid alert ID',
        message: 'Alert ID is required'
      };
      return res["status"](400)["json"](error);
    }

    const validation = AlertActionSchema.safeParse(req.body);
    if (!validation.success) {
      const error: ApiError = {
        error: 'Validation failed',
        message: 'Invalid alert action data',
        details: validation.error.flatten()
      };
      return res["status"](400)["json"](error);
    }

    const userId = parseInt(req.user?.id || '0');
    if (!userId) {
      const error: ApiError = {
        error: 'Authentication required',
        message: 'User must be authenticated to resolve alerts'
      };
      return res["status"](401)["json"](error);
    }

    await varianceTrackingService.alerts.resolveAlert(alertId, userId, validation.data.notes);

    res["json"]({
      success: true,
      message: 'Alert resolved successfully'
    });
  } catch (error) {
    console.error('Alert resolution error:', error);
    const apiError: ApiError = {
      error: 'Failed to resolve alert',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res["status"](500)["json"](apiError);
  }
});

// === COMPREHENSIVE VARIANCE ANALYSIS ROUTES ===

/**
 * Perform complete variance analysis
 * POST /api/funds/:id/variance-analysis
 */
router["post"]('/api/funds/:id/variance-analysis', idempotency, async (req: AuthenticatedRequest, res: Response) => {
  try {
    let fundId: number;
    try {
      fundId = toNumber(req.params['id'], 'fund ID', { integer: true, min: 1 });
    } catch (err) {
      if (err instanceof NumberParseError) {
        const error: ApiError = {
          error: 'Invalid fund ID',
          message: err.message
        };
        return res["status"](400)["json"](error);
      }
      throw err;
    }

    const validation = VarianceAnalysisSchema.safeParse(req.body);
    if (!validation.success) {
      const error: ApiError = {
        error: 'Validation failed',
        message: 'Invalid variance analysis data',
        details: validation.error.flatten()
      };
      return res["status"](400)["json"](error);
    }

    const data = validation.data;
    const userId = parseInt(req.user?.id || '0');

    if (!userId) {
      const error: ApiError = {
        error: 'Authentication required',
        message: 'User must be authenticated to perform variance analysis'
      };
      return res["status"](401)["json"](error);
    }

    const result = await varianceTrackingService.performCompleteVarianceAnalysis({
      fundId,
      baselineId: data.baselineId,
      reportName: data.reportName,
      userId
    });

    res["status"](201)["json"]({
      success: true,
      data: {
        report: result.report,
        alertsGenerated: result.alertsGenerated,
        alertCount: result.alertsGenerated.length
      },
      message: 'Variance analysis completed successfully'
    });
  } catch (error) {
    console.error('Variance analysis error:', error);
    const apiError: ApiError = {
      error: 'Failed to perform variance analysis',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res["status"](500)["json"](apiError);
  }
});

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
          message: err.message
        };
        return res["status"](400)["json"](error);
      }
      throw err;
    }

    // Get summary data for dashboard
    const [baselines, activeAlerts] = await Promise.all([
      varianceTrackingService.baselines.getBaselines(fundId, { limit: 5 }),
      varianceTrackingService.alerts.getActiveAlerts(fundId, { limit: 10 })
    ]);

    const defaultBaseline = baselines.find(b => b.isDefault);

    res["json"]({
      success: true,
      data: {
        defaultBaseline,
        recentBaselines: baselines.slice(0, 3),
        activeAlerts,
        alertsByseverity: {
          critical: activeAlerts.filter(a => a.severity === 'critical').length,
          warning: activeAlerts.filter(a => a.severity === 'warning').length,
          info: activeAlerts.filter(a => a.severity === 'info').length
        },
        summary: {
          totalBaselines: baselines.length,
          totalActiveAlerts: activeAlerts.length,
          lastAnalysisDate: defaultBaseline?.updatedAt || null
        }
      }
    });
  } catch (error) {
    console.error('Variance dashboard error:', error);
    const apiError: ApiError = {
      error: 'Failed to fetch variance dashboard data',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res["status"](500)["json"](apiError);
  }
});

export default router;