import { z } from 'zod';

import {
  ReportPackageRenderModelSchema,
  ReportPackageRenderSourceSchema,
} from './lp-report-package-render-model.contract';

const PositiveIdSchema = z.number().int().positive();
const Sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const ReportPackageJsonExportFormatSchema = z.literal('json');

export const ReportPackageJsonExportArtifactSchema = z
  .object({
    exportVersion: z.literal(1),
    format: ReportPackageJsonExportFormatSchema,
    source: ReportPackageRenderSourceSchema,
    renderModel: ReportPackageRenderModelSchema,
  })
  .strict();

export const ReportPackageJsonExportResponseSchema = z
  .object({
    export: ReportPackageJsonExportArtifactSchema.extend({
      contentHashAlgorithm: z.literal('sha256'),
      contentHash: Sha256HexSchema,
    }).strict(),
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
export type ReportPackageJsonExportResponse = z.infer<typeof ReportPackageJsonExportResponseSchema>;
export type ReportPackageJsonExportBlocker = z.infer<typeof ReportPackageJsonExportBlockerSchema>;
export type ReportPackageJsonExportBlockedResponse = z.infer<
  typeof ReportPackageJsonExportBlockedResponseSchema
>;
