import { z } from 'zod';
import { FundMoicRankingItemV1Schema } from './fund-moic-v1.contract';

export const FundMoicRankingsResponseV2Schema = z
  .object({
    contractVersion: z.literal('2.0.0'),
    fundId: z.number().int().positive(),
    rankings: z.array(FundMoicRankingItemV1Schema),
    provenance: z
      .object({ mode: z.literal('legacy'), warnings: z.array(z.string()) })
      .strict(),
    latestReconciliation: z
      .object({
        runId: z.string().nullable(),
        createdAt: z.string().datetime().nullable(),
      })
      .strict()
      .nullable(),
    materiality: z
      .object({
        status: z.enum(['not_run', 'recorded']),
        candidateMaterial: z.literal(false),
        epsilon: z.literal(1e-8),
      })
      .strict(),
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
