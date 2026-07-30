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

export interface Task163RoundedWaterfallRun {
  events: Task163RoundedWaterfallEvent[];
  fullPrecisionTotalsUsd: {
    totalUsd: string;
    rocUsd: string;
    preferredReturnUsd: string;
    lpResidualUsd: string;
    gpCarryUsd: string;
  };
  roundedTotalsCents: Task163RoundedWaterfallEvent;
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

export function processWaterfallRunForPresentation(
  events: readonly Task163WaterfallEventEntitlements[]
): Task163RoundedWaterfallRun {
  const fullPrecisionTotals = events.reduce(
    (totals, event) => ({
      totalUsd: totals.totalUsd.plus(event.totalUsd),
      rocUsd: totals.rocUsd.plus(event.rocUsd),
      preferredReturnUsd: totals.preferredReturnUsd.plus(event.preferredReturnUsd),
      lpResidualUsd: totals.lpResidualUsd.plus(event.lpResidualUsd),
      gpCarryUsd: totals.gpCarryUsd.plus(event.gpCarryUsd),
    }),
    {
      totalUsd: new Decimal(0),
      rocUsd: new Decimal(0),
      preferredReturnUsd: new Decimal(0),
      lpResidualUsd: new Decimal(0),
      gpCarryUsd: new Decimal(0),
    }
  );
  const fullPrecisionCategoryTotal = fullPrecisionTotals.rocUsd
    .plus(fullPrecisionTotals.preferredReturnUsd)
    .plus(fullPrecisionTotals.lpResidualUsd)
    .plus(fullPrecisionTotals.gpCarryUsd);

  if (!fullPrecisionCategoryTotal.eq(fullPrecisionTotals.totalUsd)) {
    throw new Task163PresentationRoundingError(
      'FULL_PRECISION_CONSERVATION_FAILED',
      'Full-precision waterfall categories do not conserve run total.'
    );
  }

  const roundedEvents = events.map(roundWaterfallEventForPresentation);
  const roundedTotals = roundedEvents.reduce(
    (totals, event) => ({
      totalCents: totals.totalCents.plus(event.totalCents),
      rocCents: totals.rocCents.plus(event.rocCents),
      preferredReturnCents: totals.preferredReturnCents.plus(event.preferredReturnCents),
      lpResidualCents: totals.lpResidualCents.plus(event.lpResidualCents),
      gpCarryCents: totals.gpCarryCents.plus(event.gpCarryCents),
    }),
    {
      totalCents: new Decimal(0),
      rocCents: new Decimal(0),
      preferredReturnCents: new Decimal(0),
      lpResidualCents: new Decimal(0),
      gpCarryCents: new Decimal(0),
    }
  );
  const roundedCategoryTotal = roundedTotals.rocCents
    .plus(roundedTotals.preferredReturnCents)
    .plus(roundedTotals.lpResidualCents)
    .plus(roundedTotals.gpCarryCents);

  if (!roundedCategoryTotal.eq(roundedTotals.totalCents)) {
    throw new Task163PresentationRoundingError(
      'OUTPUT_CONSERVATION_FAILED',
      'Rounded waterfall categories do not conserve run total.'
    );
  }

  return {
    events: roundedEvents,
    fullPrecisionTotalsUsd: {
      totalUsd: fullPrecisionTotals.totalUsd.toString(),
      rocUsd: fullPrecisionTotals.rocUsd.toString(),
      preferredReturnUsd: fullPrecisionTotals.preferredReturnUsd.toString(),
      lpResidualUsd: fullPrecisionTotals.lpResidualUsd.toString(),
      gpCarryUsd: fullPrecisionTotals.gpCarryUsd.toString(),
    },
    roundedTotalsCents: {
      totalCents: roundedTotals.totalCents.toFixed(0),
      rocCents: roundedTotals.rocCents.toFixed(0),
      preferredReturnCents: roundedTotals.preferredReturnCents.toFixed(0),
      lpResidualCents: roundedTotals.lpResidualCents.toFixed(0),
      gpCarryCents: roundedTotals.gpCarryCents.toFixed(0),
    },
  };
}
