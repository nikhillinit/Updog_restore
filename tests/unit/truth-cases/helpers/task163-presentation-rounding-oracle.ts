import { Decimal } from '@shared/lib/decimal-config';

export type Task163PresentationRoundingErrorCode =
  | 'INVALID_USD_AMOUNT'
  | 'INVALID_TARGET_CENTS'
  | 'INVALID_ENTITLEMENT'
  | 'NEGATIVE_LRM_SHORTFALL'
  | 'OUTPUT_CONSERVATION_FAILED'
  | 'FULL_PRECISION_CONSERVATION_FAILED';

export class Task163PresentationRoundingError extends Error {
  constructor(
    readonly code: Task163PresentationRoundingErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'Task163PresentationRoundingError';
  }
}

export interface Task163WaterfallEventEntitlements {
  totalUsd: Decimal;
  rocUsd: Decimal;
  preferredReturnUsd: Decimal;
  lpResidualUsd: Decimal;
  gpCarryUsd: Decimal;
}

export interface Task163RoundedWaterfallEvent {
  totalCents: string;
  rocCents: string;
  preferredReturnCents: string;
  lpResidualCents: string;
  gpCarryCents: string;
}

export function roundUsdToIntegerCents(amountUsd: Decimal): string {
  if (!amountUsd.isFinite() || amountUsd.lt(0)) {
    throw new Task163PresentationRoundingError(
      'INVALID_USD_AMOUNT',
      'USD amount must be finite and nonnegative.'
    );
  }

  return amountUsd.times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0);
}

export function allocateIntegerCentsByExactEntitlements(
  targetCents: Decimal,
  exactEntitlements: readonly Decimal[]
): string[] {
  if (!targetCents.isFinite() || !targetCents.isInteger() || targetCents.lt(0)) {
    throw new Task163PresentationRoundingError(
      'INVALID_TARGET_CENTS',
      'Target cents must be a finite nonnegative integer.'
    );
  }

  for (const entitlement of exactEntitlements) {
    if (!entitlement.isFinite() || entitlement.lt(0)) {
      throw new Task163PresentationRoundingError(
        'INVALID_ENTITLEMENT',
        'Exact entitlements must be finite and nonnegative.'
      );
    }
  }

  const allocations = exactEntitlements.map((entitlement) =>
    entitlement.toDecimalPlaces(0, Decimal.ROUND_FLOOR)
  );
  const allocationTotal = allocations.reduce(
    (total, allocation) => total.plus(allocation),
    new Decimal(0)
  );
  let shortfall = targetCents.minus(allocationTotal);

  if (shortfall.lt(0)) {
    throw new Task163PresentationRoundingError(
      'NEGATIVE_LRM_SHORTFALL',
      'Floored exact entitlements exceed target cents.'
    );
  }

  const remainderOrder = exactEntitlements
    .map((entitlement, index) => ({
      index,
      remainder: entitlement.minus(allocations[index]!),
    }))
    .sort((left, right) => right.remainder.comparedTo(left.remainder) || left.index - right.index);

  if (shortfall.gt(0) && remainderOrder.length === 0) {
    throw new Task163PresentationRoundingError(
      'OUTPUT_CONSERVATION_FAILED',
      'No entitlement bucket can receive remaining cents.'
    );
  }

  let cursor = 0;
  while (shortfall.gt(0)) {
    const winner = remainderOrder[cursor % remainderOrder.length]!;
    allocations[winner.index] = allocations[winner.index]!.plus(1);
    shortfall = shortfall.minus(1);
    cursor += 1;
  }

  const outputTotal = allocations.reduce(
    (total, allocation) => total.plus(allocation),
    new Decimal(0)
  );
  if (!outputTotal.eq(targetCents)) {
    throw new Task163PresentationRoundingError(
      'OUTPUT_CONSERVATION_FAILED',
      'Integer-cent allocations do not conserve target cents.'
    );
  }

  return allocations.map((allocation) => allocation.toFixed(0));
}

export function roundWaterfallEventForPresentation(
  event: Task163WaterfallEventEntitlements
): Task163RoundedWaterfallEvent {
  const residualUsd = event.lpResidualUsd.plus(event.gpCarryUsd);
  const entitlementTotalUsd = event.rocUsd.plus(event.preferredReturnUsd).plus(residualUsd);

  if (!event.totalUsd.isFinite() || !entitlementTotalUsd.eq(event.totalUsd)) {
    throw new Task163PresentationRoundingError(
      'FULL_PRECISION_CONSERVATION_FAILED',
      'Full-precision waterfall entitlements do not conserve event total.'
    );
  }

  const totalCents = new Decimal(roundUsdToIntegerCents(event.totalUsd));
  const [rocCents, preferredReturnCents, residualCents] = allocateIntegerCentsByExactEntitlements(
    totalCents,
    [event.rocUsd, event.preferredReturnUsd, residualUsd].map((amount) => amount.times(100))
  );
  const [lpResidualCents, gpCarryCents] = allocateIntegerCentsByExactEntitlements(
    new Decimal(residualCents!),
    [event.lpResidualUsd, event.gpCarryUsd].map((amount) => amount.times(100))
  );

  const rounded = {
    totalCents: totalCents.toFixed(0),
    rocCents: rocCents!,
    preferredReturnCents: preferredReturnCents!,
    lpResidualCents: lpResidualCents!,
    gpCarryCents: gpCarryCents!,
  };
  const roundedAllocationTotal = [
    rounded.rocCents,
    rounded.preferredReturnCents,
    rounded.lpResidualCents,
    rounded.gpCarryCents,
  ].reduce((total, cents) => total.plus(cents), new Decimal(0));

  if (!roundedAllocationTotal.eq(totalCents)) {
    throw new Task163PresentationRoundingError(
      'OUTPUT_CONSERVATION_FAILED',
      'Hierarchical integer-cent allocations do not conserve event total.'
    );
  }

  return rounded;
}
