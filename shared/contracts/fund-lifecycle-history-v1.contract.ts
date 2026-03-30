/**
 * FundLifecycleHistoryV1 -- Read contract for GET /api/funds/:id/lifecycle-history
 *
 * Returns the publication history of a fund: every config version that was
 * published, with its associated calcRun status. Entries are ordered by
 * version descending (most recent first).
 *
 * Strict schema: unknown keys are rejected (.strict()).
 *
 * @module shared/contracts/fund-lifecycle-history-v1.contract
 */

import { z } from 'zod';
import { CalculationStatusSchema } from './fund-state-read-v1.contract';

export const LifecycleHistoryEntrySchema = z
  .object({
    version: z.number().int(),
    publishedAt: z.string().datetime(),
    publishedBy: z.number().int().nullable(),
    fundSize: z.number().nullable(),
    numCompanies: z.number().int().nullable(),
    calcRun: z
      .object({
        runId: z.number().int().nullable(),
        status: CalculationStatusSchema.nullable(),
        dispatchState: z.enum(['pending', 'dispatched', 'partial', 'failed']).nullable(),
        lastCalculatedAt: z.string().datetime().nullable(),
        correlationId: z.string().nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const FundLifecycleHistoryV1Schema = z
  .object({
    fundId: z.number().int(),
    entries: z.array(LifecycleHistoryEntrySchema),
  })
  .strict();

export type LifecycleHistoryEntry = z.infer<typeof LifecycleHistoryEntrySchema>;
export type FundLifecycleHistoryV1 = z.infer<typeof FundLifecycleHistoryV1Schema>;
