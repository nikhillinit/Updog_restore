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

function refuse(
  code: string,
  message: string,
  diagnostics?: Record<string, unknown>
): V2CoreRefusal {
  return {
    ok: false,
    code: code as V2CoreRefusal['code'],
    stage: 'waterfall',
    message,
    ...(diagnostics ? { diagnostics } : {}),
  };
}

export interface EntitlementPool {
  readonly dealId: string;
  readonly securityId: string;
  proceedsAvailable: Decimal;
  costBasisRelieved: Decimal;
  gainLoss: Decimal;
}

export interface DealByDealTierResult {
  readonly kind: string;
  readonly priority: number;
  totalAllocated: Decimal;
  gpShare: Decimal;
  lpShare: Decimal;
  perPartner: Map<string, Decimal>;
}

export interface DealByDealWaterfallResult {
  readonly ok: true;
  readonly pools: readonly EntitlementPool[];
  readonly tierAllocations: readonly DealByDealTierResult[];
  readonly partnerDistributions: Map<string, Decimal>;
  readonly totalDistributed: Decimal;
}

export type DealByDealResult =
  DealByDealWaterfallResult | { readonly ok: false; readonly refusal: V2CoreRefusal };

function buildEntitlementPools(state: EventStreamState): EntitlementPool[] {
  const poolMap = new Map<string, EntitlementPool>();

  for (const [, lot] of state.investmentLots) {
    const key = `${lot.dealId}:${lot.securityId}`;
    if (!poolMap.has(key)) {
      poolMap.set(key, {
        dealId: lot.dealId,
        securityId: lot.securityId,
        proceedsAvailable: ZERO,
        costBasisRelieved: ZERO,
        gainLoss: ZERO,
      });
    }
    const pool = poolMap.get(key)!;
    pool.costBasisRelieved = pool.costBasisRelieved.plus(lot.relievedAmount);
  }

  for (const [, lot] of state.cashSourceLots) {
    if (!lot.lotId.startsWith('proceeds:') || !lot.dealId) continue;
    for (const [key, pool] of poolMap) {
      if (key.startsWith(`${lot.dealId}:`)) {
        pool.proceedsAvailable = pool.proceedsAvailable.plus(lot.originalAmount);
        break;
      }
    }
  }

  for (const [, pool] of poolMap) {
    pool.gainLoss = pool.proceedsAvailable.minus(pool.costBasisRelieved);
  }

  return Array.from(poolMap.values());
}

function allocateReturnOfCapital(
  available: Decimal,
  costBasis: Decimal,
  ledgers: Map<string, PartnerLedgerState>
): { allocated: Decimal; gpShare: Decimal; lpShare: Decimal; perPartner: Map<string, Decimal> } {
  const rocTarget = Decimal.min(available, costBasis);
  if (rocTarget.lte(0)) {
    return { allocated: ZERO, gpShare: ZERO, lpShare: ZERO, perPartner: new Map() };
  }

  const partners = Array.from(ledgers.values());
  const shares = partners.map((p) => p.settledCapital);
  const targetCents = decimalToCents(rocTarget);
  const allocCents = apportionCentsLrmFromShares(targetCents, shares);

  const perPartner = new Map<string, Decimal>();
  let gpTotal = ZERO;
  let lpTotal = ZERO;

  for (let i = 0; i < partners.length; i++) {
    const amount = new Decimal(centsToDecimalString(allocCents[i]!));
    perPartner.set(partners[i]!.partnerId, amount);
    if (partners[i]!.isGp) {
      gpTotal = gpTotal.plus(amount);
    } else {
      lpTotal = lpTotal.plus(amount);
    }
  }

  return { allocated: rocTarget, gpShare: gpTotal, lpShare: lpTotal, perPartner };
}

function allocatePreferredReturn(
  available: Decimal,
  ledgers: Map<string, PartnerLedgerState>,
  gpTreatment: 'pari_passu' | 'excluded'
): { allocated: Decimal; gpShare: Decimal; lpShare: Decimal; perPartner: Map<string, Decimal> } {
  const eligiblePartners = Array.from(ledgers.values()).filter(
    (p) => !(p.isGp && gpTreatment === 'excluded')
  );

  const totalAccrued = eligiblePartners.reduce((s, p) => s.plus(p.accruedPreference), ZERO);
  const prefTarget = Decimal.min(available, totalAccrued);
  if (prefTarget.lte(0)) {
    return { allocated: ZERO, gpShare: ZERO, lpShare: ZERO, perPartner: new Map() };
  }

  const shares = eligiblePartners.map((p) => p.accruedPreference);
  const targetCents = decimalToCents(prefTarget);
  const allocCents = apportionCentsLrmFromShares(targetCents, shares);

  const perPartner = new Map<string, Decimal>();
  let gpTotal = ZERO;
  let lpTotal = ZERO;

  for (let i = 0; i < eligiblePartners.length; i++) {
    const amount = new Decimal(centsToDecimalString(allocCents[i]!));
    perPartner.set(eligiblePartners[i]!.partnerId, amount);
    if (eligiblePartners[i]!.isGp) {
      gpTotal = gpTotal.plus(amount);
    } else {
      lpTotal = lpTotal.plus(amount);
    }
  }

  return { allocated: prefTarget, gpShare: gpTotal, lpShare: lpTotal, perPartner };
}

function allocateGpCatchUp(
  available: Decimal,
  gpAllocationRate: Decimal,
  gpShare: Decimal,
  cumulativePreferredPaid: Decimal,
  cumulativeGpProfit: Decimal,
  ledgers: Map<string, PartnerLedgerState>
): {
  allocated: Decimal;
  gpShareAmount: Decimal;
  lpShareAmount: Decimal;
  perPartner: Map<string, Decimal>;
} {
  const targetGpProfit = cumulativePreferredPaid.plus(available).mul(gpShare);
  const gpDeficit = targetGpProfit.minus(cumulativeGpProfit);

  if (gpDeficit.lte(0)) {
    return { allocated: ZERO, gpShareAmount: ZERO, lpShareAmount: ZERO, perPartner: new Map() };
  }

  const grossCatchUp = gpDeficit.div(gpAllocationRate);
  const catchUpAllocated = Decimal.min(available, grossCatchUp);

  if (catchUpAllocated.lte(0)) {
    return { allocated: ZERO, gpShareAmount: ZERO, lpShareAmount: ZERO, perPartner: new Map() };
  }

  const gpAmount = catchUpAllocated.mul(gpAllocationRate);
  const lpAmount = catchUpAllocated.minus(gpAmount);

  const gpPartners = Array.from(ledgers.values()).filter((p) => p.isGp);
  const lpPartners = Array.from(ledgers.values()).filter((p) => !p.isGp);
  const perPartner = new Map<string, Decimal>();

  if (gpPartners.length > 0) {
    const gpShares = gpPartners.map((p) => p.settledCapital);
    const gpCents = apportionCentsLrmFromShares(decimalToCents(gpAmount), gpShares);
    for (let i = 0; i < gpPartners.length; i++) {
      perPartner.set(gpPartners[i]!.partnerId, new Decimal(centsToDecimalString(gpCents[i]!)));
    }
  }

  if (lpPartners.length > 0 && lpAmount.gt(0)) {
    const lpShares = lpPartners.map((p) => p.settledCapital);
    const lpCents = apportionCentsLrmFromShares(decimalToCents(lpAmount), lpShares);
    for (let i = 0; i < lpPartners.length; i++) {
      perPartner.set(lpPartners[i]!.partnerId, new Decimal(centsToDecimalString(lpCents[i]!)));
    }
  }

  return {
    allocated: catchUpAllocated,
    gpShareAmount: gpAmount,
    lpShareAmount: lpAmount,
    perPartner,
  };
}

function allocateCarry(
  available: Decimal,
  gpShareRate: Decimal,
  ledgers: Map<string, PartnerLedgerState>
): {
  allocated: Decimal;
  gpShareAmount: Decimal;
  lpShareAmount: Decimal;
  perPartner: Map<string, Decimal>;
} {
  if (available.lte(0)) {
    return { allocated: ZERO, gpShareAmount: ZERO, lpShareAmount: ZERO, perPartner: new Map() };
  }

  const gpAmount = available.mul(gpShareRate);
  const lpAmount = available.minus(gpAmount);
  const perPartner = new Map<string, Decimal>();

  const gpPartners = Array.from(ledgers.values()).filter((p) => p.isGp);
  const lpPartners = Array.from(ledgers.values()).filter((p) => !p.isGp);

  if (gpPartners.length > 0) {
    const gpShares = gpPartners.map((p) => p.settledCapital);
    const gpCents = apportionCentsLrmFromShares(decimalToCents(gpAmount), gpShares);
    for (let i = 0; i < gpPartners.length; i++) {
      perPartner.set(gpPartners[i]!.partnerId, new Decimal(centsToDecimalString(gpCents[i]!)));
    }
  }

  if (lpPartners.length > 0 && lpAmount.gt(0)) {
    const lpShares = lpPartners.map((p) => p.settledCapital);
    const lpCents = apportionCentsLrmFromShares(decimalToCents(lpAmount), lpShares);
    for (let i = 0; i < lpPartners.length; i++) {
      perPartner.set(lpPartners[i]!.partnerId, new Decimal(centsToDecimalString(lpCents[i]!)));
    }
  }

  return { allocated: available, gpShareAmount: gpAmount, lpShareAmount: lpAmount, perPartner };
}

export function runDealByDealWaterfall(
  input: NormalizedInternalEconomicsInputV2,
  state: EventStreamState
): DealByDealResult {
  const pools = buildEntitlementPools(state);
  const policy = input.waterfallPolicy;

  const carryTier = policy.find((t) => t.kind === 'carry') as
    (WaterfallTierV2 & { kind: 'carry' }) | undefined;
  if (!carryTier) {
    return { ok: false, refusal: refuse('INVALID_TIER_POLICY', 'Carry tier is required.') };
  }
  const gpShareRate = new Decimal(carryTier.gpShare);

  const tierResults: DealByDealTierResult[] = [];
  const partnerDistributions = new Map<string, Decimal>();
  for (const [, ledger] of state.partnerLedgers) {
    partnerDistributions.set(ledger.partnerId, ZERO);
  }

  let totalDistributed = ZERO;

  for (const pool of pools) {
    if (pool.proceedsAvailable.lte(0)) continue;

    let remaining = pool.proceedsAvailable;

    for (const tier of policy) {
      if (remaining.lte(0)) break;

      let result: DealByDealTierResult;

      switch (tier.kind) {
        case 'return_of_capital': {
          const roc = allocateReturnOfCapital(
            remaining,
            pool.costBasisRelieved,
            state.partnerLedgers
          );
          remaining = remaining.minus(roc.allocated);
          result = {
            kind: 'return_of_capital',
            priority: tier.priority,
            totalAllocated: roc.allocated,
            gpShare: roc.gpShare,
            lpShare: roc.lpShare,
            perPartner: roc.perPartner,
          };
          break;
        }

        case 'preferred_return': {
          const pref = allocatePreferredReturn(
            remaining,
            state.partnerLedgers,
            input.gpCashPreferredReturnTreatment
          );
          remaining = remaining.minus(pref.allocated);
          result = {
            kind: 'preferred_return',
            priority: tier.priority,
            totalAllocated: pref.allocated,
            gpShare: pref.gpShare,
            lpShare: pref.lpShare,
            perPartner: pref.perPartner,
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

          const catchUp = allocateGpCatchUp(
            remaining,
            new Decimal(tier.gpAllocationRate),
            gpShareRate,
            cumulativePrefPaid,
            cumulativeGpProfit,
            state.partnerLedgers
          );
          remaining = remaining.minus(catchUp.allocated);
          result = {
            kind: 'gp_catch_up',
            priority: tier.priority,
            totalAllocated: catchUp.allocated,
            gpShare: catchUp.gpShareAmount,
            lpShare: catchUp.lpShareAmount,
            perPartner: catchUp.perPartner,
          };
          break;
        }

        case 'carry': {
          const carry = allocateCarry(remaining, gpShareRate, state.partnerLedgers);
          remaining = remaining.minus(carry.allocated);
          result = {
            kind: 'carry',
            priority: tier.priority,
            totalAllocated: carry.allocated,
            gpShare: carry.gpShareAmount,
            lpShare: carry.lpShareAmount,
            perPartner: carry.perPartner,
          };
          break;
        }
      }

      for (const [partnerId, amount] of result.perPartner) {
        const current = partnerDistributions.get(partnerId) ?? ZERO;
        partnerDistributions.set(partnerId, current.plus(amount));
      }
      totalDistributed = totalDistributed.plus(result.totalAllocated);
      tierResults.push(result);
    }
  }

  return {
    ok: true,
    pools,
    tierAllocations: tierResults,
    partnerDistributions,
    totalDistributed,
  };
}

export function toTierAllocationsV2(results: readonly DealByDealTierResult[]): TierAllocationV2[] {
  const merged = new Map<string, TierAllocationV2>();

  for (const r of results) {
    const existing = merged.get(r.kind);
    if (existing) {
      merged.set(r.kind, {
        kind: r.kind,
        priority: r.priority,
        totalAllocated: new Decimal(existing.totalAllocated).plus(r.totalAllocated).toFixed(6),
        gpShare: new Decimal(existing.gpShare).plus(r.gpShare).toFixed(6),
        lpShare: new Decimal(existing.lpShare).plus(r.lpShare).toFixed(6),
      });
    } else {
      merged.set(r.kind, {
        kind: r.kind,
        priority: r.priority,
        totalAllocated: r.totalAllocated.toFixed(6),
        gpShare: r.gpShare.toFixed(6),
        lpShare: r.lpShare.toFixed(6),
      });
    }
  }

  return Array.from(merged.values()).sort((a, b) => a.priority - b.priority);
}
