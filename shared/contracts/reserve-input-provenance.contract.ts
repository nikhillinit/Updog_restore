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

export type ReserveInputSourceStatus = z.infer<typeof ReserveInputSourceStatusSchema>;
export type ReserveInputFieldProvenance = z.infer<typeof ReserveInputFieldProvenanceSchema>;
export type ReserveCompanyInputWithProvenance = z.infer<
  typeof ReserveCompanyInputWithProvenanceSchema
>;
export type ReserveInputTrustSummary = z.infer<typeof ReserveInputTrustSummarySchema>;
