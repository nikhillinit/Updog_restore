import { z } from 'zod';

import { Decimal } from '../../lib/decimal-config';
import { MoneyDecimalStringSchema } from '../../lib/decimal-string';

const PositiveIntSchema = z.number().int().positive();
const IsoDateSchema = z.string().date();
const IsoDateTimeSchema = z.string().datetime();
const CurrencySchema = z.string().regex(/^[A-Z]{3}$/);
const Sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/);
const StoredPositionDecimalStringSchema = z.string().regex(/^-?(?:0|[1-9]\d*)\.\d{6}$/);
const OwnershipPctStringSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)\.\d{8}$/)
  .refine((value) => new Decimal(value).gte(0) && new Decimal(value).lte(100));

export const CurrentPositionQuerySchema = z
  .object({
    vehicleId: PositiveIntSchema.optional(),
    companyIdentityId: PositiveIntSchema.optional(),
    asOfDate: IsoDateSchema.optional(),
  })
  .strict();

export const PositionComponentV1Schema = z
  .object({
    kind: z.enum(['priced', 'contingent']),
    shares: StoredPositionDecimalStringSchema,
    costBasis: MoneyDecimalStringSchema,
    participationIds: z.array(PositiveIntSchema),
  })
  .strict();

export const CurrentPositionV1Schema = z
  .object({
    fundId: PositiveIntSchema,
    vehicleId: PositiveIntSchema,
    companyIdentityId: PositiveIntSchema,
    asOfDate: IsoDateSchema,
    knowledgeCutoff: IsoDateTimeSchema,
    shares: StoredPositionDecimalStringSchema,
    costBasis: MoneyDecimalStringSchema,
    proceeds: MoneyDecimalStringSchema,
    components: z.array(PositionComponentV1Schema),
    warnings: z.array(z.object({ code: z.string(), message: z.string() }).strict()),
  })
  .strict();

export const CurrentPositionListV1Schema = z
  .object({
    fundId: PositiveIntSchema,
    asOfDate: IsoDateSchema,
    knowledgeCutoff: IsoDateTimeSchema,
    positions: z.array(CurrentPositionV1Schema),
  })
  .strict();

export const OwnershipSnapshotRequestSchema = z
  .object({
    vehicleId: PositiveIntSchema,
    companyIdentityId: PositiveIntSchema,
    effectiveDate: IsoDateSchema,
    ownershipPct: OwnershipPctStringSchema,
    fdNumerator: StoredPositionDecimalStringSchema.optional(),
    fdDenominator: StoredPositionDecimalStringSchema.optional(),
    currency: z.literal('USD').default('USD'),
    supersedesSnapshotId: PositiveIntSchema.optional(),
    sourceObservationId: PositiveIntSchema,
  })
  .strict()
  .superRefine((input, context) => {
    if ((input.fdNumerator === undefined) !== (input.fdDenominator === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fdNumerator'],
        message: 'fdNumerator and fdDenominator must be supplied together.',
      });
    }
    if (input.fdNumerator !== undefined && input.fdDenominator !== undefined) {
      const denominator = new Decimal(input.fdDenominator);
      if (!denominator.gt(0)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fdDenominator'],
          message: 'fdDenominator must be greater than zero.',
        });
        return;
      }
      const pct = new Decimal(input.fdNumerator).div(denominator).mul(100).toFixed(8);
      if (pct !== input.ownershipPct) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ownershipPct'],
          message: 'ownershipPct must exactly equal fdNumerator / fdDenominator * 100.',
        });
      }
    }
  });

export const OwnershipSnapshotV1Schema = z
  .object({
    id: PositiveIntSchema,
    fundId: PositiveIntSchema,
    vehicleId: PositiveIntSchema,
    companyIdentityId: PositiveIntSchema,
    effectiveDate: IsoDateSchema,
    recordedAt: IsoDateTimeSchema,
    ownershipPct: OwnershipPctStringSchema,
    fdNumerator: StoredPositionDecimalStringSchema.nullable(),
    fdDenominator: StoredPositionDecimalStringSchema.nullable(),
    currency: CurrencySchema,
    supersedesSnapshotId: PositiveIntSchema.nullable(),
    sourceObservationId: PositiveIntSchema,
    createdBy: PositiveIntSchema.nullable(),
    idempotencyKey: z.string().min(1).max(128),
    requestHash: Sha256HexSchema,
  })
  .strict();

export const OwnershipSnapshotListV1Schema = z
  .object({
    fundId: PositiveIntSchema,
    asOfDate: IsoDateSchema,
    knowledgeCutoff: IsoDateTimeSchema,
    snapshots: z.array(OwnershipSnapshotV1Schema),
  })
  .strict();

export const PositionValuationRequestSchema = z
  .object({
    vehicleId: PositiveIntSchema,
    companyIdentityId: PositiveIntSchema,
    companyId: PositiveIntSchema,
    asOfDate: IsoDateSchema,
    fairValue: MoneyDecimalStringSchema.refine((value) => new Decimal(value).gte(0)),
    currency: z.literal('USD').default('USD'),
    sourceObservationId: PositiveIntSchema,
    markSource: z.enum([
      'financing_round',
      'signed_loi',
      'revenue_milestone',
      'strategic_partnership',
      'audited_financials',
      'board_update',
      'gp_estimate',
      'third_party_priced',
      'secondary_transaction',
      'impairment',
    ]),
    confidenceLevel: z.enum(['high', 'medium', 'low']),
    valuationMethod: z.string().min(1),
    methodologyNotes: z.string().optional(),
  })
  .strict();

export const PositionValuationV1Schema = z
  .object({
    valuationMarkId: PositiveIntSchema,
    sourceObservationId: PositiveIntSchema,
    fundId: PositiveIntSchema,
    vehicleId: PositiveIntSchema,
    companyIdentityId: PositiveIntSchema,
    companyId: PositiveIntSchema,
    asOfDate: IsoDateSchema,
    fairValue: MoneyDecimalStringSchema,
    sourceHash: Sha256HexSchema,
  })
  .strict();

export const PositionValuationSelectionV1Schema = z
  .object({
    fundId: PositiveIntSchema,
    vehicleId: PositiveIntSchema,
    companyIdentityId: PositiveIntSchema,
    companyId: PositiveIntSchema.nullable(),
    asOfDate: IsoDateSchema,
    aggregateFairValue: MoneyDecimalStringSchema.nullable(),
    basis: z.enum(['direct', 'derived', 'unavailable']),
    directMarkId: PositiveIntSchema.nullable(),
    directSourceObservationId: PositiveIntSchema.nullable(),
    ownershipSnapshotId: PositiveIntSchema.nullable(),
    derivedTrancheId: PositiveIntSchema.nullable(),
    derivedTrancheVersion: PositiveIntSchema.nullable(),
    derivedParticipationId: PositiveIntSchema.nullable(),
    derivedParticipationVersion: PositiveIntSchema.nullable(),
    evidenceDate: IsoDateSchema.nullable(),
    valuationAgeDays: z.number().int().nonnegative().nullable(),
    pricedComponentFairValue: MoneyDecimalStringSchema.nullable(),
    warnings: z.array(z.object({ code: z.string(), message: z.string() }).strict()),
  })
  .strict();

export type CurrentPositionQuery = z.infer<typeof CurrentPositionQuerySchema>;
export type CurrentPositionV1 = z.infer<typeof CurrentPositionV1Schema>;
export type CurrentPositionListV1 = z.infer<typeof CurrentPositionListV1Schema>;
export type OwnershipSnapshotRequest = z.output<typeof OwnershipSnapshotRequestSchema>;
export type OwnershipSnapshotV1 = z.infer<typeof OwnershipSnapshotV1Schema>;
export type OwnershipSnapshotListV1 = z.infer<typeof OwnershipSnapshotListV1Schema>;
export type PositionValuationRequest = z.output<typeof PositionValuationRequestSchema>;
export type PositionValuationV1 = z.infer<typeof PositionValuationV1Schema>;
export type PositionValuationSelectionV1 = z.infer<typeof PositionValuationSelectionV1Schema>;
