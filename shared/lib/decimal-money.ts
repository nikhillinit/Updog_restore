/**
 * Decimal money calculation helpers.
 *
 * These helpers use the globally configured Decimal wrapper and keep
 * half-up rounding explicit for financial calculation boundaries.
 */

import Decimal from '@shared/lib/decimal-config';

const toDecimal = (n: Decimal.Value): Decimal => new Decimal(n);

export const roundP = (n: Decimal.Value, places = 6): Decimal =>
  toDecimal(n).toDecimalPlaces(places, Decimal.ROUND_HALF_UP);

export const MetricPrecision = {
  IRR: 4,
  MULTIPLE: 2,
  CURRENCY: 2,
  PERCENTAGE: 2,
  RATE: 2,
  INTERNAL: 6,
} as const;

export const roundIRR = (irr: Decimal.Value): Decimal => roundP(irr, MetricPrecision.IRR);

export const roundMultiple = (multiple: Decimal.Value): Decimal =>
  roundP(multiple, MetricPrecision.MULTIPLE);

export const roundCurrency = (amount: Decimal.Value): Decimal =>
  roundP(amount, MetricPrecision.CURRENCY);

export const roundPercentage = (pct: Decimal.Value): Decimal =>
  roundP(pct, MetricPrecision.PERCENTAGE);

export function safeDivide(numerator: Decimal.Value, denominator: Decimal.Value): Decimal | null {
  const denom = toDecimal(denominator);
  if (denom.isZero()) {
    return null;
  }
  const result = toDecimal(numerator).div(denom);
  if (!result.isFinite()) {
    return null;
  }
  return result;
}

export function percentageChange(oldValue: Decimal.Value, newValue: Decimal.Value): Decimal | null {
  const old = toDecimal(oldValue);
  if (old.isZero()) {
    return null;
  }
  return toDecimal(newValue).minus(old).div(old);
}

export function clamp(value: Decimal.Value, min: Decimal.Value, max: Decimal.Value): Decimal {
  const v = toDecimal(value);
  const minD = toDecimal(min);
  const maxD = toDecimal(max);
  if (v.lt(minD)) return minD;
  if (v.gt(maxD)) return maxD;
  return v;
}

export function sum(values: Decimal.Value[]): Decimal {
  return values.reduce((acc: Decimal, v) => acc.plus(toDecimal(v)), toDecimal(0));
}

export function isValidDecimal(value: unknown): value is Decimal {
  return value instanceof Decimal && value.isFinite();
}

export { Decimal };
