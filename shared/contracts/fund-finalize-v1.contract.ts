/**
 * FundFinalizeV1 -- Canonical write contract for POST /api/funds/finalize
 *
 * Merges FundCreateV1 (required fund fields) with FundDraftWriteV1
 * (optional config fields) into a single atomic payload.
 * The server creates the fund, saves the draft config, and publishes
 * in one orchestrated call.
 *
 * Strict schema: unknown keys are rejected (.strict()).
 *
 * @unit managementFee: decimal ratio 0-0.10 (e.g. 0.02 = 2%)
 * @unit carryPercentage: decimal ratio 0-0.50 (e.g. 0.20 = 20%)
 * @unit size: dollars (whole number)
 */

import { z } from 'zod';
import { engineResultsSchema } from '@shared/schemas/engine-results-schema';
import { FundDraftWriteV1Schema } from '@shared/contracts/fund-draft-write-v1.contract';

// Extract only the draft config fields (exclude fundName/fundSize which overlap
// with the create fields under different names)
const draftConfigFields = FundDraftWriteV1Schema.omit({
  fundName: true,
  fundSize: true,
  vintageYear: true,
  managementFeeRate: true,
  carriedInterest: true,
});

export const FundFinalizeV1Schema = z
  .object({
    /**
     * Existing draft fund identity created by the routed setup wizard.
     * When present, finalize publishes this draft instead of creating a new fund.
     */
    draftFundId: z.number().int().positive().optional(),

    // ── Required fund-level fields (from FundCreateV1) ──

    /** Fund display name */
    name: z.string().min(1, 'Fund name is required'),

    /**
     * Fund size in dollars.
     * @provisional size=0 means user did not enter a value
     * @unit dollars
     */
    size: z.number().nonnegative('Fund size must be zero or positive'),

    /**
     * Management fee as decimal ratio
     * @unit decimal ratio (0.02 = 2%)
     */
    managementFee: z.number().min(0).max(0.1).default(0.02),

    /**
     * Carried interest as decimal ratio
     * @unit decimal ratio (0.20 = 20%)
     */
    carryPercentage: z.number().min(0).max(0.5).default(0.2),

    /** Vintage year */
    vintageYear: z
      .number()
      .int()
      .min(2000)
      .max(2100)
      .default(() => new Date().getFullYear()),

    /** Optional model version tag for evolution tracking */
    modelVersion: z.string().optional(),

    /** Optional engine calculation results from the modeling wizard */
    engineResults: engineResultsSchema.nullable().optional(),

    // ── Optional draft config fields (from FundDraftWriteV1) ──

    /** Establishment date */
    establishmentDate: draftConfigFields.shape.establishmentDate,
    /** Is evergreen fund */
    isEvergreen: draftConfigFields.shape.isEvergreen,
    /** Fund life in years */
    fundLife: draftConfigFields.shape.fundLife,
    /** Investment period in years */
    investmentPeriod: draftConfigFields.shape.investmentPeriod,
    /** GP commitment amount */
    gpCommitment: draftConfigFields.shape.gpCommitment,

    // Capital Structure
    lpClasses: draftConfigFields.shape.lpClasses,
    lps: draftConfigFields.shape.lps,

    // Investment Strategy
    stages: draftConfigFields.shape.stages,
    sectorProfiles: draftConfigFields.shape.sectorProfiles,
    allocations: draftConfigFields.shape.allocations,
    followOnChecks: draftConfigFields.shape.followOnChecks,

    // Capital Plan
    capitalStageAllocations: draftConfigFields.shape.capitalStageAllocations,
    capitalPlanAllocations: draftConfigFields.shape.capitalPlanAllocations,
    targetMetrics: draftConfigFields.shape.targetMetrics,

    // Investment Pipeline
    pipelineProfiles: draftConfigFields.shape.pipelineProfiles,

    // Distributions & Carry
    waterfallType: draftConfigFields.shape.waterfallType,
    waterfallTiers: draftConfigFields.shape.waterfallTiers,
    recyclingEnabled: draftConfigFields.shape.recyclingEnabled,
    recyclingType: draftConfigFields.shape.recyclingType,
    recyclingCap: draftConfigFields.shape.recyclingCap,
    recyclingPeriod: draftConfigFields.shape.recyclingPeriod,
    exitRecyclingRate: draftConfigFields.shape.exitRecyclingRate,
    mgmtFeeRecyclingRate: draftConfigFields.shape.mgmtFeeRecyclingRate,
    allowFutureRecycling: draftConfigFields.shape.allowFutureRecycling,

    // Fees & Expenses
    feeProfiles: draftConfigFields.shape.feeProfiles,
    fundExpenses: draftConfigFields.shape.fundExpenses,

    // Experimental GP economics assumptions (P0, non-authoritative)
    economicsAssumptions: draftConfigFields.shape.economicsAssumptions,
  })
  .strict();

export type FundFinalizeV1 = z.infer<typeof FundFinalizeV1Schema>;

// ---------------------------------------------------------------------------
// Response schema
// ---------------------------------------------------------------------------

export const FundFinalizeResponseV1Schema = z
  .object({
    success: z.literal(true),
    data: z.object({
      fundId: z.number().int().positive(),
      configVersion: z.number().int().positive(),
      correlationId: z.string().uuid(),
      runId: z.number().int().positive().optional(),
      dispatchState: z.enum(['pending', 'dispatched', 'partial', 'failed']).optional(),
      published: z.boolean(),
    }),
  })
  .strict();

export type FundFinalizeResponseV1 = z.infer<typeof FundFinalizeResponseV1Schema>;
