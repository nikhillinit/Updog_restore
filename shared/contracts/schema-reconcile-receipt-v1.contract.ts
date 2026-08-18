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

export const SCHEMA_RECONCILE_CATCHUP_TARGET_IDENTITIES = [
  { manifest: '27-g3-portfolio-and-calculation', auditName: 'g3-portfolio-and-calculation', migration: '0050' },
  { manifest: '28-g3-canary', auditName: 'g3-canary', migration: '0051' },
  { manifest: '29-g3-capital-call-notification-outbox', auditName: 'g3-capital-call-notification-outbox', migration: '0052' },
  { manifest: '30-g3-release-gate-hardening', auditName: 'g3-release-gate-hardening', migration: '0053' },
] as const;

const catchupTargetSchema = <M extends string, G extends string>(manifest: M, migration: G) =>
  z
    .object({
      manifest: z.literal(manifest),
      migration: z.literal(migration),
      // SKIP is legal only for a target whose exact-checksum ledger row was
      // already committed by an interrupted earlier catch-up run.
      preDecision: z.enum(['APPLY-MISSING-DDL', 'SKIP']),
      postDecision: z.literal('SKIP'),
    })
    .strict();

export const SchemaReconcileCatchupReceiptV1Schema = z
  .object({
    repository: GitHubRepositorySchema,
    workflowPath: z.literal('.github/workflows/prod-schema-reconcile.yml'),
    runId: PositiveDecimalIdSchema,
    runAttempt: z.number().int().min(1).max(100),
    mode: z.literal('apply-catchup-0050-0053'),
    sourceSha: SourceShaSchema,
    targets: z.tuple([
      catchupTargetSchema('27-g3-portfolio-and-calculation', '0050'),
      catchupTargetSchema('28-g3-canary', '0051'),
      catchupTargetSchema('29-g3-capital-call-notification-outbox', '0052'),
      catchupTargetSchema('30-g3-release-gate-hardening', '0053'),
    ]),
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
    if (!receipt.targets.some((target) => target.preDecision === 'APPLY-MISSING-DDL')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targets'],
        message: 'Catch-up receipt requires at least one applied target',
      });
    }
  });

export type SchemaReconcileCatchupReceiptV1 = z.infer<
  typeof SchemaReconcileCatchupReceiptV1Schema
>;
