import { Decimal } from '../../../lib/decimal-config';
import type {
  NormalizedInternalEconomicsInputV2,
  WaterfallTierV2,
  V2CoreRefusal,
} from '../../../contracts/internal-economics/internal-economics-input-v2.contract';
import type { TierAllocationV2 } from '../../../contracts/internal-economics/internal-economics-receipt-v2.contract';
import type { PartnerLedgerState, EventStreamState } from './event-stream-engine-v2';
import { computeGpCatchUpAllocationV2, splitQuantizedGpLp } from './catch-up-allocation-v2';
import {
  apportionCentsLrmFromShares,
  decimalToCents,
  decimalToCentsFloor,
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

function apportionGpLpBuckets(
  gpAmount: Decimal,
  lpAmount: Decimal,
  partners: readonly PartnerLedgerState[],
  tierLabel: 'Catch-up' | 'Carry'
): Map<string, Decimal> {
  const perPartner = new Map<string, Decimal>();
  const gpPartners = partners.filter((partner) => partner.isGp);
  const lpPartners = partners.filter((partner) => !partner.isGp);

  if (gpAmount.gt(0)) {
    if (gpPartners.length === 0) {
      throw new Error(`${tierLabel} GP bucket invariant violated: no eligible GP partners.`);
    }
    for (const [id, amount] of apportionBySettledCapital(gpAmount, gpPartners)) {
      perPartner.set(id, amount);
    }
  }

  if (lpAmount.gt(0)) {
    if (lpPartners.length === 0) {
      throw new Error(`${tierLabel} LP bucket invariant violated: no eligible LP partners.`);
    }
    for (const [id, amount] of apportionBySettledCapital(lpAmount, lpPartners)) {
      perPartner.set(id, amount);
    }
  }

  return perPartner;
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
  const openingPreferredPaid = new Decimal(
    input.openingState.profitDecomposition.openingCumulativePreferredPaid
  );
  if (
    input.gpCashPreferredReturnTreatment === 'pari_passu' &&
    !openingPreferredPaid.isZero() &&
    policy.some((tier) => tier.kind === 'gp_catch_up')
  ) {
    throw new Error(
      'Whole-fund pari-passu resume with nonzero opening preferred paid requires GP/LP preferred provenance.'
    );
  }
  let cumulativeGpProfit = new Decimal(
    input.openingState.profitDecomposition.openingCumulativeGpProfitDistributions
  );
  let cumulativeLpProfit = openingPreferredPaid.plus(
    input.openingState.profitDecomposition.openingCumulativeLpProfitDistributions
  );
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
        const shares = allPartners.map((p) => p.settledCapital);
        const targetCents = decimalToCents(rocTarget);
        const allocCents = apportionCentsLrmFromShares(targetCents, shares);
        const perPartner = new Map<string, Decimal>();
        let allocatedCents = 0n;
        for (let i = 0; i < allPartners.length; i++) {
          perPartner.set(
            allPartners[i]!.partnerId,
            new Decimal(centsToDecimalString(allocCents[i]!))
          );
          allocatedCents += allocCents[i]!;
        }
        const allocated = new Decimal(centsToDecimalString(allocatedCents));
        const split = gpLpSplit(perPartner, state.partnerLedgers);
        remaining = remaining.minus(allocated);
        result = {
          kind: 'return_of_capital',
          priority: tier.priority,
          totalAllocated: allocated,
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
        // Same quantize-once discipline as deal-by-deal: floored balances bound
        // the ledger claim, floored availability bounds proceeds, and the
        // emitted total is reconstructed from integer units.
        const balanceCents = eligiblePartners.map((p) => decimalToCentsFloor(p.accruedPreference));
        const totalAccruedCents = balanceCents.reduce((s, c) => s + c, 0n);
        const availableCents = decimalToCentsFloor(remaining);
        const targetCents = totalAccruedCents < availableCents ? totalAccruedCents : availableCents;

        if (targetCents <= 0n) {
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

        const shares = balanceCents.map((c) => new Decimal(centsToDecimalString(c)));
        const allocCents = apportionCentsLrmFromShares(targetCents, shares);
        const perPartner = new Map<string, Decimal>();
        let allocatedCents = 0n;
        for (let i = 0; i < eligiblePartners.length; i++) {
          perPartner.set(
            eligiblePartners[i]!.partnerId,
            new Decimal(centsToDecimalString(allocCents[i]!))
          );
          allocatedCents += allocCents[i]!;
        }

        const allocated = new Decimal(centsToDecimalString(allocatedCents));
        const split = gpLpSplit(perPartner, state.partnerLedgers);
        remaining = remaining.minus(allocated);
        result = {
          kind: 'preferred_return',
          priority: tier.priority,
          totalAllocated: allocated,
          gpShare: split.gpShare,
          lpShare: split.lpShare,
          perPartner,
        };
        break;
      }

      case 'gp_catch_up': {
        const gpAllocationRate = new Decimal(tier.gpAllocationRate);
        const catchUp = computeGpCatchUpAllocationV2({
          available: remaining,
          cumulativeGpProfit,
          cumulativeLpProfit,
          terminalGpShare: gpShareRate,
          catchUpGpAllocationRate: gpAllocationRate,
        });
        const catchUpAllocated = new Decimal(catchUp.allocatedTotal);
        const gpAmount = new Decimal(catchUp.gpAmount);
        const lpAmount = new Decimal(catchUp.lpAmount);
        const perPartner = apportionGpLpBuckets(gpAmount, lpAmount, allPartners, 'Catch-up');

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

        const carry = splitQuantizedGpLp(remaining, gpShareRate, remaining);
        const allocated = new Decimal(carry.allocatedTotal);
        const gpAmount = new Decimal(carry.gpAmount);
        const lpAmount = new Decimal(carry.lpAmount);
        const perPartner = apportionGpLpBuckets(gpAmount, lpAmount, allPartners, 'Carry');

        remaining = remaining.minus(allocated);
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

    if (tier.kind !== 'return_of_capital') {
      cumulativeGpProfit = cumulativeGpProfit.plus(result.gpShare);
      cumulativeLpProfit = cumulativeLpProfit.plus(result.lpShare);
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
