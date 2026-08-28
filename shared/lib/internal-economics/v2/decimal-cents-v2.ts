import { Decimal } from '../../../lib/decimal-config';

const MONEY_SCALE = 6;
const CENTS_MULTIPLIER = BigInt(10) ** BigInt(MONEY_SCALE);

export function decimalToCents(value: Decimal): bigint {
  const rounded = value.toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_HALF_UP);
  const scaled = rounded.mul(new Decimal(10).pow(MONEY_SCALE));
  return BigInt(scaled.toFixed(0));
}

export function decimalToCentsFloor(value: Decimal): bigint {
  const floored = value.toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_FLOOR);
  const scaled = floored.mul(new Decimal(10).pow(MONEY_SCALE));
  return BigInt(scaled.toFixed(0));
}

export function centsToDecimalString(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const intPart = abs / CENTS_MULTIPLIER;
  const fracPart = abs % CENTS_MULTIPLIER;
  const fracStr = fracPart.toString().padStart(MONEY_SCALE, '0');
  return `${negative ? '-' : ''}${intPart}.${fracStr}`;
}

export function decimalStringToCents(value: string): bigint {
  return decimalToCents(new Decimal(value));
}

export class LrmConservationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LrmConservationError';
  }
}

export function apportionCentsLrm(
  targetCents: bigint,
  exactEntitlements: readonly Decimal[]
): readonly bigint[] {
  if (exactEntitlements.length === 0) {
    if (targetCents !== 0n) {
      throw new LrmConservationError('No entitlement bucket can receive remaining cents.');
    }
    return [];
  }

  const allocations = exactEntitlements.map((e) => {
    const floored = e.toDecimalPlaces(0, Decimal.ROUND_FLOOR);
    return BigInt(floored.toFixed(0));
  });

  const allocationTotal = allocations.reduce((s, a) => s + a, 0n);
  let shortfall = targetCents - allocationTotal;

  if (shortfall < 0n) {
    throw new LrmConservationError('Floored exact entitlements exceed target cents.');
  }

  if (shortfall > 0n) {
    const remainderOrder = exactEntitlements
      .map((entitlement, index) => ({
        index,
        remainder: entitlement.minus(new Decimal(allocations[index]!.toString())),
      }))
      .sort((a, b) => b.remainder.comparedTo(a.remainder) || a.index - b.index);

    let cursor = 0;
    while (shortfall > 0n) {
      const winner = remainderOrder[cursor % remainderOrder.length]!;
      allocations[winner.index] = allocations[winner.index]! + 1n;
      shortfall -= 1n;
      cursor += 1;
    }
  }

  const outputTotal = allocations.reduce((s, a) => s + a, 0n);
  if (outputTotal !== targetCents) {
    throw new LrmConservationError('Integer-cent allocations do not conserve target cents.');
  }

  return allocations;
}

export function apportionCentsLrmFromShares(
  targetCents: bigint,
  shares: readonly Decimal[]
): readonly bigint[] {
  const totalShares = shares.reduce((s, v) => s.plus(v), new Decimal(0));
  if (totalShares.isZero()) {
    if (targetCents !== 0n) {
      throw new LrmConservationError('Cannot apportion nonzero cents with zero total shares.');
    }
    return shares.map(() => 0n);
  }
  const targetDecimal = new Decimal(targetCents.toString());
  const exactEntitlements = shares.map((s) => s.div(totalShares).mul(targetDecimal));
  return apportionCentsLrm(targetCents, exactEntitlements);
}
