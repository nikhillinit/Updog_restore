import { Decimal } from '../../../lib/decimal-config';
import { apportionCentsLrm, centsToDecimalString, decimalToCents } from './decimal-cents-v2';

export interface GpCatchUpAllocationV2Input {
  readonly available: Decimal;
  readonly cumulativeGpProfit: Decimal;
  readonly cumulativeLpProfit: Decimal;
  readonly terminalGpShare: Decimal;
  readonly catchUpGpAllocationRate: Decimal;
}

export interface GpCatchUpAllocationV2Result {
  readonly allocatedTotal: string;
  readonly gpAmount: string;
  readonly lpAmount: string;
}

export function computeQuantizedGpLpSplitV2(
  allocated: Decimal,
  gpShare: Decimal
): GpCatchUpAllocationV2Result {
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

export function computeGpCatchUpAllocationV2(
  input: GpCatchUpAllocationV2Input
): GpCatchUpAllocationV2Result {
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
  const allocated = Decimal.min(available, grossCatchUpDue);

  return computeQuantizedGpLpSplitV2(allocated, g);
}
