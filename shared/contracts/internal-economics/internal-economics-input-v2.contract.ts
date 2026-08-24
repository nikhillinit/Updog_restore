import { z } from 'zod';
import { MoneyDecimalStringSchema, RatioDecimalStringSchema } from '../../lib/decimal-string';

export const INTERNAL_ECONOMICS_COMPOSITE_V2_VERSION =
  'internal-economics-composite/2.0.0' as const;

export const INTERNAL_ECONOMICS_COMPOSITE_V2_1_VERSION =
  'internal-economics-composite/2.0.1' as const;

// ---------------------------------------------------------------------------
// Refusal codes
// ---------------------------------------------------------------------------

export const V2_REFUSAL_CODES = [
  'UNSUPPORTED_INTERNAL_ECONOMICS_CONTRACT_VERSION',
  'SCHEMA_VALIDATION_FAILED',
  'ADMISSION_LIMIT_EXCEEDED',
  'EVENT_OUT_OF_WINDOW',
  'DUPLICATE_EVENT_IDENTITY',
  'OPENING_RECONCILIATION_VIOLATION',
  'LP_CLASS_PROFILE_AMBIGUITY',
  'UNSUPPORTED_MULTI_CLASS_FEE_DIVERGENCE',
  'GP_SPLIT_MISMATCH',
  'CASH_SOURCE_ALLOCATION_VIOLATION',
  'INVESTMENT_LOT_RELIEF_VIOLATION',
  'UNSUPPORTED_V2_WATERFALL_HYBRID',
  'INVALID_TIER_POLICY',
  'UNSUPPORTED_TIER_FEATURE',
  'COMMITMENT_OVERRUN',
  'UNSUPPORTED_V2_EQUALIZATION',
  'EQUALIZATION_MISMATCH',
  'NEGATIVE_PERIOD_BASIS',
  'UNSUPPORTED_V2_RECYCLING_BASIS',
  'RECYCLING_CAPACITY_EXCEEDED',
  'FEE_RECYCLING_DISABLED',
  'RECEIPT_CONSERVATION_VIOLATION',
  'FEE_ALLOCATION_MISMATCH',
  'OPENING_PROVENANCE_REQUIRED',
  'UNSUPPORTED_V2_BASE_EVENT',
  'UNSUPPORTED_V2_CONTRIBUTION_CORRECTION',
  'UNSUPPORTED_V2_WRITE_OFF',
  'UNSUPPORTED_V2_CONVERSION',
  'UNSUPPORTED_V2_FEE_BASIS',
  'UNSUPPORTED_V2_FEE_PROFILE_FEATURE',
  'UNSUPPORTED_V2_MANAGEMENT_FEE',
  'INVALID_V2_FEE_PERIOD_MONTHS',
  'UNSUPPORTED_V2_RETROACTIVE_PERIOD_FLOW_FEE',
  'UNSUPPORTED_V2_PREFERRED_RETURN',
  'UNSUPPORTED_V2_FEE_RECYCLING',
  'UNSUPPORTED_V2_DEAL_BY_DEAL_DISTRIBUTION',
  'UNSUPPORTED_V2_EXIT_RECYCLING_DISTRIBUTION',
  'UNSUPPORTED_V2_WHOLE_FUND_CERTIFICATION',
] as const;

export type V2RefusalCode = (typeof V2_REFUSAL_CODES)[number];

export const V2_STAGES = [
  'normalization',
  'admission',
  'chronology',
  'settlement',
  'provenance',
  'accrual',
  'equalization',
  'waterfall',
  'recycling',
  'receipt',
] as const;

export type V2Stage = (typeof V2_STAGES)[number];

export interface V2RefusalDiagnostics {
  readonly periodIndex?: number;
  readonly eventId?: string;
  readonly partnerId?: string;
  readonly expectedCents?: string;
  readonly actualCents?: string;
  readonly deltaCents?: string;
  readonly contextDetails?: string;
}

export interface V2CoreRefusal {
  readonly ok: false;
  readonly code: V2RefusalCode;
  readonly stage: V2Stage;
  readonly message: string;
  readonly diagnostics?: V2RefusalDiagnostics;
}

// ---------------------------------------------------------------------------
// Event kinds
// ---------------------------------------------------------------------------

export const V2_EVENT_KINDS = [
  'settled_contribution',
  'contribution_correction',
  'fund_expense_payment',
  'realization',
  'write_off',
  'conversion',
  'deployment',
  'equalization_principal',
  'equalization_interest',
] as const;

export type V2EventKind = (typeof V2_EVENT_KINDS)[number];

export const V2_DERIVED_EVENT_KINDS = ['management_fee_payment', 'distribution'] as const;

export type V2DerivedEventKind = (typeof V2_DERIVED_EVENT_KINDS)[number];

export const V2_CONTRIBUTION_PURPOSES = ['deployment', 'management_fee', 'fund_expense'] as const;

export type V2ContributionPurpose = (typeof V2_CONTRIBUTION_PURPOSES)[number];

export const V2_EXPENSE_CATEGORIES = ['legal', 'audit', 'admin', 'custody', 'other'] as const;

export type V2ExpenseCategory = (typeof V2_EXPENSE_CATEGORIES)[number];

export const V2_RECYCLING_TAGS = ['fee', 'exit', 'none'] as const;

export type V2RecyclingTag = (typeof V2_RECYCLING_TAGS)[number];

// ---------------------------------------------------------------------------
// Event classification table (phase, cash-equation line, etc.)
// ---------------------------------------------------------------------------

export interface V2EventClassification {
  readonly phase: number;
  readonly cashEquationSign: '+' | '-' | 'zero' | 'none';
  readonly callableEffect: 'consumes' | 'restores' | 'none' | 'reserved';
}

export const V2_EVENT_CLASSIFICATION: Record<V2EventKind, V2EventClassification> = {
  settled_contribution: {
    phase: 1,
    cashEquationSign: '+',
    callableEffect: 'consumes',
  },
  contribution_correction: {
    phase: 1,
    cashEquationSign: '-',
    callableEffect: 'restores',
  },
  fund_expense_payment: {
    phase: 3,
    cashEquationSign: '-',
    callableEffect: 'none',
  },
  realization: { phase: 4, cashEquationSign: '+', callableEffect: 'none' },
  write_off: { phase: 4, cashEquationSign: 'none', callableEffect: 'none' },
  conversion: { phase: 4, cashEquationSign: 'none', callableEffect: 'none' },
  deployment: { phase: 7, cashEquationSign: '-', callableEffect: 'none' },
  equalization_principal: {
    phase: 1,
    cashEquationSign: 'zero',
    callableEffect: 'reserved',
  },
  equalization_interest: {
    phase: 1,
    cashEquationSign: 'none',
    callableEffect: 'reserved',
  },
};

// ---------------------------------------------------------------------------
// Tier grammar (section 2)
// ---------------------------------------------------------------------------

export const V2_TIER_KINDS = [
  'return_of_capital',
  'preferred_return',
  'gp_catch_up',
  'carry',
] as const;

export type V2TierKind = (typeof V2_TIER_KINDS)[number];

export const V2_RATE_MODES = ['simple', 'effective_annual_compounded'] as const;

export type V2RateMode = (typeof V2_RATE_MODES)[number];

export type WaterfallTierV2 =
  | { readonly kind: 'return_of_capital'; readonly priority: number }
  | {
      readonly kind: 'preferred_return';
      readonly priority: number;
      readonly basis: 'unreturned_settled_cash_capital';
      readonly annualRate: string;
      readonly rateMode: V2RateMode;
    }
  | {
      readonly kind: 'gp_catch_up';
      readonly priority: number;
      readonly gpAllocationRate: string;
    }
  | {
      readonly kind: 'carry';
      readonly priority: number;
      readonly gpShare: string;
    };

// ---------------------------------------------------------------------------
// Tier grammar Zod schema
// ---------------------------------------------------------------------------

const ReturnOfCapitalTierSchema = z.object({
  kind: z.literal('return_of_capital'),
  priority: z.number().int().positive(),
});

const PreferredReturnTierSchema = z.object({
  kind: z.literal('preferred_return'),
  priority: z.number().int().positive(),
  basis: z.literal('unreturned_settled_cash_capital'),
  annualRate: RatioDecimalStringSchema,
  rateMode: z.enum(V2_RATE_MODES),
});

const GpCatchUpTierSchema = z.object({
  kind: z.literal('gp_catch_up'),
  priority: z.number().int().positive(),
  gpAllocationRate: RatioDecimalStringSchema,
});

const CarryTierSchema = z.object({
  kind: z.literal('carry'),
  priority: z.number().int().positive(),
  gpShare: RatioDecimalStringSchema,
});

export const WaterfallTierV2Schema = z.discriminatedUnion('kind', [
  ReturnOfCapitalTierSchema,
  PreferredReturnTierSchema,
  GpCatchUpTierSchema,
  CarryTierSchema,
]);

// ---------------------------------------------------------------------------
// Waterfall type normalization
// ---------------------------------------------------------------------------

export const V2_WATERFALL_LANES = ['deal_by_deal', 'whole_fund'] as const;

export type V2WaterfallLane = (typeof V2_WATERFALL_LANES)[number];

export function normalizeWaterfallTypeV2(publicToken: string): V2WaterfallLane | V2CoreRefusal {
  switch (publicToken) {
    case 'american':
    case 'deal_by_deal':
      return 'deal_by_deal';
    case 'european':
    case 'whole_fund':
      return 'whole_fund';
    case 'hybrid':
      return {
        ok: false,
        code: 'UNSUPPORTED_V2_WATERFALL_HYBRID',
        stage: 'normalization',
        message: 'Hybrid waterfall is not supported in V2.0.0.',
      };
    default:
      return {
        ok: false,
        code: 'SCHEMA_VALIDATION_FAILED',
        stage: 'normalization',
        message: `Unknown waterfall type: ${publicToken}`,
      };
  }
}

// ---------------------------------------------------------------------------
// GP cash preferred-return treatment
// ---------------------------------------------------------------------------

export const V2_GP_CASH_PREF_TREATMENTS = ['pari_passu', 'excluded'] as const;

export type V2GpCashPreferredReturnTreatment = (typeof V2_GP_CASH_PREF_TREATMENTS)[number];

// ---------------------------------------------------------------------------
// Cash-source allocation (lot-level)
// ---------------------------------------------------------------------------

export const CashSourceAllocationSchema = z
  .object({
    lotId: z.string().min(1),
    amount: MoneyDecimalStringSchema,
  })
  .strict();

export type CashSourceAllocation = z.infer<typeof CashSourceAllocationSchema>;

// ---------------------------------------------------------------------------
// Relief row (investment lot relief)
// ---------------------------------------------------------------------------

export const ReliefRowSchema = z
  .object({
    investmentLotId: z.string().min(1),
    relievedCostBasis: MoneyDecimalStringSchema,
    allocatedProceeds: MoneyDecimalStringSchema,
  })
  .strict();

export type ReliefRow = z.infer<typeof ReliefRowSchema>;

// ---------------------------------------------------------------------------
// Event wire schema (caller input)
// ---------------------------------------------------------------------------

const UtcInstantSchema = z.string().datetime({ offset: false });

const BaseEventSchema = z.object({
  eventId: z.string().min(1),
  instant: UtcInstantSchema,
  amountUsd: MoneyDecimalStringSchema,
});

const SettledContributionEventSchema = BaseEventSchema.extend({
  kind: z.literal('settled_contribution'),
  partnerId: z.string().min(1),
  purpose: z.enum(V2_CONTRIBUTION_PURPOSES),
  settlementSourceRef: z.string().min(1),
}).strict();

const ContributionCorrectionEventSchema = BaseEventSchema.extend({
  kind: z.literal('contribution_correction'),
  correctsEventId: z.string().min(1),
}).strict();

const FundExpensePaymentEventSchema = BaseEventSchema.extend({
  kind: z.literal('fund_expense_payment'),
  expenseCategory: z.enum(V2_EXPENSE_CATEGORIES),
  description: z.string().optional(),
  cashSourceAllocations: z.array(CashSourceAllocationSchema).min(1),
}).strict();

const RealizationEventSchema = BaseEventSchema.extend({
  kind: z.literal('realization'),
  dealId: z.string().min(1),
  reliefRows: z.array(ReliefRowSchema).min(1),
  recyclingTag: z.enum(V2_RECYCLING_TAGS),
}).strict();

const WriteOffEventSchema = BaseEventSchema.extend({
  kind: z.literal('write_off'),
  dealId: z.string().min(1),
  reliefRows: z.array(ReliefRowSchema).min(1),
}).strict();

const ConversionEventSchema = BaseEventSchema.extend({
  kind: z.literal('conversion'),
  dealId: z.string().min(1),
  reliefRows: z.array(ReliefRowSchema).min(1),
  successorLot: z
    .object({
      investmentLotId: z.string().min(1),
      costBasis: MoneyDecimalStringSchema,
    })
    .strict(),
}).strict();

const DeploymentEventSchema = BaseEventSchema.extend({
  kind: z.literal('deployment'),
  dealId: z.string().min(1),
  securityId: z.string().min(1),
  cashSourceAllocations: z.array(CashSourceAllocationSchema).min(1),
}).strict();

const EqualizationPrincipalEventSchema = BaseEventSchema.extend({
  kind: z.literal('equalization_principal'),
}).strict();

const EqualizationInterestEventSchema = BaseEventSchema.extend({
  kind: z.literal('equalization_interest'),
}).strict();

export const V2EventSchema = z.discriminatedUnion('kind', [
  SettledContributionEventSchema,
  ContributionCorrectionEventSchema,
  FundExpensePaymentEventSchema,
  RealizationEventSchema,
  WriteOffEventSchema,
  ConversionEventSchema,
  DeploymentEventSchema,
  EqualizationPrincipalEventSchema,
  EqualizationInterestEventSchema,
]);

export type V2Event = z.infer<typeof V2EventSchema>;

// ---------------------------------------------------------------------------
// FeeProfileV2WireSchema — strict, decimal-string-only mirror
// ---------------------------------------------------------------------------

export const FeeRateV2Schema = z
  .object({
    rate: RatioDecimalStringSchema,
    basis: z.enum([
      'committed_capital',
      'called_capital',
      'invested_capital',
      'fair_market_value',
      'unrealized_cost',
    ]),
  })
  .strict();

export const FeeScheduleEntryV2Schema = z
  .object({
    periodStartDate: UtcInstantSchema,
    periodEndDate: UtcInstantSchema,
    rate: FeeRateV2Schema,
  })
  .strict();

export const FeeProfileV2WireSchema = z
  .object({
    managementFeeSchedule: z.array(FeeScheduleEntryV2Schema),
    feeRecyclingEnabled: z.boolean(),
    feeRecyclingCapUsd: MoneyDecimalStringSchema.optional(),
    exitRecyclingEnabled: z.boolean(),
    exitRecyclingCapUsd: MoneyDecimalStringSchema.optional(),
  })
  .strict();

export type FeeProfileV2Wire = z.infer<typeof FeeProfileV2WireSchema>;

// ---------------------------------------------------------------------------
// LP class
// ---------------------------------------------------------------------------

export const LpClassV2Schema = z
  .object({
    lpClassId: z.string().min(1),
    feeProfile: FeeProfileV2WireSchema,
  })
  .strict();

export type LpClassV2 = z.infer<typeof LpClassV2Schema>;

// ---------------------------------------------------------------------------
// Partner wire schema
// ---------------------------------------------------------------------------

export const PartnerV2Schema = z
  .object({
    partnerId: z.string().min(1),
    name: z.string().min(1),
    isGp: z.boolean(),
    lpClassId: z.string().min(1).optional(),
    committedCapital: MoneyDecimalStringSchema,
    settledCash: MoneyDecimalStringSchema,
    gpDeemedContribution: MoneyDecimalStringSchema.optional(),
    remainingCallableCommitment: MoneyDecimalStringSchema,
  })
  .strict();

export type PartnerV2 = z.infer<typeof PartnerV2Schema>;

// ---------------------------------------------------------------------------
// Opening state
// ---------------------------------------------------------------------------

export const InvestorLedgerV2Schema = z
  .object({
    partnerId: z.string().min(1),
    committedCapital: MoneyDecimalStringSchema,
    calledCapital: MoneyDecimalStringSchema,
    settledCapital: MoneyDecimalStringSchema,
    paidInCapital: MoneyDecimalStringSchema,
    unreturnedSettledCashCapital: MoneyDecimalStringSchema,
    cumulativeDistributions: MoneyDecimalStringSchema,
    cumulativeFees: MoneyDecimalStringSchema,
    accruedPreference: MoneyDecimalStringSchema,
  })
  .strict();

export type InvestorLedgerV2 = z.infer<typeof InvestorLedgerV2Schema>;

export const OpeningPartnerOwnerV2Schema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('lp'),
      partnerId: z.string().min(1),
      lpClassId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('gp'),
      partnerId: z.string().min(1),
    })
    .strict(),
]);

export type OpeningPartnerOwnerV2 = z.infer<typeof OpeningPartnerOwnerV2Schema>;

export const OpeningCashOwnerV2Schema = z.union([
  OpeningPartnerOwnerV2Schema,
  z
    .object({
      kind: z.literal('entitlement_pool'),
      entitlementPoolId: z.string().min(1),
    })
    .strict(),
  z.object({ kind: z.literal('fund') }).strict(),
]);

export type OpeningCashOwnerV2 = z.infer<typeof OpeningCashOwnerV2Schema>;

export const OpeningCashLotV2Schema = z
  .object({
    lotId: z.string().min(1),
    sourceRef: z.string().min(1),
    owner: OpeningCashOwnerV2Schema,
    classification: z.enum(['paid_in', 'recycling', 'unclassified']),
    originalAmount: MoneyDecimalStringSchema,
    remainingBalance: MoneyDecimalStringSchema,
  })
  .strict();

export const OpeningInvestmentLotOwnerSliceV2Schema = z
  .object({
    investmentLotId: z.string().min(1),
    sourceRef: z.string().min(1),
    entitlementPoolId: z.string().min(1),
    dealId: z.string().min(1),
    securityId: z.string().min(1),
    owner: OpeningPartnerOwnerV2Schema,
    costBasis: MoneyDecimalStringSchema,
    relievedAmount: MoneyDecimalStringSchema,
    entitlementAmount: MoneyDecimalStringSchema,
  })
  .strict();

export const OpeningEntitlementPoolV2Schema = z
  .object({
    entitlementPoolId: z.string().min(1),
    sourceRef: z.string().min(1),
    dealId: z.string().min(1),
    securityId: z.string().min(1),
  })
  .strict();

export const OpeningProvenanceV2Schema = z
  .object({
    cashLots: z.array(OpeningCashLotV2Schema),
    investmentLots: z.array(OpeningInvestmentLotOwnerSliceV2Schema),
    entitlementPools: z.array(OpeningEntitlementPoolV2Schema),
  })
  .strict();

export type OpeningProvenanceV2 = z.infer<typeof OpeningProvenanceV2Schema>;

export const OpeningCashClassificationV2Schema = z
  .object({
    paidIn: MoneyDecimalStringSchema,
    recycling: MoneyDecimalStringSchema,
    unclassified: MoneyDecimalStringSchema,
  })
  .strict();

export const OpeningProfitDecompositionV2Schema = z
  .object({
    openingCumulativePreferredPaid: MoneyDecimalStringSchema,
    openingCumulativeGpProfitDistributions: MoneyDecimalStringSchema,
    openingCumulativeLpProfitDistributions: MoneyDecimalStringSchema,
  })
  .strict();

export const OpeningStateV2Schema = z
  .object({
    openingCash: MoneyDecimalStringSchema,
    openingCashClassification: OpeningCashClassificationV2Schema,
    openingProvenance: OpeningProvenanceV2Schema.default({
      cashLots: [],
      investmentLots: [],
      entitlementPools: [],
    }),
    openingCommitments: MoneyDecimalStringSchema,
    investorLedgers: z.array(InvestorLedgerV2Schema).min(1),
    accruedPreferenceTotal: MoneyDecimalStringSchema,
    cumulativeDistributionsTotal: MoneyDecimalStringSchema,
    cumulativeFeesTotal: MoneyDecimalStringSchema,
    consumedFeeRecyclingCapacity: MoneyDecimalStringSchema,
    consumedExitRecyclingCapacity: MoneyDecimalStringSchema,
    profitDecomposition: OpeningProfitDecompositionV2Schema,
  })
  .strict();

export type OpeningStateV2 = z.infer<typeof OpeningStateV2Schema>;

// ---------------------------------------------------------------------------
// Admission limits (named constants)
// ---------------------------------------------------------------------------

export const V2_ADMISSION_LIMITS = {
  MAX_PERIODS: 200,
  MAX_EVENTS: 10_000,
  MAX_PARTNERS: 1_000,
  MAX_LP_CLASSES: 100,
  MAX_PROVENANCE_ALLOCATION_ROWS: 50_000,
  MAX_OUTPUT_ROWS: 100_000,
  MAX_SERIALIZED_INPUT_BYTES: 4 * 1024 * 1024,
} as const;

// ---------------------------------------------------------------------------
// Top-level input wire schema
// ---------------------------------------------------------------------------

export const InternalEconomicsInputV2WireSchema = z
  .object({
    contractVersion: z.literal(INTERNAL_ECONOMICS_COMPOSITE_V2_1_VERSION),
    currency: z.literal('USD'),
    calculationDate: UtcInstantSchema,
    cutoverInstant: UtcInstantSchema,
    roundingMode: z.literal('half_up'),
    fundEstablishmentDate: UtcInstantSchema,
    investmentPeriodEndDate: UtcInstantSchema,
    fundTermDate: UtcInstantSchema,
    lpClasses: z.array(LpClassV2Schema).min(1),
    partners: z.array(PartnerV2Schema).min(1),
    waterfallPolicy: z.array(WaterfallTierV2Schema).min(1),
    selectedLane: z.enum(V2_WATERFALL_LANES),
    gpCashPreferredReturnTreatment: z.enum(V2_GP_CASH_PREF_TREATMENTS),
    openingState: OpeningStateV2Schema,
    events: z.array(V2EventSchema),
    sourceRefs: z.array(z.string().min(1)).optional(),
    upstreamReceiptIds: z.array(z.string().min(1)).optional(),
  })
  .strict();

export type InternalEconomicsInputV2Wire = z.infer<typeof InternalEconomicsInputV2WireSchema>;

// ---------------------------------------------------------------------------
// Branded normalized type
// ---------------------------------------------------------------------------

declare const __normalizedBrand: unique symbol;

export type NormalizedInternalEconomicsInputV2 = InternalEconomicsInputV2Wire & {
  readonly [__normalizedBrand]: true;
  readonly _normalizedInputHash: string;
  readonly _hashAlgorithm: 'canonical-json-sha256/1';
};
