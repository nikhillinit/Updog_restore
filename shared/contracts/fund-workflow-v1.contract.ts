import { z } from 'zod';

export const FUND_WORKFLOW_CONTRACT_VERSION = 'fund-workflow/v1';
export const FundWorkflowOperationSchema = z.enum([
  'create',
  'save_draft',
  'finalize',
  'publish_draft',
]);
export type FundWorkflowOperation = z.infer<typeof FundWorkflowOperationSchema>;
export const FundWorkflowKeySchema = z
  .string()
  .uuid()
  .transform((key) => key.toLowerCase());
export const FundDraftETagSchema = z.string().regex(/^"[0-9a-f]{16}"$/);
/**
 * Response header carrying the same strong draft revision as `ETag`.
 * Intermediaries that re-encode a response may weaken its ETag to `W/"..."`
 * (Vercel's edge does this under Brotli, even with `no-transform`), which
 * FundDraftETagSchema rejects. Clients read this header first and fall back to
 * `ETag`; If-Match still carries the strong value.
 */
export const FUND_DRAFT_REVISION_HEADER = 'Fund-Draft-Revision';
