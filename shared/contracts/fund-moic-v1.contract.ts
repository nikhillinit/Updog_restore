import { z } from 'zod';

export const FundMoicRankingItemV1Schema = z.object({
  rank: z.number().int().positive(),
  investmentId: z.string(),
  investmentName: z.string(),
  reservesMoic: z.object({
    value: z.number().nullable(),
    description: z.string(),
    formula: z.string(),
  }),
});

export type FundMoicRankingItemV1 = z.infer<typeof FundMoicRankingItemV1Schema>;

export const FundMoicRankingsResponseV1Schema = z.object({
  fundId: z.number().int().positive(),
  rankings: z.array(FundMoicRankingItemV1Schema),
  generatedAt: z.string().datetime(),
});

export type FundMoicRankingsResponseV1 = z.infer<typeof FundMoicRankingsResponseV1Schema>;
