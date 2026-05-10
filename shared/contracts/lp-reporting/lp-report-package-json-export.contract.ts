import { z } from 'zod';

import {
  ReportPackageRenderModelSchema,
  ReportPackageRenderSourceSchema,
} from './lp-report-package-render-model.contract';

const PositiveIdSchema = z.number().int().positive();
const NonnegativeIntegerSchema = z.number().int().nonnegative();
const Sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const ReportPackageJsonExportFormatSchema = z.literal('json');
export const ReportPackageCsvExportFormatSchema = z.literal('csv');
export const ReportPackageExportFormatSchema = z.enum(['json', 'csv']);
export const ReportPackageExportStatusSchema = z.literal('ready');
export const ReportPackageExportHashAlgorithmSchema = z.literal('sha256');
export const ReportPackageCsvContentTypeSchema = z.literal('text/csv; charset=utf-8');

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

export const ReportPackageCsvExportDocumentSchema = z
  .object({
    exportVersion: z.literal(1),
    format: ReportPackageCsvExportFormatSchema,
    sourceJsonExportId: PositiveIdSchema,
    sourceJsonContentHash: Sha256HexSchema,
    contentType: ReportPackageCsvContentTypeSchema,
    filename: z.string().min(1),
    csv: z.string().min(1),
  })
  .strict();

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

const ReportPackageCsvStoredExportMetadataFields = {
  sourceJsonExportId: PositiveIdSchema,
  sourceJsonContentHash: Sha256HexSchema,
  contentType: ReportPackageCsvContentTypeSchema,
  filename: z.string().min(1),
} as const;

export const ReportPackageCsvStoredExportResponseSchema = z
  .object({
    record: ReportPackageExportRecordSchema,
    inserted: z.boolean(),
    ...ReportPackageCsvStoredExportMetadataFields,
  })
  .strict();

export const ReportPackageCsvStoredExportGetResponseSchema = z.union([
  z.object({ record: z.null() }).strict(),
  z
    .object({
      record: ReportPackageExportRecordSchema,
      ...ReportPackageCsvStoredExportMetadataFields,
    })
    .strict(),
]);

export const ReportPackageCsvStoredArtifactResponseSchema = z
  .object({
    record: ReportPackageExportRecordSchema,
    csv: ReportPackageCsvExportDocumentSchema,
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

export const ReportPackageCsvSourceJsonExportRequiredResponseSchema = z
  .object({
    error: z.literal('REPORT_PACKAGE_CSV_SOURCE_JSON_EXPORT_REQUIRED'),
    message: z.string().min(1),
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
export type ReportPackageCsvExportDocument = z.infer<typeof ReportPackageCsvExportDocumentSchema>;
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
export type ReportPackageCsvStoredExportResponse = z.infer<
  typeof ReportPackageCsvStoredExportResponseSchema
>;
export type ReportPackageCsvStoredExportGetResponse = z.infer<
  typeof ReportPackageCsvStoredExportGetResponseSchema
>;
export type ReportPackageCsvStoredArtifactResponse = z.infer<
  typeof ReportPackageCsvStoredArtifactResponseSchema
>;
export type ReportPackageExportNotFoundResponse = z.infer<
  typeof ReportPackageExportNotFoundResponseSchema
>;
export type ReportPackageExportContentHashConflictResponse = z.infer<
  typeof ReportPackageExportContentHashConflictResponseSchema
>;
export type ReportPackageCsvSourceJsonExportRequiredResponse = z.infer<
  typeof ReportPackageCsvSourceJsonExportRequiredResponseSchema
>;
export type ReportPackageJsonExportBlocker = z.infer<typeof ReportPackageJsonExportBlockerSchema>;
export type ReportPackageJsonExportBlockedResponse = z.infer<
  typeof ReportPackageJsonExportBlockedResponseSchema
>;
