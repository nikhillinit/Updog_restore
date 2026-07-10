import { z } from 'zod';
import { FundMoicRankingItemV1Schema } from './fund-moic-v1.contract';

const ModePreviewSchema = z
  .object({
    calculationKey: z.literal('fund_moic_rankings_exit_probability'),
    configuredMode: z.enum(['off', 'shadow', 'on']),
    effectiveMode: z.enum(['off', 'shadow', 'on']),
    killSwitchActive: z.boolean(),
    shadowStartedAt: z.string().datetime().nullable(),
    eligibleAt: z.string().datetime().nullable(),
    residencyDaysRequired: z.literal(7),
    residencyStatus: z.enum(['not_applicable', 'pending', 'eligible']),
    currentSourceMatchesAccepted: z.boolean(),
    unreconciledEditsPresent: z.boolean(),
    blockers: z.array(
      z.enum([
        'accepted_reconciliation_required',
        'accepted_reconciliation_not_found',
        'current_source_changed',
        'exit_probability_source_incomplete',
        'kill_switch_active',
        'reserve_exit_multiple_source_incomplete',
        'shadow_residency_pending',
      ])
    ),
    version: z.number().int().nonnegative(),
  })
  .strict();

const MoicInputSummarySchema = z
  .object({
    sourceVersion: z.literal('moic-exit-probability-v1'),
    explicitExitProbabilityCount: z.number().int().nonnegative(),
    defaultedExitProbabilityCount: z.number().int().nonnegative(),
    activationBlockingDefaultedExitProbabilityCount: z.number().int().nonnegative(),
    explicitReserveExitMultipleCount: z.number().int().nonnegative(),
    defaultedReserveExitMultipleCount: z.number().int().nonnegative(),
    activationBlockingDefaultedReserveExitMultipleCount: z.number().int().nonnegative(),
  })
  .strict();

const ActualsProvenanceSummarySchema = z
  .object({
    factsStatus: z.enum(['available', 'failed']),
    factsInputHash: z.string().min(1).nullable(),
    companyCount: z.number().int().nonnegative(),
    trustStateCounts: z
      .object({
        LIVE: z.number().int().nonnegative(),
        PARTIAL: z.number().int().nonnegative(),
        UNAVAILABLE: z.number().int().nonnegative(),
        FAILED: z.number().int().nonnegative(),
      })
      .strict(),
    defaultedEconomicInputCount: z.number().int().nonnegative(),
    warnings: z.array(z.enum(['actuals_facts_failed'])),
  })
  .strict();

export const FundMoicRankingsResponseV2Schema = z
  .object({
    contractVersion: z.literal('2.1.0'),
    fundId: z.number().int().positive(),
    rankings: z.array(FundMoicRankingItemV1Schema),
    provenance: z
      .object({ mode: z.enum(['legacy', 'candidate']), warnings: z.array(z.string()) })
      .strict(),
    latestReconciliation: z
      .object({
        runId: z.string().nullable(),
        createdAt: z.string().datetime().nullable(),
        currentInputMatches: z.boolean(),
        sourceFingerprintMatches: z.boolean(),
      })
      .strict()
      .nullable(),
    materiality: z
      .object({
        status: z.enum(['not_run', 'recorded', 'stale']),
        candidateMaterial: z.boolean(),
        epsilon: z.literal(1e-8),
      })
      .strict(),
    modePreview: ModePreviewSchema,
    moicInputSummary: MoicInputSummarySchema,
    actualsProvenanceSummary: ActualsProvenanceSummarySchema,
    roundEvidenceSummary: z
      .object({
        activeRoundCount: z.number().int().nonnegative(),
        activeOverrideCount: z.number().int().nonnegative(),
        warningCodes: z.array(z.string()),
      })
      .strict(),
    generatedAt: z.string().datetime(),
  })
  .strict();

export type FundMoicRankingsResponseV2 = z.infer<typeof FundMoicRankingsResponseV2Schema>;
