import { z } from 'zod';

import { Decimal } from '../../lib/decimal-config';
import { MoneyDecimalStringSchema } from '../../lib/decimal-string';
import {
  LedgerFxDecimalStringSchema,
  LedgerRateDecimalStringSchema,
  USD_FX_RATE_TO_USD,
} from './financing-event.contract';

export const VEHICLE_PARTICIPATION_ERROR_CODES = [
  'USE_LEDGER_ROUTE',
  'SUB_CENT_FX_RESIDUE',
  'MIXED_INVESTMENT_ORIGIN',
  'SUSPECTED_DUPLICATE_POSITION',
  'DUPLICATE_CONFIRMATION_STALE',
  'IDENTITY_LINK_REQUIRED',
  'IDENTITY_LINK_AMBIGUOUS',
  'LOT_OMITTED_UNPRICED',
  'LOT_OMITTED_UNREPRESENTABLE',
  'EFFECTIVE_TERMS_MATRIX_VIOLATION',
  'CALCULATION_INELIGIBLE_PARTICIPATION',
  'PARTICIPATION_CASCADE_REQUIRED',
] as const;

export const VehicleParticipationErrorCodeSchema = z.enum(VEHICLE_PARTICIPATION_ERROR_CODES);
export type VehicleParticipationErrorCode = z.infer<typeof VehicleParticipationErrorCodeSchema>;

const PositiveIntSchema = z.number().int().positive();
const IsoDateSchema = z.string().date();
const IsoDateTimeSchema = z.string().datetime();
const CurrencySchema = z.string().regex(/^[A-Z]{3}$/);
const Sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/);
const DescriptiveTermsSchema = z.record(z.string(), z.unknown());
export const ParticipationEconomicOriginSchema = z.enum(['cash_investment', 'conversion_result']);
export type ParticipationEconomicOrigin = z.infer<typeof ParticipationEconomicOriginSchema>;
const SharesDecimalStringSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)\.\d{8}$/)
  .refine((value) => new Decimal(value).gt(0), 'Shares must be greater than zero.');

export const CreateVehicleFinancingParticipationRequestSchema = z
  .object({
    vehicleId: PositiveIntSchema,
    participationAmount: MoneyDecimalStringSchema.refine(
      (value) => new Decimal(value).gt(0),
      'Participation amount must be greater than zero.'
    ),
    originalAmount: MoneyDecimalStringSchema.refine(
      (value) => new Decimal(value).gt(0),
      'Original amount must be greater than zero.'
    ).optional(),
    currency: CurrencySchema.optional(),
    fxRateToUsd: LedgerFxDecimalStringSchema.optional(),
    fxRateDate: IsoDateSchema.optional(),
    sharesAcquired: SharesDecimalStringSchema.optional(),
    closingDate: IsoDateSchema.optional(),
    pricePerShare: MoneyDecimalStringSchema.optional(),
    postMoneyValuation: MoneyDecimalStringSchema.optional(),
    valuationCap: MoneyDecimalStringSchema.optional(),
    conversionDiscountRate: LedgerRateDecimalStringSchema.optional(),
    interestRate: LedgerRateDecimalStringSchema.optional(),
    liquidationPreferenceMultiple: LedgerRateDecimalStringSchema.optional(),
    participatingPreferred: z.boolean().optional(),
    participationCapMultiple: LedgerRateDecimalStringSchema.optional(),
    proRataRightsPct: LedgerRateDecimalStringSchema.optional(),
    maturityDate: IsoDateSchema.optional(),
    descriptiveTerms: DescriptiveTermsSchema.optional(),
    confirmedDuplicates: z.array(Sha256HexSchema).default([]),
  })
  .strict()
  .superRefine((input, context) => {
    const currency = input.currency ?? 'USD';
    if (currency === 'USD') {
      if (input.fxRateToUsd !== undefined && input.fxRateToUsd !== USD_FX_RATE_TO_USD) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fxRateToUsd'],
          message: 'USD participations require the canonical unity FX rate.',
        });
      }
      return;
    }

    for (const field of ['originalAmount', 'fxRateToUsd', 'fxRateDate'] as const) {
      if (input[field] === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `Non-USD participations require ${field}.`,
        });
      }
    }
  });

export const VehicleFinancingParticipationV1Schema = z
  .object({
    id: PositiveIntSchema,
    fundId: PositiveIntSchema,
    vehicleId: PositiveIntSchema,
    financingEventId: PositiveIntSchema,
    trancheKey: z.string().min(1),
    financingTrancheId: PositiveIntSchema,
    version: PositiveIntSchema,
    supersededByParticipationId: PositiveIntSchema.nullable(),
    economicOrigin: ParticipationEconomicOriginSchema,
    participationAmount: MoneyDecimalStringSchema,
    originalAmount: MoneyDecimalStringSchema.nullable(),
    currency: CurrencySchema.nullable(),
    fxRateToUsd: LedgerFxDecimalStringSchema.nullable(),
    fxRateDate: IsoDateSchema.nullable(),
    sharesAcquired: SharesDecimalStringSchema.nullable(),
    closingDate: IsoDateSchema.nullable(),
    pricePerShare: MoneyDecimalStringSchema.nullable(),
    postMoneyValuation: MoneyDecimalStringSchema.nullable(),
    valuationCap: MoneyDecimalStringSchema.nullable(),
    conversionDiscountRate: LedgerRateDecimalStringSchema.nullable(),
    interestRate: LedgerRateDecimalStringSchema.nullable(),
    liquidationPreferenceMultiple: LedgerRateDecimalStringSchema.nullable(),
    participatingPreferred: z.boolean().nullable(),
    participationCapMultiple: LedgerRateDecimalStringSchema.nullable(),
    proRataRightsPct: LedgerRateDecimalStringSchema.nullable(),
    maturityDate: IsoDateSchema.nullable(),
    descriptiveTerms: DescriptiveTermsSchema.nullable(),
    confirmedDuplicates: z.array(Sha256HexSchema),
    sourceObservationId: PositiveIntSchema.nullable(),
    createdBy: PositiveIntSchema.nullable(),
    idempotencyKey: z.string().min(1).max(128),
    requestHash: Sha256HexSchema,
    createdAt: IsoDateTimeSchema,
  })
  .strict();

export type CreateVehicleFinancingParticipationRequest = z.input<
  typeof CreateVehicleFinancingParticipationRequestSchema
>;
export type VehicleFinancingParticipationV1 = z.infer<typeof VehicleFinancingParticipationV1Schema>;
