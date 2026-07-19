import { z } from 'zod';

/**
 * Reserve Envelope V1 (ADR-056 NET-NEW #1)
 *
 * Fund-scoped, provenance-disclosing derivation of `availableReserves` =
 * investable follow-on capital after fees / expenses / deployment, plus exit
 * recycling headroom. Replaces the naive `fundSize * reserveRatio`.
 *
 * STANDALONE + UNWIRED: consumed by no live reserve path in this slice.
 * All money is integer cents; component `amountCents` is the SIGNED
 * contribution to availableReserves (inflows >= 0, outflows <= 0).
 */

export const ReserveEnvelopeComponentStatusSchema = z.enum([
  'observed', // read directly from a persisted authoritative column
  'derived', // computed from persisted inputs via a disclosed formula
  'defaulted', // a disclosed default assumption substituted for a missing input
  'unavailable', // cannot be computed honestly; contributes 0 and is disclosed
]);

export const ReserveEnvelopeComponentSchema = z
  .object({
    amountCents: z.number().int(),
    status: ReserveEnvelopeComponentStatusSchema,
    source: z.string().min(1),
    reason: z.string().min(1).nullable(),
  })
  .strict();

export const ReserveEnvelopeComponentsSchema = z
  .object({
    committedCapital: ReserveEnvelopeComponentSchema,
    deployedCapital: ReserveEnvelopeComponentSchema,
    managementFees: ReserveEnvelopeComponentSchema,
    fundExpenses: ReserveEnvelopeComponentSchema,
    exitRecycling: ReserveEnvelopeComponentSchema,
  })
  .strict();

export const ReserveEnvelopeV1Schema = z
  .object({
    contractVersion: z.literal('reserve-envelope-v1'),
    fundId: z.number().int().positive(),
    asOfDate: z.string().date(),
    baseCurrency: z.string().length(3),
    availableReservesCents: z.number().int().nonnegative(),
    components: ReserveEnvelopeComponentsSchema,
    trustedForActivation: z.boolean(),
    blocked: z.boolean(),
    blockReason: z.string().min(1).nullable(),
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export type ReserveEnvelopeComponentStatus = z.infer<typeof ReserveEnvelopeComponentStatusSchema>;
export type ReserveEnvelopeComponent = z.infer<typeof ReserveEnvelopeComponentSchema>;
export type ReserveEnvelopeComponents = z.infer<typeof ReserveEnvelopeComponentsSchema>;
export type ReserveEnvelopeV1 = z.infer<typeof ReserveEnvelopeV1Schema>;
