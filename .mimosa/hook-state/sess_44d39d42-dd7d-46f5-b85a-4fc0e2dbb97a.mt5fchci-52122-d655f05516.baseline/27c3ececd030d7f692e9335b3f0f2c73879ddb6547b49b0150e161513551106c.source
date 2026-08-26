/**
 * FundErrorV1 -- Structured error response for fund endpoints
 *
 * The `issues` array matches the shape already parsed by
 * queryClient.ts:78 (ApiError constructor).
 * `issues.path` is (string | number)[] to match Zod's ZodIssue.path.
 */

import { z } from 'zod';

export const FundErrorIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
});

export const FundErrorV1Schema = z.object({
  error: z.string(),
  code: z.string(),
  issues: z.array(FundErrorIssueSchema).optional(),
});

export type FundErrorIssue = z.infer<typeof FundErrorIssueSchema>;
export type FundErrorV1 = z.infer<typeof FundErrorV1Schema>;
