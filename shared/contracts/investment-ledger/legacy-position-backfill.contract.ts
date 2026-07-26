import { z } from 'zod';

const PositiveIntSchema = z.number().int().positive();
const Sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/);
const IsoDateSchema = z.string().date();
const StoredPositionDecimalStringSchema = z.string().regex(/^-?(?:0|[1-9]\d*)\.\d{6}$/);

export const LegacyPositionBackfillModeSchema = z.enum(['dry_run', 'apply', 'resume']);

export const LegacyPositionBackfillRequestSchema = z
  .object({
    mode: LegacyPositionBackfillModeSchema,
    fundIds: z.array(PositiveIntSchema).min(1).optional(),
    expectedSourceHashes: z.record(z.string().regex(/^\d+$/), Sha256HexSchema).optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.mode !== 'dry_run' && input.expectedSourceHashes === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expectedSourceHashes'],
        message: 'Apply mode requires expectedSourceHashes from a dry-run plan.',
      });
    }
  });

export const LegacyPositionBackfillBlockerCodeSchema = z.enum([
  'MULTI_MAIN_FUND_VEHICLE',
  'MAIN_VEHICLE_SLUG_CONFLICT',
  'INVESTMENT_FUND_MISMATCH',
  'IDENTITY_LINK_MISSING',
  'IDENTITY_LINK_AMBIGUOUS',
  'PARTICIPATION_NOT_FOUND',
  'PARTICIPATION_SUPERSEDED',
  'PARTICIPATION_SCOPE_MISMATCH',
  'NON_USD_VALUE_UNSUPPORTED',
  'COST_BASIS_MISSING',
  'COST_BASIS_MISMATCH',
  'SHARE_PRECISION_LOSS',
  'SOURCE_PLAN_HASH_REQUIRED',
  'SOURCE_PLAN_HASH_CHANGED',
  'EXISTING_BACKFILL_MISMATCH',
  'POSITION_ACQUISITION_OVERLAP',
]);

export const LegacyPositionBackfillWarningCodeSchema = z.enum([
  'ZERO_SHARE_LEGACY_POSITION',
  'MAIN_VEHICLE_WOULD_BE_CREATED',
  'MAIN_VEHICLE_CREATED',
  'EXISTING_BACKFILL_REPLAYED',
  'PARTICIPATION_OBSERVATION_REUSED',
]);

export const LegacyPositionBackfillCandidateSchema = z
  .object({
    investmentId: PositiveIntSchema,
    fundId: PositiveIntSchema,
    vehicleId: PositiveIntSchema.nullable(),
    companyIdentityId: PositiveIntSchema.nullable(),
    vehicleParticipationId: PositiveIntSchema.nullable(),
    effectiveDate: IsoDateSchema,
    sharesDelta: StoredPositionDecimalStringSchema.nullable(),
    costBasisDelta: StoredPositionDecimalStringSchema.nullable(),
    sourcePlanHash: Sha256HexSchema.nullable(),
    eventId: PositiveIntSchema.nullable(),
    status: z.enum(['planned', 'written', 'skipped', 'blocked']),
    blockers: z.array(LegacyPositionBackfillBlockerCodeSchema),
    warnings: z.array(LegacyPositionBackfillWarningCodeSchema),
  })
  .strict();

export const LegacyPositionBackfillResultSchema = z
  .object({
    mode: LegacyPositionBackfillModeSchema,
    fundsScanned: z.number().int().nonnegative(),
    investmentsScanned: z.number().int().nonnegative(),
    planned: z.number().int().nonnegative(),
    written: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
    createdMainVehicles: z.number().int().nonnegative(),
    candidates: z.array(LegacyPositionBackfillCandidateSchema),
  })
  .strict();

export type LegacyPositionBackfillMode = z.infer<typeof LegacyPositionBackfillModeSchema>;
export type LegacyPositionBackfillRequest = z.output<
  typeof LegacyPositionBackfillRequestSchema
>;
export type LegacyPositionBackfillBlockerCode = z.infer<
  typeof LegacyPositionBackfillBlockerCodeSchema
>;
export type LegacyPositionBackfillWarningCode = z.infer<
  typeof LegacyPositionBackfillWarningCodeSchema
>;
export type LegacyPositionBackfillCandidate = z.infer<
  typeof LegacyPositionBackfillCandidateSchema
>;
export type LegacyPositionBackfillResult = z.infer<typeof LegacyPositionBackfillResultSchema>;
