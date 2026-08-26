/**
 * LP Reporting -- Evidence Record Contract (CREATE shape)
 *
 * Mirrors the evidence_records table from
 * migrations/0014_lp_evidence_sprint3_drift.sql, including
 * the typed-FK exclusivity constraint: exactly one of
 * {valuationMarkId, companyId, metricRunId, narrativeRunId} must be set.
 *
 * The wire-format mirror of the SQL CHECK
 *   num_nonnulls(valuation_mark_id, company_id, metric_run_id, narrative_run_id) = 1
 * is enforced at the schema level via .superRefine(). The error path
 * points at `valuationMarkId` for ergonomic failure reporting.
 *
 * Polymorphic target_type/target_id is forbidden. The Phase 0.5 verifier
 * greps the LP-reporting contracts directory for `target_type` and fails
 * the gate on any match.
 *
 * @module shared/contracts/lp-reporting/evidence-record.contract
 * @see docs/adr/ADR-011-decimal-string-api-convention.md
 */

import { z } from 'zod';
import { ConfidenceLevelSchema } from './valuation-mark.contract';

export const EvidenceSourceSchema = z.enum([
  'financing_round',
  'signed_loi',
  'revenue_milestone',
  'strategic_partnership',
  'audited_financials',
  'board_update',
  'gp_estimate',
  'third_party_priced',
  'secondary_transaction',
  'customer_contract',
  'management_report',
  'auditor_confirmation',
]);

export const MaterialityLevelSchema = z.enum(['high', 'medium', 'low']);
export const ConfidentialitySchema = z.enum(['internal', 'lp_shareable', 'restricted']);

export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;
export type MaterialityLevel = z.infer<typeof MaterialityLevelSchema>;
export type Confidentiality = z.infer<typeof ConfidentialitySchema>;

export const EvidenceAttachmentSchema = z
  .object({
    filename: z.string().max(512),
    contentType: z.string().max(128).optional(),
    sizeBytes: z.number().int().nonnegative().optional(),
    storageKey: z.string().max(512),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .optional(),
  })
  .strict();

export type EvidenceAttachment = z.infer<typeof EvidenceAttachmentSchema>;

export const EvidenceRecordCreateSchema = z
  .object({
    fundId: z.number().int().positive(),

    // Typed nullable target FKs. Exactly one must be set; enforced by
    // .superRefine() below. No polymorphic target_type/target_id column.
    valuationMarkId: z.number().int().positive().optional(),
    companyId: z.number().int().positive().optional(),
    metricRunId: z.number().int().positive().optional(),
    narrativeRunId: z.number().int().positive().optional(),

    evidenceSource: EvidenceSourceSchema,
    sourceDate: z.string().date(),
    receivedDate: z.string().date().optional(),
    expirationDate: z.string().date().optional(),
    confidenceLevel: ConfidenceLevelSchema.default('medium'),
    materialityLevel: MaterialityLevelSchema.default('medium'),

    confidentiality: ConfidentialitySchema.default('internal'),
    redactionRequired: z.boolean().default(false),
    documentHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .optional(),
    valuationPolicyVersion: z.string().max(64).optional(),

    description: z.string().max(2000).optional(),
    internalNotes: z.string().max(5000).optional(),
    lpObjection: z.string().max(2000).optional(),
    attachments: z.array(EvidenceAttachmentSchema).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    const targets = [
      value.valuationMarkId,
      value.companyId,
      value.metricRunId,
      value.narrativeRunId,
    ].filter((v): v is number => v !== undefined && v !== null);
    if (targets.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Exactly one of valuationMarkId, companyId, metricRunId, narrativeRunId must be set (got ${targets.length}).`,
        path: ['valuationMarkId'],
      });
    }
  });

export type EvidenceRecordCreate = z.infer<typeof EvidenceRecordCreateSchema>;

export const MetricRunEvidenceIdempotencyKeySchema = z.string().trim().min(1).max(128);

export const MetricRunEvidenceCreateRequestSchema = z
  .object({
    idempotencyKey: MetricRunEvidenceIdempotencyKeySchema,
    evidenceSource: EvidenceSourceSchema,
    sourceDate: z.string().date(),
    receivedDate: z.string().date().optional(),
    expirationDate: z.string().date().optional(),
    confidenceLevel: ConfidenceLevelSchema.default('medium'),
    materialityLevel: MaterialityLevelSchema.default('medium'),
    confidentiality: ConfidentialitySchema.default('internal'),
    redactionRequired: z.boolean().default(false),
    documentHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .optional(),
    valuationPolicyVersion: z.string().max(64).optional(),
    description: z.string().max(2000).optional(),
    internalNotes: z.string().max(5000).optional(),
    lpObjection: z.string().max(2000).optional(),
  })
  .strict();

export const MetricRunEvidenceRecordSchema = z
  .object({
    id: z.number().int().positive(),
    fundId: z.number().int().positive(),
    metricRunId: z.number().int().positive(),
    idempotencyKey: MetricRunEvidenceIdempotencyKeySchema,
    evidenceSource: EvidenceSourceSchema,
    sourceDate: z.string().date(),
    receivedDate: z.string().date().nullable(),
    expirationDate: z.string().date().nullable(),
    confidenceLevel: ConfidenceLevelSchema,
    materialityLevel: MaterialityLevelSchema,
    confidentiality: ConfidentialitySchema,
    redactionRequired: z.boolean(),
    documentHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .nullable(),
    valuationPolicyVersion: z.string().max(64).nullable(),
    description: z.string().max(2000).nullable(),
    internalNotes: z.string().max(5000).nullable(),
    lpObjection: z.string().max(2000).nullable(),
    uploadedBy: z.number().int().positive().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const MetricRunEvidenceCreateResponseSchema = z
  .object({
    record: MetricRunEvidenceRecordSchema,
    inserted: z.boolean(),
  })
  .strict();

export const MetricRunEvidenceListResponseSchema = z
  .object({
    records: z.array(MetricRunEvidenceRecordSchema),
  })
  .strict();

export type MetricRunEvidenceCreateRequest = z.infer<typeof MetricRunEvidenceCreateRequestSchema>;
export type MetricRunEvidenceRecord = z.infer<typeof MetricRunEvidenceRecordSchema>;
export type MetricRunEvidenceCreateResponse = z.infer<typeof MetricRunEvidenceCreateResponseSchema>;
export type MetricRunEvidenceListResponse = z.infer<typeof MetricRunEvidenceListResponseSchema>;
