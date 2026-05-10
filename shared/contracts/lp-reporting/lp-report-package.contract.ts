/**
 * LP Reporting -- internal report package contracts.
 *
 * Report packages are metric-run-route scoped: the route owns fundId,
 * metricRunId, package IDs, audit fields, refs, and payload creation.
 *
 * @module shared/contracts/lp-reporting/lp-report-package.contract
 */

import { z } from 'zod';

import { LpMetricRunDiagnosticsSchema, LpMetricRunResultsSchema } from './lp-metric-run.contract';
import { NarrativeTypeSchema } from './lp-narrative-run.contract';

const PositiveIdSchema = z.number().int().positive();
const PositiveVersionSchema = z.number().int().positive();
const HexSha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const ReportPackageStatusSchema = z.enum(['assembled']);

export const ReportPackageExpectedNarrativeSchema = z
  .object({
    narrativeType: NarrativeTypeSchema,
    narrativeRunId: PositiveIdSchema,
    expectedVersion: PositiveVersionSchema,
  })
  .strict();

export const ReportPackageAssembleRequestSchema = z
  .object({
    expectedMetricRunVersion: PositiveVersionSchema,
    expectedNarratives: z.array(ReportPackageExpectedNarrativeSchema).min(1),
  })
  .strict();

export const ReportPackageNarrativeRefSchema = z
  .object({
    narrativeType: NarrativeTypeSchema,
    narrativeRunId: PositiveIdSchema,
    narrativeVersion: PositiveVersionSchema,
    approvedBy: PositiveIdSchema.nullable(),
    approvedAt: z.string().datetime(),
    textHash: HexSha256Schema,
  })
  .strict();

export const ReportPackageNarrativePayloadSchema = ReportPackageNarrativeRefSchema.extend({
  effectiveText: z.string().min(1),
}).strict();

export const ReportPackagePayloadSchema = z
  .object({
    payloadVersion: z.literal(1),
    results: LpMetricRunResultsSchema,
    diagnostics: LpMetricRunDiagnosticsSchema,
    sourceEventIds: z.array(PositiveIdSchema),
    sourceMarkIds: z.array(PositiveIdSchema),
    evidenceRecordIds: z.array(PositiveIdSchema),
    narratives: z.array(ReportPackageNarrativePayloadSchema),
  })
  .strict();

export const ReportPackageRecordSchema = z
  .object({
    reportPackageId: PositiveIdSchema,
    fundId: PositiveIdSchema,
    metricRunId: PositiveIdSchema,
    status: ReportPackageStatusSchema,
    asOfDate: z.string().date(),
    metricRunVersion: PositiveVersionSchema,
    metricRunLockedBy: PositiveIdSchema.nullable(),
    metricRunLockedAt: z.string().datetime().nullable(),
    narrativeRefs: z.array(ReportPackageNarrativeRefSchema),
    payload: ReportPackagePayloadSchema,
    assembledBy: PositiveIdSchema,
    assembledAt: z.string().datetime(),
    version: PositiveVersionSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const ReportPackageGetResponseSchema = z
  .object({
    record: ReportPackageRecordSchema.nullable(),
  })
  .strict();

export const ReportPackageAssembleResponseSchema = z
  .object({
    record: ReportPackageRecordSchema,
    inserted: z.boolean(),
  })
  .strict();

export type ReportPackageStatus = z.infer<typeof ReportPackageStatusSchema>;
export type ReportPackageExpectedNarrative = z.infer<typeof ReportPackageExpectedNarrativeSchema>;
export type ReportPackageAssembleRequest = z.infer<typeof ReportPackageAssembleRequestSchema>;
export type ReportPackageNarrativeRef = z.infer<typeof ReportPackageNarrativeRefSchema>;
export type ReportPackagePayload = z.infer<typeof ReportPackagePayloadSchema>;
export type ReportPackageRecord = z.infer<typeof ReportPackageRecordSchema>;
export type ReportPackageGetResponse = z.infer<typeof ReportPackageGetResponseSchema>;
export type ReportPackageAssembleResponse = z.infer<typeof ReportPackageAssembleResponseSchema>;
