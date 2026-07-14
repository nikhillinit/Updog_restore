import { z } from 'zod';

import { DecimalStringSchema } from '../lp-reporting/cash-flow-event.contract';

export const MonteCarloAssumptionsProfileV1Schema = z
  .object({
    profileVersion: z.literal('mc-assumptions-v1'),
    lowDataVolatility: z.number(),
    lowDataConfidence: z.number().nullable(),
    aggregateStageProfile: z.string(),
    upsideCompression: z.number(),
    baselineIrrFallback: DecimalStringSchema,
    baselineDpiFallback: DecimalStringSchema,
    baselineTvpiFallback: DecimalStringSchema,
    distributionSelectionRules: z
      .object({
        multiples: z.string(),
        skewedMetrics: z.string(),
        smallSamples: z.string(),
      })
      .strict(),
  })
  .strict();

export type MonteCarloAssumptionsProfileV1 = z.infer<typeof MonteCarloAssumptionsProfileV1Schema>;
