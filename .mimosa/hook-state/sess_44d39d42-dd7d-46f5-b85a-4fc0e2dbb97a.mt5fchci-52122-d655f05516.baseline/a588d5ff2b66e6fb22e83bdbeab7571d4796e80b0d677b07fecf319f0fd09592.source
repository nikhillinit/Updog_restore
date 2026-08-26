import { z } from 'zod';

import { Decimal } from '../../lib/decimal-config';
import { MoneyDecimalStringSchema } from '../../lib/decimal-string';
import { VehicleFinancingParticipationV1Schema } from './participation.contract';

export const POSITION_EVENT_ERROR_CODES = [
  'NON_USD_VALUE_UNSUPPORTED',
  'IDENTITY_NOT_CURRENT',
  'POSITION_EVENT_CONSERVATION_VIOLATION',
  'LOT_RELIEF_NOT_FOUND',
  'LOT_RELIEF_EXCEEDED',
  'NORMALIZATION_REJECTED',
  'POSITION_EVENT_NOT_FOUND',
  'POSITION_EVENT_ALREADY_CORRECTED',
  'POSITION_EVENT_NOT_CORRECTABLE',
  'POSITION_CONVERSION_NOT_FOUND',
  'POSITION_CONVERSION_INELIGIBLE',
  'POSITION_CONVERSION_CONFLICT',
  'POSITION_CONVERSION_PRECISION_LOSS',
  'POSITION_CONVERSION_FORBIDDEN_WRITE',
  'precondition_failed',
  'LEDGER_WRITE_FAILED',
] as const;

export const PositionEventErrorCodeSchema = z.enum(POSITION_EVENT_ERROR_CODES);
export type PositionEventErrorCode = z.infer<typeof PositionEventErrorCodeSchema>;

const PositiveIntSchema = z.number().int().positive();
const IsoDateSchema = z.string().date();
const IsoDateTimeSchema = z.string().datetime();
const CurrencySchema = z.string().regex(/^[A-Z]{3}$/);
const Sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/);
const SharesDecimalStringSchema = z.string().regex(/^-?(?:0|[1-9]\d*)\.\d{8}$/);
const StoredPositionDecimalStringSchema = z.string().regex(/^-?(?:0|[1-9]\d*)\.\d{6}$/);
const PositiveStoredPositionDecimalStringSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)\.\d{6}$/)
  .refine((value) => new Decimal(value).gt(0), 'Shares must be greater than zero.');
const PositionEventTypeSchema = z.enum([
  'acquisition',
  'conversion',
  'realization',
  'write_off',
  'adjustment',
  'reversal',
]);

export const PositionEventLotReliefRequestSchema = z
  .object({
    investmentId: PositiveIntSchema,
    investmentLotId: z.string().uuid(),
    relievedShares: SharesDecimalStringSchema.refine(
      (value) => new Decimal(value).gt(0),
      'Relieved shares must be greater than zero.'
    ),
    relievedCostBasis: MoneyDecimalStringSchema.refine(
      (value) => new Decimal(value).gte(0),
      'Relieved cost basis must be non-negative.'
    ),
    allocatedProceeds: MoneyDecimalStringSchema.refine(
      (value) => new Decimal(value).gte(0),
      'Allocated proceeds must be non-negative.'
    ),
  })
  .strict();

export const RecordPositionEventRequestSchema = z
  .object({
    vehicleId: PositiveIntSchema,
    companyIdentityId: PositiveIntSchema,
    eventType: z.enum(['acquisition', 'realization', 'write_off', 'adjustment']),
    effectiveDate: IsoDateSchema,
    currency: CurrencySchema.default('USD'),
    sharesDelta: SharesDecimalStringSchema,
    costBasisDelta: MoneyDecimalStringSchema,
    proceeds: MoneyDecimalStringSchema,
    lotReliefs: z.array(PositionEventLotReliefRequestSchema).min(1).optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.eventType === 'acquisition' || input.eventType === 'adjustment') {
      if (!new Decimal(input.proceeds).eq(0)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['proceeds'],
          message: `${input.eventType} proceeds must be zero.`,
        });
      }
      if (input.lotReliefs !== undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lotReliefs'],
          message: `${input.eventType} events cannot carry lot reliefs.`,
        });
      }
    }

    if (input.eventType === 'acquisition') {
      if (!new Decimal(input.sharesDelta).gt(0)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sharesDelta'],
          message: 'Acquisition sharesDelta must be greater than zero.',
        });
      }
      if (!new Decimal(input.costBasisDelta).gte(0)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['costBasisDelta'],
          message: 'Acquisition costBasisDelta must be non-negative.',
        });
      }
    }

    if (input.eventType === 'realization' || input.eventType === 'write_off') {
      if (input.lotReliefs === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lotReliefs'],
          message: `${input.eventType} events require at least one lot relief.`,
        });
      }

      const seenLotIds = new Set<string>();
      for (const [index, relief] of (input.lotReliefs ?? []).entries()) {
        if (seenLotIds.has(relief.investmentLotId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['lotReliefs', index, 'investmentLotId'],
            message: 'A position event cannot relieve the same lot more than once.',
          });
        }
        seenLotIds.add(relief.investmentLotId);
        if (input.eventType === 'write_off' && !new Decimal(relief.allocatedProceeds).eq(0)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['lotReliefs', index, 'allocatedProceeds'],
            message: 'Write-off allocated proceeds must be zero.',
          });
        }
      }

      if (input.eventType === 'write_off' && !new Decimal(input.proceeds).eq(0)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['proceeds'],
          message: 'Write-off proceeds must be zero.',
        });
      }
    }
  });

export const CorrectPositionRequestSchema = z
  .object({
    positionEventId: PositiveIntSchema,
    currency: CurrencySchema.default('USD'),
    sharesDelta: SharesDecimalStringSchema,
    costBasisDelta: MoneyDecimalStringSchema,
    proceeds: MoneyDecimalStringSchema,
    lotReliefs: z.array(PositionEventLotReliefRequestSchema).min(1).optional(),
  })
  .strict();

export const PositionConversionLotReliefRequestSchema = z
  .object({
    investmentId: PositiveIntSchema,
    investmentLotId: z.string().uuid(),
    relievedShares: PositiveStoredPositionDecimalStringSchema,
    relievedCostBasis: MoneyDecimalStringSchema.refine(
      (value) => new Decimal(value).gt(0),
      'Relieved cost basis must be greater than zero.'
    ),
  })
  .strict();

export const PositionConversionAccruedInterestSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('excluded') }).strict(),
  z
    .object({
      mode: z.literal('capitalized_with_adjustment'),
      amount: MoneyDecimalStringSchema.refine(
        (value) => new Decimal(value).gt(0),
        'Capitalized interest amount must be greater than zero.'
      ),
    })
    .strict(),
]);

export const ConvertPositionRequestSchema = z
  .object({
    sourceParticipationId: PositiveIntSchema,
    resultingTrancheId: PositiveIntSchema,
    effectiveDate: IsoDateSchema,
    resultingSharesAcquired: PositiveStoredPositionDecimalStringSchema,
    sourceLotReliefs: z.array(PositionConversionLotReliefRequestSchema).min(1).optional(),
    accruedInterest: PositionConversionAccruedInterestSchema.default({ mode: 'excluded' }),
    currency: z.literal('USD').default('USD'),
  })
  .strict();

export const PositionEventV1Schema = z
  .object({
    id: PositiveIntSchema,
    fundId: PositiveIntSchema,
    vehicleId: PositiveIntSchema,
    companyIdentityId: PositiveIntSchema,
    eventType: PositionEventTypeSchema,
    effectiveDate: IsoDateSchema,
    recordedAt: IsoDateTimeSchema,
    sharesDelta: StoredPositionDecimalStringSchema,
    costBasisDelta: MoneyDecimalStringSchema,
    proceeds: MoneyDecimalStringSchema,
    replacesEventId: PositiveIntSchema.nullable(),
    reversesPositionEventId: PositiveIntSchema.nullable(),
    vehicleParticipationId: PositiveIntSchema.nullable(),
    resultingParticipationId: PositiveIntSchema.nullable(),
    sourceParticipationVersion: PositiveIntSchema.nullable(),
    resultingParticipationVersion: PositiveIntSchema.nullable(),
    sourceTrancheVersion: PositiveIntSchema.nullable(),
    resultingTrancheVersion: PositiveIntSchema.nullable(),
    sourceObservationId: PositiveIntSchema.nullable(),
    backfilledFromInvestmentId: PositiveIntSchema.nullable(),
    createdBy: PositiveIntSchema.nullable(),
    idempotencyKey: z.string().min(1).max(128).nullable(),
    requestHash: Sha256HexSchema.nullable(),
  })
  .strict();

export const PositionCorrectionV1Schema = z
  .object({
    reversal: PositionEventV1Schema,
    replacement: PositionEventV1Schema,
    reconciliationCaseId: PositiveIntSchema,
  })
  .strict();

export const PositionSourceBasisReliefV1Schema = z
  .object({
    conversionPositionEventId: PositiveIntSchema,
    sourceAcquisitionPositionEventId: PositiveIntSchema,
    capitalizedAdjustmentPositionEventId: PositiveIntSchema.nullable(),
    fundId: PositiveIntSchema,
    vehicleId: PositiveIntSchema,
    companyIdentityId: PositiveIntSchema,
    sourceParticipationId: PositiveIntSchema,
    sourceParticipationVersion: PositiveIntSchema,
    sourceFinancingEventId: PositiveIntSchema,
    sourceFinancingTrancheId: PositiveIntSchema,
    resultingParticipationId: PositiveIntSchema,
    resultingParticipationVersion: PositiveIntSchema,
    resultingFinancingEventId: PositiveIntSchema,
    resultingFinancingTrancheId: PositiveIntSchema,
    sourceTrancheVersion: PositiveIntSchema,
    resultingTrancheVersion: PositiveIntSchema,
    sourceAcquisitionCostBasis: MoneyDecimalStringSchema,
    capitalizedAdjustmentCostBasis: MoneyDecimalStringSchema,
    relievedCostBasis: MoneyDecimalStringSchema,
    sourceEconomicOrigin: z.literal('cash_investment'),
    resultingEconomicOrigin: z.literal('conversion_result'),
  })
  .strict();

export const PositionConversionLotReliefV1Schema = z
  .object({
    investmentId: PositiveIntSchema,
    investmentLotId: z.string().uuid(),
    relievedShares: StoredPositionDecimalStringSchema,
    relievedCostBasis: MoneyDecimalStringSchema,
    allocatedProceeds: MoneyDecimalStringSchema,
  })
  .strict();

export const PositionConversionV1Schema = z
  .object({
    sourceParticipationId: PositiveIntSchema,
    sourceParticipationVersion: PositiveIntSchema,
    resultingParticipation: VehicleFinancingParticipationV1Schema,
    conversionEvent: PositionEventV1Schema,
    capitalizedAdjustmentEvent: PositionEventV1Schema.nullable(),
    reliefMode: z.enum(['specific_lots', 'source_basis']),
    lotReliefs: z.array(PositionConversionLotReliefV1Schema),
    sourceBasisRelief: PositionSourceBasisReliefV1Schema,
    resultConversionLotId: z.string().uuid(),
    conversionObservationId: PositiveIntSchema,
  })
  .strict();

export type PositionEventLotReliefRequest = z.infer<typeof PositionEventLotReliefRequestSchema>;
export type RecordPositionEventRequest = z.output<typeof RecordPositionEventRequestSchema>;
export type CorrectPositionRequest = z.output<typeof CorrectPositionRequestSchema>;
export type PositionConversionLotReliefRequest = z.infer<
  typeof PositionConversionLotReliefRequestSchema
>;
export type ConvertPositionRequest = z.output<typeof ConvertPositionRequestSchema>;
export type PositionEventV1 = z.infer<typeof PositionEventV1Schema>;
export type PositionCorrectionV1 = z.infer<typeof PositionCorrectionV1Schema>;
export type PositionSourceBasisReliefV1 = z.infer<typeof PositionSourceBasisReliefV1Schema>;
export type PositionConversionLotReliefV1 = z.infer<typeof PositionConversionLotReliefV1Schema>;
export type PositionConversionV1 = z.infer<typeof PositionConversionV1Schema>;
