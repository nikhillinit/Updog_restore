import { Decimal, toDecimal } from '@shared/lib/decimal-utils';

type DecimalLike = Decimal | number | string;

export function computePositionValue(opts: {
  currentValuation: DecimalLike | null | undefined;
  ownershipCurrentPct: DecimalLike | null | undefined;
}): Decimal {
  const companyValuation =
    opts.currentValuation == null ? new Decimal(0) : toDecimal(opts.currentValuation);
  const ownership = opts.ownershipCurrentPct == null ? null : toDecimal(opts.ownershipCurrentPct);
  return ownership != null && ownership.gt(0)
    ? companyValuation.times(ownership)
    : companyValuation;
}
