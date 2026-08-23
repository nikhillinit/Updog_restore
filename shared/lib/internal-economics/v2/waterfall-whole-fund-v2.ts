import { Decimal } from '../../../lib/decimal-config';
import type {
  NormalizedInternalEconomicsInputV2,
  WaterfallTierV2,
  V2CoreRefusal,
} from '../../../contracts/internal-economics/internal-economics-input-v2.contract';
import type { TierAllocationV2 } from '../../../contracts/internal-economics/internal-economics-receipt-v2.contract';
import type { PartnerLedgerState, EventStreamState } from './event-stream-engine-v2';
import {
  apportionCentsLrmFromShares,
  decimalToCents,
  centsToDecimalString,
} from './decimal-cents-v2';

const ZERO = new Decimal(0);

function refuse(code: string, message: string): V2CoreRefusal {
  return { ok: false, code: code as V2CoreRefusal['code'], stage: 'waterfall', message };
}

export interface WholeFundTierResult {
  readonly kind: string;
  readonly priority: number;
  totalAllocated: Decimal;
  gpShare: Decimal;
  lpShare: Decimal;
  perPartner: Map<string, Decimal>;
}

export interface WholeFundWaterfallResult {
  readonly ok: true;
  readonly tierAllocations: readonly WholeFundTierResult[];
  readonly partnerDistributions: Map<string, Decimal>;
  readonly totalDistributed: Decimal;
}

export type WholeFundResult =
  WholeFundWaterfallResult | { readonly ok: false; readonly refusal: V2CoreRefusal };

function computeTotalDistributable(state: EventStreamState): Decimal {
  let total = ZERO;
  for (const [, lot] of state.cashSourceLots) {
    if (lot.lotId.startsWith('proceeds:')) {
      total = total.plus(lot.remainingBalance);
    }
  }
  return total;
}

function computeTotalCostBasis(state: EventStreamState): Decimal {
  let total = ZERO;
  for (const [, lot] of state.investmentLots) {
    total = total.plus(lot.relievedAmount);
  }
  return total;
}

function apportionBySettledCapital(
  amount: Decimal,
  partners: readonly PartnerLedgerState[]
): Map<string, Decimal> {
  if (amount.lte(0) || partners.length === 0) return new Map();

  const shares = partners.map((p) => p.settledCapital);
  const targetCents = decimalToCents(amount);
  const allocCents = apportionCentsLrmFromShares(targetCents, shares);
  const result = new Map<string, Decimal>();

  for (let i = 0; i < partners.length; i++) {
    result.set(partners[i]!.partnerId, new Decimal(centsToDecimalString(allocCents[i]!)));
  }
  return result;
}

function gpLpSplit(
  perPartner: Map<string, Decimal>,
  ledgers: Map<string, PartnerLedgerState>
): { gpShare: Decimal; lpShare: Decimal } {
  let gpShare = ZERO;
  let lpShare = ZERO;
  for (const [partnerId, amount] of perPartner) {
    const ledger = ledgers.get(partnerId);
    if (ledger?.isGp) {
      gpShare = gpShare.plus(amount);
    } else {
      lpShare = lpShare.plus(amount);
    }
  }
  return { gpShare, lpShare };
}

export function runWholeFundWaterfall(
  input: NormalizedInternalEconomicsInputV2,
  state: EventStreamState
): WholeFundResult {
  const policy = input.waterfallPolicy;

  const carryTier = policy.find((t) => t.kind === 'carry') as
    (WaterfallTierV2 & { kind: 'carry' }) | undefined;
  if (!carryTier) {
    return { ok: false, refusal: refuse('INVALID_TIER_POLICY', 'Carry tier is required.') };
  }
  const gpShareRate = new Decimal(carryTier.gpShare);

  const totalDistributable = computeTotalDistributable(state);
  const totalCostBasis = computeTotalCostBasis(state);
  const allPartners = Array.from(state.partnerLedgers.values());

  let remaining = totalDistributable;
  const tierResults: WholeFundTierResult[] = [];
  const partnerDistributions = new Map<string, Decimal>();
  for (const p of allPartners) {
    partnerDistributions.set(p.partnerId, ZERO);
  }

  for (const tier of policy) {
    if (remaining.lte(0)) break;

    let result: WholeFundTierResult;

    switch (tier.kind) {
      case 'return_of_capital': {
        const rocTarget = Decimal.min(remaining, totalCostBasis);
        const perPartner = apportionBySettledCapital(rocTarget, allPartners);
        const split = gpLpSplit(perPartner, state.partnerLedgers);
        remaining = remaining.minus(rocTarget);
        result = {
          kind: 'return_of_capital',
          priority: tier.priority,
          totalAllocated: rocTarget,
          gpShare: split.gpShare,
          lpShare: split.lpShare,
          perPartner,
        };
        break;
      }

      case 'preferred_return': {
        const eligiblePartners = allPartners.filter(
          (p) => !(p.isGp && input.gpCashPreferredReturnTreatment === 'excluded')
        );
        const totalAccrued = eligiblePartners.reduce((s, p) => s.plus(p.accruedPreference), ZERO);
        const prefTarget = Decimal.min(remaining, totalAccrued);

        if (prefTarget.lte(0)) {
          result = {
            kind: 'preferred_return',
            priority: tier.priority,
            totalAllocated: ZERO,
            gpShare: ZERO,
            lpShare: ZERO,
            perPartner: new Map(),
          };
          break;
        }

        const shares = eligiblePartners.map((p) => p.accruedPreference);
        const targetCents = decimalToCents(prefTarget);
        const allocCents = apportionCentsLrmFromShares(targetCents, shares);
        const perPartner = new Map<string, Decimal>();
        for (let i = 0; i < eligiblePartners.length; i++) {
          perPartner.set(
            eligiblePartners[i]!.partnerId,
            new Decimal(centsToDecimalString(allocCents[i]!))
          );
        }

        const split = gpLpSplit(perPartner, state.partnerLedgers);
        remaining = remaining.minus(prefTarget);
        result = {
          kind: 'preferred_return',
          priority: tier.priority,
          totalAllocated: prefTarget,
          gpShare: split.gpShare,
          lpShare: split.lpShare,
          perPartner,
        };
        break;
      }

      case 'gp_catch_up': {
        const cumulativePrefPaid = new Decimal(
          input.openingState.profitDecomposition.openingCumulativePreferredPaid
        );
        const cumulativeGpProfit = new Decimal(
          input.openingState.profitDecomposition.openingCumulativeGpProfitDistributions
        );

        const gpAllocationRate = new Decimal(tier.gpAllocationRate);
        const targetGpProfit = cumulativePrefPaid.plus(remaining).mul(gpShareRate);
        const gpDeficit = targetGpProfit.minus(cumulativeGpProfit);

        if (gpDeficit.lte(0)) {
          result = {
            kind: 'gp_catch_up',
            priority: tier.priority,
            totalAllocated: ZERO,
            gpShare: ZERO,
            lpShare: ZERO,
            perPartner: new Map(),
          };
          break;
        }

        const grossCatchUp = gpDeficit.div(gpAllocationRate);
        const catchUpAllocated = Decimal.min(remaining, grossCatchUp);
        const gpAmount = catchUpAllocated.mul(gpAllocationRate);
        const lpAmount = catchUpAllocated.minus(gpAmount);

        const gpPartners = allPartners.filter((p) => p.isGp);
        const lpPartners = allPartners.filter((p) => !p.isGp);
        const perPartner = new Map<string, Decimal>();

        if (gpPartners.length > 0) {
          const gpAlloc = apportionBySettledCapital(gpAmount, gpPartners);
          for (const [id, amt] of gpAlloc) perPartner.set(id, amt);
        }
        if (lpPartners.length > 0 && lpAmount.gt(0)) {
          const lpAlloc = apportionBySettledCapital(lpAmount, lpPartners);
          for (const [id, amt] of lpAlloc) perPartner.set(id, amt);
        }

        remaining = remaining.minus(catchUpAllocated);
        result = {
          kind: 'gp_catch_up',
          priority: tier.priority,
          totalAllocated: catchUpAllocated,
          gpShare: gpAmount,
          lpShare: lpAmount,
          perPartner,
        };
        break;
      }

      case 'carry': {
        if (remaining.lte(0)) {
          result = {
            kind: 'carry',
            priority: tier.priority,
            totalAllocated: ZERO,
            gpShare: ZERO,
            lpShare: ZERO,
            perPartner: new Map(),
          };
          break;
        }

        const gpAmount = remaining.mul(gpShareRate);
        const lpAmount = remaining.minus(gpAmount);

        const gpPartners = allPartners.filter((p) => p.isGp);
        const lpPartners = allPartners.filter((p) => !p.isGp);
        const perPartner = new Map<string, Decimal>();

        if (gpPartners.length > 0) {
          const gpAlloc = apportionBySettledCapital(gpAmount, gpPartners);
          for (const [id, amt] of gpAlloc) perPartner.set(id, amt);
        }
        if (lpPartners.length > 0 && lpAmount.gt(0)) {
          const lpAlloc = apportionBySettledCapital(lpAmount, lpPartners);
          for (const [id, amt] of lpAlloc) perPartner.set(id, amt);
        }

        const allocated = remaining;
        remaining = ZERO;
        result = {
          kind: 'carry',
          priority: tier.priority,
          totalAllocated: allocated,
          gpShare: gpAmount,
          lpShare: lpAmount,
          perPartner,
        };
        break;
      }
    }

    for (const [partnerId, amount] of result.perPartner) {
      const current = partnerDistributions.get(partnerId) ?? ZERO;
      partnerDistributions.set(partnerId, current.plus(amount));
    }
    tierResults.push(result);
  }

  const totalDistributed = tierResults.reduce((s, r) => s.plus(r.totalAllocated), ZERO);

  return {
    ok: true,
    tierAllocations: tierResults,
    partnerDistributions,
    totalDistributed,
  };
}

export function toTierAllocationsV2(results: readonly WholeFundTierResult[]): TierAllocationV2[] {
  return results.map((r) => ({
    kind: r.kind,
    priority: r.priority,
    totalAllocated: r.totalAllocated.toFixed(6),
    gpShare: r.gpShare.toFixed(6),
    lpShare: r.lpShare.toFixed(6),
  }));
}
