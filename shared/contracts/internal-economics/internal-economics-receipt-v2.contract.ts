import type {
  V2WaterfallLane,
  V2CoreRefusal,
  NormalizedInternalEconomicsInputV2,
} from './internal-economics-input-v2.contract';

export const INTERNAL_ECONOMICS_RECEIPT_V2_VERSION = 'internal-economics-receipt/2.1.0' as const;

// ---------------------------------------------------------------------------
// Per-partner cash-flow vector
// ---------------------------------------------------------------------------

export interface CashFlowEntryV2 {
  readonly instant: string;
  readonly amountUsd: string;
  readonly direction: 'inflow' | 'outflow';
  readonly eventId: string;
}

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
  | OpeningPartnerOwnerV2
  | OpeningEntitlementPoolOwnerV2
  | OpeningFundOwnerV2;

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
  readonly account: 'cash' | 'invested_basis' | 'opening_unreturned_capital';
  readonly rowRef: string;
  readonly owner: OpeningOwnerV2;
  readonly amountUsd: string;
}

export interface InvestmentSliceJournalPostingV2 {
  readonly account: 'cash' | 'invested_basis' | 'opening_unreturned_capital';
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

export type JournalEntryV2 = OpeningCashLotJournalEntryV2 | OpeningInvestmentSliceJournalEntryV2;

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
  readonly kind: string;
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
  readonly composite: 'internal-economics-composite/2.0.1';
  readonly eventEngine: 'internal-economics-event-engine/2.0.1';
  readonly selectedWaterfall: 'internal-economics-waterfall-deal-by-deal/2.0.1';
  readonly receiptSerializer: 'internal-economics-receipt-serializer/2.1.0';
}

export interface InternalEconomicsReceiptV2 {
  readonly receiptVersion: typeof INTERNAL_ECONOMICS_RECEIPT_V2_VERSION;
  readonly componentVersions: ComponentVersionsV2;
  readonly selectedLane: V2WaterfallLane;
  readonly hashAlgorithm: 'canonical-json-sha256/1';
  readonly normalizedInputHash: string;
  readonly fundCashEquation: FundCashEquationV2;
  readonly openingPositions: OpeningPositionsReceiptV2;
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
