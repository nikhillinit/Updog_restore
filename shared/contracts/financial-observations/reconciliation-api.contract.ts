/**
 * Reconciliation / import-batch V2 API contract (PLAN_61 Wave C, Task 6).
 *
 * Request/response DTOs for the six acceptance-layer routes (R1-R6) that stage
 * CSV observed-actual observations, reconcile identity/duplicate cases, and
 * accept singleton dependency groups. Additive to the byte-frozen V1
 * `csv | notion` import contract, which is unchanged.
 *
 * Privacy invariant (third-review finding 5): no DTO here exposes
 * `observationHash` or `candidateFingerprint`. They are persisted server-side
 * only; `previewHash` is the sole opaque digest the client ever sees.
 */
import { z } from 'zod';

import { IMPORT_V2_CONTRACT_VERSION } from './normalization.contract';
import {
  ImportBatchStatusSchema,
  Sha256HexSchema,
  SourceObservationStatusSchema,
} from './financial-observation.contract';
import {
  ReconciliationCanonicalRecordRefV1Schema,
  ReconciliationCaseStatusSchema,
  ReconciliationCaseTypeSchema,
  ReconciliationResolutionActionSchema,
} from './reconciliation.contract';

/** Operator/source attestation carried by R1. Not durable provenance. */
export const IMPORT_DATA_BASIS = 'observed_actual' as const;
export const ImportDataBasisSchema = z.literal(IMPORT_DATA_BASIS);

export type ImportBatchStatus = z.infer<typeof ImportBatchStatusSchema>;

const PositiveIntSchema = z.number().int().positive();
const IsoDateTimeSchema = z.string().datetime();

/** Surrogate singleton dependency-group key for a staged observation (§7). */
export const DEPENDENCY_GROUP_KEY_PREFIX = 'source-observation' as const;
export function dependencyGroupKeyForObservation(observationId: number): string {
  return `${DEPENDENCY_GROUP_KEY_PREFIX}:${observationId}`;
}

/**
 * Error codes surfaced by the Task 6 acceptance layer. Kept as a pinned union
 * so route mapping and service throw sites stay in lock-step with tests.
 */
export const RECONCILIATION_API_ERROR_CODES = [
  // R1 staging
  'INVALID_BODY',
  'INVALID_IDEMPOTENCY_KEY',
  'IDEMPOTENCY_KEY_REUSE',
  'ARTIFACT_NOT_FOUND',
  'MAPPING_PROFILE_NOT_FOUND',
  'ARTIFACT_SOURCE_TYPE_UNSUPPORTED',
  'PROFILE_SOURCE_TYPE_UNSUPPORTED',
  'PROFILE_DOMAIN_MISMATCH',
  'ARTIFACT_PAYLOAD_UNAVAILABLE',
  'DESCRIPTOR_MAPPING_NOT_ALLOWED',
  'MEASURE_KEY_MAPPING_REQUIRED',
  'FUTURE_EFFECTIVE_DATE_UNSUPPORTED',
  'NORMALIZATION_REJECTED',
  'DUPLICATE_OBSERVATION_IN_BATCH',
  'OBSERVATION_ALREADY_ACCEPTED',
  // Identity / case resolution
  'CASE_NOT_FOUND',
  'CASE_NOT_OPEN',
  'RESOLUTION_ACTION_INVALID',
  'RESOLUTION_MEMO_REQUIRED',
  'CANONICAL_TARGET_INVALID',
  'CANONICAL_TARGET_NOT_FOUND',
  'CANONICAL_TARGET_DOMAIN_MISMATCH',
  'IDENTITY_NOT_FOUND',
  'IDENTITY_ALREADY_RESOLVED',
  'IDENTITY_LABEL_EMPTY',
  'PROFILE_ALIAS_CONFLICT',
  'CROSS_FUND_IDENTITY_MERGE_UNSUPPORTED',
  'IDENTITY_MERGE_HEAD_CHANGED',
  'IDENTITY_MERGE_CYCLE',
  'DUPLICATE_CASE_ID',
  // R6 commit
  'PREVIEW_HASH_MISMATCH',
  'DEPENDENCY_GROUP_INCOMPLETE',
  'UNKNOWN_GROUP_KEY',
  'OBSERVATION_NOT_STAGED',
  // Shared preconditions / expiry
  'PRECONDITION_REQUIRED',
  'PRECONDITION_FAILED',
  'BATCH_EXPIRED',
  'CROSS_FUND_REFERENCE',
] as const;
export const ReconciliationApiErrorCodeSchema = z.enum(RECONCILIATION_API_ERROR_CODES);
export type ReconciliationApiErrorCode = z.infer<typeof ReconciliationApiErrorCodeSchema>;

// --- R1: stage import batch -------------------------------------------------

export const StageImportBatchRequestSchema = z
  .object({
    contractVersion: z.literal(IMPORT_V2_CONTRACT_VERSION),
    sourceArtifactId: PositiveIntSchema,
    mappingProfileId: PositiveIntSchema,
    dataBasis: ImportDataBasisSchema,
  })
  .strict();
export type StageImportBatchRequest = z.infer<typeof StageImportBatchRequestSchema>;

export const StagedObservationReceiptSchema = z
  .object({
    id: PositiveIntSchema,
    sourceLocator: z.string().min(1),
    dependencyGroupKey: z.string().min(1),
  })
  .strict();
export type StagedObservationReceipt = z.infer<typeof StagedObservationReceiptSchema>;

export const StageImportBatchReceiptSchema = z
  .object({
    batchId: PositiveIntSchema,
    sourceArtifactId: PositiveIntSchema,
    mappingProfileId: PositiveIntSchema,
    dataBasis: ImportDataBasisSchema,
    previewHash: Sha256HexSchema,
    purgeAfter: IsoDateTimeSchema,
    observations: z.array(StagedObservationReceiptSchema),
    initialCaseIds: z.array(PositiveIntSchema),
  })
  .strict();
export type StageImportBatchReceipt = z.infer<typeof StageImportBatchReceiptSchema>;

// --- R2: batch status -------------------------------------------------------

export const ImportBatchGroupSchema = z
  .object({
    dependencyGroupKey: z.string().min(1),
    observationId: PositiveIntSchema,
    observationStatus: SourceObservationStatusSchema,
    sourceLocator: z.string().min(1),
    caseIds: z.array(PositiveIntSchema),
    accepted: z.boolean(),
  })
  .strict();
export type ImportBatchGroup = z.infer<typeof ImportBatchGroupSchema>;

export const ImportBatchBlockerSchema = z
  .object({
    caseId: PositiveIntSchema,
    caseType: ReconciliationCaseTypeSchema,
    status: ReconciliationCaseStatusSchema,
    observationId: PositiveIntSchema.nullable(),
  })
  .strict();
export type ImportBatchBlocker = z.infer<typeof ImportBatchBlockerSchema>;

export const ImportBatchStatusResponseSchema = z
  .object({
    batchId: PositiveIntSchema,
    sourceArtifactId: PositiveIntSchema.nullable(),
    mappingProfileId: PositiveIntSchema.nullable(),
    status: ImportBatchStatusSchema,
    dataBasis: ImportDataBasisSchema,
    previewHash: Sha256HexSchema.nullable(),
    purgeAfter: IsoDateTimeSchema,
    retentionExtendedUntil: IsoDateTimeSchema.nullable(),
    purgedAt: IsoDateTimeSchema.nullable(),
    expired: z.boolean(),
    version: PositiveIntSchema,
    etag: z.string().min(1),
    groups: z.array(ImportBatchGroupSchema),
    blockers: z.array(ImportBatchBlockerSchema),
  })
  .strict();
export type ImportBatchStatusResponse = z.infer<typeof ImportBatchStatusResponseSchema>;

// --- R3/R4/R5: reconciliation cases ----------------------------------------

/**
 * Resolution decision accepted by R4/R5 and echoed on the case DTO. Same shape
 * as the persisted `ReconciliationResolutionV1` (action + target + memo, plus
 * the additive `sourceCompanyIdentityId`/`canonicalName`/`targetCanonicalRecordRef`).
 * Action-specific requirements are enforced service-side per the §8 matrix.
 */
export const ReconciliationResolutionApiV1Schema = z
  .object({
    action: ReconciliationResolutionActionSchema,
    targetCompanyIdentityId: PositiveIntSchema.nullable(),
    memo: z.string().min(1),
    sourceCompanyIdentityId: PositiveIntSchema.optional(),
    canonicalName: z.string().min(1).optional(),
    targetCanonicalRecordRef: ReconciliationCanonicalRecordRefV1Schema.optional(),
  })
  .strict();

/**
 * Sanitized case projection (no `observationHash`/`candidateFingerprint`).
 * `etag` is the per-case optimistic-concurrency token clients echo via If-Match.
 */
export const ReconciliationCaseDtoSchema = z
  .object({
    id: PositiveIntSchema,
    fundId: PositiveIntSchema,
    importBatchId: PositiveIntSchema.nullable(),
    sourceObservationId: PositiveIntSchema.nullable(),
    caseType: ReconciliationCaseTypeSchema,
    status: ReconciliationCaseStatusSchema,
    resolution: ReconciliationResolutionApiV1Schema.nullable(),
    resolvedBy: PositiveIntSchema.nullable(),
    resolvedAt: IsoDateTimeSchema.nullable(),
    version: PositiveIntSchema,
    createdAt: IsoDateTimeSchema,
    etag: z.string().min(1),
  })
  .strict();
export type ReconciliationCaseDto = z.infer<typeof ReconciliationCaseDtoSchema>;

export const ResolveCaseRequestSchema = ReconciliationResolutionApiV1Schema;
export type ResolveCaseRequest = z.infer<typeof ResolveCaseRequestSchema>;

export const ReconciliationCaseResponseSchema = z
  .object({ case: ReconciliationCaseDtoSchema })
  .strict();
export type ReconciliationCaseResponse = z.infer<typeof ReconciliationCaseResponseSchema>;

export const ListReconciliationCasesResponseSchema = z
  .object({ cases: z.array(ReconciliationCaseDtoSchema) })
  .strict();
export type ListReconciliationCasesResponse = z.infer<typeof ListReconciliationCasesResponseSchema>;

export const ListReconciliationCasesQuerySchema = z
  .object({ status: ReconciliationCaseStatusSchema.optional() })
  .strict();

// R5 bulk-resolve: unique case IDs, per-item If-Match + decision, ordered
// partial-result envelope (one transaction per item).
export const BulkResolveItemSchema = z
  .object({
    caseId: PositiveIntSchema,
    ifMatch: z.string().min(1),
    decision: ReconciliationResolutionApiV1Schema,
  })
  .strict();
export type BulkResolveItem = z.infer<typeof BulkResolveItemSchema>;

export const BulkResolveRequestSchema = z
  .object({ items: z.array(BulkResolveItemSchema).min(1) })
  .strict();
export type BulkResolveRequest = z.infer<typeof BulkResolveRequestSchema>;

export const BulkResolveResultItemSchema = z
  .object({
    caseId: PositiveIntSchema,
    ok: z.boolean(),
    httpStatus: z.number().int(),
    case: ReconciliationCaseDtoSchema.nullable(),
    error: z
      .object({ code: ReconciliationApiErrorCodeSchema, message: z.string().min(1) })
      .strict()
      .nullable(),
  })
  .strict();
export type BulkResolveResultItem = z.infer<typeof BulkResolveResultItemSchema>;

export const BulkResolveResponseSchema = z
  .object({ results: z.array(BulkResolveResultItemSchema) })
  .strict();
export type BulkResolveResponse = z.infer<typeof BulkResolveResponseSchema>;

// --- R6: acceptance-only commit --------------------------------------------

export const CommitImportBatchRequestSchema = z
  .object({
    previewHash: Sha256HexSchema,
    requestedGroupKeys: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type CommitImportBatchRequest = z.infer<typeof CommitImportBatchRequestSchema>;

export const CommitImportBatchResponseSchema = z
  .object({ batch: ImportBatchStatusResponseSchema })
  .strict();
export type CommitImportBatchResponse = z.infer<typeof CommitImportBatchResponseSchema>;
