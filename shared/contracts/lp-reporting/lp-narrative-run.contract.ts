/**
 * LP Reporting -- Narrative run contracts.
 *
 * Narrative runs are additive children of locked metric runs. Create requests
 * are metric-run-route scoped: the route owns fundId, metricRunId, asOfDate,
 * generatedBy, and all lifecycle/audit fields.
 *
 * @module shared/contracts/lp-reporting/lp-narrative-run.contract
 */

import { z } from 'zod';

export const NarrativeTypeSchema = z.enum([
  'no_dpi',
  'methodology',
  'portfolio_update',
  'risk_disclosure',
]);

export const NarrativeStatusSchema = z.enum(['draft', 'reviewed', 'approved', 'exported']);

export type NarrativeType = z.infer<typeof NarrativeTypeSchema>;
export type NarrativeStatus = z.infer<typeof NarrativeStatusSchema>;

export const NarrativeRunCreateRequestSchema = z
  .object({
    narrativeType: NarrativeTypeSchema,
  })
  .strict();

const PositiveVersionSchema = z.number().int().positive();
const NonEmptyTrimmedTextSchema = z.string().trim().min(1);

export const NarrativeRunEditRequestSchema = z
  .object({
    expectedVersion: PositiveVersionSchema,
    editedText: NonEmptyTrimmedTextSchema,
  })
  .strict();

export const NarrativeRunReviewRequestSchema = z
  .object({
    expectedVersion: PositiveVersionSchema,
  })
  .strict();

export const NarrativeRunApproveRequestSchema = z
  .object({
    expectedVersion: PositiveVersionSchema,
  })
  .strict();

export const NarrativeRunRecordSchema = z
  .object({
    narrativeRunId: z.number().int().positive(),
    fundId: z.number().int().positive(),
    metricRunId: z.number().int().positive(),
    asOfDate: z.string().date(),
    narrativeType: NarrativeTypeSchema,
    generatedText: z.string().min(1),
    editedText: z.string().nullable(),
    status: NarrativeStatusSchema,
    generatedBy: z.number().int().positive().nullable(),
    editedBy: z.number().int().positive().nullable(),
    reviewedBy: z.number().int().positive().nullable(),
    reviewedAt: z.string().datetime().nullable(),
    approvedBy: z.number().int().positive().nullable(),
    approvedAt: z.string().datetime().nullable(),
    exportedAt: z.string().datetime().nullable(),
    version: PositiveVersionSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const NarrativeRunCreateResponseSchema = z
  .object({
    record: NarrativeRunRecordSchema,
    inserted: z.boolean(),
  })
  .strict();

export const NarrativeRunListResponseSchema = z
  .object({
    records: z.array(NarrativeRunRecordSchema),
  })
  .strict();

export const NarrativeRunDetailResponseSchema = z
  .object({
    record: NarrativeRunRecordSchema,
  })
  .strict();

export const NarrativeRunLifecycleResponseSchema = z
  .object({
    record: NarrativeRunRecordSchema,
    changed: z.boolean(),
  })
  .strict();

export type NarrativeRunCreateRequest = z.infer<typeof NarrativeRunCreateRequestSchema>;
export type NarrativeRunEditRequest = z.infer<typeof NarrativeRunEditRequestSchema>;
export type NarrativeRunReviewRequest = z.infer<typeof NarrativeRunReviewRequestSchema>;
export type NarrativeRunApproveRequest = z.infer<typeof NarrativeRunApproveRequestSchema>;
export type NarrativeRunRecord = z.infer<typeof NarrativeRunRecordSchema>;
export type NarrativeRunCreateResponse = z.infer<typeof NarrativeRunCreateResponseSchema>;
export type NarrativeRunListResponse = z.infer<typeof NarrativeRunListResponseSchema>;
export type NarrativeRunDetailResponse = z.infer<typeof NarrativeRunDetailResponseSchema>;
export type NarrativeRunLifecycleResponse = z.infer<typeof NarrativeRunLifecycleResponseSchema>;
