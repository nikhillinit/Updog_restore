/**
 * FundFinalizeV1 -- Canonical write contract for server-owned wizard finalization.
 *
 * This endpoint is intentionally broader than FundCreateV1 because it captures
 * the final authoritative draft snapshot alongside the create payload.
 */

import { z } from 'zod';
import { FundCreateV1Schema } from './fund-create-v1.contract';
import { FundDraftWriteV1Schema } from './fund-draft-write-v1.contract';

export const FundFinalizeV1Schema = z
  .object({
    /** Existing draft-backed fund identity, when the wizard has already bootstrapped one. */
    fundId: z.number().int().positive().optional(),
    /** Canonical create payload used when a draft-backed fund does not exist yet. */
    create: FundCreateV1Schema,
    /** Full authoritative draft snapshot to persist before publish. */
    draft: FundDraftWriteV1Schema,
  })
  .strict();

export const FundFinalizeResultV1Schema = z
  .object({
    fundId: z.number().int().positive(),
    publishedConfigId: z.number().int().positive(),
    publishedVersion: z.number().int().positive(),
    runId: z.number().int().positive(),
    correlationId: z.string().min(1),
    dispatchState: z.string().min(1),
  })
  .strict();

export type FundFinalizeV1 = z.infer<typeof FundFinalizeV1Schema>;
export type FundFinalizeResultV1 = z.infer<typeof FundFinalizeResultV1Schema>;
