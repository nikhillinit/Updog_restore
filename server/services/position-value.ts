import { toDecimal } from '@shared/lib/decimal-utils';
import type { Decimal } from '@shared/lib/decimal-utils';

type DecimalLike = Decimal | number | string;

export function computePositionValue(opts: {
  currentValuation: DecimalLike | null | undefined;
  ownershipCurrentPct: DecimalLike | null | undefined;
}): Decimal | null {
  if (opts.currentValuation == null) {
    return null;
  }

  const companyValuation = toDecimal(opts.currentValuation);
  const ownership = opts.ownershipCurrentPct == null ? null : toDecimal(opts.ownershipCurrentPct);
  return ownership != null && ownership.gt(0)
    ? companyValuation.times(ownership)
    : companyValuation;
}
