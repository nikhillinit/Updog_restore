import { z } from 'zod';

import { Decimal } from '../../lib/decimal-config';
import { MoneyDecimalStringSchema, assertDecimalStringLeaves } from '../../lib/decimal-string';

export const LEDGER_CONTRACT_VERSION = '1.0.0';
export const LEDGER_SECURITY_TYPES = ['equity', 'safe', 'convertible_note', 'other'] as const;
export const LedgerSecurityTypeSchema = z.enum(LEDGER_SECURITY_TYPES);
export type LedgerSecurityType = z.infer<typeof LedgerSecurityTypeSchema>;

export const USD_FX_RATE_TO_USD = '1.0000000000';

export const LedgerRateDecimalStringSchema = z.string().regex(/^-?(?:0|[1-9]\d*)\.\d{8}$/);
export const LedgerFxDecimalStringSchema = z.string().regex(/^(?:0|[1-9]\d*)\.\d{10}$/);
const PositiveMoneyDecimalStringSchema = MoneyDecimalStringSchema.refine(
  (value) => new Decimal(value).gt(0),
  'Amount must be greater than zero.'
);
const PositiveLedgerFxDecimalStringSchema = LedgerFxDecimalStringSchema.refine(
  (value) => new Decimal(value).gt(0),
  'FX rate must be greater than zero.'
);

export const SECURITY_TYPE_TERM_MATRIX = {
  equity: {
    requiredAny: ['pricePerShare', 'postMoneyValuation'],
    forbidden: [],
  },
  safe: {
    requiredAny: ['valuationCap', 'conversionDiscountRate'],
    forbidden: ['liquidationPreferenceMultiple', 'participatingPreferred'],
  },
  convertible_note: {
    requiredAll: ['interestRate', 'maturityDate'],
    forbidden: [],
  },
  other: {
    requiredAny: [],
    forbidden: [],
  },
} as const;

const PositiveIntSchema = z.number().int().positive();
const IsoDateSchema = z.string().date();
const IsoDateTimeSchema = z.string().datetime();
const CurrencySchema = z.string().regex(/^[A-Z]{3}$/);
const Sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/);
const DescriptiveTermsSchema = z.record(z.string(), z.unknown());
const InputSecurityTypeSchema = z.enum([...LEDGER_SECURITY_TYPES, 'warrant']);

const trancheEconomicShape = {
  closingDate: IsoDateSchema,
  securityType: InputSecurityTypeSchema,
  investmentAmount: PositiveMoneyDecimalStringSchema,
  originalAmount: PositiveMoneyDecimalStringSchema.optional(),
  currency: CurrencySchema.optional(),
  fxRateToUsd: PositiveLedgerFxDecimalStringSchema.optional(),
  fxRateDate: IsoDateSchema.optional(),
  pricePerShare: MoneyDecimalStringSchema.optional(),
  postMoneyValuation: MoneyDecimalStringSchema.optional(),
  valuationCap: MoneyDecimalStringSchema.optional(),
  conversionDiscountRate: LedgerRateDecimalStringSchema.optional(),
  interestRate: LedgerRateDecimalStringSchema.optional(),
  maturityDate: IsoDateSchema.optional(),
  liquidationPreferenceMultiple: LedgerRateDecimalStringSchema.optional(),
  participatingPreferred: z.boolean().optional(),
  participationCapMultiple: LedgerRateDecimalStringSchema.optional(),
  proRataRightsPct: LedgerRateDecimalStringSchema.optional(),
  descriptiveTerms: DescriptiveTermsSchema.optional(),
};

const trancheEconomicObject = z.object(trancheEconomicShape).strict();
const trancheWithKeyObject = z
  .object({ trancheKey: z.string().min(1), ...trancheEconomicShape })
  .strict();

/**
 * The correction payload carries no `trancheKey` (identity comes from the path),
 * so the key is optional on the shared input type; the record schema re-attaches
 * it as required after normalization.
 */
type TrancheInput = z.infer<typeof trancheEconomicObject> & { trancheKey?: string };

/**
 * Normalized tranche terms. Every optional term stays declared even on the
 * warrant path, where the values move into `descriptiveTerms` and the row is
 * marked calculation-ineligible: a union that dropped the keys would force
 * consumers to narrow on a distinction that carries no meaning downstream.
 */
export interface NormalizedTrancheTerms {
  closingDate: string;
  securityType: LedgerSecurityType;
  investmentAmount: string;
  originalAmount: string;
  currency: string;
  fxRateToUsd: string;
  fxRateDate: string;
  pricePerShare?: string | undefined;
  postMoneyValuation?: string | undefined;
  valuationCap?: string | undefined;
  conversionDiscountRate?: string | undefined;
  interestRate?: string | undefined;
  maturityDate?: string | undefined;
  liquidationPreferenceMultiple?: string | undefined;
  participatingPreferred?: boolean | undefined;
  participationCapMultiple?: string | undefined;
  proRataRightsPct?: string | undefined;
  descriptiveTerms: Record<string, unknown>;
  calculationEligible: boolean;
}

const warrantTermFields = [
  'pricePerShare',
  'postMoneyValuation',
  'valuationCap',
  'conversionDiscountRate',
  'interestRate',
  'maturityDate',
  'liquidationPreferenceMultiple',
  'participatingPreferred',
  'participationCapMultiple',
  'proRataRightsPct',
] as const;

function addIssue(context: z.RefinementCtx, path: string, message: string): void {
  context.addIssue({
    code: z.ZodIssueCode.custom,
    path: [path],
    message,
  });
}

function validateTranche(input: TrancheInput, context: z.RefinementCtx): void {
  const currency = input.currency ?? 'USD';
  if (currency === 'USD') {
    if (input.fxRateToUsd !== undefined && input.fxRateToUsd !== USD_FX_RATE_TO_USD) {
      addIssue(context, 'fxRateToUsd', 'USD tranches require the canonical unity FX rate.');
    }
  } else {
    if (input.originalAmount === undefined) {
      addIssue(context, 'originalAmount', 'Non-USD tranches require originalAmount.');
    }
    if (input.fxRateToUsd === undefined) {
      addIssue(context, 'fxRateToUsd', 'Non-USD tranches require an explicit FX rate.');
    }
    if (input.fxRateDate === undefined) {
      addIssue(context, 'fxRateDate', 'Non-USD tranches require an explicit FX rate date.');
    }
  }

  if (input.securityType === 'warrant') {
    return;
  }

  const matrix = SECURITY_TYPE_TERM_MATRIX[input.securityType];
  if (
    'requiredAny' in matrix &&
    matrix.requiredAny.length > 0 &&
    !matrix.requiredAny.some((field) => input[field] !== undefined)
  ) {
    addIssue(
      context,
      'securityType',
      `${input.securityType} requires at least one supported valuation term.`
    );
  }
  if ('requiredAll' in matrix && matrix.requiredAll.some((field) => input[field] === undefined)) {
    addIssue(
      context,
      'securityType',
      `${input.securityType} requires all mandatory security terms.`
    );
  }
  for (const field of matrix.forbidden) {
    if (input[field] !== undefined) {
      addIssue(context, field, `${field} is not supported for ${input.securityType}.`);
    }
  }
}

function normalizeTranche(input: TrancheInput): NormalizedTrancheTerms {
  const currency = input.currency ?? 'USD';
  const originalAmount = input.originalAmount ?? input.investmentAmount;
  const fxRateToUsd = input.fxRateToUsd ?? USD_FX_RATE_TO_USD;
  const fxRateDate = input.fxRateDate ?? input.closingDate;
  const descriptiveTerms = input.descriptiveTerms ?? {};

  if (input.securityType !== 'warrant') {
    return {
      ...input,
      securityType: input.securityType,
      originalAmount,
      currency,
      fxRateToUsd,
      fxRateDate,
      descriptiveTerms,
      calculationEligible: true,
    };
  }

  const warrantTerms: Record<string, unknown> = {};
  for (const field of warrantTermFields) {
    const value = input[field];
    if (value !== undefined) {
      warrantTerms[field] = value;
    }
  }
  const {
    pricePerShare: _pricePerShare,
    postMoneyValuation: _postMoneyValuation,
    valuationCap: _valuationCap,
    conversionDiscountRate: _conversionDiscountRate,
    interestRate: _interestRate,
    maturityDate: _maturityDate,
    liquidationPreferenceMultiple: _liquidationPreferenceMultiple,
    participatingPreferred: _participatingPreferred,
    participationCapMultiple: _participationCapMultiple,
    proRataRightsPct: _proRataRightsPct,
    ...base
  } = input;

  return {
    ...base,
    securityType: 'other' as const,
    originalAmount,
    currency,
    fxRateToUsd,
    fxRateDate,
    descriptiveTerms: {
      ...descriptiveTerms,
      ...(Object.keys(warrantTerms).length > 0 && { warrantTerms }),
    },
    calculationEligible: false,
  };
}

export const CreateFinancingEventRequestSchema = z
  .object({
    companyIdentityId: PositiveIntSchema,
    eventKey: z.string().min(1),
    roundName: z.string().min(1),
    securityType: LedgerSecurityTypeSchema,
    eventDate: IsoDateSchema,
    currency: CurrencySchema.default('USD'),
    roundSize: MoneyDecimalStringSchema.nullable().optional(),
    preMoneyValuation: MoneyDecimalStringSchema.nullable().optional(),
    postMoneyValuation: MoneyDecimalStringSchema.nullable().optional(),
    pricePerShare: MoneyDecimalStringSchema.nullable().optional(),
  })
  .strict();

export const RecordFinancingTrancheRequestSchema = trancheWithKeyObject
  .superRefine(validateTranche)
  .transform((input) => ({ ...normalizeTranche(input), trancheKey: input.trancheKey }));
export const CorrectFinancingTrancheRequestSchema = trancheEconomicObject
  .superRefine(validateTranche)
  .transform((input) => normalizeTranche(input));

export const FinancingEventV1Schema = z
  .object({
    id: PositiveIntSchema,
    fundId: PositiveIntSchema,
    companyIdentityId: PositiveIntSchema,
    eventKey: z.string().min(1),
    roundName: z.string().min(1),
    securityType: LedgerSecurityTypeSchema,
    eventDate: IsoDateSchema,
    currency: CurrencySchema,
    roundSize: MoneyDecimalStringSchema.nullable(),
    preMoneyValuation: MoneyDecimalStringSchema.nullable(),
    postMoneyValuation: MoneyDecimalStringSchema.nullable(),
    pricePerShare: MoneyDecimalStringSchema.nullable(),
    createdBy: PositiveIntSchema.nullable(),
    idempotencyKey: z.string().min(1).max(128),
    requestHash: Sha256HexSchema,
    createdAt: IsoDateTimeSchema,
  })
  .strict();

export const FinancingTrancheV1Schema = z
  .object({
    id: PositiveIntSchema,
    fundId: PositiveIntSchema,
    financingEventId: PositiveIntSchema,
    trancheKey: z.string().min(1),
    version: PositiveIntSchema,
    supersededByTrancheId: PositiveIntSchema.nullable(),
    closingDate: IsoDateSchema,
    securityType: LedgerSecurityTypeSchema,
    investmentAmount: MoneyDecimalStringSchema,
    originalAmount: MoneyDecimalStringSchema,
    currency: CurrencySchema,
    fxRateToUsd: LedgerFxDecimalStringSchema,
    fxRateDate: IsoDateSchema,
    pricePerShare: MoneyDecimalStringSchema.nullable(),
    postMoneyValuation: MoneyDecimalStringSchema.nullable(),
    valuationCap: MoneyDecimalStringSchema.nullable(),
    conversionDiscountRate: LedgerRateDecimalStringSchema.nullable(),
    interestRate: LedgerRateDecimalStringSchema.nullable(),
    maturityDate: IsoDateSchema.nullable(),
    liquidationPreferenceMultiple: LedgerRateDecimalStringSchema.nullable(),
    participatingPreferred: z.boolean().nullable(),
    participationCapMultiple: LedgerRateDecimalStringSchema.nullable(),
    proRataRightsPct: LedgerRateDecimalStringSchema.nullable(),
    descriptiveTerms: DescriptiveTermsSchema,
    calculationEligible: z.boolean(),
    sourceObservationId: PositiveIntSchema.nullable(),
    createdBy: PositiveIntSchema.nullable(),
    idempotencyKey: z.string().min(1).max(128),
    requestHash: Sha256HexSchema,
    createdAt: IsoDateTimeSchema,
  })
  .strict();

export const FinancingEventDetailV1Schema = z
  .object({
    event: FinancingEventV1Schema,
    headTranches: z.array(FinancingTrancheV1Schema),
    versionHistory: z.array(FinancingTrancheV1Schema),
  })
  .strict();

export type CreateFinancingEventRequest = z.input<typeof CreateFinancingEventRequestSchema>;
export type RecordFinancingTrancheRequest = z.output<typeof RecordFinancingTrancheRequestSchema>;
export type CorrectFinancingTrancheRequest = z.output<typeof CorrectFinancingTrancheRequestSchema>;
export type FinancingEventV1 = z.infer<typeof FinancingEventV1Schema>;
export type FinancingTrancheV1 = z.infer<typeof FinancingTrancheV1Schema>;
export type FinancingEventDetailV1 = z.infer<typeof FinancingEventDetailV1Schema>;

/**
 * Only the 6-place money subset is safe for the shared key-based decimal
 * assertion. Ledger rate and FX leaves intentionally use 8 and 10 places.
 */
export function investmentLedgerMoneyProjection(
  tranche: Pick<
    RecordFinancingTrancheRequest,
    'investmentAmount' | 'originalAmount' | 'postMoneyValuation' | 'valuationCap' | 'pricePerShare'
  >
): Record<string, string> {
  const projection = {
    investmentAmount: tranche.investmentAmount,
    originalAmount: tranche.originalAmount,
    ...(tranche.postMoneyValuation !== undefined && {
      postMoneyValuation: tranche.postMoneyValuation,
    }),
    ...(tranche.valuationCap !== undefined && {
      valuationCap: tranche.valuationCap,
    }),
    ...(tranche.pricePerShare !== undefined && {
      pricePerShare: tranche.pricePerShare,
    }),
  };
  assertDecimalStringLeaves(projection);
  return projection;
}
