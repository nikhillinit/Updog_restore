import { z } from 'zod';

export const FundMoicRankingsProvenanceV1Schema = z
  .object({
    source: z.literal('portfolio_companies'),
    calculation: z.literal('reserves_moic_rankings'),
    metricBasis: z.literal('planned_reserves'),
    sourceRecordCount: z.number().int().min(0),
  })
  .strict();

export const FundMoicReservesMoicV1Schema = z
  .object({
    value: z.number().nullable(),
    description: z.string(),
    formula: z.string(),
  })
  .strict();

export const FundMoicRankingItemV1Schema = z
  .object({
    rank: z.number().int().positive(),
    investmentId: z.string(),
    investmentName: z.string(),
    reservesMoic: FundMoicReservesMoicV1Schema,
  })
  .strict();

export type FundMoicRankingsProvenanceV1 = z.infer<
  typeof FundMoicRankingsProvenanceV1Schema
>;
export type FundMoicReservesMoicV1 = z.infer<typeof FundMoicReservesMoicV1Schema>;
export type FundMoicRankingItemV1 = z.infer<typeof FundMoicRankingItemV1Schema>;

export const FundMoicRankingsResponseV1Schema = z
  .object({
    fundId: z.number().int().positive(),
    provenance: FundMoicRankingsProvenanceV1Schema,
    rankings: z.array(FundMoicRankingItemV1Schema),
    generatedAt: z.string().datetime(),
  })
  .strict();

export type FundMoicRankingsResponseV1 = z.infer<typeof FundMoicRankingsResponseV1Schema>;
