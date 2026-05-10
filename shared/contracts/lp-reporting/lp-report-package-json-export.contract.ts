import { z } from 'zod';

import {
  ReportPackageRenderModelSchema,
  ReportPackageRenderSourceSchema,
} from './lp-report-package-render-model.contract';

const PositiveIdSchema = z.number().int().positive();
const NonnegativeIntegerSchema = z.number().int().nonnegative();
const Sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const ReportPackageJsonExportFormatSchema = z.literal('json');
export const ReportPackageExportFormatSchema = z.literal('json');
export const ReportPackageExportStatusSchema = z.literal('ready');
export const ReportPackageExportHashAlgorithmSchema = z.literal('sha256');

export const ReportPackageJsonExportArtifactSchema = z
  .object({
    exportVersion: z.literal(1),
    format: ReportPackageJsonExportFormatSchema,
    source: ReportPackageRenderSourceSchema,
    renderModel: ReportPackageRenderModelSchema,
  })
  .strict();

export const ReportPackageJsonExportDocumentSchema = ReportPackageJsonExportArtifactSchema.extend({
  contentHashAlgorithm: ReportPackageExportHashAlgorithmSchema,
  contentHash: Sha256HexSchema,
}).strict();

export const ReportPackageJsonExportResponseSchema = z
  .object({
    export: ReportPackageJsonExportDocumentSchema,
  })
  .strict();

export const ReportPackageExportRecordSchema = z
  .object({
    reportPackageExportId: PositiveIdSchema,
    fundId: PositiveIdSchema,
    metricRunId: PositiveIdSchema,
    reportPackageId: PositiveIdSchema,
    format: ReportPackageExportFormatSchema,
    exportVersion: z.literal(1),
    status: ReportPackageExportStatusSchema,
    contentHashAlgorithm: ReportPackageExportHashAlgorithmSchema,
    contentHash: Sha256HexSchema,
    artifactSizeBytes: NonnegativeIntegerSchema,
    createdBy: PositiveIdSchema,
    readyAt: z.string().datetime(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const ReportPackageJsonStoredExportResponseSchema = z
  .object({
    record: ReportPackageExportRecordSchema,
    inserted: z.boolean(),
  })
  .strict();

export const ReportPackageJsonStoredExportGetResponseSchema = z
  .object({
    record: ReportPackageExportRecordSchema.nullable(),
  })
  .strict();

export const ReportPackageJsonStoredArtifactResponseSchema = z
  .object({
    record: ReportPackageExportRecordSchema,
    export: ReportPackageJsonExportDocumentSchema,
  })
  .strict();

export const ReportPackageExportNotFoundResponseSchema = z
  .object({
    error: z.literal('REPORT_PACKAGE_EXPORT_NOT_FOUND'),
    message: z.string().min(1),
  })
  .strict();

export const ReportPackageExportContentHashConflictResponseSchema = z
  .object({
    error: z.literal('EXPORT_CONTENT_HASH_CONFLICT'),
    message: z.string().min(1),
    storedContentHash: Sha256HexSchema,
    currentContentHash: Sha256HexSchema,
  })
  .strict();

export const ReportPackageJsonExportBlockerCodeSchema = z.enum([
  'EVIDENCE_REFERENCE_INVALID',
  'EVIDENCE_RESTRICTED',
  'EVIDENCE_REDACTION_REQUIRED',
]);

export const ReportPackageJsonExportBlockerSchema = z
  .object({
    code: ReportPackageJsonExportBlockerCodeSchema,
    message: z.string().min(1),
    evidenceRecordId: PositiveIdSchema.optional(),
    evidenceRecordIds: z.array(PositiveIdSchema).min(1).optional(),
  })
  .strict();

export const ReportPackageJsonExportBlockedResponseSchema = z
  .object({
    error: z.literal('REPORT_PACKAGE_JSON_EXPORT_BLOCKED'),
    message: z.string().min(1),
    blockers: z.array(ReportPackageJsonExportBlockerSchema).min(1),
  })
  .strict();

export type ReportPackageJsonExportArtifact = z.infer<typeof ReportPackageJsonExportArtifactSchema>;
export type ReportPackageJsonExportDocument = z.infer<typeof ReportPackageJsonExportDocumentSchema>;
export type ReportPackageJsonExportResponse = z.infer<typeof ReportPackageJsonExportResponseSchema>;
export type ReportPackageExportFormat = z.infer<typeof ReportPackageExportFormatSchema>;
export type ReportPackageExportStatus = z.infer<typeof ReportPackageExportStatusSchema>;
export type ReportPackageExportRecord = z.infer<typeof ReportPackageExportRecordSchema>;
export type ReportPackageJsonStoredExportResponse = z.infer<
  typeof ReportPackageJsonStoredExportResponseSchema
>;
export type ReportPackageJsonStoredExportGetResponse = z.infer<
  typeof ReportPackageJsonStoredExportGetResponseSchema
>;
export type ReportPackageJsonStoredArtifactResponse = z.infer<
  typeof ReportPackageJsonStoredArtifactResponseSchema
>;
export type ReportPackageExportNotFoundResponse = z.infer<
  typeof ReportPackageExportNotFoundResponseSchema
>;
export type ReportPackageExportContentHashConflictResponse = z.infer<
  typeof ReportPackageExportContentHashConflictResponseSchema
>;
export type ReportPackageJsonExportBlocker = z.infer<typeof ReportPackageJsonExportBlockerSchema>;
export type ReportPackageJsonExportBlockedResponse = z.infer<
  typeof ReportPackageJsonExportBlockedResponseSchema
>;
