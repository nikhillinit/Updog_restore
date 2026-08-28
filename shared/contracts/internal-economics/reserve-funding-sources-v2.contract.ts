import type { V2Stage } from './internal-economics-input-v2.contract';

// ---------------------------------------------------------------------------
// Reserve refusal codes (disjoint from V2RefusalCode)
// ---------------------------------------------------------------------------

export const V2_RESERVE_REFUSAL_CODES = [
  'MISSING_PROVENANCE',
  'RESERVE_BUCKET_OVERLAP',
  'RESERVE_CONSERVATION_VIOLATION',
] as const;

export type V2ReserveRefusalCode = (typeof V2_RESERVE_REFUSAL_CODES)[number];

export interface V2ReserveRefusal {
  readonly ok: false;
  readonly code: V2ReserveRefusalCode;
  readonly stage: V2Stage;
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Reserve funding sources
// ---------------------------------------------------------------------------

export interface ReserveFundingSourcesV2 {
  readonly remainingCallableCommitmentUsd: string;
  readonly eligiblePaidInCashUsd: string;
  readonly eligibleRecyclingCashUsd: string;
}

// ---------------------------------------------------------------------------
// Result union
// ---------------------------------------------------------------------------

export type ReserveFundingSourcesV2Result =
  | { readonly ok: true; readonly sources: ReserveFundingSourcesV2 }
  | { readonly ok: false; readonly refusal: V2ReserveRefusal };
