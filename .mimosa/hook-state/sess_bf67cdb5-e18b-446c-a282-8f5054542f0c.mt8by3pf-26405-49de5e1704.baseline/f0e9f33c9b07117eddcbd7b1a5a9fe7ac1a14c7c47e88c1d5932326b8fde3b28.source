import { z } from 'zod';

import { PortfolioCompaniesModeSchema } from './portfolio-meta.contract';

export const FundViewContextV1Schema = z
  .object({
    contractVersion: z.literal('fund-view-context-v1'),
    fundId: z.number().int().positive().nullable(),
    vehicleId: z.number().int().positive().nullable(),
    asOfDate: z.string().date().nullable(),
    currentPlanVersionId: z.string().min(1).nullable(),
    viewPreset: PortfolioCompaniesModeSchema,
  })
  .strict();

export type FundViewContextV1 = z.infer<typeof FundViewContextV1Schema>;
