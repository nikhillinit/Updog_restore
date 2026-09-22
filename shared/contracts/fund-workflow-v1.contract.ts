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
