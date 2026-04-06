/**
 * ReserveIcDecisionV1 -- Canonical human decision contract for reserve
 * planning / IC workflows.
 *
 * This contract is intentionally separate from engine-oriented reserve
 * decision storage. It models human proposal / approval / rejection state
 * for follow-on reserve decisions.
 *
 * @module shared/contracts/reserve-ic-decision-v1.contract
 */

import { z } from 'zod';

export const ReserveIcDecisionTypeSchema = z.enum([
  'follow_on',
  'defer',
  'cut_reserve',
  'no_action',
]);

export const ReserveIcDecisionStatusSchema = z.enum([
  'draft',
  'proposed',
  'approved',
  'rejected',
]);

export const ReserveIcDecisionProvenanceSchema = z
  .object({
    sourceScenarioId: z.string().uuid().nullable(),
    sourceAllocationVersion: z.number().int().min(1).nullable(),
    liveAllocationVersion: z.number().int().min(1).nullable(),
  })
  .strict();

export const ReserveIcDecisionRecordV1Schema = z
  .object({
    id: z.string().uuid(),
    fundId: z.number().int().positive(),
    companyId: z.number().int().positive(),
    decisionType: ReserveIcDecisionTypeSchema,
    decisionStatus: ReserveIcDecisionStatusSchema,
    rationale: z.string().trim().min(1).max(4000),
    proposedPlannedReservesCents: z.number().int().min(0).nullable(),
    finalPlannedReservesCents: z.number().int().min(0).nullable(),
    decidedByUserId: z.number().int().positive().nullable(),
    decidedByLabel: z.string().trim().min(1).max(255).nullable(),
    decidedAt: z.string().datetime().nullable(),
    provenance: ReserveIcDecisionProvenanceSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      (value.decisionStatus === 'approved' || value.decisionStatus === 'rejected') &&
      value.decidedAt === null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'decidedAt is required once a decision is approved or rejected',
        path: ['decidedAt'],
      });
    }
  });

export const CreateReserveIcDecisionV1Schema = z
  .object({
    fundId: z.number().int().positive(),
    companyId: z.number().int().positive(),
    decisionType: ReserveIcDecisionTypeSchema,
    decisionStatus: ReserveIcDecisionStatusSchema.default('draft'),
    rationale: z.string().trim().min(1).max(4000),
    proposedPlannedReservesCents: z.number().int().min(0).nullable(),
    finalPlannedReservesCents: z.number().int().min(0).nullable().optional(),
    decidedByUserId: z.number().int().positive().nullable().optional(),
    decidedByLabel: z.string().trim().min(1).max(255).nullable().optional(),
    decidedAt: z.string().datetime().nullable().optional(),
    provenance: ReserveIcDecisionProvenanceSchema,
  })
  .strict();

export const UpdateReserveIcDecisionV1Schema = z
  .object({
    decisionType: ReserveIcDecisionTypeSchema.optional(),
    decisionStatus: ReserveIcDecisionStatusSchema.optional(),
    rationale: z.string().trim().min(1).max(4000).optional(),
    proposedPlannedReservesCents: z.number().int().min(0).nullable().optional(),
    finalPlannedReservesCents: z.number().int().min(0).nullable().optional(),
    decidedByUserId: z.number().int().positive().nullable().optional(),
    decidedByLabel: z.string().trim().min(1).max(255).nullable().optional(),
    decidedAt: z.string().datetime().nullable().optional(),
    provenance: ReserveIcDecisionProvenanceSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export type ReserveIcDecisionType = z.infer<typeof ReserveIcDecisionTypeSchema>;
export type ReserveIcDecisionStatus = z.infer<typeof ReserveIcDecisionStatusSchema>;
export type ReserveIcDecisionProvenance = z.infer<typeof ReserveIcDecisionProvenanceSchema>;
export type ReserveIcDecisionRecordV1 = z.infer<typeof ReserveIcDecisionRecordV1Schema>;
export type CreateReserveIcDecisionV1 = z.infer<typeof CreateReserveIcDecisionV1Schema>;
export type UpdateReserveIcDecisionV1 = z.infer<typeof UpdateReserveIcDecisionV1Schema>;
