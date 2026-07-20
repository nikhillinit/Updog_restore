import { z } from 'zod';
import {
  MarginalReserveInputFailureSchema,
  MarginalReserveRankingItemV1Schema,
} from './marginal-reserve-moic-v1.contract';

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const MarginalReserveRankingsResponseV2Schema = z
  .object({
    contractVersion: z.literal('marginal-reserve-rankings-v2'),
    mode: z.enum(['off', 'shadow', 'on']),
    actionability: z.enum(['actionable', 'non_actionable']),
    fundId: z.number().int().positive(),
    asOfDate: z.string().date(),
    factsInputHash: Sha256Schema,
    assumptionsHash: Sha256Schema,
    rankings: z.array(MarginalReserveRankingItemV1Schema),
    unavailable: z.array(MarginalReserveInputFailureSchema),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.actionability !== 'actionable') return;

    if (value.mode !== 'on') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mode'],
        message: 'Actionable marginal rankings require effective mode on',
      });
    }

    if (!value.rankings.some((ranking) => ranking.status === 'actionable')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rankings'],
        message: 'Actionable marginal rankings require at least one actionable ranking',
      });
    }
  });

export type MarginalReserveRankingsResponseV2 = z.infer<
  typeof MarginalReserveRankingsResponseV2Schema
>;
