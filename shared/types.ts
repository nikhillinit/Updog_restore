// shared/types.ts - Comprehensive type definitions for Updog_restore

import { z } from 'zod';

// =============================================================================
// CORE ENGINE TYPES
// =============================================================================

// Reserve Engine Types
export const ReserveInputSchema = z.object({
  id: z.number().int().positive(),
  invested: z.number().min(0),
  ownership: z.number().min(0).max(1),
  stage: z.string().min(1),
  sector: z.string().min(1),
});

export const ReserveOutputSchema = z.object({
  allocation: z.number().min(0),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
});

export const ReserveSummarySchema = z.object({
  fundId: z.number().int().positive(),
  totalAllocation: z.number().min(0),
  avgConfidence: z.number().min(0).max(1),
  highConfidenceCount: z.number().int().min(0),
  allocations: z.array(ReserveOutputSchema),
  generatedAt: z.date(),
});

// Pacing Engine Types  
export const PacingInputSchema = z.object({
  fundSize: z.number().min(0),
  deploymentQuarter: z.number().int().min(1),
  marketCondition: z.enum(['bull', 'bear', 'neutral']),
});

export const PacingOutputSchema = z.object({
  quarter: z.number().int().positive(),
  deployment: z.number().min(0),
  note: z.string().min(1),
});

export const PacingSummarySchema = z.object({
  fundSize: z.number().min(0),
  totalQuarters: z.number().int().positive(),
  avgQuarterlyDeployment: z.number().min(0),
  marketCondition: z.enum(['bull', 'bear', 'neutral']),
  deployments: z.array(PacingOutputSchema),
  generatedAt: z.date(),
});

// Cohort Engine Types (scaffold)
export const CohortInputSchema = z.object({
  fundId: z.number().int().positive(),
  vintageYear: z.number().int().min(2000).max(2030),
  cohortSize: z.number().int().positive(),
});

export const CohortOutputSchema = z.object({
  cohortId: z.string(),
  vintageYear: z.number().int(),
  performance: z.object({
    irr: z.number(),
    multiple: z.number().min(0),
    dpi: z.number().min(0),
  }),
  companies: z.array(z.object({
    id: z.number().int().positive(),
    name: z.string(),
    stage: z.string(),
    valuation: z.number().min(0),
  })),
});

export const CohortSummarySchema = z.object({
  cohortId: z.string(),
  vintageYear: z.number().int(),
  totalCompanies: z.number().int().min(0),
  performance: z.object({
    irr: z.number(),
    multiple: z.number().min(0),
    dpi: z.number().min(0),
  }),
  avgValuation: z.number().min(0),
  stageDistribution: z.record(z.string(), z.number().int().min(0)),
  companies: z.array(z.object({
    id: z.number().int().positive(),
    name: z.string(),
    stage: z.string(),
    valuation: z.number().min(0),
  })),
  generatedAt: z.date(),
  metadata: z.object({
    algorithmMode: z.enum(['rule-based', 'ml-enhanced']),
    yearsActive: z.number().int().min(0),
    maturityLevel: z.number().min(0).max(1),
  }).optional(),
});

// =============================================================================
// INFERRED TYPESCRIPT TYPES
// =============================================================================

export type ReserveInput = z.infer<typeof ReserveInputSchema>;
export type ReserveOutput = z.infer<typeof ReserveOutputSchema>;
export type ReserveSummary = z.infer<typeof ReserveSummarySchema>;

export type PacingInput = z.infer<typeof PacingInputSchema>;
export type PacingOutput = z.infer<typeof PacingOutputSchema>;
export type PacingSummary = z.infer<typeof PacingSummarySchema>;

export type CohortInput = z.infer<typeof CohortInputSchema>;
export type CohortOutput = z.infer<typeof CohortOutputSchema>;
export type CohortSummary = z.infer<typeof CohortSummarySchema>;

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

export const ApiErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  code: z.number().int().optional(),
  details: z.record(z.unknown()).optional(),
});

export const ApiSuccessSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    timestamp: z.date(),
  });

export type ApiError = z.infer<typeof ApiErrorSchema>;
export type ApiSuccess<T> = {
  success: true;
  data: T;
  timestamp: Date;
};

// =============================================================================
// FEATURE FLAGS & ENVIRONMENT
// =============================================================================

export const EngineConfigSchema = z.object({
  ALG_RESERVE: z.boolean().default(false),
  ALG_PACING: z.boolean().default(false),
  ALG_COHORT: z.boolean().default(false),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type EngineConfig = z.infer<typeof EngineConfigSchema>;

// =============================================================================
// CHART DATA TYPES
// =============================================================================

export const ChartDataPointSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.number(),
  color: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const TimeSeriesPointSchema = z.object({
  x: z.union([z.string(), z.number(), z.date()]),
  y: z.number(),
  metadata: z.record(z.unknown()).optional(),
});

export type ChartDataPoint = z.infer<typeof ChartDataPointSchema>;
export type TimeSeriesPoint = z.infer<typeof TimeSeriesPointSchema>;

// =============================================================================
// ENGINE CONFIDENCE LEVELS
// =============================================================================

export const ConfidenceLevel = {
  COLD_START: 0.3,
  LOW: 0.5,
  MEDIUM: 0.7,
  HIGH: 0.85,
  ML_ENHANCED: 0.95,
} as const;

export type ConfidenceLevelType = typeof ConfidenceLevel[keyof typeof ConfidenceLevel];

// =============================================================================
// UTILITY TYPES
// =============================================================================

export type WithTimestamp<T> = T & { timestamp: Date };
export type WithId<T> = T & { id: number };
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

// Engine processing status
export type EngineStatus = 'idle' | 'processing' | 'completed' | 'error';

// Market condition with extended metadata
export type MarketConditionExtended = {
  condition: 'bull' | 'bear' | 'neutral';
  confidence: number;
  indicators: {
    volatility: number;
    sentiment: number;
    liquidity: number;
  };
};