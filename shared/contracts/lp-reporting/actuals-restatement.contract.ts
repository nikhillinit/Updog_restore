import { z } from 'zod';

import {
  ActualsCorrectionProvenanceV1Schema,
  ActualsOriginalPublicationV1Schema,
  ActualsRecordIdentityV1Schema,
  FinancialCapitalActualsV1Schema,
  FinancialFactsBasisRefSchema,
  FinancialValuationActualsV1Schema,
} from '../financial-facts-snapshot-v1.contract';
import {
  ACTUALS_MAX_ROWS,
  ActualsDeploymentCategorySchema,
  ActualsDistributionTypeSchema,
  ActualsExpenseCategorySchema,
  ActualsExternalRefSchema,
  ActualsLedgerEventTypeSchema,
  ActualsPilotCentExactMoneySchema,
  ActualsPublishFileV1Schema,
  ActualsPublishReceiptV2Schema,
  FinancialFactsETagSchema,
  GregorianDateSchema,
  isFormulaLikeValue,
} from './actuals-pilot.contract';
import {
  ACTUALS_LEDGER_TEMPLATE_VERSION,
  ACTUALS_VALUATION_TEMPLATE_VERSION,
} from './actuals-pilot-templates';

export const ACTUALS_RESTATEMENT_CONTRACT_VERSION = 'actuals-restatement/1.0.0' as const;
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const PositiveIdSchema = z.number().int().positive().max(2_147_483_647);
const ReasonSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => !isFormulaLikeValue(value), 'Formula-like values are not accepted.');

export const ActualsRestatementItemMappingV1Schema = z
  .object({
    target: ActualsRecordIdentityV1Schema,
    originalPublication: ActualsOriginalPublicationV1Schema,
    replacementExternalRef: ActualsExternalRefSchema,
    expectedReplacementContentHash: HashSchema,
  })
  .strict();

const RestatementRequestSchema = z
  .object({
    contractVersion: z.literal(ACTUALS_RESTATEMENT_CONTRACT_VERSION),
    expectedBasis: FinancialFactsBasisRefSchema,
    expectedETag: FinancialFactsETagSchema,
    ledger: ActualsPublishFileV1Schema.extend({
      templateVersion: z.literal(ACTUALS_LEDGER_TEMPLATE_VERSION),
    })
      .strict()
      .nullable(),
    valuation: ActualsPublishFileV1Schema.extend({
      templateVersion: z.literal(ACTUALS_VALUATION_TEMPLATE_VERSION),
    })
      .strict()
      .nullable(),
    items: z.array(ActualsRestatementItemMappingV1Schema).min(1).max(ACTUALS_MAX_ROWS),
    reason: ReasonSchema,
  })
  .strict();

function refineRestatementRequest(
  value: z.infer<typeof RestatementRequestSchema>,
  ctx: z.RefinementCtx
): void {
  if (
    value.expectedETag !==
    `"financial-facts:${value.expectedBasis.snapshotId}:${value.expectedBasis.snapshotInputHash}"`
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expectedETag'],
      message: 'ETag must identify the exact expected basis.',
    });
  }
  for (const kind of ['ledger', 'valuation'] as const) {
    if (value.items.some((item) => item.target.kind === kind) !== (value[kind] !== null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [kind],
        message:
          'Each supplied file must have at least one mapped target, and each target requires its file.',
      });
    }
  }
  const targets = new Set<string>();
  const refs = new Set<string>();
  value.items.forEach((item, index) => {
    const key = `${item.target.kind}:${item.target.recordId}`;
    if (targets.has(key) || refs.has(item.replacementExternalRef)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items', index],
        message: 'Targets and replacement external references must be unique.',
      });
    }
    targets.add(key);
    refs.add(item.replacementExternalRef);
  });
}

export const ActualsRestatementPreviewRequestV1Schema =
  RestatementRequestSchema.superRefine(refineRestatementRequest);
export const ActualsRestatementPublishRequestV1Schema = RestatementRequestSchema.extend({
  expectedPreviewHash: HashSchema,
})
  .strict()
  .superRefine(refineRestatementRequest);

export const ActualsRestatementRecordFieldsV1Schema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('ledger'),
      eventType: ActualsLedgerEventTypeSchema,
      effectiveDate: GregorianDateSchema,
      amount: ActualsPilotCentExactMoneySchema,
      currency: z.literal('USD'),
      companyId: PositiveIdSchema.nullable(),
      vehicleId: PositiveIdSchema,
      deploymentCategory: ActualsDeploymentCategorySchema.nullable(),
      expenseCategory: ActualsExpenseCategorySchema.nullable(),
      distributionType: ActualsDistributionTypeSchema.nullable(),
      recallable: z.boolean().nullable(),
      description: z.string().max(500).nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('valuation'),
      markDate: GregorianDateSchema,
      fairValue: ActualsPilotCentExactMoneySchema,
      currency: z.literal('USD'),
      companyId: PositiveIdSchema,
      vehicleId: PositiveIdSchema,
      markPurpose: z.string().min(1).max(64),
      markSource: z.string().min(1).max(64),
      confidenceLevel: z.string().min(1).max(64),
      valuationMethod: z.string().min(1).max(64),
      costBasis: ActualsPilotCentExactMoneySchema.nullable(),
    })
    .strict(),
]);

export const ActualsRestatementTargetV1Schema = z
  .object({
    identity: ActualsRecordIdentityV1Schema,
    fields: ActualsRestatementRecordFieldsV1Schema,
    sourceExternalRef: ActualsExternalRefSchema,
    originalPublication: ActualsOriginalPublicationV1Schema,
    predecessor: ActualsRecordIdentityV1Schema.nullable(),
    correctionCommandId: z.string().uuid().nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.identity.kind !== value.fields.kind ||
      (value.predecessor !== null && value.identity.kind !== value.predecessor.kind)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Record fields and predecessor must match the target kind.',
      });
    }
  });

export const ActualsRestatementErrorCodeV1Schema = z.enum([
  'ACTUALS_PUBLICATION_DISABLED',
  'STALE_BASIS',
  'INVALID_TARGET',
  'TARGET_NOT_EFFECTIVE',
  'TARGET_HASH_MISMATCH',
  'TARGET_NOT_ADMITTED',
  'REPLACEMENT_MAPPING_MISMATCH',
  'EXTERNAL_REF_REUSE_CONFLICT',
  'INVALID_REPLACEMENT_LINEAGE',
  'HISTORICAL_MARK_RESTATEMENT_UNSUPPORTED',
  'VALUATION_SCOPE_MISMATCH',
  'EFFECTIVE_BASIS_INVALID',
  'PREVIEW_HASH_MISMATCH',
  'INVALID_CURSOR',
]);

export const ActualsRestatementPreviewResponseV1Schema = z
  .object({
    contractVersion: z.literal(ACTUALS_RESTATEMENT_CONTRACT_VERSION),
    basisRef: FinancialFactsBasisRefSchema,
    previewHash: HashSchema,
    canPublish: z.boolean(),
    items: z
      .array(
        z
          .object({
            original: ActualsRestatementTargetV1Schema,
            replacementExternalRef: ActualsExternalRefSchema,
            replacementContentHash: HashSchema,
            replacementFields: ActualsRestatementRecordFieldsV1Schema,
          })
          .strict()
      )
      .min(1)
      .max(ACTUALS_MAX_ROWS),
    impact: z
      .object({
        capitalActuals: FinancialCapitalActualsV1Schema,
        valuationActuals: FinancialValuationActualsV1Schema,
        unavailableCompanyIds: z.array(PositiveIdSchema),
      })
      .strict()
      .nullable(),
    errors: z
      .array(
        z
          .object({
            code: ActualsRestatementErrorCodeV1Schema,
            message: z.string().min(1).max(500),
            target: ActualsRecordIdentityV1Schema.nullable(),
          })
          .strict()
      )
      .max(ACTUALS_MAX_ROWS),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.canPublish !== (value.errors.length === 0 && value.impact !== null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['canPublish'],
        message: 'A publishable preview requires complete impact and no errors.',
      });
    }
  });

export const ActualsRestatementReceiptV1Schema = ActualsPublishReceiptV2Schema.options[1];

/** Decode the opaque transport cursor before parsing this fund-and-basis-bound value. */
export const ActualsRestatementCursorV1Schema = z
  .object({
    contractVersion: z.literal('actuals-restatement-cursor/1.0.0'),
    scope: z.enum(['targets', 'history']),
    fundId: PositiveIdSchema,
    snapshotId: PositiveIdSchema,
    snapshotInputHash: HashSchema,
    afterId: PositiveIdSchema,
    afterKind: z.enum(['ledger', 'valuation', 'command']),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.scope === 'history') !== (value.afterKind === 'command')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['afterKind'],
        message: 'Cursor key must match its collection.',
      });
    }
  });

export const ActualsRestatementReadRequestV1Schema = z
  .object({
    expectedBasis: FinancialFactsBasisRefSchema,
    limit: z.number().int().min(1).max(100).default(50),
    cursor: z.string().min(1).max(2048).nullable(),
  })
  .strict();

export const ActualsRestatementTargetsResponseV1Schema = z
  .object({
    contractVersion: z.literal(ACTUALS_RESTATEMENT_CONTRACT_VERSION),
    basisRef: FinancialFactsBasisRefSchema,
    targets: z.array(ActualsRestatementTargetV1Schema).max(100),
    nextCursor: z.string().min(1).max(2048).nullable(),
  })
  .strict();

export const ActualsRestatementHistoryResponseV1Schema = z
  .object({
    contractVersion: z.literal(ACTUALS_RESTATEMENT_CONTRACT_VERSION),
    basisRef: FinancialFactsBasisRefSchema,
    history: z
      .array(
        z
          .object({
            id: PositiveIdSchema,
            publication: ActualsOriginalPublicationV1Schema,
            correction: ActualsCorrectionProvenanceV1Schema,
          })
          .strict()
      )
      .max(100),
    nextCursor: z.string().min(1).max(2048).nullable(),
  })
  .strict();

export type ActualsRestatementItemMappingV1 = z.infer<typeof ActualsRestatementItemMappingV1Schema>;
export type ActualsRestatementPreviewRequestV1 = z.infer<
  typeof ActualsRestatementPreviewRequestV1Schema
>;
export type ActualsRestatementPublishRequestV1 = z.infer<
  typeof ActualsRestatementPublishRequestV1Schema
>;
export type ActualsRestatementPreviewResponseV1 = z.infer<
  typeof ActualsRestatementPreviewResponseV1Schema
>;
export type ActualsRestatementTargetV1 = z.infer<typeof ActualsRestatementTargetV1Schema>;
export type ActualsRestatementReceiptV1 = z.infer<typeof ActualsRestatementReceiptV1Schema>;
export type ActualsRestatementRecordFieldsV1 = z.infer<
  typeof ActualsRestatementRecordFieldsV1Schema
>;
export type ActualsRestatementErrorCodeV1 = z.infer<typeof ActualsRestatementErrorCodeV1Schema>;
export type ActualsRestatementCursorV1 = z.infer<typeof ActualsRestatementCursorV1Schema>;
export type ActualsRestatementReadRequestV1 = z.infer<typeof ActualsRestatementReadRequestV1Schema>;
export type ActualsRestatementTargetsResponseV1 = z.infer<
  typeof ActualsRestatementTargetsResponseV1Schema
>;
export type ActualsRestatementHistoryResponseV1 = z.infer<
  typeof ActualsRestatementHistoryResponseV1Schema
>;
