import type {
  V2WaterfallLane,
  V2CoreRefusal,
  NormalizedInternalEconomicsInputV2,
} from './internal-economics-input-v2.contract';

export const INTERNAL_ECONOMICS_RECEIPT_V2_VERSION = 'internal-economics-receipt/2.0.0' as const;

// ---------------------------------------------------------------------------
// Per-partner cash-flow vector
// ---------------------------------------------------------------------------

export interface CashFlowEntryV2 {
  readonly instant: string;
  readonly amountUsd: string;
  readonly direction: 'inflow' | 'outflow';
  readonly eventId: string;
}

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
  readonly totalFees: string;
  readonly totalExpenses: string;
  readonly feeRecyclingUsed: string;
  readonly exitRecyclingUsed: string;
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

export interface InternalEconomicsReceiptV2 {
  readonly receiptVersion: typeof INTERNAL_ECONOMICS_RECEIPT_V2_VERSION;
  readonly componentVersions: Record<string, string>;
  readonly selectedLane: V2WaterfallLane;
  readonly hashAlgorithm: 'canonical-json-sha256/1';
  readonly normalizedInputHash: string;
  readonly resultHash: string;
  readonly fundCashEquation: FundCashEquationV2;
  readonly tierAllocations: readonly TierAllocationV2[];
  readonly partnerLedgers: readonly PartnerLedgerV2[];
  readonly classLedgers: readonly ClassLedgerV2[];
  readonly sourceRefs?: readonly string[];
  readonly upstreamReceiptIds?: readonly string[];
}

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
