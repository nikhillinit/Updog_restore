import type {
  V2WaterfallLane,
  V2CoreRefusal,
  NormalizedInternalEconomicsInputV2,
  V2TierKind,
} from './internal-economics-input-v2.contract';

export const INTERNAL_ECONOMICS_RECEIPT_V2_VERSION = 'internal-economics-receipt/2.2.0' as const;

// ---------------------------------------------------------------------------
// Per-partner cash-flow vector
// ---------------------------------------------------------------------------

export type CashFlowEntryV2 =
  | {
      readonly source: 'event';
      readonly instant: string;
      readonly amountUsd: string;
      readonly direction: 'inflow' | 'outflow';
      readonly eventId: string;
    }
  | {
      readonly source: 'distribution';
      readonly instant: string;
      readonly amountUsd: string;
      readonly direction: 'outflow';
      readonly lane: V2WaterfallLane;
      readonly tierKind: V2TierKind;
      readonly tierOrdinal: number;
      readonly partnerId: string;
    };

export interface OpeningLpOwnerV2 {
  readonly kind: 'lp';
  readonly partnerId: string;
  readonly lpClassId: string;
}

export interface OpeningGpOwnerV2 {
  readonly kind: 'gp';
  readonly partnerId: string;
}

export interface OpeningEntitlementPoolOwnerV2 {
  readonly kind: 'entitlement_pool';
  readonly entitlementPoolId: string;
}

export interface OpeningFundOwnerV2 {
  readonly kind: 'fund';
}

export type OpeningPartnerOwnerV2 = OpeningLpOwnerV2 | OpeningGpOwnerV2;

export type OpeningOwnerV2 =
  OpeningPartnerOwnerV2 | OpeningEntitlementPoolOwnerV2 | OpeningFundOwnerV2;

export interface OpeningCashLotReceiptV2 {
  readonly lotId: string;
  readonly sourceRef: string;
  readonly owner: OpeningOwnerV2;
  readonly classification: 'paid_in' | 'recycling' | 'unclassified';
  readonly originalAmount: string;
  readonly remainingBalance: string;
}

export interface OpeningInvestmentSliceReceiptV2 {
  readonly investmentLotId: string;
  readonly sourceRef: string;
  readonly entitlementPoolId: string;
  readonly dealId: string;
  readonly securityId: string;
  readonly owner: OpeningPartnerOwnerV2;
  readonly costBasis: string;
  readonly relievedAmount: string;
  readonly remainingBasis: string;
  readonly entitlementAmount: string;
}

export interface OpeningEntitlementPoolReceiptV2 {
  readonly entitlementPoolId: string;
  readonly sourceRef: string;
  readonly dealId: string;
  readonly securityId: string;
  readonly entitlementTotal: string;
}

export interface OpeningPositionsReceiptV2 {
  readonly cashLots: readonly OpeningCashLotReceiptV2[];
  readonly investmentSlices: readonly OpeningInvestmentSliceReceiptV2[];
  readonly entitlementPools: readonly OpeningEntitlementPoolReceiptV2[];
}

export interface JournalPostingV2 {
  readonly account: JournalAccountV2;
  readonly rowRef: string;
  readonly owner: OpeningOwnerV2;
  readonly amountUsd: string;
}

export interface InvestmentSliceJournalPostingV2 {
  readonly account: JournalAccountV2;
  readonly rowRef: string;
  readonly owner: OpeningPartnerOwnerV2;
  readonly amountUsd: string;
}

export interface JournalEntryBaseV2 {
  readonly entryId: string;
  readonly instant: string;
  readonly sourceRef: string;
}

export interface OpeningCashLotJournalEntryV2 extends JournalEntryBaseV2 {
  readonly kind: 'opening_cash_lot';
  readonly postings: readonly [JournalPostingV2, JournalPostingV2];
}

export interface OpeningInvestmentSliceJournalEntryV2 extends JournalEntryBaseV2 {
  readonly kind: 'opening_investment_slice';
  readonly postings: readonly [InvestmentSliceJournalPostingV2, InvestmentSliceJournalPostingV2];
}

export type JournalAccountV2 =
  | 'cash'
  | 'invested_basis'
  | 'opening_unreturned_capital'
  | 'contributed_capital'
  | 'realized_gain_loss'
  | 'fund_expenses'
  | 'distributions';

export interface EventJournalPostingV2 {
  readonly account: JournalAccountV2;
  readonly rowRef: string;
  readonly amountUsd: string;
}

export interface EventJournalEntryV2 {
  readonly entryId: string;
  readonly instant: string;
  readonly source: 'event';
  readonly eventId: string;
  readonly chronologyOrdinal: number;
  readonly postings: readonly EventJournalPostingV2[];
}

export interface DistributionJournalEntryV2 {
  readonly entryId: string;
  readonly instant: string;
  readonly source: 'distribution';
  readonly lane: V2WaterfallLane;
  readonly tierKind: V2TierKind;
  readonly tierOrdinal: number;
  readonly partnerId: string;
  readonly postings: readonly EventJournalPostingV2[];
}

export type JournalEntryV2 =
  | OpeningCashLotJournalEntryV2
  | OpeningInvestmentSliceJournalEntryV2
  | EventJournalEntryV2
  | DistributionJournalEntryV2;

// ---------------------------------------------------------------------------
// Per-partner ledger in receipt
// ---------------------------------------------------------------------------

export interface PartnerLedgerV2 {
  readonly partnerId: string;
  readonly committedCapital: string;
  readonly calledCapital: string;
  readonly settledCapital: string;
  readonly paidInCapital: string;
  readonly unreturnedSettledCashCapital: string;
  readonly cumulativeDistributions: string;
  readonly cumulativeFees: string;
  readonly cumulativeExpenses: string;
  readonly accruedPreference: string;
  readonly returnOfCapital: string;
  readonly preferredReturnPaid: string;
  readonly catchUpPaid: string;
  readonly carryPaid: string;
  readonly cashFlowVector: readonly CashFlowEntryV2[];
}

// ---------------------------------------------------------------------------
// Per-class ledger
// ---------------------------------------------------------------------------

export interface ClassLedgerV2 {
  readonly lpClassId: string;
  readonly committedCapital: string;
  readonly calledCapital: string;
  readonly settledCapital: string;
  readonly paidInCapital: string;
  readonly unreturnedSettledCashCapital: string;
  readonly cumulativeDistributions: string;
  readonly cumulativeFees: string;
  readonly cumulativeExpenses: string;
  readonly accruedPreference: string;
  readonly returnOfCapital: string;
  readonly preferredReturnPaid: string;
  readonly catchUpPaid: string;
  readonly carryPaid: string;
  readonly cashFlowVector: readonly CashFlowEntryV2[];
}

// ---------------------------------------------------------------------------
// Tier allocation breakdown
// ---------------------------------------------------------------------------

export interface TierAllocationV2 {
  readonly kind: V2TierKind;
  readonly priority: number;
  readonly totalAllocated: string;
  readonly gpShare: string;
  readonly lpShare: string;
}

// ---------------------------------------------------------------------------
// Fund cash equation
// ---------------------------------------------------------------------------

export interface FundCashEquationV2 {
  readonly openingCash: string;
  readonly contributions: string;
  readonly deployments: string;
  readonly realizations: string;
  readonly fees: string;
  readonly expenses: string;
  readonly distributions: string;
  readonly endingCash: string;
}

// ---------------------------------------------------------------------------
// Receipt
// ---------------------------------------------------------------------------

export interface ComponentVersionsV2 {
  readonly normalizer: 'internal-economics-normalizer/2.0.1';
  readonly composite: 'internal-economics-composite/2.2.0';
  readonly eventEngine: 'internal-economics-event-engine/2.2.0';
  readonly selectedWaterfall:
    | 'internal-economics-waterfall-deal-by-deal/2.2.0'
    | 'internal-economics-waterfall-whole-fund/2.2.0';
  readonly receiptSerializer: 'internal-economics-receipt-serializer/2.2.0';
}

export interface CashLotLineageV2 {
  readonly lotId: string;
  readonly consumingEventIds: readonly string[];
}

export interface InvestmentSliceLineageV2 {
  readonly investmentLotId: string;
  readonly fundingAllocations: readonly {
    readonly lotId: string;
    readonly amount: string;
  }[];
}

export interface LineageDisclosureV2 {
  readonly cashLots: readonly CashLotLineageV2[];
  readonly investmentSlices: readonly InvestmentSliceLineageV2[];
}

export interface InternalEconomicsReceiptV2 {
  readonly receiptVersion: typeof INTERNAL_ECONOMICS_RECEIPT_V2_VERSION;
  readonly componentVersions: ComponentVersionsV2;
  readonly selectedLane: V2WaterfallLane;
  readonly hashAlgorithm: 'canonical-json-sha256/1';
  readonly normalizedInputHash: string;
  readonly fundCashEquation: FundCashEquationV2;
  readonly openingPositions: OpeningPositionsReceiptV2;
  readonly lineage: LineageDisclosureV2;
  readonly journal: readonly JournalEntryV2[];
  readonly tierAllocations: readonly TierAllocationV2[];
  readonly partnerLedgers: readonly PartnerLedgerV2[];
  readonly classLedgers: readonly ClassLedgerV2[];
  readonly sourceRefs: readonly string[];
  readonly upstreamReceiptIds: readonly string[];
  readonly resultHash: string;
}

export type InternalEconomicsReceiptV2ResultHashPreimage = Omit<
  InternalEconomicsReceiptV2,
  'resultHash'
>;

// ---------------------------------------------------------------------------
// Dual-lane certification (test/CI only)
// ---------------------------------------------------------------------------

export interface V2DualLaneCertification {
  readonly dealByDeal: InternalEconomicsReceiptV2;
  readonly wholeFund: InternalEconomicsReceiptV2;
}

// ---------------------------------------------------------------------------
// Result unions (re-exported for convenience)
// ---------------------------------------------------------------------------

export type InternalEconomicsReceiptV2Result =
  | { readonly ok: true; readonly receipt: InternalEconomicsReceiptV2 }
  | { readonly ok: false; readonly refusal: V2CoreRefusal };

export type V2DualLaneCertificationResult =
  | { readonly ok: true; readonly certification: V2DualLaneCertification }
  | { readonly ok: false; readonly refusal: V2CoreRefusal };

export type NormalizeInputV2Result =
  | {
      readonly ok: true;
      readonly input: NormalizedInternalEconomicsInputV2;
    }
  | { readonly ok: false; readonly refusal: V2CoreRefusal };
