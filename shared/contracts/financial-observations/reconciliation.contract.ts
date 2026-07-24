import { z } from 'zod';

import { Sha256HexSchema } from './financial-observation.contract';

export const RECONCILIATION_CASE_TYPES = ['identity_resolution', 'observation_match'] as const;
export const RECONCILIATION_CASE_STATUSES = ['open', 'resolved', 'expired_unresolved'] as const;
export const TERMINAL_RECONCILIATION_CASE_STATUSES = ['resolved', 'expired_unresolved'] as const;
export const RECONCILIATION_RESOLUTION_ACTIONS = [
  'confirm_match',
  'create_identity',
  'merge_identities',
  'reject',
] as const;

export const ReconciliationCaseTypeSchema = z.enum(RECONCILIATION_CASE_TYPES);
export const ReconciliationCaseStatusSchema = z.enum(RECONCILIATION_CASE_STATUSES);
export const ReconciliationResolutionActionSchema = z.enum(RECONCILIATION_RESOLUTION_ACTIONS);

export const RECONCILIATION_CANONICAL_RECORD_KINDS = ['cash_flow_event', 'valuation_mark'] as const;
export const ReconciliationCanonicalRecordKindSchema = z.enum(
  RECONCILIATION_CANONICAL_RECORD_KINDS
);

/**
 * Typed reference to the canonical record a confirmed `observation_match`
 * duplicate points at. Additive-optional so persisted 1.0.0 resolutions (which
 * lack it) still parse; the JSONB `resolution` column is schema-compatible.
 */
export const ReconciliationCanonicalRecordRefV1Schema = z
  .object({
    kind: ReconciliationCanonicalRecordKindSchema,
    id: z.number().int().positive(),
  })
  .strict();

export const ReconciliationResolutionV1Schema = z
  .object({
    action: ReconciliationResolutionActionSchema,
    targetCompanyIdentityId: z.number().int().positive().nullable(),
    memo: z.string().min(1),
    sourceCompanyIdentityId: z.number().int().positive().optional(),
    canonicalName: z.string().min(1).optional(),
    targetCanonicalRecordRef: ReconciliationCanonicalRecordRefV1Schema.optional(),
  })
  .strict();

export const ReconciliationCaseHistoryEntryV1Schema = z
  .object({
    at: z.string().datetime(),
    event: z.enum(['opened', 'updated', 'resolved', 'expired_unresolved']),
  })
  .strict();

export const ReconciliationCaseV1Schema = z
  .object({
    id: z.number().int().positive(),
    fundId: z.number().int().positive(),
    importBatchId: z.number().int().positive().nullable(),
    sourceObservationId: z.number().int().positive().nullable(),
    caseType: ReconciliationCaseTypeSchema,
    status: ReconciliationCaseStatusSchema,
    observationHash: Sha256HexSchema.nullable(),
    candidateFingerprint: Sha256HexSchema.nullable(),
    resolution: ReconciliationResolutionV1Schema.nullable(),
    resolvedBy: z.number().int().positive().nullable(),
    resolvedAt: z.string().datetime().nullable(),
    history: z.array(ReconciliationCaseHistoryEntryV1Schema),
    version: z.number().int().positive(),
    createdAt: z.string().datetime(),
  })
  .strict();

export type ReconciliationCanonicalRecordKind = z.infer<
  typeof ReconciliationCanonicalRecordKindSchema
>;
export type ReconciliationCanonicalRecordRefV1 = z.infer<
  typeof ReconciliationCanonicalRecordRefV1Schema
>;
export type ReconciliationResolutionV1 = z.infer<typeof ReconciliationResolutionV1Schema>;
export type ReconciliationCaseHistoryEntryV1 = z.infer<
  typeof ReconciliationCaseHistoryEntryV1Schema
>;
export type ReconciliationCaseV1 = z.infer<typeof ReconciliationCaseV1Schema>;
