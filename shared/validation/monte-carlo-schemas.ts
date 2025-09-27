/**
 * Comprehensive Zod Validation Schemas for Monte Carlo Operations
 *
 * Security-hardened input validation for:
 * - Monte Carlo simulation parameters
 * - Financial calculations
 * - Portfolio construction inputs
 * - Risk metrics parameters
 * - Performance distribution inputs
 */

import { z } from 'zod';

// Base validation primitives with security constraints
const PositiveNumber = z.number().positive().finite();
const PositiveInteger = z.number().int().positive().finite();
const Percentage = z.number().min(0).max(1).finite();
const PercentageAsFloat = z.number().min(0).max(100).finite();
const MonetaryAmount = z.number().min(0).max(1e12).finite(); // Max $1 trillion
const IRR = z.number().min(-1).max(10).finite(); // -100% to 1000%
const Multiple = z.number().min(0).max(100).finite(); // 0x to 100x
const YearRange = z.number().int().min(1990).max(2050);
const FundId = z.number().int().positive();
const UserId = z.number().int().positive().optional();

// String validation with length limits
const SafeString = z.string().min(1).max(255).trim();
const ShortString = z.string().min(1).max(50).trim();
const LongString = z.string().min(1).max(1000).trim();
const UUID = z.string().uuid();

// Sector and stage enums for validation
const SectorEnum = z.enum([
  'fintech', 'healthtech', 'edtech', 'enterprise_software', 'consumer',
  'biotech', 'deep_tech', 'climate_tech', 'cybersecurity', 'ai_ml',
  'blockchain', 'mobility', 'real_estate', 'food_tech', 'other'
]);

const StageEnum = z.enum([
  'pre_seed', 'seed', 'series_a', 'series_b', 'series_c',
  'series_d_plus', 'growth', 'late_stage', 'public'
]);

// Market scenario validation
const MarketScenarioEnum = z.enum(['bull', 'bear', 'neutral']);

// =============================================================================
// CORE MONTE CARLO SCHEMAS
// =============================================================================

export const SimulationConfigSchema = z.object({
  fundId: FundId,
  runs: PositiveInteger.min(100).max(50000),
  timeHorizonYears: PositiveInteger.min(1).max(15),
  baselineId: UUID.optional(),
  portfolioSize: PositiveInteger.min(1).max(1000).optional(),
  deploymentScheduleMonths: PositiveInteger.min(1).max(120).optional(),
  randomSeed: z.number().int().min(1).max(2147483647).optional()
}).strict();

export const MarketEnvironmentSchema = z.object({
  scenario: MarketScenarioEnum,
  exitMultipliers: z.object({
    mean: Multiple.min(0.1).max(50),
    volatility: PositiveNumber.min(0.01).max(5)
  }),
  failureRate: Percentage,
  followOnProbability: Percentage
}).strict();

export const PortfolioInputsSchema = z.object({
  fundSize: MonetaryAmount.min(1000000), // Min $1M fund
  deployedCapital: MonetaryAmount,
  reserveRatio: Percentage,
  sectorWeights: z.record(SectorEnum, Percentage),
  stageWeights: z.record(StageEnum, Percentage),
  averageInvestmentSize: MonetaryAmount.min(10000) // Min $10K investment
}).strict().refine(
  (data: any) => data.deployedCapital <= data.fundSize,
  { message: "Deployed capital cannot exceed fund size" }
).refine(
  (data: any) => (Object.values(data.sectorWeights) as number[]).reduce((sum: number, weight: number) => sum + weight, 0) <= 1.01,
  { message: "Sector weights cannot exceed 100%" }
).refine(
  (data: any) => (Object.values(data.stageWeights) as number[]).reduce((sum: number, weight: number) => sum + weight, 0) <= 1.01,
  { message: "Stage weights cannot exceed 100%" }
);

export const DistributionParametersSchema = z.object({
  irr: z.object({
    mean: IRR.min(-0.5).max(3), // -50% to 300%
    volatility: PositiveNumber.min(0.01).max(2)
  }),
  multiple: z.object({
    mean: Multiple.min(0.1).max(20),
    volatility: PositiveNumber.min(0.01).max(10)
  }),
  dpi: z.object({
    mean: PositiveNumber.min(0).max(5),
    volatility: PositiveNumber.min(0.01).max(2)
  }),
  exitTiming: z.object({
    mean: PositiveNumber.min(1).max(15), // 1-15 years
    volatility: PositiveNumber.min(0.1).max(5)
  }),
  followOnSize: z.object({
    mean: PositiveNumber.min(0).max(5), // 0-500% of initial
    volatility: PositiveNumber.min(0.01).max(2)
  })
}).strict();

// =============================================================================
// RESULTS AND METRICS SCHEMAS
// =============================================================================

export const PerformanceDistributionSchema = z.object({
  scenarios: z.array(z.number().finite()).min(1).max(50000),
  percentiles: z.object({
    p5: z.number().finite(),
    p25: z.number().finite(),
    p50: z.number().finite(),
    p75: z.number().finite(),
    p95: z.number().finite()
  }),
  statistics: z.object({
    mean: z.number().finite(),
    standardDeviation: PositiveNumber,
    min: z.number().finite(),
    max: z.number().finite()
  }),
  confidenceIntervals: z.object({
    ci68: z.tuple([z.number().finite(), z.number().finite()]),
    ci95: z.tuple([z.number().finite(), z.number().finite()])
  })
}).strict();

export const RiskMetricsSchema = z.object({
  valueAtRisk: z.object({
    var5: z.number().finite(),
    var10: z.number().finite()
  }),
  conditionalValueAtRisk: z.object({
    cvar5: z.number().finite(),
    cvar10: z.number().finite()
  }),
  probabilityOfLoss: Percentage,
  downsideRisk: PositiveNumber,
  sharpeRatio: z.number().min(-10).max(10).finite(),
  sortinoRatio: z.number().min(-10).max(10).finite(),
  maxDrawdown: Percentage
}).strict();

export const ReserveOptimizationSchema = z.object({
  currentReserveRatio: Percentage,
  optimalReserveRatio: Percentage,
  improvementPotential: z.number().min(-1).max(1).finite(),
  coverageScenarios: z.object({
    p25: Percentage,
    p50: Percentage,
    p75: Percentage
  }),
  allocationRecommendations: z.array(z.object({
    reserveRatio: Percentage,
    expectedIRR: IRR,
    riskAdjustedReturn: z.number().finite(),
    followOnCoverage: Percentage
  }))
}).strict();

// =============================================================================
// FUND AND INVESTMENT SCHEMAS
// =============================================================================

export const FundBasicsSchema = z.object({
  name: SafeString,
  size: MonetaryAmount.min(100000), // Min $100K
  managementFee: Percentage,
  carryPercentage: Percentage,
  vintageYear: YearRange,
  status: z.enum(['active', 'closed', 'fundraising', 'liquidating'])
}).strict();

export const InvestmentSchema = z.object({
  fundId: FundId,
  companyName: SafeString,
  sector: SectorEnum,
  stage: StageEnum,
  investmentAmount: MonetaryAmount.min(1000), // Min $1K
  investmentDate: z.date(),
  round: ShortString,
  ownershipPercentage: Percentage.optional(),
  valuationAtInvestment: MonetaryAmount.optional(),
  dealTags: z.array(ShortString).max(10).optional()
}).strict();

export const CompanyValuationSchema = z.object({
  companyId: PositiveInteger,
  newValuation: MonetaryAmount.min(1000),
  valuationDate: z.date(),
  valuationMethod: z.enum(['market', 'dcf', 'comparable', 'liquidation', 'other']),
  notes: LongString.optional(),
  userId: UserId
}).strict();

// =============================================================================
// FINANCIAL CALCULATIONS SCHEMAS
// =============================================================================

export const PacingAnalysisSchema = z.object({
  fundId: FundId,
  targetPacingMonths: PositiveInteger.min(6).max(120),
  currentDeployedCapital: MonetaryAmount,
  remainingCapital: MonetaryAmount,
  targetInvestmentsPerQuarter: PositiveInteger.min(1).max(50),
  averageInvestmentSize: MonetaryAmount.min(10000),
  seasonalityFactors: z.record(z.string().regex(/^Q[1-4]$/), PositiveNumber.min(0.1).max(3)).optional()
}).strict();

export const ReserveAnalysisSchema = z.object({
  fundId: FundId,
  currentReserveAmount: MonetaryAmount,
  portfolioSize: PositiveInteger.min(1).max(1000),
  followOnStrategy: z.enum(['aggressive', 'balanced', 'conservative']),
  targetReserveRatio: Percentage,
  followOnMultiplier: PositiveNumber.min(0.1).max(10),
  timeHorizonMonths: PositiveInteger.min(6).max(180)
}).strict();

export const CohortAnalysisSchema = z.object({
  fundId: FundId,
  cohortType: z.enum(['vintage', 'sector', 'stage', 'custom']),
  cohortCriteria: z.record(z.string(), z.any()).optional(),
  benchmarkMetrics: z.array(z.enum(['irr', 'multiple', 'dpi', 'tvpi'])),
  timeHorizonYears: PositiveInteger.min(1).max(15)
}).strict();

// =============================================================================
// USER INPUT SANITIZATION SCHEMAS
// =============================================================================

export const UserInputSchema = z.object({
  userId: UserId,
  sessionId: UUID.optional(),
  ipAddress: z.string().ip().optional(),
  userAgent: z.string().max(500).optional(),
  timestamp: z.date()
}).strict();

export const SearchQuerySchema = z.object({
  query: z.string().min(1).max(100).trim(),
  filters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: PositiveInteger.max(1000).default(1),
  limit: PositiveInteger.min(1).max(100).default(20)
}).strict();

// =============================================================================
// API REQUEST/RESPONSE SCHEMAS
// =============================================================================

export const MonteCarloRequestSchema = z.object({
  config: SimulationConfigSchema,
  marketEnvironment: MarketEnvironmentSchema.optional(),
  userContext: UserInputSchema
}).strict();

export const MonteCarloResponseSchema = z.object({
  simulationId: UUID,
  config: SimulationConfigSchema,
  executionTimeMs: PositiveInteger,
  irr: PerformanceDistributionSchema,
  multiple: PerformanceDistributionSchema,
  dpi: PerformanceDistributionSchema,
  tvpi: PerformanceDistributionSchema,
  totalValue: PerformanceDistributionSchema,
  riskMetrics: RiskMetricsSchema,
  reserveOptimization: ReserveOptimizationSchema,
  scenarios: z.record(z.string(), z.record(z.string(), z.number().finite())),
  insights: z.object({
    primaryRecommendations: z.array(SafeString).max(5),
    riskWarnings: z.array(SafeString).max(10),
    opportunityAreas: z.array(SafeString).max(10),
    keyMetrics: z.array(z.object({
      metric: SafeString,
      value: z.number().finite(),
      benchmark: z.number().finite(),
      status: z.enum(['above', 'below', 'at', 'warning']),
      impact: z.enum(['high', 'medium', 'low'])
    }))
  })
}).strict();

// =============================================================================
// BULK OPERATIONS SCHEMAS
// =============================================================================

export const BulkInvestmentSchema = z.object({
  investments: z.array(InvestmentSchema).min(1).max(100),
  batchId: UUID.optional(),
  validateOnly: z.boolean().default(false),
  userContext: UserInputSchema
}).strict();

export const BulkValuationUpdateSchema = z.object({
  valuations: z.array(CompanyValuationSchema).min(1).max(50),
  batchId: UUID.optional(),
  effectiveDate: z.date(),
  userContext: UserInputSchema
}).strict();

// =============================================================================
// EXPORT ALL SCHEMAS
// =============================================================================

export const MonteCarloSchemas = {
  SimulationConfig: SimulationConfigSchema,
  MarketEnvironment: MarketEnvironmentSchema,
  PortfolioInputs: PortfolioInputsSchema,
  DistributionParameters: DistributionParametersSchema,
  PerformanceDistribution: PerformanceDistributionSchema,
  RiskMetrics: RiskMetricsSchema,
  ReserveOptimization: ReserveOptimizationSchema,
  Request: MonteCarloRequestSchema,
  Response: MonteCarloResponseSchema
};

export const FinancialSchemas = {
  FundBasics: FundBasicsSchema,
  Investment: InvestmentSchema,
  CompanyValuation: CompanyValuationSchema,
  PacingAnalysis: PacingAnalysisSchema,
  ReserveAnalysis: ReserveAnalysisSchema,
  CohortAnalysis: CohortAnalysisSchema,
  BulkInvestment: BulkInvestmentSchema,
  BulkValuationUpdate: BulkValuationUpdateSchema
};

export const SecuritySchemas = {
  UserInput: UserInputSchema,
  SearchQuery: SearchQuerySchema
};

// Type exports for TypeScript
export type SimulationConfig = z.infer<typeof SimulationConfigSchema>;
export type MarketEnvironment = z.infer<typeof MarketEnvironmentSchema>;
export type PortfolioInputs = z.infer<typeof PortfolioInputsSchema>;
export type DistributionParameters = z.infer<typeof DistributionParametersSchema>;
export type MonteCarloRequest = z.infer<typeof MonteCarloRequestSchema>;
export type MonteCarloResponse = z.infer<typeof MonteCarloResponseSchema>;
export type FundBasics = z.infer<typeof FundBasicsSchema>;
export type Investment = z.infer<typeof InvestmentSchema>;
export type UserInput = z.infer<typeof UserInputSchema>;
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

// Validation utility functions
export const validateMonteCarloConfig = (data: unknown) => {
  return SimulationConfigSchema.safeParse(data);
};

export const validateFinancialInput = (schema: z.ZodSchema, data: unknown) => {
  return schema.safeParse(data);
};

export const createValidationError = (error: z.ZodError) => {
  return {
    isValid: false,
    errors: error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
      code: err.code,
    }))
  };
};