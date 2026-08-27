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

export const INTERNAL_ECONOMICS_WATERFALL_DEAL_BY_DEAL_V2_VERSION =
  'internal-economics-waterfall-deal-by-deal/2.0.1' as const;

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

  // Quantize once in integer units: floored balances bound the ledger claim,
  // floored availability bounds proceeds, and the allocated total is
  // reconstructed from the emitted units so it always equals the partner sum.
  const balanceCents = eligiblePartners.map((p) => decimalToCentsFloor(p.accruedPreference));
  const totalAccruedCents = balanceCents.reduce((s, c) => s + c, 0n);
  const availableCents = decimalToCentsFloor(available);
  const targetCents = totalAccruedCents < availableCents ? totalAccruedCents : availableCents;
  if (targetCents <= 0n) {
    return { allocated: ZERO, gpShare: ZERO, lpShare: ZERO, perPartner: new Map() };
  }

  const shares = balanceCents.map((c) => new Decimal(centsToDecimalString(c)));
  const allocCents = apportionCentsLrmFromShares(targetCents, shares);

  const perPartner = new Map<string, Decimal>();
  let gpTotal = ZERO;
  let lpTotal = ZERO;
  let allocatedCents = 0n;

  for (let i = 0; i < eligiblePartners.length; i++) {
    const amount = new Decimal(centsToDecimalString(allocCents[i]!));
    perPartner.set(eligiblePartners[i]!.partnerId, amount);
    allocatedCents += allocCents[i]!;
    if (eligiblePartners[i]!.isGp) {
      gpTotal = gpTotal.plus(amount);
    } else {
      lpTotal = lpTotal.plus(amount);
    }
  }

  return {
    allocated: new Decimal(centsToDecimalString(allocatedCents)),
    gpShare: gpTotal,
    lpShare: lpTotal,
    perPartner,
  };
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

function apportionGpLpBuckets(
  gpAmount: Decimal,
  lpAmount: Decimal,
  ledgers: Map<string, PartnerLedgerState>,
  tierLabel: 'Catch-up' | 'Carry'
): Map<string, Decimal> {
  const perPartner = new Map<string, Decimal>();
  const partners = Array.from(ledgers.values());
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

function allocateGpCatchUp(
  available: Decimal,
  gpAllocationRate: Decimal,
  gpShare: Decimal,
  cumulativeGpProfit: Decimal,
  cumulativeLpProfit: Decimal,
  ledgers: Map<string, PartnerLedgerState>
): {
  allocated: Decimal;
  gpShareAmount: Decimal;
  lpShareAmount: Decimal;
  perPartner: Map<string, Decimal>;
} {
  const allocation = computeGpCatchUpAllocationV2({
    available,
    cumulativeGpProfit,
    cumulativeLpProfit,
    terminalGpShare: gpShare,
    catchUpGpAllocationRate: gpAllocationRate,
  });
  const catchUpAllocated = new Decimal(allocation.allocatedTotal);
  const gpAmount = new Decimal(allocation.gpAmount);
  const lpAmount = new Decimal(allocation.lpAmount);
  const perPartner = apportionGpLpBuckets(gpAmount, lpAmount, ledgers, 'Catch-up');

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

  const allocation = splitQuantizedGpLp(available, gpShareRate, available);
  const allocated = new Decimal(allocation.allocatedTotal);
  const gpAmount = new Decimal(allocation.gpAmount);
  const lpAmount = new Decimal(allocation.lpAmount);
  const perPartner = apportionGpLpBuckets(gpAmount, lpAmount, ledgers, 'Carry');

  return { allocated, gpShareAmount: gpAmount, lpShareAmount: lpAmount, perPartner };
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

  const hasCatchUpTier = policy.some((tier) => tier.kind === 'gp_catch_up');
  if (hasCatchUpTier) {
    const openingProfitDecomposition = input.openingState.profitDecomposition;
    const hasOpeningProfitHistory = [
      openingProfitDecomposition.openingCumulativePreferredPaid,
      openingProfitDecomposition.openingCumulativeGpProfitDistributions,
      openingProfitDecomposition.openingCumulativeLpProfitDistributions,
    ].some((amount) => !new Decimal(amount).isZero());

    if (hasOpeningProfitHistory) {
      throw new Error(
        'Deal-by-deal waterfall cannot consume nonzero scalar opening profit-decomposition history with gp_catch_up.'
      );
    }
  }

  // Accrued preference is a fund-level per-partner balance with no per-pool
  // provenance. Allocating it in more than one pool either double-pays the
  // ledger (current defect) or imposes a cross-pool consumption priority that
  // contradicts pool independence, so multi-pool runs with a positive
  // preference entitlement fail closed. Unreachable on admitted public input.
  if (policy.some((tier) => tier.kind === 'preferred_return')) {
    const eligibleAccrued = Array.from(state.partnerLedgers.values())
      .filter((p) => !(p.isGp && input.gpCashPreferredReturnTreatment === 'excluded'))
      .reduce((s, p) => s.plus(p.accruedPreference), ZERO);
    const positiveProceedsPools = pools.filter((pool) => pool.proceedsAvailable.gt(0)).length;

    if (eligibleAccrued.gt(0) && positiveProceedsPools > 1) {
      throw new Error(
        'Deal-by-deal waterfall cannot allocate a fund-level accrued-preference balance across multiple entitlement pools without per-pool preference provenance.'
      );
    }
  }

  const tierResults: DealByDealTierResult[] = [];
  const partnerDistributions = new Map<string, Decimal>();
  for (const [, ledger] of state.partnerLedgers) {
    partnerDistributions.set(ledger.partnerId, ZERO);
  }

  let totalDistributed = ZERO;

  for (const pool of pools) {
    if (pool.proceedsAvailable.lte(0)) continue;

    let remaining = pool.proceedsAvailable;
    let cumulativeGpProfit = ZERO;
    let cumulativeLpProfit = ZERO;

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
          const catchUp = allocateGpCatchUp(
            remaining,
            new Decimal(tier.gpAllocationRate),
            gpShareRate,
            cumulativeGpProfit,
            cumulativeLpProfit,
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

      if (tier.kind !== 'return_of_capital') {
        cumulativeGpProfit = cumulativeGpProfit.plus(result.gpShare);
        cumulativeLpProfit = cumulativeLpProfit.plus(result.lpShare);
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
