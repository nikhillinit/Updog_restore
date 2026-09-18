import { z } from 'zod';
import {
  ACTUALS_LEDGER_MAX_BYTES,
  ACTUALS_VALUATION_MAX_BYTES,
  GregorianDateSchema,
} from './actuals-pilot.contract';
import {
  ACTUALS_LEDGER_TEMPLATE_VERSION,
  ACTUALS_VALUATION_TEMPLATE_VERSION,
} from './actuals-pilot-templates';

export const ACTUALS_DRAFT_HISTORY_PAGE_SIZE = 20;
const positiveInt = z.number().int().positive().max(2_147_483_647);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const fileName = z
  .string()
  .min(1)
  .max(255)
  .refine((value) => !/[\p{Cc}\\/]/u.test(value));
const note = z.string().trim().min(1).max(500);
const base64 = (bytes: number) =>
  z
    .string()
    .max(4 * Math.ceil(bytes / 3))
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);

export const ActualsDraftIfMatchSchema = z
  .string()
  .regex(/^"actuals-draft:[1-9][0-9]{0,9}:(?:none|[1-9][0-9]{0,9}:[a-f0-9]{64})"$/);
export const ActualsDraftIdempotencyKeySchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
export const ActualsDraftRevisionParamSchema = z
  .string()
  .regex(/^[1-9][0-9]{0,9}$/)
  .transform(Number)
  .pipe(positiveInt);
export const ActualsDraftHistoryQuerySchema = z
  .object({
    beforeRevision: ActualsDraftRevisionParamSchema.optional(),
  })
  .strict();

export const ActualsDraftLedgerFileV1Schema = z
  .object({
    templateVersion: z.literal(ACTUALS_LEDGER_TEMPLATE_VERSION),
    fileName,
    payload: base64(ACTUALS_LEDGER_MAX_BYTES),
  })
  .strict();
export const ActualsDraftValuationFileV1Schema = z
  .object({
    templateVersion: z.literal(ACTUALS_VALUATION_TEMPLATE_VERSION),
    fileName,
    payload: base64(ACTUALS_VALUATION_MAX_BYTES),
  })
  .strict();
export const ActualsDraftSaveRequestV1Schema = z
  .object({
    contractVersion: z.literal('actuals-draft-save/1.0.0'),
    classification: z.enum(['provisional', 'synthetic']),
    asOfDate: GregorianDateSchema.nullable(),
    sourceNote: note,
    correctionReason: note,
    ledger: ActualsDraftLedgerFileV1Schema,
    valuation: ActualsDraftValuationFileV1Schema.nullable(),
  })
  .strict();

export const ActualsDraftHeadV1Schema = z
  .object({
    revision: positiveInt,
    revisionHash: sha256,
    etag: ActualsDraftIfMatchSchema,
  })
  .strict();
const fileMetadata = {
  fileName,
  payloadSha256: sha256,
  byteCount: z.number().int().nonnegative(),
  sourceArtifactId: positiveInt,
  purgeAfter: z.string().datetime(),
};
export const ActualsDraftRevisionV1Schema = ActualsDraftHeadV1Schema.extend({
  fundId: positiveInt,
  priorRevision: positiveInt.nullable(),
  priorRevisionHash: sha256.nullable(),
  classification: ActualsDraftSaveRequestV1Schema.shape.classification,
  asOfDate: GregorianDateSchema.nullable(),
  sourceNote: note,
  correctionReason: note,
  createdBy: positiveInt,
  createdAt: z.string().datetime(),
  ledger: z
    .object({
      ...fileMetadata,
      templateVersion: z.literal(ACTUALS_LEDGER_TEMPLATE_VERSION),
      byteCount: fileMetadata.byteCount.max(ACTUALS_LEDGER_MAX_BYTES),
    })
    .strict(),
  valuation: z
    .object({
      ...fileMetadata,
      templateVersion: z.literal(ACTUALS_VALUATION_TEMPLATE_VERSION),
      byteCount: fileMetadata.byteCount.max(ACTUALS_VALUATION_MAX_BYTES),
    })
    .strict()
    .nullable(),
}).strict();
export const ActualsDraftSaveResponseV1Schema = z
  .object({
    contractVersion: z.literal('actuals-draft-save-result/1.0.0'),
    idempotencyKey: ActualsDraftIdempotencyKeySchema,
    requestHash: sha256,
    revision: ActualsDraftRevisionV1Schema,
    replayed: z.boolean(),
  })
  .strict();
export const ActualsDraftHistoryResponseV1Schema = z
  .object({
    contractVersion: z.literal('actuals-draft-history/1.0.0'),
    fundId: positiveInt,
    head: ActualsDraftHeadV1Schema.nullable(),
    revisions: z.array(ActualsDraftRevisionV1Schema).max(ACTUALS_DRAFT_HISTORY_PAGE_SIZE),
    nextBeforeRevision: positiveInt.nullable(),
  })
  .strict();
const payloadReadback = z
  .object({
    payload: base64(ACTUALS_LEDGER_MAX_BYTES).nullable(),
    payloadAvailable: z.boolean(),
  })
  .strict()
  .refine((value) => value.payloadAvailable === (value.payload !== null));
export const ActualsDraftDetailResponseV1Schema = z
  .object({
    contractVersion: z.literal('actuals-draft-detail/1.0.0'),
    revision: ActualsDraftRevisionV1Schema,
    ledger: payloadReadback,
    valuation: payloadReadback.nullable(),
  })
  .strict();

export type ActualsDraftSaveRequestV1 = z.infer<typeof ActualsDraftSaveRequestV1Schema>;
export type ActualsDraftHeadV1 = z.infer<typeof ActualsDraftHeadV1Schema>;
export type ActualsDraftRevisionV1 = z.infer<typeof ActualsDraftRevisionV1Schema>;
export type ActualsDraftSaveResponseV1 = z.infer<typeof ActualsDraftSaveResponseV1Schema>;
export type ActualsDraftHistoryResponseV1 = z.infer<typeof ActualsDraftHistoryResponseV1Schema>;
export type ActualsDraftDetailResponseV1 = z.infer<typeof ActualsDraftDetailResponseV1Schema>;
