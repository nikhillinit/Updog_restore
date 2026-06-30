/**
 * LP Reporting -- Planning FMV Override Contract.
 *
 * Planning FMV overrides are approved GP valuation marks created from the
 * reserve-planning workspace. They intentionally do not carry round identity or
 * scenario identity; the durable evidence row is a valuation mark.
 *
 * @module shared/contracts/lp-reporting/planning-fmv-override.contract
 */

import { z } from 'zod';

import { DecimalStringSchema } from './cash-flow-event.contract';

export const PlanningFmvOverrideErrorCodeSchema = z.enum([
  'planning_fmv_invalid_request',
  'planning_fmv_idempotency_key_required',
  'planning_fmv_idempotency_key_reused',
  'planning_fmv_request_pending',
  'planning_fmv_request_failed',
  'planning_fmv_source_conflict',
  'planning_fmv_approval_forbidden',
]);

export const PlanningFmvConfidenceLevelSchema = z.enum(['high', 'medium', 'low']);

export const PlanningFmvSourceContextSchema = z
  .object({
    allocationVersion: z.number().int().positive().nullable().optional(),
    plannedReservesCents: z.number().int().nonnegative().nullable().optional(),
    allocationReason: z.string().max(1000).nullable().optional(),
  })
  .strict();

export const PlanningFmvOverrideCreateRequestSchema = z
  .object({
    companyId: z.number().int().positive(),
    markDate: z.string().date(),
    asOfDate: z.string().date().optional(),
    fairValue: DecimalStringSchema.refine((value) => !value.startsWith('-'), {
      message: 'fairValue must be non-negative',
    }),
    currency: z.literal('USD').default('USD'),
    confidenceLevel: PlanningFmvConfidenceLevelSchema.default('medium'),
    reason: z.string().trim().min(1).max(1000),
    methodologyNotes: z.string().trim().min(1).max(4000).optional(),
    source: PlanningFmvSourceContextSchema.default({}),
  })
  .strict();

export const PlanningFmvOverrideRecordSchema = z
  .object({
    id: z.number().int().positive(),
    fundId: z.number().int().positive(),
    companyId: z.number().int().positive(),
    markDate: z.string().date(),
    asOfDate: z.string().date(),
    fairValue: DecimalStringSchema,
    currency: z.literal('USD'),
    confidenceLevel: PlanningFmvConfidenceLevelSchema,
    status: z.enum(['approved', 'locked']),
    priorMarkId: z.number().int().positive().nullable(),
    methodologyNotes: z.string().nullable(),
    approvedBy: z.number().int().positive().nullable(),
    approvedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime().nullable(),
  })
  .strict();

export const PlanningFmvOverrideCreateResponseSchema = z
  .object({
    requestId: z.number().int().positive(),
    idempotencyKey: z.string().min(1).max(128),
    replayed: z.boolean(),
    valuationMark: PlanningFmvOverrideRecordSchema,
  })
  .strict();

export const PlanningFmvOverrideLatestQuerySchema = z
  .object({
    asOfDate: z.string().date().optional(),
  })
  .strict();

export const PlanningFmvOverrideLatestResponseSchema = z
  .object({
    asOfDate: z.string().date(),
    marks: z.array(PlanningFmvOverrideRecordSchema),
  })
  .strict();

export type PlanningFmvOverrideErrorCode = z.infer<typeof PlanningFmvOverrideErrorCodeSchema>;
export type PlanningFmvOverrideCreateRequest = z.infer<
  typeof PlanningFmvOverrideCreateRequestSchema
>;
export type PlanningFmvOverrideRecord = z.infer<typeof PlanningFmvOverrideRecordSchema>;
export type PlanningFmvOverrideCreateResponse = z.infer<
  typeof PlanningFmvOverrideCreateResponseSchema
>;
export type PlanningFmvOverrideLatestQuery = z.infer<typeof PlanningFmvOverrideLatestQuerySchema>;
export type PlanningFmvOverrideLatestResponse = z.infer<
  typeof PlanningFmvOverrideLatestResponseSchema
>;
