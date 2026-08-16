import { z } from 'zod';

const GitHubRepositorySchema = z
  .string()
  .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, 'Repository must be owner/name');
const PositiveDecimalIdSchema = z
  .string()
  .regex(/^[1-9][0-9]{0,31}$/, 'Identifier must be a positive decimal string');
const SourceShaSchema = z.string().regex(/^[a-f0-9]{40}$/, 'Source SHA must be lowercase SHA-1');

export const SchemaReconcileReceiptV1Schema = z
  .object({
    repository: GitHubRepositorySchema,
    workflowPath: z.literal('.github/workflows/prod-schema-reconcile.yml'),
    runId: PositiveDecimalIdSchema,
    runAttempt: z.number().int().min(1).max(100),
    mode: z.literal('apply'),
    sourceSha: SourceShaSchema,
    manifest: z.literal('30-g3-release-gate-hardening'),
    migration: z.literal('0053'),
    preDecision: z.literal('APPLY-MISSING-DDL'),
    postDecision: z.literal('SKIP'),
    buildTimeMs: z.number().int().min(0).max(900_000),
    result: z.literal('applied_and_clean'),
  })
  .strict()
  .superRefine((receipt, ctx) => {
    if (receipt.runAttempt !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['runAttempt'],
        message: 'Schema apply must run on attempt 1',
      });
    }
  });

export type SchemaReconcileReceiptV1 = z.infer<typeof SchemaReconcileReceiptV1Schema>;
