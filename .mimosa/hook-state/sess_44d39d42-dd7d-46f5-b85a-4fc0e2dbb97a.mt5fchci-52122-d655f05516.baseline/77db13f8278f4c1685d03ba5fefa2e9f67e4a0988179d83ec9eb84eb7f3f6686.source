/**
 * FundCreateV1 -- Canonical write contract for POST /api/funds
 *
 * Strict schema: unknown keys are rejected (.strict()).
 * The legacy `basics` wrapper format is handled by the server adapter,
 * not by this schema.
 *
 * @unit managementFee: decimal ratio 0-0.10 (e.g. 0.02 = 2%)
 * @unit carryPercentage: decimal ratio 0-0.50 (e.g. 0.20 = 20%)
 * @unit size: dollars (whole number)
 */

import { z } from 'zod';
import { engineResultsSchema } from '@shared/schemas/engine-results-schema';

export const FundCreateV1Schema = z
  .object({
    /** Fund display name */
    name: z.string().min(1, 'Fund name is required'),

    /**
     * Fund size in dollars.
     * @provisional size=0 means user did not enter a value; Phase 2A reconciles
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
  })
  .strict();

export type FundCreateV1 = z.infer<typeof FundCreateV1Schema>;
