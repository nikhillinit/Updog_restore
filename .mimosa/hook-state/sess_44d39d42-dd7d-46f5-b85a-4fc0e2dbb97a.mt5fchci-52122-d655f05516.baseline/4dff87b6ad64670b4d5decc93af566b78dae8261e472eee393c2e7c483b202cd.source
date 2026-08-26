import { z } from 'zod';
import { ReserveCompanyInputSchema } from '../types';

export const ReserveInputSourceStatusSchema = z.enum([
  'observed',
  'approved_assumption',
  'estimated',
  'defaulted',
  'unavailable',
]);

export const ReserveInputFieldProvenanceSchema = z
  .object({
    status: ReserveInputSourceStatusSchema,
    source: z.string().min(1),
    reason: z.string().min(1).nullable(),
  })
  .strict();

export const ReserveCompanyInputProvenanceSchema = z
  .object({
    invested: ReserveInputFieldProvenanceSchema,
    ownership: ReserveInputFieldProvenanceSchema,
    stage: ReserveInputFieldProvenanceSchema,
    sector: ReserveInputFieldProvenanceSchema,
  })
  .strict();

export const ReserveCompanyInputWithProvenanceSchema = ReserveCompanyInputSchema.extend({
  provenance: ReserveCompanyInputProvenanceSchema,
}).strict();

export const ReserveInputTrustSummarySchema = z
  .object({
    trustedForActivation: z.boolean(),
    defaultedInputCount: z.number().int().nonnegative(),
    unavailableInputCount: z.number().int().nonnegative(),
    defaultedFields: z.array(z.enum(['invested', 'ownership', 'stage', 'sector'])),
    unavailableFields: z.array(z.enum(['invested', 'ownership', 'stage', 'sector'])),
  })
  .strict();

export const FactsReserveCandidateExclusionReasonSchema = z.enum([
  'missing_ownership',
  'missing_stage',
  'missing_sector',
  'currency_blocked',
  'facts_unavailable',
]);

export const FactsReserveCandidateSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('eligible'),
      companyId: z.number().int().positive(),
      input: ReserveCompanyInputWithProvenanceSchema,
      factsInputHash: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      status: z.literal('excluded'),
      companyId: z.number().int().positive(),
      reasons: z.array(FactsReserveCandidateExclusionReasonSchema).min(1),
      factsInputHash: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .nullable(),
    })
    .strict(),
]);

export type ReserveInputSourceStatus = z.infer<typeof ReserveInputSourceStatusSchema>;
export type ReserveInputFieldProvenance = z.infer<typeof ReserveInputFieldProvenanceSchema>;
export type ReserveCompanyInputWithProvenance = z.infer<
  typeof ReserveCompanyInputWithProvenanceSchema
>;
export type ReserveInputTrustSummary = z.infer<typeof ReserveInputTrustSummarySchema>;
export type FactsReserveCandidateExclusionReason = z.infer<
  typeof FactsReserveCandidateExclusionReasonSchema
>;
export type FactsReserveCandidate = z.infer<typeof FactsReserveCandidateSchema>;
