// shared/types.ts - Comprehensive type definitions for Updog_restore

import { z } from 'zod';

// Re-export unified portfolio strategy types
export {
  PortfolioStrategySchema,
  AllocationConfigSchema,
  createPortfolioStrategy,
  validatePortfolioStrategy,
  updatePortfolioStrategy,
  migrateLegacyStrategy,
} from './portfolio-strategy-schema';

// Re-export types (type-only exports)
export type {
  PortfolioStrategy,
  PortfolioState,
  CheckSizeConfig,
  AllocationConfig,
  ScenarioConfig,
} from './portfolio-strategy-schema';

// =============================================================================
// SIMULATION TYPES
// =============================================================================

export interface SimulationInputs {
  baseMOIC?: number;
  baseIRR?: number;
  initialCapital?: number;
  monteCarloRuns?: number;
  periods?: number;
  growthRate?: number;
  growthVolatility?: number;
  distributionRate?: number;
  distributionVolatility?: number;
  moicVolatility?: number;
  irrVolatility?: number;
  /**
   * Container for additional fund-specific data
   * Use this instead of spreading arbitrary properties
   * @example { fundName: 'Acme I', vintage: 2024 }
   */
  metadata?: Record<string, unknown>;
}

export interface SimulationResult {
  kpi: {
    tvpi: string;
    irr: string;
    moic: string;
    dpi: string;
  };
  moicScenarios: {
    p10: number;
    p50: number;
    p90: number;
  };
  irrScenarios: {
    p10: number;
    p50: number;
    p90: number;
  };
  tvpiSeries: number[];
  dpiSeries: number[];
  exitsByQuarter: Array<{
    quarter: string;
    exits: number;
    value: number;
  }>;
  portfolioAnalysis: Array<{
    companyId: string;
    metrics: {
      revenue: number;
      growth: number;
      multiple: number;
      irr: number;
    };
  }>;
  metadata: {
    runs: number;
    periods: number;
    duration: number;
    timestamp: string;
  };
}

// =============================================================================
// CORE ENGINE TYPES
// =============================================================================

// Reserve Engine Types - Company-level input for reserve calculations
// NOTE: This is distinct from ReserveInputSchema in schemas.ts which is engine-level input
export const ReserveCompanyInputSchema = z.object({
  id: z.number().int().positive(),
  invested: z.number().min(0),
  ownership: z.number().min(0).max(1),
  stage: z.string().min(1),
  sector: z.string().min(1),
});

/** @deprecated Use ReserveCompanyInputSchema - kept for backward compatibility */
export const ReserveInputSchema = ReserveCompanyInputSchema;

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
  companies: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string(),
      stage: z.string(),
      valuation: z.number().min(0),
    })
  ),
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
  companies: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string(),
      stage: z.string(),
      valuation: z.number().min(0),
    })
  ),
  generatedAt: z.date(),
  metadata: z
    .object({
      algorithmMode: z.enum(['rule-based', 'ml-enhanced']),
      yearsActive: z.number().int().min(0),
      maturityLevel: z.number().min(0).max(1),
    })
    .optional(),
});

// =============================================================================
// INFERRED TYPESCRIPT TYPES
// =============================================================================

export type ReserveCompanyInput = z.infer<typeof ReserveCompanyInputSchema>;
/** @deprecated Use ReserveCompanyInput - kept for backward compatibility */
export type ReserveInput = ReserveCompanyInput;
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

export type ConfidenceLevelType = (typeof ConfidenceLevel)[keyof typeof ConfidenceLevel];

// =============================================================================
// FUND SETUP TYPES (Investment Strategy, Exit Recycling, Waterfall)
// =============================================================================

// Investment Strategy Types
export const StageSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  graduationRate: z.number().min(0).max(100), // percentage
  exitRate: z.number().min(0).max(100), // percentage
});

export const SectorProfileSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  targetPercentage: z.number().min(0).max(100), // percentage of fund
  description: z.string().optional(),
});

export const AllocationSchema = z.object({
  id: z.string(),
  category: z.string().min(1),
  percentage: z.number().min(0).max(100), // percentage of fund
  description: z.string().optional(),
});

export const InvestmentStrategySchema = z.object({
  stages: z.array(StageSchema),
  sectorProfiles: z.array(SectorProfileSchema),
  allocations: z.array(AllocationSchema),
});

// Exit Recycling Types
export const ExitRecyclingSchema = z.object({
  enabled: z.boolean().default(false),
  recyclePercentage: z.number().min(0).max(100).default(0), // percentage of exit proceeds to recycle
  maxRecycleAmount: z.number().min(0).optional(), // max dollar amount to recycle
  recycleWindowMonths: z.number().int().min(1).max(120).default(24), // time window for recycling
  restrictToSameSector: z.boolean().default(false),
  restrictToSameStage: z.boolean().default(false),
});

// Waterfall Types
const CarryVestingSchema = z.object({
  cliffYears: z.number().int().min(0).max(10).default(0),
  vestingYears: z.number().int().min(1).max(10).default(4),
});

export const WaterfallSchema = z
  .object({
    type: z.literal('AMERICAN'),
    carryVesting: CarryVestingSchema,
  })
  .strict();

// Complete Fund Setup Types (extending existing)
export const CompleteFundSetupSchema = z.object({
  // Basic fund info
  name: z.string().min(1),
  size: z.number().positive(),
  deployedCapital: z.number().nonnegative(),
  managementFee: z.number().min(0).max(1),
  carryPercentage: z.number().min(0).max(1),
  vintageYear: z.number().int().min(2000).max(2030),

  // Evergreen and fund life fields
  isEvergreen: z.boolean().default(false),
  lifeYears: z.number().int().min(3).max(20).optional(),
  investmentHorizonYears: z.number().int().min(1).max(30),

  // New strategy/recycling/waterfall
  investmentStrategy: InvestmentStrategySchema,
  exitRecycling: ExitRecyclingSchema,
  waterfall: WaterfallSchema,
});

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

// Fund Setup TypeScript Types
export type Stage = z.infer<typeof StageSchema>;
export type SectorProfile = z.infer<typeof SectorProfileSchema>;
export type Allocation = z.infer<typeof AllocationSchema>;
export type InvestmentStrategy = z.infer<typeof InvestmentStrategySchema>;
export type ExitRecycling = z.infer<typeof ExitRecyclingSchema>;
export type Waterfall = z.infer<typeof WaterfallSchema>;
export type CompleteFundSetup = z.infer<typeof CompleteFundSetupSchema>;

// =============================================================================
// CASHFLOW & LIQUIDITY MANAGEMENT TYPES
// =============================================================================

// Re-export cashflow management types
export {
  CashTransactionTypeSchema,
  TransactionStatusSchema,
  CashTransactionSchema,
  CapitalCallSchema,
  ExpenseCategorySchema,
  RecurringExpenseSchema,
  LiquidityForecastSchema,
  CashPositionSchema,
  DistributionWaterfallSchema,
  FundCashflowConfigSchema,
  validateCashTransaction,
  validateCapitalCall,
  validateLiquidityForecast,
  validateCashPosition,
  calculateNetCashFlow,
  groupTransactionsByType,
  calculateLiquidityMetrics,
  type CashTransactionType,
  type TransactionStatus,
  type CashTransaction,
  type CapitalCall,
  type ExpenseCategory,
  type RecurringExpense,
  type LiquidityForecast,
  type CashPosition,
  type DistributionWaterfall,
  type FundCashflowConfig,
} from './schemas/cashflow-schema';
