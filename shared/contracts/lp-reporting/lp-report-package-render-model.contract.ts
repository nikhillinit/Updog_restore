/**
 * LP Reporting -- report package render model contracts.
 *
 * The render model is a read-only, renderer-facing projection over an
 * assembled report package. It is intentionally distinct from the package
 * assembly record and does not include export lifecycle, file, URL, queue, or
 * storage fields.
 *
 * @module shared/contracts/lp-reporting/lp-report-package-render-model.contract
 */

import { z } from 'zod';

import { DecimalStringSchema } from './cash-flow-event.contract';
import { XirrDiagnosticSchema } from './lp-metric-run.contract';
import { NarrativeTypeSchema } from './lp-narrative-run.contract';
import {
  ReportPackageH9MetadataSchema,
  ReportPackageStatusSchema,
} from './lp-report-package.contract';

const PositiveIdSchema = z.number().int().positive();
const PositiveVersionSchema = z.number().int().positive();
const PositiveIntegerSchema = z.number().int().positive();
const NonnegativeIntegerSchema = z.number().int().nonnegative();
const HexSha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

/**
 * Render-model shape versions. Version 2 added the optional per-metric
 * provenance fields (inputsHash, inputsHashShort, methodologyVersion,
 * calculationVersion) to metric sections. Stored export replays compare
 * content hashes only within the same render-model version; older stored
 * artifacts replay against their own bytes/hash.
 */
export const CURRENT_REPORT_PACKAGE_RENDER_MODEL_VERSION = 2;
export const ReportPackageRenderModelVersionSchema = z.union([z.literal(1), z.literal(2)]);

export const ReportPackageRenderMetricSectionIdSchema = z.enum([
  'performance',
  'capital',
  'mark_confidence',
]);

export const ReportPackageRenderMetricIdSchema = z.enum([
  'dpi',
  'rvpi',
  'tvpi',
  'moic',
  'netIrr',
  'grossIrr',
  'contributionsTotal',
  'distributionsTotal',
  'currentNav',
  'markConfidenceHigh',
  'markConfidenceMedium',
  'markConfidenceLow',
]);

export const ReportPackageRenderMetricValueKindSchema = z.enum([
  'multiple',
  'irr',
  'money',
  'count',
]);

export const ReportPackageRenderSourceH9StampSchema = ReportPackageH9MetadataSchema.pick({
  fingerprintHash: true,
  policyVersion: true,
  actionabilityStatus: true,
});

export const ReportPackageRenderSourceSchema = z
  .object({
    reportPackageId: PositiveIdSchema,
    fundId: PositiveIdSchema,
    metricRunId: PositiveIdSchema,
    reportPackageStatus: ReportPackageStatusSchema,
    asOfDate: z.string().date(),
    metricRunVersion: PositiveVersionSchema,
    metricRunLockedBy: PositiveIdSchema.nullable(),
    metricRunLockedAt: z.string().datetime().nullable(),
    assembledBy: PositiveIdSchema,
    assembledAt: z.string().datetime(),
    packageVersion: PositiveVersionSchema,
    payloadVersion: z.literal(1),
    h9Stamp: ReportPackageRenderSourceH9StampSchema,
  })
  .strict();

export const ReportPackageRenderFundDisplaySchema = z
  .object({
    fundId: PositiveIdSchema,
    name: z.string().min(1),
    vintageYear: PositiveIntegerSchema.nullable(),
    size: DecimalStringSchema.nullable(),
  })
  .strict();

export const ReportPackageRenderMetricRowSchema = z
  .object({
    metricId: ReportPackageRenderMetricIdSchema,
    label: z.string().min(1),
    value: z.union([DecimalStringSchema, NonnegativeIntegerSchema]).nullable(),
    valueKind: ReportPackageRenderMetricValueKindSchema,
    currency: z.literal('USD').nullable(),
  })
  .strict();

export const ReportPackageRenderMetricSectionSchema = z
  .object({
    sectionId: ReportPackageRenderMetricSectionIdSchema,
    title: z.string().min(1),
    inputsHash: z.string().min(1).max(128).optional(),
    inputsHashShort: z.string().length(12).optional(),
    methodologyVersion: z.string().min(1).max(64).optional(),
    calculationVersion: z.string().min(1).max(64).optional(),
    rows: z.array(ReportPackageRenderMetricRowSchema),
  })
  .strict();

export const ReportPackageRenderNarrativeSectionSchema = z
  .object({
    sectionId: NarrativeTypeSchema,
    title: z.string().min(1),
    narrativeType: NarrativeTypeSchema,
    narrativeRunId: PositiveIdSchema,
    narrativeVersion: PositiveVersionSchema,
    approvedBy: PositiveIdSchema.nullable(),
    approvedAt: z.string().datetime(),
    textHash: HexSha256Schema,
    body: z.string().min(1),
  })
  .strict();

export const ReportPackageRenderDiagnosticsSchema = z
  .object({
    engineVersion: z.string().min(1),
    decimalPrecision: PositiveIntegerSchema,
    excludedFutureMarks: z.array(PositiveIdSchema),
    warnings: z.array(
      z
        .object({
          code: z.string().min(1),
          message: z.string(),
        })
        .strict()
    ),
    xirr: z
      .object({
        net: XirrDiagnosticSchema,
        gross: XirrDiagnosticSchema,
      })
      .strict(),
  })
  .strict();

export const ReportPackageRenderReferencesSchema = z
  .object({
    sourceEventIds: z.array(PositiveIdSchema),
    sourceMarkIds: z.array(PositiveIdSchema),
    evidenceRecordIds: z.array(PositiveIdSchema),
    narrativeRunIds: z.array(PositiveIdSchema),
  })
  .strict();

export const ReportPackageRenderModelSchema = z
  .object({
    renderModelVersion: ReportPackageRenderModelVersionSchema,
    source: ReportPackageRenderSourceSchema,
    fundDisplay: ReportPackageRenderFundDisplaySchema,
    metricSections: z.array(ReportPackageRenderMetricSectionSchema),
    narrativeSections: z.array(ReportPackageRenderNarrativeSectionSchema),
    diagnostics: ReportPackageRenderDiagnosticsSchema,
    references: ReportPackageRenderReferencesSchema,
  })
  .strict();

export const ReportPackageRenderModelResponseSchema = z
  .object({
    renderModel: ReportPackageRenderModelSchema,
  })
  .strict();

export type ReportPackageRenderMetricSectionId = z.infer<
  typeof ReportPackageRenderMetricSectionIdSchema
>;
export type ReportPackageRenderMetricId = z.infer<typeof ReportPackageRenderMetricIdSchema>;
export type ReportPackageRenderMetricValueKind = z.infer<
  typeof ReportPackageRenderMetricValueKindSchema
>;
export type ReportPackageRenderSourceH9Stamp = z.infer<
  typeof ReportPackageRenderSourceH9StampSchema
>;
export type ReportPackageRenderSource = z.infer<typeof ReportPackageRenderSourceSchema>;
export type ReportPackageRenderFundDisplay = z.infer<typeof ReportPackageRenderFundDisplaySchema>;
export type ReportPackageRenderMetricRow = z.infer<typeof ReportPackageRenderMetricRowSchema>;
export type ReportPackageRenderMetricSection = z.infer<
  typeof ReportPackageRenderMetricSectionSchema
>;
export type ReportPackageRenderNarrativeSection = z.infer<
  typeof ReportPackageRenderNarrativeSectionSchema
>;
export type ReportPackageRenderDiagnostics = z.infer<typeof ReportPackageRenderDiagnosticsSchema>;
export type ReportPackageRenderReferences = z.infer<typeof ReportPackageRenderReferencesSchema>;
export type ReportPackageRenderModel = z.infer<typeof ReportPackageRenderModelSchema>;
export type ReportPackageRenderModelResponse = z.infer<
  typeof ReportPackageRenderModelResponseSchema
>;
