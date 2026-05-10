/**
 * LP Reporting -- Import Commit Contract.
 *
 * Commit requests intentionally carry the same source payload used for dry-run
 * plus the dry-run preview hash. The server re-parses the payload and rejects
 * the write if the recomputed preview hash differs.
 *
 * @module shared/contracts/lp-reporting/import-commit.contract
 */

import { z } from 'zod';
import { PreviewHashSchema, SourceTypeSchema } from './import-dry-run.contract';

export const ImportCommitRequestSchema = z
  .object({
    sourceType: SourceTypeSchema,
    payload: z.string().min(1),
    previewHash: PreviewHashSchema,
  })
  .strict();

export const ImportCommitResponseSchema = z
  .object({
    importBatchId: z.string().uuid(),
    previewHash: PreviewHashSchema,
    insertedCount: z.number().int().nonnegative(),
    skippedExistingCount: z.number().int().nonnegative(),
    skippedDuplicateCount: z.number().int().nonnegative(),
    skippedExcludedCount: z.number().int().nonnegative(),
    insertedIds: z.array(z.number().int().positive()).default([]),
  })
  .strict();

export type ImportCommitRequest = z.infer<typeof ImportCommitRequestSchema>;
export type ImportCommitResponse = z.infer<typeof ImportCommitResponseSchema>;
