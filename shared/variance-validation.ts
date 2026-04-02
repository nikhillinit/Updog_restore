/**
 * Variance Tracking Validation Schemas
 *
 * Comprehensive Zod validation schemas for variance tracking API endpoints,
 * request/response validation, and type safety.
 */

import { z } from 'zod';
import { positiveInt } from './schema-helpers';
import type { Request, Response, NextFunction } from 'express';

// Note: Removed unsafe Express.Request.validatedBody augmentation
// Use typed ValidatedRequest<T> pattern instead

/**
 * Type helper for routes that use validation middleware
 */
export type ValidatedRequest<T extends z.ZodTypeAny> = Request & {
  validated: z.infer<T>;
};

// === CORE VALIDATION HELPERS ===

/**
 * UUID validation schema
 */
export const uuidSchema = z.string().uuid();

/**
 * Timestamp validation schema
 */
export const timestampSchema = z.string().datetime();

/**
 * Non-negative decimal string validation (for stored metric fields)
 */
export const decimalSchema = z.string().regex(/^\d+(\.\d{1,4})?$/);

/**
 * Signed decimal string validation (for variances, thresholds, and deltas)
 */
export const signedDecimalSchema = z.string().regex(/^-?\d+(\.\d{1,4})?$/);

export const arbitraryRecordSchema = z.record(z.string(), z.any());

/**
 * Severity levels for alerts
 */
export const severitySchema = z.enum(['info', 'warning', 'critical', 'urgent']);

/**
 * Alert categories
 */
export const categorySchema = z.enum(['performance', 'risk', 'operational', 'compliance']);

/**
 * Baseline types
 */
export const baselineTypeSchema = z.enum(['initial', 'quarterly', 'annual', 'milestone', 'custom']);

/**
 * Report types
 */
export const reportTypeSchema = z.enum(['periodic', 'milestone', 'ad_hoc', 'alert_triggered']);

/**
 * Alert rule types
 */
export const ruleTypeSchema = z.enum(['threshold', 'trend', 'deviation', 'pattern']);

/**
 * Comparison operators
 */
export const operatorSchema = z.enum(['gt', 'lt', 'eq', 'gte', 'lte', 'between']);

/**
 * Check frequencies
 */
export const checkFrequencySchema = z.enum(['realtime', 'hourly', 'daily', 'weekly']);

/**
 * Notification channels
 */
export const notificationChannelSchema = z.enum(['email', 'slack', 'webhook']);

// === BASELINE SCHEMAS ===

/**
 * Create baseline request schema
 */
export const CreateBaselineRequestSchema = z
  .object({
    name: z
      .string()
      .min(1, 'Baseline name is required')
      .max(100, 'Baseline name must be 100 characters or less'),
    description: z.string().max(500, 'Description must be 500 characters or less').optional(),
    baselineType: baselineTypeSchema,
    periodStart: timestampSchema,
    periodEnd: timestampSchema,
    tags: z
      .array(z.string().max(50, 'Tag must be 50 characters or less'))
      .max(10, 'Maximum 10 tags allowed')
      .default([]),
  })
  .refine(
    (data) => {
      const start = new Date(data.periodStart);
      const end = new Date(data.periodEnd);
      return end > start;
    },
    {
      message: 'Period end must be after period start',
      path: ['periodEnd'],
    }
  );

/**
 * Baseline response schema
 */
export const BaselineResponseSchema = z.object({
  id: uuidSchema,
  fundId: positiveInt(),
  name: z.string(),
  description: z.string().nullable(),
  baselineType: baselineTypeSchema,
  periodStart: timestampSchema,
  periodEnd: timestampSchema,
  snapshotDate: timestampSchema,
  totalValue: decimalSchema,
  deployedCapital: decimalSchema,
  irr: decimalSchema.nullable(),
  multiple: decimalSchema.nullable(),
  dpi: decimalSchema.nullable(),
  tvpi: decimalSchema.nullable(),
  portfolioCount: z.number().int().min(0),
  averageInvestment: decimalSchema.nullable(),
  topPerformers: z.any(), // JSON data
  companySnapshots: z
    .array(
      z.object({
        portfolioCompanyId: positiveInt(),
        companyId: positiveInt(),
        companyName: z.string(),
        sector: z.string(),
        stage: z.string().nullable(),
        status: z.string().nullable(),
        investedCapital: decimalSchema.nullable(),
        currentValuation: decimalSchema.nullable(),
      })
    )
    .nullable()
    .optional(),
  sectorDistribution: z.any(), // JSON data
  stageDistribution: z.any(), // JSON data
  reserveAllocation: z.any(), // JSON data
  pacingMetrics: z.any(), // JSON data
  isActive: z.boolean(),
  isDefault: z.boolean(),
  confidence: decimalSchema,
  version: z.string(),
  parentBaselineId: uuidSchema.nullable(),
  sourceSnapshotId: uuidSchema.nullable(),
  sourceRunId: positiveInt().nullable(),
  createdBy: positiveInt(),
  approvedBy: positiveInt().nullable(),
  tags: z.array(z.string()),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

/**
 * Get baselines query parameters schema
 */
export const GetBaselinesQuerySchema = z.object({
  baselineType: baselineTypeSchema.optional(),
  isDefault: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  limit: z
    .string()
    .regex(/^\d+$/, 'Limit must be a positive integer')
    .transform((val) => parseInt(val))
    .refine((val) => val > 0 && val <= 100, 'Limit must be between 1 and 100')
    .optional(),
});

// === VARIANCE REPORT SCHEMAS ===

/**
 * Create variance report request schema
 */
export const CreateVarianceReportRequestSchema = z.object({
  baselineId: uuidSchema.optional(),
  reportName: z
    .string()
    .min(1, 'Report name is required')
    .max(100, 'Report name must be 100 characters or less'),
  reportType: reportTypeSchema,
  reportPeriod: z.enum(['monthly', 'quarterly', 'annual']).optional(),
  asOfDate: timestampSchema.optional(),
});

/**
 * Variance calculation schema
 */
export const VarianceCalculationSchema = z.object({
  totalValueVariance: signedDecimalSchema.nullable(),
  totalValueVariancePct: signedDecimalSchema.nullable(),
  irrVariance: signedDecimalSchema.nullable(),
  multipleVariance: signedDecimalSchema.nullable(),
  dpiVariance: signedDecimalSchema.nullable(),
  tvpiVariance: signedDecimalSchema.nullable(),
});

export const DistributionVarianceRowSchema = z.object({
  current: z.number(),
  baseline: z.number(),
  delta: z.number(),
  deltaPct: z.number().nullable(),
  currentCountShare: z.number(),
  baselineCountShare: z.number(),
  countShareDelta: z.number(),
  countShareDeltaPct: z.number().nullable(),
});

export const NumericMetricDeltaSchema = z.object({
  current: z.number(),
  baseline: z.number(),
  delta: z.number(),
  deltaPct: z.number().nullable(),
});

export const UntypedMetricChangeSchema = z.object({
  current: z.any().nullable(),
  baseline: z.any().nullable(),
});

export const CompanyVarianceRowSchema = z.object({
  companyId: positiveInt(),
  companyName: z.string(),
  sector: z.string().optional(),
  stage: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  changeType: z.enum(['matched', 'added', 'removed']).optional(),
  baselineValuation: signedDecimalSchema.nullable().optional(),
  currentValuation: signedDecimalSchema.nullable().optional(),
  baselineInvestedCapital: signedDecimalSchema.nullable().optional(),
  currentInvestedCapital: signedDecimalSchema.nullable().optional(),
  // Temporary compatibility alias. Prefer valuationVariance* for new consumers.
  valuationChange: signedDecimalSchema.nullable().optional(),
  valuationChangePct: signedDecimalSchema.nullable().optional(),
  valuationVariance: signedDecimalSchema.nullable(),
  valuationVariancePct: signedDecimalSchema.nullable(),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
});

/**
 * Portfolio variance schema
 */
export const PortfolioVarianceSchema = z.object({
  companyVariances: z.array(CompanyVarianceRowSchema),
  sectorVariances: z.record(z.string(), DistributionVarianceRowSchema),
  stageVariances: z.record(z.string(), DistributionVarianceRowSchema),
  portfolioCountVariance: z.number().int(),
});

export const ReserveVarianceSchema = z.object({
  hasData: z.boolean(),
  currentReserves: arbitraryRecordSchema,
  baselineReserves: arbitraryRecordSchema,
  metricDeltas: z.record(z.string(), NumericMetricDeltaSchema),
  changes: z.record(z.string(), UntypedMetricChangeSchema),
});

export const PacingVarianceSchema = z.object({
  hasData: z.boolean(),
  currentPacing: arbitraryRecordSchema,
  baselinePacing: arbitraryRecordSchema,
  metricDeltas: z.record(z.string(), NumericMetricDeltaSchema),
  changes: z.record(z.string(), UntypedMetricChangeSchema),
});

/**
 * Variance insights schema
 */
export const VarianceInsightsSchema = z.object({
  overallScore: decimalSchema,
  significantVariances: z.array(
    z.object({
      metric: z.string(),
      variance: signedDecimalSchema,
      variancePct: signedDecimalSchema.nullable(),
      severity: z.enum(['low', 'medium', 'high', 'critical']),
    })
  ),
  factors: z.array(
    z.object({
      factor: z.string(),
      impact: z.enum(['positive', 'negative', 'neutral']),
      magnitude: decimalSchema,
    })
  ),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
});

/**
 * Variance report response schema
 */
export const VarianceReportResponseSchema = z.object({
  id: uuidSchema,
  fundId: positiveInt(),
  baselineId: uuidSchema,
  reportName: z.string(),
  reportType: reportTypeSchema,
  reportPeriod: z.string().nullable(),
  analysisStart: timestampSchema,
  analysisEnd: timestampSchema,
  asOfDate: timestampSchema,
  currentMetrics: z.any(),
  baselineMetrics: z.any(),
  ...VarianceCalculationSchema.shape,
  portfolioVariances: z.any(),
  sectorVariances: z.any(),
  stageVariances: z.any(),
  reserveVariances: z.any(),
  pacingVariances: z.any(),
  overallVarianceScore: decimalSchema.nullable(),
  significantVariances: z.any(),
  varianceFactors: z.any(),
  alertsTriggered: z.any(),
  thresholdBreaches: z.any(),
  riskLevel: z.string(),
  calculationEngine: z.string(),
  calculationDurationMs: z.number().int().nullable(),
  dataQualityScore: decimalSchema.nullable(),
  generatedBy: positiveInt().nullable(),
  reviewedBy: positiveInt().nullable(),
  approvedBy: positiveInt().nullable(),
  status: z.enum(['draft', 'pending_review', 'approved', 'archived']),
  isPublic: z.boolean(),
  sharedWith: z.array(z.string()),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const ClientVarianceMetricSchema = z.object({
  metric: z.string(),
  value: signedDecimalSchema.nullable(),
  pct: signedDecimalSchema.nullable(),
});

export const ClientVarianceSummarySchema = z.object({
  totalVariances: z.number().int().min(0),
  significantVariances: z.number().int().min(0),
  criticalVariances: z.number().int().min(0),
});

export const ClientPortfolioVarianceSchema = z.object({
  companyVariances: z.array(CompanyVarianceRowSchema),
  portfolioCountVariance: z.number().int(),
});

export const VarianceReportClientResponseSchema = z.object({
  id: uuidSchema,
  fundId: positiveInt(),
  baselineId: uuidSchema,
  reportName: z.string(),
  reportType: reportTypeSchema,
  reportPeriod: z.enum(['monthly', 'quarterly', 'annual']).optional(),
  asOfDate: timestampSchema,
  generatedBy: positiveInt().optional(),
  generatedAt: timestampSchema,
  summary: ClientVarianceSummarySchema,
  variances: z.array(ClientVarianceMetricSchema),
  portfolioVariances: ClientPortfolioVarianceSchema.optional(),
  sectorVariances: z.record(z.string(), DistributionVarianceRowSchema).optional(),
  stageVariances: z.record(z.string(), DistributionVarianceRowSchema).optional(),
  reserveVariances: ReserveVarianceSchema.optional(),
  pacingVariances: PacingVarianceSchema.optional(),
});

// === ALERT SCHEMAS ===

/**
 * Create alert rule request schema
 */
export const CreateAlertRuleRequestSchema = z
  .object({
    name: z
      .string()
      .min(1, 'Alert rule name is required')
      .max(100, 'Alert rule name must be 100 characters or less'),
    description: z.string().max(500, 'Description must be 500 characters or less').optional(),
    ruleType: ruleTypeSchema,
    metricName: z
      .string()
      .min(1, 'Metric name is required')
      .max(50, 'Metric name must be 50 characters or less'),
    operator: operatorSchema,
    thresholdValue: z.number(),
    secondaryThreshold: z.number().optional(),
    severity: severitySchema.default('warning'),
    category: categorySchema.default('performance'),
    checkFrequency: checkFrequencySchema.default('daily'),
    suppressionPeriod: positiveInt()
      .min(1, 'Suppression period must be at least 1 minute')
      .max(10080, 'Suppression period cannot exceed 1 week (10080 minutes)')
      .default(60),
    notificationChannels: z
      .array(notificationChannelSchema)
      .min(1, 'At least one notification channel required')
      .default(['email']),
    escalationRules: z.any().optional(),
    conditions: z.any().optional(),
    filters: z.any().optional(),
  })
  .refine(
    (data) => {
      if (data.operator === 'between' && !data.secondaryThreshold) {
        return false;
      }
      return true;
    },
    {
      message: 'Secondary threshold is required for "between" operator',
      path: ['secondaryThreshold'],
    }
  );

/**
 * Alert rule response schema
 */
export const AlertRuleResponseSchema = z.object({
  id: uuidSchema,
  fundId: positiveInt().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  ruleType: ruleTypeSchema,
  metricName: z.string(),
  operator: operatorSchema,
  thresholdValue: signedDecimalSchema.nullable(),
  secondaryThreshold: signedDecimalSchema.nullable(),
  severity: severitySchema,
  category: categorySchema,
  isEnabled: z.boolean(),
  checkFrequency: checkFrequencySchema,
  suppressionPeriod: z.number().int(),
  escalationRules: z.any(),
  notificationChannels: z.array(z.string()),
  conditions: z.any(),
  filters: z.any(),
  createdBy: positiveInt(),
  lastModifiedBy: positiveInt().nullable(),
  version: z.string(),
  lastTriggered: timestampSchema.nullable(),
  triggerCount: z.number().int(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

/**
 * Performance alert response schema
 */
export const PerformanceAlertResponseSchema = z.object({
  id: uuidSchema,
  fundId: positiveInt(),
  baselineId: uuidSchema.nullable(),
  varianceReportId: uuidSchema.nullable(),
  alertType: z.string(),
  severity: severitySchema,
  category: categorySchema,
  title: z.string(),
  description: z.string(),
  recommendations: z.any(),
  metricName: z.string(),
  thresholdValue: signedDecimalSchema.nullable(),
  actualValue: signedDecimalSchema.nullable(),
  varianceAmount: signedDecimalSchema.nullable(),
  variancePercentage: signedDecimalSchema.nullable(),
  triggeredAt: timestampSchema,
  firstOccurrence: timestampSchema.nullable(),
  lastOccurrence: timestampSchema.nullable(),
  occurrenceCount: z.number().int(),
  status: z.enum(['active', 'acknowledged', 'investigating', 'resolved', 'dismissed']),
  acknowledgedBy: positiveInt().nullable(),
  acknowledgedAt: timestampSchema.nullable(),
  resolvedBy: positiveInt().nullable(),
  resolvedAt: timestampSchema.nullable(),
  resolutionNotes: z.string().nullable(),
  affectedEntities: z.any(),
  contextData: z.any(),
  notificationsSent: z.any(),
  escalationLevel: z.number().int(),
  escalatedAt: timestampSchema.nullable(),
  escalatedTo: z.array(z.string()),
  ruleId: uuidSchema.nullable(),
  ruleVersion: z.string().nullable(),
  detectionLatency: z.number().int().nullable(),
  processingTime: z.number().int().nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const ClientAlertResponseSchema = z.object({
  id: uuidSchema,
  fundId: positiveInt(),
  ruleId: uuidSchema.nullable().optional(),
  ruleName: z.string(),
  severity: severitySchema,
  category: categorySchema,
  message: z.string(),
  details: arbitraryRecordSchema,
  status: z.enum(['active', 'acknowledged', 'investigating', 'resolved', 'dismissed']),
  triggeredAt: timestampSchema,
  acknowledgedAt: timestampSchema.nullable().optional(),
  acknowledgedBy: positiveInt().nullable().optional(),
  resolvedAt: timestampSchema.nullable().optional(),
  resolvedBy: positiveInt().nullable().optional(),
  notes: z.string().nullable().optional(),
});

/**
 * Alert action request schema
 */
export const AlertActionRequestSchema = z.object({
  notes: z.string().max(1000, 'Notes must be 1000 characters or less').optional(),
});

/**
 * Get alerts query parameters schema
 */
export const GetAlertsQuerySchema = z.object({
  severity: z
    .string()
    .transform((val) => val.split(','))
    .pipe(z.array(severitySchema))
    .optional(),
  category: z
    .string()
    .transform((val) => val.split(','))
    .pipe(z.array(categorySchema))
    .optional(),
  status: z
    .string()
    .transform((val) => val.split(','))
    .pipe(z.array(z.enum(['active', 'acknowledged', 'investigating', 'resolved', 'dismissed'])))
    .optional(),
  limit: z
    .string()
    .regex(/^\d+$/, 'Limit must be a positive integer')
    .transform((val) => parseInt(val))
    .refine((val) => val > 0 && val <= 100, 'Limit must be between 1 and 100')
    .optional(),
});

// === ANALYSIS SCHEMAS ===

/**
 * Variance analysis request schema
 */
export const VarianceAnalysisRequestSchema = z.object({
  baselineId: uuidSchema.optional(),
  reportName: z
    .string()
    .min(1, 'Report name is required')
    .max(100, 'Report name must be 100 characters or less')
    .optional(),
  includeAlertGeneration: z.boolean().default(true),
  analysisDepth: z.enum(['summary', 'detailed', 'comprehensive']).default('detailed'),
});

/**
 * Variance analysis response schema
 */
export const VarianceAnalysisResponseSchema = z.object({
  report: VarianceReportResponseSchema,
  alertsGenerated: z.array(PerformanceAlertResponseSchema),
  alertCount: z.number().int().min(0),
  analysisMetadata: z.object({
    analysisDepth: z.string(),
    processingTime: z.number().int(),
    dataQuality: decimalSchema,
    recommendedActions: z.array(z.string()),
  }),
});

// === DASHBOARD SCHEMAS ===

/**
 * Variance dashboard response schema
 */
export const VarianceDashboardResponseSchema = z.object({
  defaultBaseline: BaselineResponseSchema.nullable(),
  recentBaselines: z.array(BaselineResponseSchema).max(5),
  activeAlerts: z.array(ClientAlertResponseSchema).max(10),
  alertsBySeverity: z.object({
    critical: z.number().int().min(0),
    warning: z.number().int().min(0),
    info: z.number().int().min(0),
    urgent: z.number().int().min(0),
  }),
  alertsByseverity: z
    .object({
      critical: z.number().int().min(0),
      warning: z.number().int().min(0),
      info: z.number().int().min(0),
      urgent: z.number().int().min(0),
    })
    .optional(),
  summary: z.object({
    totalBaselines: z.number().int().min(0),
    totalActiveAlerts: z.number().int().min(0),
    lastAnalysisDate: timestampSchema.nullable(),
    overallRiskLevel: z.enum(['low', 'medium', 'high', 'critical']),
    trendDirection: z.enum(['improving', 'stable', 'declining']),
  }),
  recentReports: z
    .array(
      z.object({
        id: uuidSchema,
        name: z.string(),
        riskLevel: z.string(),
        createdAt: timestampSchema,
        overallVarianceScore: decimalSchema.nullable(),
      })
    )
    .max(5),
});

// === API RESPONSE SCHEMAS ===

/**
 * Standard API success response schema
 */
export const ApiSuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    message: z.string().optional(),
    metadata: z.any().optional(),
  });

/**
 * Standard API error response schema
 */
export const ApiErrorResponseSchema = z.object({
  success: z.literal(false).optional(),
  error: z.string(),
  message: z.string(),
  details: z.any().optional(),
  code: z.string().optional(),
  timestamp: timestampSchema.optional(),
});

/**
 * Paginated response schema
 */
export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    success: z.literal(true),
    data: z.array(itemSchema),
    pagination: z.object({
      page: positiveInt(),
      limit: positiveInt(),
      total: z.number().int().min(0),
      totalPages: positiveInt(),
      hasNext: z.boolean(),
      hasPrev: z.boolean(),
    }),
    count: z.number().int().min(0),
  });

// === TYPE EXPORTS ===

export type CreateBaselineRequest = z.infer<typeof CreateBaselineRequestSchema>;
export type BaselineResponse = z.infer<typeof BaselineResponseSchema>;
export type GetBaselinesQuery = z.infer<typeof GetBaselinesQuerySchema>;

export type CreateVarianceReportRequest = z.infer<typeof CreateVarianceReportRequestSchema>;
export type VarianceReportResponse = z.infer<typeof VarianceReportResponseSchema>;
export type VarianceReportClientResponse = z.infer<typeof VarianceReportClientResponseSchema>;
export type VarianceCalculation = z.infer<typeof VarianceCalculationSchema>;
export type CompanyVarianceRow = z.infer<typeof CompanyVarianceRowSchema>;
export type PortfolioVariance = z.infer<typeof PortfolioVarianceSchema>;
export type ReserveVariance = z.infer<typeof ReserveVarianceSchema>;
export type PacingVariance = z.infer<typeof PacingVarianceSchema>;
export type VarianceInsights = z.infer<typeof VarianceInsightsSchema>;

export type CreateAlertRuleRequest = z.infer<typeof CreateAlertRuleRequestSchema>;
export type AlertRuleResponse = z.infer<typeof AlertRuleResponseSchema>;
export type PerformanceAlertResponse = z.infer<typeof PerformanceAlertResponseSchema>;
export type ClientAlertResponse = z.infer<typeof ClientAlertResponseSchema>;
export type AlertActionRequest = z.infer<typeof AlertActionRequestSchema>;
export type GetAlertsQuery = z.infer<typeof GetAlertsQuerySchema>;

export type VarianceAnalysisRequest = z.infer<typeof VarianceAnalysisRequestSchema>;
export type VarianceAnalysisResponse = z.infer<typeof VarianceAnalysisResponseSchema>;
export type VarianceDashboardResponse = z.infer<typeof VarianceDashboardResponseSchema>;

// === VALIDATION UTILITIES ===

/**
 * Validate fund ID parameter
 */
export const validateFundId = (id: string): number => {
  const parsed = parseInt(id);
  if (isNaN(parsed) || parsed < 1) {
    throw new Error('Invalid fund ID: must be a positive integer');
  }
  return parsed;
};

/**
 * Validate UUID parameter
 */
export const validateUuid = (id: string): string => {
  const result = uuidSchema.safeParse(id);
  if (!result.success) {
    throw new Error('Invalid UUID format');
  }
  return result.data;
};

/**
 * Validate date parameter
 */
export const validateDate = (dateString: string): Date => {
  const result = timestampSchema.safeParse(dateString);
  if (!result.success) {
    throw new Error('Invalid date format: must be ISO 8601 timestamp');
  }
  return new Date(result.data);
};

/**
 * Creates typed validation middleware that narrows request body type
 * @param schema - Zod schema to validate against
 * @returns Express middleware with type-safe validated body
 */
export const createValidationMiddleware = <T extends z.ZodTypeAny>(schema: T) => {
  type ValidatedData = z.infer<T>;

  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Request body validation failed',
        details: result.error.flatten(),
      });
    }
    // Attach validated data with proper typing
    // TypeScript will infer ValidatedData type in route handlers
    (req as Request & { validated: ValidatedData }).validated = result.data as ValidatedData;
    next();
  };
};
