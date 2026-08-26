/**
 * Immutable Legal Capital Envelope contract (`capital-envelope/1.0.0`).
 *
 * Brief 3 (docs/superpowers/specs/2026-07-30-task163-go-readiness-briefs.md,
 * lines 376-433) defines the operator-attested legal capital envelope for
 * internal LP economics: an append-only, versioned record of LP/GP/total
 * commitments for a fund's single `main_fund` vehicle. This module carries
 * the schema-only surface for WP-L3's envelope service:
 *
 *  - `CapitalEnvelopeCreateRequestV1Schema` — the client-authoritative
 *    creation request (Brief 3 field list verbatim). The four arithmetic
 *    invariants (lp >= 0, gp >= 0, total > 0, lp + gp = total exactly) are
 *    enforced in-schema; each violation surfaces its seed-refusal code as
 *    the zod issue message so callers can map 422 payloads without string
 *    invention.
 *  - `CapitalEnvelopeSeedRefusalCodeV1Schema` — the Brief 3 invariant
 *    refusal registry (HTTP 422, nothing persisted). The two vehicle codes
 *    (`ENVELOPE_VEHICLE_NOT_IN_FUND`, `ENVELOPE_VEHICLE_NOT_MAIN_FUND`)
 *    are DB-state checks the envelope service performs at creation time;
 *    they cannot be schema-enforced here.
 *  - `CapitalEnvelopeHashPreimageV1Schema` and
 *    `buildCapitalEnvelopeHashPreimageV1` — the `envelope_hash` preimage
 *    shape: contract version + fundId + the attested legal content fields,
 *    and nothing else. Lineage fields (row id, version, parent version,
 *    idempotency key, request hash, created-at) are excluded so the hash is
 *    a pure content identity.
 *
 * Money is canonical 6dp decimal strings (`MoneyDecimalStringSchema`);
 * never `number` round-trips. This module is schema-only: no hashing, no
 * Node crypto — services compute `envelope_hash` from the preimage object
 * via the canonical hash helper server-side.
 *
 * Governing plan: docs/superpowers/plans/
 * 2026-07-31-task163-wp-l3-service-persistence-plan.md (section 1 scope,
 * P-D6/P-D11, section 11 T-B1).
 *
 * @module shared/contracts/internal-economics/capital-envelope-v1.contract
 */
import { z } from 'zod';

import { Decimal } from '../../lib/decimal-config';
import { MoneyDecimalStringSchema } from '../../lib/decimal-string';

export const CAPITAL_ENVELOPE_CONTRACT_VERSION = 'capital-envelope/1.0.0' as const;

const Sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/);

/**
 * Brief 3 invariant refusal registry (envelope-seed phase, HTTP 422, no row
 * created). Codes are minted here 1:1 against Brief 3's invariant list
 * (briefs lines 410-422); the `ENVELOPE_` prefix keeps the one-definitions
 * registry unambiguous across phases.
 */
export const CAPITAL_ENVELOPE_SEED_REFUSAL_CODES_V1 = [
  'ENVELOPE_LP_COMMITMENT_NEGATIVE',
  'ENVELOPE_GP_COMMITMENT_NEGATIVE',
  'ENVELOPE_TOTAL_COMMITMENT_NOT_POSITIVE',
  'ENVELOPE_COMMITMENT_SUM_MISMATCH',
  'ENVELOPE_CURRENCY_UNSUPPORTED',
  'ENVELOPE_VEHICLE_NOT_IN_FUND',
  'ENVELOPE_VEHICLE_NOT_MAIN_FUND',
] as const;

export const CapitalEnvelopeSeedRefusalCodeV1Schema = z.enum(
  CAPITAL_ENVELOPE_SEED_REFUSAL_CODES_V1
);
export type CapitalEnvelopeSeedRefusalCodeV1 = z.infer<
  typeof CapitalEnvelopeSeedRefusalCodeV1Schema
>;

const CapitalEnvelopeContentFieldsV1 = {
  mainFundVehicleId: z.number().int().positive(),
  lpCommitmentUsd: MoneyDecimalStringSchema,
  gpCommitmentUsd: MoneyDecimalStringSchema,
  totalCommitmentUsd: MoneyDecimalStringSchema,
  currency: z.literal('USD'),
  effectiveAt: z.string().datetime(),
  sourceArtifactId: z.number().int().positive(),
  sourceConfigId: z.number().int().positive(),
  sourceConfigVersion: z.number().int().positive(),
  sourceConfigHash: Sha256HexSchema,
  attestedBy: z.number().int().positive(),
  attestedAt: z.string().datetime(),
} as const;

function enforceCommitmentInvariants(
  value: {
    lpCommitmentUsd: string;
    gpCommitmentUsd: string;
    totalCommitmentUsd: string;
  },
  ctx: z.RefinementCtx
): void {
  const lp = new Decimal(value.lpCommitmentUsd);
  const gp = new Decimal(value.gpCommitmentUsd);
  const total = new Decimal(value.totalCommitmentUsd);

  if (lp.lt(0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['lpCommitmentUsd'],
      message: 'ENVELOPE_LP_COMMITMENT_NEGATIVE',
    });
  }
  if (gp.lt(0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['gpCommitmentUsd'],
      message: 'ENVELOPE_GP_COMMITMENT_NEGATIVE',
    });
  }
  if (!total.gt(0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['totalCommitmentUsd'],
      message: 'ENVELOPE_TOTAL_COMMITMENT_NOT_POSITIVE',
    });
  }
  if (!lp.plus(gp).eq(total)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['totalCommitmentUsd'],
      message: 'ENVELOPE_COMMITMENT_SUM_MISMATCH',
    });
  }
}

/**
 * Client-authoritative envelope creation request (Brief 3 fields). Version
 * allocation, parent-version lineage, and the vehicle checks are service
 * concerns (P-D11 advisory-lock protocol); they never travel in the request.
 */
export const CapitalEnvelopeCreateRequestV1Schema = z
  .object(CapitalEnvelopeContentFieldsV1)
  .strict()
  .superRefine(enforceCommitmentInvariants);
export type CapitalEnvelopeCreateRequestV1 = Readonly<
  z.infer<typeof CapitalEnvelopeCreateRequestV1Schema>
>;

/**
 * `envelope_hash` preimage: contract version + fund + attested legal
 * content. Excludes row id, version, parent lineage, idempotency key,
 * request hash, and created-at, so identical legal content always hashes
 * identically across correction chains.
 */
export const CapitalEnvelopeHashPreimageV1Schema = z
  .object({
    contractVersion: z.literal(CAPITAL_ENVELOPE_CONTRACT_VERSION),
    fundId: z.number().int().positive(),
    ...CapitalEnvelopeContentFieldsV1,
  })
  .strict()
  .superRefine(enforceCommitmentInvariants);
export type CapitalEnvelopeHashPreimageV1 = Readonly<
  z.infer<typeof CapitalEnvelopeHashPreimageV1Schema>
>;

/** Pure projection from a validated request to the hash preimage shape. */
export function buildCapitalEnvelopeHashPreimageV1(input: {
  readonly fundId: number;
  readonly request: CapitalEnvelopeCreateRequestV1;
}): CapitalEnvelopeHashPreimageV1 {
  return CapitalEnvelopeHashPreimageV1Schema.parse({
    contractVersion: CAPITAL_ENVELOPE_CONTRACT_VERSION,
    fundId: input.fundId,
    mainFundVehicleId: input.request.mainFundVehicleId,
    lpCommitmentUsd: input.request.lpCommitmentUsd,
    gpCommitmentUsd: input.request.gpCommitmentUsd,
    totalCommitmentUsd: input.request.totalCommitmentUsd,
    currency: input.request.currency,
    effectiveAt: input.request.effectiveAt,
    sourceArtifactId: input.request.sourceArtifactId,
    sourceConfigId: input.request.sourceConfigId,
    sourceConfigVersion: input.request.sourceConfigVersion,
    sourceConfigHash: input.request.sourceConfigHash,
    attestedBy: input.request.attestedBy,
    attestedAt: input.request.attestedAt,
  });
}
