/**
 * Scenario Comparison Tool Validation Schemas
 *
 * Zod schemas for scenario comparison API validation
 */

import { z } from 'zod';

// ============================================================================
// Enums
// ============================================================================

export const ComparisonTypeEnum = z.enum(['deal_level', 'portfolio_level', 'mixed']);
export const ComparisonStatusEnum = z.enum(['computing', 'ready', 'stale', 'error']);
export const DisplayLayoutEnum = z.enum(['side_by_side', 'stacked', 'grid']);
export const DeltaModeEnum = z.enum(['absolute', 'percentage', 'both']);
export const ColorSchemeEnum = z.enum(['traffic_light', 'heatmap', 'grayscale']);
export const AccessTypeEnum = z.enum(['view', 'refresh', 'export', 'share']);
export const ExportFormatEnum = z.enum(['csv', 'pdf', 'json', 'xlsx']);
export const MetricTrendEnum = z.enum(['higher_is_better', 'lower_is_better']);

export const ComparisonMetricEnum = z.enum([
  'moic',
  'irr',
  'tvpi',
  'dpi',
  'total_investment',
  'follow_ons',
  'exit_proceeds',
  'exit_valuation',
  'gross_multiple',
  'net_irr',
  'gross_irr',
  'total_to_lps',
  'projected_fund_value',
  'weighted_summary',
]);

// ============================================================================
// Common Schemas
// ============================================================================

const UUIDSchema = z.string().uuid();
const PositiveIntSchema = z.number().int().positive();

// ============================================================================
// Delta Configuration Schema
// ============================================================================

export const DeltaConfigSchema = z.object({
  showAbsolute: z.boolean().default(true),
  showPercentage: z.boolean().default(true),
  baselineScenarioId: z.string().uuid().nullable().default(null),
  highlightThreshold: z.number().min(0).max(1).default(0.1),
});

// ============================================================================
// Request Schemas
// ============================================================================

export const CreateComparisonRequestSchema = z.object({
  fundId: PositiveIntSchema,
  baseScenarioId: UUIDSchema,
  comparisonScenarioIds: z
    .array(UUIDSchema)
    .min(1, 'At least one comparison scenario required')
    .max(5, 'Maximum 5 comparison scenarios allowed'),
  comparisonType: ComparisonTypeEnum.optional().default('deal_level'),
  comparisonMetrics: z
    .array(ComparisonMetricEnum)
    .min(1, 'At least one metric required')
    .default(['moic', 'irr', 'weighted_summary']),
  weightScheme: z.record(z.string(), z.number().min(0)).optional(),
  includeDetails: z.boolean().default(false),
  comparisonName: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
});

export const ListComparisonsQuerySchema = z.object({
  fundId: z.coerce.number().int().positive(),
  status: ComparisonStatusEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const GetComparisonParamsSchema = z.object({
  comparisonId: UUIDSchema,
});

export const ExportComparisonQuerySchema = z.object({
  format: ExportFormatEnum,
  includeCharts: z.coerce.boolean().default(false),
  includeRawData: z.coerce.boolean().default(false),
});

// ============================================================================
// Saved Configuration Schemas
// ============================================================================

export const CreateSavedConfigRequestSchema = z.object({
  fundId: PositiveIntSchema,
  configName: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  scenarioIds: z
    .array(UUIDSchema)
    .min(2, 'At least 2 scenarios required')
    .max(6, 'Maximum 6 scenarios allowed'),
  scenarioTypes: z.record(UUIDSchema, z.enum(['deal', 'portfolio'])),
  displayLayout: DisplayLayoutEnum.default('side_by_side'),
  metricsToCompare: z.array(ComparisonMetricEnum).min(1),
  sortOrder: z.string().optional(),
  showDeltas: z.boolean().default(true),
  deltaMode: DeltaModeEnum.default('percentage'),
  baselineScenarioId: UUIDSchema.optional(),
  highlightThreshold: z.number().min(0).max(1).default(0.1),
  colorScheme: ColorSchemeEnum.default('traffic_light'),
  betterWorseIndicators: z.boolean().default(true),
  isPublic: z.boolean().default(false),
  sharedWith: z.array(z.string()).default([]),
});

export const UpdateSavedConfigRequestSchema = CreateSavedConfigRequestSchema.partial().extend({
  version: z.number().int().positive(), // Required for optimistic locking
});

export const ListSavedConfigsQuerySchema = z.object({
  fundId: z.coerce.number().int().positive(),
  includePublic: z.coerce.boolean().default(true),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ============================================================================
// Response Schemas
// ============================================================================

export const WeightedSummarySchema = z.object({
  moic: z.number().nullable(),
  investment: z.number(),
  follow_ons: z.number(),
  exit_proceeds: z.number(),
  exit_valuation: z.number(),
  months_to_exit: z.number().optional(),
});

export const ScenarioSnapshotSchema = z.object({
  id: UUIDSchema,
  name: z.string(),
  scenarioType: z.string(),
  isBase: z.boolean(),
  weightedSummary: WeightedSummarySchema.optional(),
  caseCount: z.number().int().optional(),
  lastUpdated: z.string().datetime().optional(),
});

export const DeltaMetricSchema = z.object({
  metricName: ComparisonMetricEnum,
  displayName: z.string(),
  scenarioId: UUIDSchema,
  baseValue: z.number(),
  comparisonValue: z.number(),
  absoluteDelta: z.number(),
  percentageDelta: z.number().nullable(),
  weightedDelta: z.number().optional(),
  isBetter: z.boolean(),
  trend: MetricTrendEnum,
});

export const AggregateSummarySchema = z.object({
  totalScenariosCompared: z.number().int(),
  metricsComputed: z.array(ComparisonMetricEnum),
  averageAbsoluteDelta: z.number(),
  maxAbsoluteDelta: z.number(),
  minAbsoluteDelta: z.number(),
  deltaDistribution: z.record(z.string(), z.number()).optional(),
});

export const ComparisonResultsSchema = z.object({
  deltaMetrics: z.array(DeltaMetricSchema),
  scenarios: z.array(ScenarioSnapshotSchema),
  aggregateSummary: AggregateSummarySchema.optional(),
  computedAt: z.string().datetime(),
});

export const ComparisonResponseSchema = z.object({
  id: UUIDSchema,
  fundId: PositiveIntSchema,
  comparisonName: z.string(),
  description: z.string().optional(),
  baseScenarioId: UUIDSchema,
  comparisonScenarioIds: z.array(UUIDSchema),
  comparisonType: ComparisonTypeEnum,
  comparisonMetrics: z.array(ComparisonMetricEnum),
  status: ComparisonStatusEnum,
  results: ComparisonResultsSchema.nullable(),
  error: z.string().optional(),
  createdBy: z.number().int().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastAccessed: z.string().datetime().optional(),
  cacheExpiresAt: z.string().datetime().optional(),
});

export const ComparisonListResponseSchema = z.object({
  success: z.boolean().default(true),
  data: z.array(ComparisonResponseSchema),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    pages: z.number().int(),
  }),
});

export const SavedConfigResponseSchema = z.object({
  id: UUIDSchema,
  fundId: PositiveIntSchema,
  configName: z.string(),
  description: z.string().optional(),
  scenarioIds: z.array(UUIDSchema),
  scenarioTypes: z.record(z.string(), z.enum(['deal', 'portfolio'])),
  displayLayout: DisplayLayoutEnum,
  metricsToCompare: z.array(ComparisonMetricEnum),
  sortOrder: z.string().optional(),
  showDeltas: z.boolean(),
  deltaMode: DeltaModeEnum,
  baselineScenarioId: UUIDSchema.optional(),
  highlightThreshold: z.number(),
  colorScheme: ColorSchemeEnum,
  betterWorseIndicators: z.boolean(),
  useCount: z.number().int(),
  lastUsedAt: z.string().datetime().optional(),
  isPublic: z.boolean(),
  createdBy: z.number().int(),
  sharedWith: z.array(z.string()),
  version: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ============================================================================
// Access Tracking Schema
// ============================================================================

export const TrackAccessRequestSchema = z.object({
  comparisonId: UUIDSchema.optional(),
  configurationId: UUIDSchema.optional(),
  fundId: PositiveIntSchema,
  accessType: AccessTypeEnum,
  scenariosCompared: z.array(UUIDSchema),
  metricsViewed: z.array(z.string()).optional(),
  loadTimingMs: z.number().int().positive().optional(),
  cacheHit: z.boolean().default(false),
});

// ============================================================================
// Type Exports
// ============================================================================

export type CreateComparisonRequest = z.infer<typeof CreateComparisonRequestSchema>;
export type ListComparisonsQuery = z.infer<typeof ListComparisonsQuerySchema>;
export type ExportComparisonQuery = z.infer<typeof ExportComparisonQuerySchema>;
export type CreateSavedConfigRequest = z.infer<typeof CreateSavedConfigRequestSchema>;
export type UpdateSavedConfigRequest = z.infer<typeof UpdateSavedConfigRequestSchema>;
export type ListSavedConfigsQuery = z.infer<typeof ListSavedConfigsQuerySchema>;
export type DeltaConfig = z.infer<typeof DeltaConfigSchema>;
export type WeightedSummary = z.infer<typeof WeightedSummarySchema>;
export type ScenarioSnapshot = z.infer<typeof ScenarioSnapshotSchema>;
export type DeltaMetric = z.infer<typeof DeltaMetricSchema>;
export type AggregateSummary = z.infer<typeof AggregateSummarySchema>;
export type ComparisonResults = z.infer<typeof ComparisonResultsSchema>;
export type ComparisonResponse = z.infer<typeof ComparisonResponseSchema>;
export type ComparisonListResponse = z.infer<typeof ComparisonListResponseSchema>;
export type SavedConfigResponse = z.infer<typeof SavedConfigResponseSchema>;
export type TrackAccessRequest = z.infer<typeof TrackAccessRequestSchema>;
export type ComparisonType = z.infer<typeof ComparisonTypeEnum>;
export type ComparisonStatus = z.infer<typeof ComparisonStatusEnum>;
export type DisplayLayout = z.infer<typeof DisplayLayoutEnum>;
export type DeltaMode = z.infer<typeof DeltaModeEnum>;
export type ColorScheme = z.infer<typeof ColorSchemeEnum>;
export type AccessType = z.infer<typeof AccessTypeEnum>;
export type ExportFormat = z.infer<typeof ExportFormatEnum>;
export type ComparisonMetric = z.infer<typeof ComparisonMetricEnum>;
