/**
 * Extended Fund Model Schema
 * Complete production-grade VC fund modeling inputs
 */

import { z } from 'zod';
import Decimal from 'decimal.js';
import { ZodDecimal, ZodPercentage, ZodPositiveDecimal } from './decimal-zod';
import { StageProfileSchema } from './stage-profile';
import { FeeProfileSchema } from './fee-profile';
import { CapitalCallPolicySchema } from './capital-call-policy';
import { WaterfallPolicySchema } from './waterfall-policy';
import { RecyclingPolicySchema } from './recycling-policy';

/**
 * Base fund model inputs (existing schema)
 */
export const BaseFundModelInputsSchema = z.object({
  /** Fund identifier */
  id: z.string(),

  /** Fund name */
  name: z.string(),

  /** Total committed capital */
  committedCapital: ZodPositiveDecimal,

  /** Management fee rate (deprecated - use FeeProfile instead) */
  managementFeeRate: ZodPercentage.optional(),

  /** Carry rate (deprecated - use WaterfallPolicy instead) */
  carryRate: ZodPercentage.optional(),

  /** Fund term in months */
  fundTermMonths: z.number().int().positive(),

  /** Vintage year */
  vintageYear: z.number().int().min(2000).max(2100),

  /** Investment period in months */
  investmentPeriodMonths: z.number().int().positive().optional()
});

export type BaseFundModelInputs = z.infer<typeof BaseFundModelInputsSchema>;

/**
 * Model assumptions and settings
 */
export const ModelAssumptionsSchema = z.object({
  /** Default holding period (months) */
  defaultHoldingPeriod: z.number().int().positive().default(60),

  /** Reinvestment period (months) */
  reinvestmentPeriod: z.number().int().positive().default(36),

  /** Maximum portfolio concentration (% of fund) */
  portfolioConcentrationLimit: ZodPercentage.default(new Decimal(0.2)),

  /** Diversification rules */
  diversificationRules: z.object({
    /** Max % per stage */
    maxPerStage: ZodPercentage.optional(),

    /** Max % per sector */
    maxPerSector: ZodPercentage.optional(),

    /** Max % per geography */
    maxPerGeography: ZodPercentage.optional()
  }).optional(),

  /** Enable end-of-term liquidation */
  liquidateAtTermEnd: z.boolean().default(false),

  /** FMV discount at forced liquidation */
  liquidationDiscountPercent: ZodPercentage.default(new Decimal(0.3))
});

export type ModelAssumptions = z.infer<typeof ModelAssumptionsSchema>;

/**
 * Monte Carlo simulation settings
 */
export const MonteCarloSettingsSchema = z.object({
  /** Enable Monte Carlo mode */
  enabled: z.boolean().default(false),

  /** Number of simulation runs */
  numberOfSimulations: z.number().int().min(100).max(10000).default(1000),

  /** Confidence interval for reporting */
  confidenceInterval: ZodPercentage.default(new Decimal(0.95)),

  /** Random seed for deterministic results */
  randomSeed: z.string().optional()
});

export type MonteCarloSettings = z.infer<typeof MonteCarloSettingsSchema>;

/**
 * Complete extended fund model inputs
 */
export const ExtendedFundModelInputsSchema = BaseFundModelInputsSchema.extend({
  /** Stage-based portfolio construction */
  stageProfile: StageProfileSchema,

  /** Fee structure and recycling */
  feeProfile: FeeProfileSchema,

  /** Capital call timing */
  capitalCallPolicy: CapitalCallPolicySchema,

  /** Distribution waterfall */
  waterfallPolicy: WaterfallPolicySchema,

  /** Exit proceeds recycling */
  recyclingPolicy: RecyclingPolicySchema.optional(),

  /** Model assumptions */
  assumptions: ModelAssumptionsSchema.default({}),

  /** Monte Carlo settings */
  monteCarloSettings: MonteCarloSettingsSchema.optional()
}).refine(
  (data) => {
    // Validate investment period <= fund term
    if (data.investmentPeriodMonths) {
      return data.investmentPeriodMonths <= data.fundTermMonths;
    }
    return true;
  },
  {
    message: 'Investment period cannot exceed fund term',
    path: ['investmentPeriodMonths']
  }
).refine(
  (data) => {
    // Validate stage graduation/exit rates sum <= 100%
    for (const stage of data.stageProfile.stages) {
      const totalRate = stage.graduationRate.plus(stage.exitRate);
      if (totalRate.gt(1)) {
        return false;
      }
    }
    return true;
  },
  {
    message: 'Stage graduation + exit rates cannot exceed 100%',
    path: ['stageProfile', 'stages']
  }
);

export type ExtendedFundModelInputs = z.infer<typeof ExtendedFundModelInputsSchema>;

/**
 * Fund model outputs (snapshot of fund state at a point in time)
 */
export const FundModelOutputsSchema = z.object({
  /** Period number (0-indexed) */
  period: z.number().int().min(0),

  /** Months from fund inception */
  month: z.number().int().min(0),

  /** Capital called (cumulative) */
  capitalCalled: ZodDecimal,

  /** Capital deployed in investments */
  investedCapital: ZodDecimal,

  /** Uninvested cash */
  uninvestedCash: ZodDecimal,

  /** Management fees paid (cumulative) */
  managementFeesPaid: ZodDecimal,

  /** Exit proceeds (cumulative) */
  exitProceeds: ZodDecimal,

  /** Distributions to LPs (cumulative) */
  distributionsToLPs: ZodDecimal,

  /** Distributions to GP (cumulative) */
  distributionsToGP: ZodDecimal,

  /** Net Asset Value (fair market value of remaining investments + cash) */
  nav: ZodDecimal,

  /** Total Value to Paid-In (TVPI) */
  tvpi: ZodDecimal,

  /** Distributed to Paid-In (DPI) */
  dpi: ZodDecimal,

  /** Residual Value to Paid-In (RVPI) */
  rvpi: ZodDecimal,

  /** Internal Rate of Return (IRR) */
  irr: ZodDecimal.optional(),

  /** Number of active companies */
  activeCompanies: z.number().int().min(0),

  /** Number of exited companies */
  exitedCompanies: z.number().int().min(0),

  /** Number of failed companies */
  failedCompanies: z.number().int().min(0)
});

export type FundModelOutputs = z.infer<typeof FundModelOutputsSchema>;

/**
 * Complete simulation result
 */
export const SimulationResultSchema = z.object({
  /** Input parameters used */
  inputs: ExtendedFundModelInputsSchema,

  /** Period-by-period outputs */
  periods: z.array(FundModelOutputsSchema),

  /** Final metrics */
  finalMetrics: z.object({
    tvpi: ZodDecimal,
    dpi: ZodDecimal,
    irr: ZodDecimal,
    moic: ZodDecimal,
    totalExitValue: ZodDecimal,
    totalDistributed: ZodDecimal,
    fundLifetimeMonths: z.number().int()
  }),

  /** Simulation metadata */
  metadata: z.object({
    modelVersion: z.string(),
    engineVersion: z.string(),
    computedAt: z.date(),
    computationTimeMs: z.number()
  })
});

export type SimulationResult = z.infer<typeof SimulationResultSchema>;

/**
 * Validation helper
 */
export function validateExtendedFundModel(data: unknown) {
  try {
    const validated = ExtendedFundModelInputsSchema.parse(data);
    return {
      success: true as const,
      data: validated,
      errors: null
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false as const,
        data: null,
        errors: error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message,
          code: err.code
        }))
      };
    }
    throw error;
  }
}
