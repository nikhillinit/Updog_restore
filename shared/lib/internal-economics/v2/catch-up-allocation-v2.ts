import { Decimal } from '../../../lib/decimal-config';
import type { PartnerLedgerState } from './event-stream-engine-v2';
import {
  apportionCentsLrm,
  apportionCentsLrmFromShares,
  centsToDecimalString,
  decimalToCappedCents,
  decimalToCents,
} from './decimal-cents-v2';

export interface GpCatchUpAllocationV2Input {
  readonly available: Decimal;
  readonly cumulativeGpProfit: Decimal;
  readonly cumulativeLpProfit: Decimal;
  readonly terminalGpShare: Decimal;
  readonly catchUpGpAllocationRate: Decimal;
}

export interface QuantizedGpLpSplitV2Result {
  readonly allocatedTotal: string;
  readonly gpAmount: string;
  readonly lpAmount: string;
}

export function computeQuantizedGpLpSplitV2(
  allocated: Decimal,
  gpShare: Decimal
): QuantizedGpLpSplitV2Result {
  if (allocated.lt(0) || gpShare.lt(0) || gpShare.gt(1)) {
    throw new Error('GP/LP split invariant violated.');
  }

  const allocatedCents = decimalToCents(allocated);
  const allocatedUnits = new Decimal(allocatedCents.toString());
  const buckets = apportionCentsLrm(allocatedCents, [
    allocatedUnits.mul(gpShare),
    allocatedUnits.mul(new Decimal(1).minus(gpShare)),
  ]);
  const gpCents = buckets[0]!;
  const lpCents = buckets[1]!;

  return {
    allocatedTotal: centsToDecimalString(gpCents + lpCents),
    gpAmount: centsToDecimalString(gpCents),
    lpAmount: centsToDecimalString(lpCents),
  };
}

export function apportionQuantizedGpLpSplitBySettledCapitalV2(
  allocation: QuantizedGpLpSplitV2Result,
  partners: readonly PartnerLedgerState[],
  tierLabel: 'Catch-up' | 'Carry'
): Map<string, Decimal> {
  const perPartner = new Map<string, Decimal>();

  for (const [bucket, amount] of [
    ['GP', allocation.gpAmount],
    ['LP', allocation.lpAmount],
  ] as const) {
    const bucketAmount = new Decimal(amount);
    if (bucketAmount.lte(0)) continue;

    const eligiblePartners = partners.filter((partner) => partner.isGp === (bucket === 'GP'));
    if (eligiblePartners.length === 0) {
      throw new Error(
        `${tierLabel} ${bucket} bucket invariant violated: no eligible ${bucket} partners.`
      );
    }

    const allocatedCents = apportionCentsLrmFromShares(
      decimalToCents(bucketAmount),
      eligiblePartners.map((partner) => partner.settledCapital)
    );
    for (let i = 0; i < eligiblePartners.length; i++) {
      perPartner.set(
        eligiblePartners[i]!.partnerId,
        new Decimal(centsToDecimalString(allocatedCents[i]!))
      );
    }
  }

  return perPartner;
}

export function computeGpCatchUpAllocationV2(
  input: GpCatchUpAllocationV2Input
): QuantizedGpLpSplitV2Result {
  const {
    available,
    cumulativeGpProfit,
    cumulativeLpProfit,
    terminalGpShare: c,
    catchUpGpAllocationRate: g,
  } = input;

  if (available.lt(0) || c.lt(0) || c.gte(g) || g.gt(1)) {
    throw new Error('Invalid catch-up allocation inputs.');
  }

  const grossCatchUpDue = Decimal.max(
    new Decimal(0),
    c.mul(cumulativeGpProfit.plus(cumulativeLpProfit)).minus(cumulativeGpProfit).div(g.minus(c))
  );
  const allocatedCents = decimalToCappedCents(grossCatchUpDue, available);
  const allocated = new Decimal(centsToDecimalString(allocatedCents));

  return computeQuantizedGpLpSplitV2(allocated, g);
}
