/**
 * Comprehensive schema definitions for reserve calculation engine
 * Provides type-safe contracts and validation for all reserve-related operations
 */

import { z } from 'zod';

// Base Types
export const MoneySchema = z.number().positive().finite();
export const PercentageSchema = z.number().min(0).max(1);
export const StageSchema = z.enum(['pre_seed', 'seed', 'series_a', 'series_b', 'series_c', 'series_d', 'growth', 'late_stage']);
export const OutcomeSchema = z.enum(['failure', 'small_exit', 'medium_exit', 'large_exit', 'mega_exit']);

// Company and Investment Types
export const PortfolioCompanySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  sector: z.string().min(1).max(50),
  currentStage: StageSchema,
  
  // Investment details
  totalInvested: MoneySchema,
  currentValuation: MoneySchema,
  ownershipPercentage: PercentageSchema,
  liquidationPreference: MoneySchema.optional(),
  
  // Timeline and status
  investmentDate: z.date(),
  lastRoundDate: z.date().optional(),
  exitDate: z.date().optional(),
  isActive: z.boolean().default(true),
  
  // Performance metrics
  currentMOIC: z.number().min(0).optional(),
  estimatedExitValue: MoneySchema.optional(),
  confidenceLevel: PercentageSchema.default(0.5),
  
  // Additional context
  tags: z.array(z.string()).default([]),
  notes: z.string().optional(),
}).strict();

export const GraduationRateSchema = z.object({
  fromStage: StageSchema,
  toStage: StageSchema,
  probability: PercentageSchema,
  timeToGraduation: z.number().positive(), // months
  valuationMultiple: z.number().min(1), // how much valuation increases
}).strict();

export const GraduationMatrixSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  rates: z.array(GraduationRateSchema),
  sector: z.string().optional(), // sector-specific matrix
  vintage: z.number().optional(), // year-specific adjustments
}).strict();

export const StageStrategySchema = z.object({
  stage: StageSchema,
  
  // Investment strategy
  targetOwnership: PercentageSchema,
  maxInvestment: MoneySchema,
  minInvestment: MoneySchema,
  
  // Timing strategy
  followOnProbability: PercentageSchema,
  reserveMultiple: z.number().min(0).max(10), // multiple of initial investment
  
  // Risk parameters
  failureRate: PercentageSchema,
  expectedMOIC: z.number().min(0),
  expectedTimeToExit: z.number().positive(), // months
  
  // Portfolio construction
  maxConcentration: PercentageSchema, // max % of fund in single investment
  diversificationWeight: z.number().min(0).max(1),
}).strict();

export const ReserveAllocationInputSchema = z.object({
  // Portfolio context
  portfolio: z.array(PortfolioCompanySchema),
  availableReserves: MoneySchema,
  totalFundSize: MoneySchema,
  
  // Strategy parameters
  graduationMatrix: GraduationMatrixSchema,
  stageStrategies: z.array(StageStrategySchema),
  
  // Constraints
  maxSingleAllocation: MoneySchema.optional(),
  minAllocationThreshold: MoneySchema.default(25000),
  maxPortfolioConcentration: PercentageSchema.default(0.1),
  
  // Scenario parameters
  scenarioType: z.enum(['conservative', 'base', 'optimistic']).default('base'),
  timeHorizon: z.number().positive().default(84), // months
  
  // Feature flags
  enableDiversification: z.boolean().default(true),
  enableRiskAdjustment: z.boolean().default(true),
  enableLiquidationPreferences: z.boolean().default(true),
}).strict();

export const ReserveAllocationOutputSchema = z.object({
  companyId: z.string().uuid(),
  companyName: z.string(),
  
  // Allocation details
  recommendedAllocation: MoneySchema,
  allocationRationale: z.string(),
  priority: z.number().min(1).max(100), // 1 = highest priority
  
  // Expected outcomes
  expectedMOIC: z.number().min(0),
  expectedValue: MoneySchema,
  riskAdjustedReturn: z.number(),
  
  // Portfolio impact
  newOwnership: PercentageSchema,
  portfolioWeight: PercentageSchema,
  concentrationRisk: z.enum(['low', 'medium', 'high']),
  
  // Timing and staging
  recommendedStage: StageSchema,
  timeToDeployment: z.number().positive(), // months
  followOnPotential: PercentageSchema,
  
  // Risk factors
  riskFactors: z.array(z.string()),
  mitigationStrategies: z.array(z.string()),
  
  // Supporting data
  calculationMetadata: z.object({
    graduationProbability: PercentageSchema,
    expectedExitMultiple: z.number().min(0),
    timeToExit: z.number().positive(),
    diversificationBonus: z.number(),
    liquidationPrefImpact: z.number().optional(),
  }),
});

export const ReserveCalculationResultSchema = z.object({
  // Input summary
  inputSummary: z.object({
    totalPortfolioCompanies: z.number().min(0),
    availableReserves: MoneySchema,
    totalAllocated: MoneySchema,
    allocationEfficiency: PercentageSchema,
  }),
  
  // Allocations
  allocations: z.array(ReserveAllocationOutputSchema),
  unallocatedReserves: MoneySchema,
  
  // Portfolio metrics
  portfolioMetrics: z.object({
    expectedPortfolioMOIC: z.number().min(0),
    expectedPortfolioValue: MoneySchema,
    portfolioDiversification: z.number().min(0).max(1),
    concentrationRisk: z.enum(['low', 'medium', 'high']),
    averageTimeToExit: z.number().positive(),
  }),
  
  // Risk analysis
  riskAnalysis: z.object({
    portfolioRisk: z.enum(['low', 'medium', 'high']),
    keyRiskFactors: z.array(z.string()),
    riskMitigationActions: z.array(z.string()),
    stressTestResults: z.object({
      downside10: z.number(), // 10th percentile outcome
      upside90: z.number(),   // 90th percentile outcome
      expectedValue: z.number(),
    }),
  }),
  
  // Scenario analysis
  scenarioResults: z.object({
    conservative: z.object({
      totalValue: MoneySchema,
      portfolioMOIC: z.number(),
      probability: PercentageSchema,
    }),
    base: z.object({
      totalValue: MoneySchema,
      portfolioMOIC: z.number(),
      probability: PercentageSchema,
    }),
    optimistic: z.object({
      totalValue: MoneySchema,
      portfolioMOIC: z.number(),
      probability: PercentageSchema,
    }),
  }),
  
  // Calculation metadata
  metadata: z.object({
    calculationDate: z.date(),
    calculationDuration: z.number().positive(), // milliseconds
    modelVersion: z.string(),
    deterministicHash: z.string(), // for result verification
    assumptions: z.array(z.string()),
    limitations: z.array(z.string()),
  }),
});

// Excel Parity Schemas
export const ExcelParityInputSchema = z.object({
  fundMetrics: z.object({
    totalCommitted: MoneySchema,
    totalCalled: MoneySchema,
    totalDistributed: MoneySchema,
    netAssetValue: MoneySchema,
    managementFees: MoneySchema,
    carriedInterest: MoneySchema,
  }),
  
  companyData: z.array(z.object({
    companyName: z.string(),
    invested: MoneySchema,
    currentValue: MoneySchema,
    distributed: MoneySchema,
    moic: z.number().min(0),
    irr: z.number(),
  })),
  
  timeline: z.array(z.object({
    quarter: z.string().regex(/^\d{4}Q[1-4]$/),
    navValue: MoneySchema,
    distributions: MoneySchema,
    calls: MoneySchema,
    dpi: z.number().min(0),
    tvpi: z.number().min(0),
    irr: z.number(),
  })),
});

export const ExcelParityOutputSchema = z.object({
  comparisonResults: z.array(z.object({
    metric: z.string(),
    excelValue: z.number(),
    webAppValue: z.number(),
    percentageDrift: z.number(),
    withinTolerance: z.boolean(),
    tolerance: z.number().default(0.01), // 1%
  })),
  
  overallParity: z.object({
    totalMetricsCompared: z.number(),
    metricsWithinTolerance: z.number(),
    parityPercentage: PercentageSchema,
    maxDrift: z.number(),
    passesParityTest: z.boolean(),
  }),
  
  detailedBreakdown: z.object({
    navComparison: z.object({
      match: z.boolean(),
      drift: z.number(),
    }),
    dpiComparison: z.object({
      match: z.boolean(),
      drift: z.number(),
    }),
    tvpiComparison: z.object({
      match: z.boolean(),
      drift: z.number(),
    }),
    irrComparison: z.object({
      match: z.boolean(),
      drift: z.number(),
    }),
    moicComparison: z.object({
      match: z.boolean(),
      drift: z.number(),
    }),
  }),
});

// Feature Flag Schemas
export const FeatureFlagSchema = z.object({
  enableNewReserveEngine: z.boolean().default(false),
  enableParityTesting: z.boolean().default(true),
  enableRiskAdjustments: z.boolean().default(true),
  enableScenarioAnalysis: z.boolean().default(true),
  enableAdvancedDiversification: z.boolean().default(false),
  enableLiquidationPreferences: z.boolean().default(true),
  enablePerformanceLogging: z.boolean().default(true),
  maxCalculationTimeMs: z.number().positive().default(5000),
}).strict();

// Type exports (inferred from schemas)
export type PortfolioCompany = z.infer<typeof PortfolioCompanySchema>;
export type GraduationRate = z.infer<typeof GraduationRateSchema>;
export type GraduationMatrix = z.infer<typeof GraduationMatrixSchema>;
export type StageStrategy = z.infer<typeof StageStrategySchema>;
export type ReserveAllocationInput = z.infer<typeof ReserveAllocationInputSchema>;
export type ReserveAllocationOutput = z.infer<typeof ReserveAllocationOutputSchema>;
export type ReserveCalculationResult = z.infer<typeof ReserveCalculationResultSchema>;
export type ExcelParityInput = z.infer<typeof ExcelParityInputSchema>;
export type ExcelParityOutput = z.infer<typeof ExcelParityOutputSchema>;
export type FeatureFlags = z.infer<typeof FeatureFlagSchema>;

// Validation utilities
export function validatePortfolioCompany(data: unknown): PortfolioCompany {
  return PortfolioCompanySchema.parse(data);
}

export function validateReserveInput(data: unknown): ReserveAllocationInput {
  return ReserveAllocationInputSchema.parse(data);
}

export function validateReserveOutput(data: unknown): ReserveCalculationResult {
  return ReserveCalculationResultSchema.parse(data);
}

export function validateExcelParity(data: unknown): ExcelParityInput {
  return ExcelParityInputSchema.parse(data);
}

// Default values and presets
export const DEFAULT_GRADUATION_MATRIX: GraduationMatrix = {
  name: 'Industry Standard',
  description: 'Based on industry averages for progression rates',
  rates: [
    {
      fromStage: 'pre_seed',
      toStage: 'seed',
      probability: 0.7,
      timeToGraduation: 12,
      valuationMultiple: 2.5,
    },
    {
      fromStage: 'seed',
      toStage: 'series_a',
      probability: 0.6,
      timeToGraduation: 18,
      valuationMultiple: 3.0,
    },
    {
      fromStage: 'series_a',
      toStage: 'series_b',
      probability: 0.5,
      timeToGraduation: 24,
      valuationMultiple: 2.5,
    },
    {
      fromStage: 'series_b',
      toStage: 'series_c',
      probability: 0.4,
      timeToGraduation: 30,
      valuationMultiple: 2.0,
    },
  ],
};

export const DEFAULT_STAGE_STRATEGIES: StageStrategy[] = [
  {
    stage: 'seed',
    targetOwnership: 0.08,
    maxInvestment: 2000000,
    minInvestment: 100000,
    followOnProbability: 0.8,
    reserveMultiple: 2.0,
    failureRate: 0.7,
    expectedMOIC: 15.0,
    expectedTimeToExit: 84,
    maxConcentration: 0.05,
    diversificationWeight: 0.8,
  },
  {
    stage: 'series_a',
    targetOwnership: 0.06,
    maxInvestment: 5000000,
    minInvestment: 500000,
    followOnProbability: 0.9,
    reserveMultiple: 1.5,
    failureRate: 0.5,
    expectedMOIC: 8.0,
    expectedTimeToExit: 72,
    maxConcentration: 0.08,
    diversificationWeight: 0.7,
  },
];

// Error classes
export class ReserveCalculationError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'ReserveCalculationError';
  }
}

export class ParityValidationError extends Error {
  constructor(
    message: string,
    public drift: number,
    public metric: string
  ) {
    super(message);
    this.name = 'ParityValidationError';
  }
}