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
  {
    manifest: '27-g3-portfolio-and-calculation',
    auditName: 'g3-portfolio-and-calculation',
    migration: '0050',
  },
  { manifest: '28-g3-canary', auditName: 'g3-canary', migration: '0051' },
  {
    manifest: '29-g3-capital-call-notification-outbox',
    auditName: 'g3-capital-call-notification-outbox',
    migration: '0052',
  },
  {
    manifest: '30-g3-release-gate-hardening',
    auditName: 'g3-release-gate-hardening',
    migration: '0053',
  },
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

export type SchemaReconcileCatchupReceiptV1 = z.infer<typeof SchemaReconcileCatchupReceiptV1Schema>;

export const CURRENT_FORECAST_MIGRATION_RANGE = [
  '0050_g3_portfolio_and_calculation_schema',
  '0051_g3_canary_schema',
  '0052_g3_capital_call_notification_outbox',
  '0053_g3_release_gate_hardening',
  '0054_operating_decisions_spine',
  '0055_current_forecast_recompute_commands',
] as const;

export const SchemaReconcileCurrentForecastReceiptV1Schema = z
  .object({
    repository: GitHubRepositorySchema,
    workflowPath: z.literal('.github/workflows/prod-schema-reconcile.yml'),
    runId: PositiveDecimalIdSchema,
    runAttempt: z.literal(1),
    mode: z.literal('apply-current-forecast-0050-0055'),
    sourceSha: SourceShaSchema,
    migrationRange: z.tuple([
      z.literal('0050_g3_portfolio_and_calculation_schema'),
      z.literal('0051_g3_canary_schema'),
      z.literal('0052_g3_capital_call_notification_outbox'),
      z.literal('0053_g3_release_gate_hardening'),
      z.literal('0054_operating_decisions_spine'),
      z.literal('0055_current_forecast_recompute_commands'),
    ]),
    preState: z
      .object({
        state: z.enum(['ready', 'complete']),
        appliedTargetCount: z.number().int().min(0).max(6),
        lastAppliedTag: z.string().min(1),
      })
      .strict(),
    postState: z.literal('complete'),
    applied: z.boolean(),
    buildTimeMs: z.number().int().min(0).max(900_000),
    result: z.literal('applied_and_clean'),
  })
  .strict()
  .superRefine((receipt, ctx) => {
    const expectedLastTag = ['0049_kpi_observations', ...CURRENT_FORECAST_MIGRATION_RANGE][
      receipt.preState.appliedTargetCount
    ];
    if (receipt.preState.lastAppliedTag !== expectedLastTag) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['preState', 'lastAppliedTag'],
        message: 'Last applied tag must match applied target count',
      });
    }
    if (receipt.preState.state === 'complete' && receipt.preState.appliedTargetCount !== 6) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['preState'],
        message: 'Complete pre-state requires all six target migrations',
      });
    }
    if (receipt.preState.state === 'ready' && receipt.preState.appliedTargetCount === 6) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['preState'],
        message: 'Ready pre-state cannot include all target migrations',
      });
    }
    if (receipt.applied !== (receipt.preState.state === 'ready')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['applied'],
        message: 'Applied flag must match pre-state',
      });
    }
  });

export type SchemaReconcileCurrentForecastReceiptV1 = z.infer<
  typeof SchemaReconcileCurrentForecastReceiptV1Schema
>;

const ActualsDraftMigrationResultObjectSchema = z
  .object({
    migration: z
      .object({
        tag: z.literal('0056_actuals_draft_revisions'),
        idx: z.literal(57),
        when: z.literal(1788825600000),
        hash: z.literal('94fd8537ee7afbee9f0d5b19bfa9cfd78263096c89ee4ef0ae015ad268ed04cf'),
      })
      .strict(),
    targetFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    preState: z
      .object({
        baselineKind: z.enum(['canonical', 'adr074-reconciled']),
        state: z.enum(['ready', 'complete']),
        appliedTargetCount: z.union([z.literal(0), z.literal(1)]),
        lastAppliedTag: z.enum([
          '0055_current_forecast_recompute_commands',
          '0056_actuals_draft_revisions',
        ]),
      })
      .strict(),
    postState: z.enum(['ready', 'complete']),
    applied: z.boolean(),
  })
  .strict();

function validateActualsDraftResult(
  result: z.infer<typeof ActualsDraftMigrationResultObjectSchema>,
  ctx: z.RefinementCtx
) {
  const wasComplete = result.preState.state === 'complete';
  if (
    result.preState.appliedTargetCount !== (wasComplete ? 1 : 0) ||
    result.preState.lastAppliedTag !==
      (wasComplete ? '0056_actuals_draft_revisions' : '0055_current_forecast_recompute_commands')
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['preState'],
      message: '0056 pre-state must agree with its exact predecessor or completed ledger identity',
    });
  }
  if (
    (wasComplete && result.applied) ||
    result.postState !== (wasComplete || result.applied ? 'complete' : 'ready')
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['applied'],
      message: '0056 apply and replay flags must agree with before/after ledger states',
    });
  }
}

export const ActualsDraftMigrationResultV1Schema =
  ActualsDraftMigrationResultObjectSchema.superRefine(validateActualsDraftResult);
export type ActualsDraftMigrationResultV1 = z.infer<typeof ActualsDraftMigrationResultV1Schema>;

export const SchemaReconcileActualsDraftReceiptV1Schema =
  ActualsDraftMigrationResultObjectSchema.extend({
    repository: GitHubRepositorySchema,
    workflowPath: z.literal('.github/workflows/prod-schema-reconcile.yml'),
    runId: PositiveDecimalIdSchema,
    runAttempt: z.literal(1),
    mode: z.literal('apply-actuals-draft-0056'),
    sourceSha: SourceShaSchema,
    postState: z.literal('complete'),
    buildTimeMs: z.number().int().min(0).max(900_000),
    result: z.literal('applied_and_clean'),
  })
    .strict()
    .superRefine(validateActualsDraftResult);

export type SchemaReconcileActualsDraftReceiptV1 = z.infer<
  typeof SchemaReconcileActualsDraftReceiptV1Schema
>;

const ActualsRestatementMigrationResultObjectSchema = z
  .object({
    migration: z
      .object({
        tag: z.literal('0057_actuals_restatement_commands'),
        idx: z.literal(58),
        when: z.literal(1788912000000),
        hash: z.literal('3f424f67d5a7fe87c6e8eeb2b25d129c0278aa18596c6a3bf9b5ef91df46d577'),
      })
      .strict(),
    targetFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    preState: z
      .object({
        baselineKind: z.enum(['canonical', 'adr074-reconciled']),
        state: z.enum(['ready', 'complete']),
        appliedTargetCount: z.union([z.literal(0), z.literal(1)]),
        lastAppliedTag: z.enum([
          '0056_actuals_draft_revisions',
          '0057_actuals_restatement_commands',
        ]),
      })
      .strict(),
    postState: z.enum(['ready', 'complete']),
    applied: z.boolean(),
  })
  .strict();

function validateActualsRestatementResult(
  result: z.infer<typeof ActualsRestatementMigrationResultObjectSchema>,
  ctx: z.RefinementCtx
) {
  const wasComplete = result.preState.state === 'complete';
  if (
    result.preState.appliedTargetCount !== (wasComplete ? 1 : 0) ||
    result.preState.lastAppliedTag !==
      (wasComplete ? '0057_actuals_restatement_commands' : '0056_actuals_draft_revisions')
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['preState'],
      message: '0057 pre-state must agree with its exact predecessor or completed ledger identity',
    });
  }
  if (
    (wasComplete && result.applied) ||
    result.postState !== (wasComplete || result.applied ? 'complete' : 'ready')
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['applied'],
      message: '0057 apply and replay flags must agree with before/after ledger states',
    });
  }
}

export const ActualsRestatementMigrationResultV1Schema =
  ActualsRestatementMigrationResultObjectSchema.superRefine(validateActualsRestatementResult);
export type ActualsRestatementMigrationResultV1 = z.infer<
  typeof ActualsRestatementMigrationResultV1Schema
>;

export const SchemaReconcileActualsRestatementReceiptV1Schema =
  ActualsRestatementMigrationResultObjectSchema.extend({
    repository: GitHubRepositorySchema,
    workflowPath: z.literal('.github/workflows/prod-schema-reconcile.yml'),
    runId: PositiveDecimalIdSchema,
    runAttempt: z.literal(1),
    mode: z.literal('apply-actuals-restatement-0057'),
    sourceSha: SourceShaSchema,
    postState: z.literal('complete'),
    buildTimeMs: z.number().int().min(0).max(900_000),
    result: z.literal('applied_and_clean'),
  })
    .strict()
    .superRefine(validateActualsRestatementResult);

export type SchemaReconcileActualsRestatementReceiptV1 = z.infer<
  typeof SchemaReconcileActualsRestatementReceiptV1Schema
>;

export const ActualsMigrationPreflightInputSchema = z
  .object({
    mode: z.enum(['apply-actuals-draft-0056', 'apply-actuals-restatement-0057']),
    repository: GitHubRepositorySchema,
    candidateSha: SourceShaSchema,
    runId: PositiveDecimalIdSchema,
    runAttempt: z.literal(1),
    databaseUrl: z.string().min(1),
    provider: z
      .object({
        projectId: z.string().regex(/^[a-z0-9-]{1,60}$/),
        branchId: z.string().regex(/^[a-z0-9-]{1,60}$/),
        endpointId: z.string().regex(/^[a-z0-9-]{1,60}$/),
        databaseName: z.string().regex(/^[A-Za-z0-9_-]{1,63}$/),
        roleName: z.string().regex(/^[A-Za-z0-9_.-]{1,63}$/),
      })
      .strict(),
  })
  .strict();
export type ActualsMigrationPreflightInput = z.infer<typeof ActualsMigrationPreflightInputSchema>;

export const ACTUALS_MIGRATION_PREFLIGHT_PREDICATES = [
  'current-protected-source-and-ci',
  'protected-provider-and-database-identity',
  'exact-body-migration-authority',
  'backup-and-pitr-recoverability',
  'restore-freshness-window-definition',
  'isolated-restore-evidence',
  'custody-role-definitions',
  'exact-live-digest-and-evidence-custody',
  'migration-isolation-containment-and-residue',
  'final-runtime-admission',
] as const;
export const ActualsMigrationPredicateObservationSchema = z
  .object({
    predicate: z.enum(ACTUALS_MIGRATION_PREFLIGHT_PREDICATES),
    status: z.enum([
      'verified',
      'failed',
      'missing_live_evidence',
      'unavailable_owner_definition',
      'missing_collector_engineering',
    ]),
    code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    evidenceRefs: z.array(z.object({ source: z.string().min(1), id: z.string().min(1) }).strict()),
  })
  .strict();
export type ActualsMigrationPredicateObservation = z.infer<
  typeof ActualsMigrationPredicateObservationSchema
>;

// This report is an observation. Parsing or passing its pure evaluation never grants apply.
export const ActualsMigrationPreflightReportSchema = z
  .object({
    schemaVersion: z.literal('actuals-migration-preflight/1.0.0'),
    binding: ActualsMigrationPreflightInputSchema.omit({ databaseUrl: true })
      .extend({
        workflowPath: z.literal('.github/workflows/prod-schema-reconcile.yml'),
        migration: z
          .object({
            tag: z.string(),
            idx: z.number().int(),
            when: z.number().int(),
            sqlSha256: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
        manifest: z
          .object({ path: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) })
          .strict(),
        targetFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
    evaluation: z.enum(['pass', 'blocked']),
    observations: z.array(ActualsMigrationPredicateObservationSchema),
  })
  .strict();
export type ActualsMigrationPreflightReport = z.infer<typeof ActualsMigrationPreflightReportSchema>;
