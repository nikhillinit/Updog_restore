import { z } from 'zod';

import { Decimal } from './decimal-config';

function fixedDecimalStringSchema(places: number) {
  return z.string().regex(new RegExp(`^-?(?:0|[1-9]\\d*)\\.\\d{${places}}$`));
}

export const MoneyDecimalStringSchema = fixedDecimalStringSchema(6);
export const RatioDecimalStringSchema = fixedDecimalStringSchema(12);

const MONEY_LEAF_KEY =
  /(?:amount|value|valuation|capital|nav|contributions?|distributions?|proceeds|cost|price)$/i;
const RATIO_LEAF_KEY = /(?:ratio|rate|percent|pct|probability|multiple|ownership)$/i;

function assertDecimalStringLeaf(value: unknown, key?: string): void {
  if (typeof value === 'string') {
    if (/e[+-]?\d/i.test(value)) {
      throw new Error('Scientific notation is not allowed in decimal-string hash inputs.');
    }
    const schema = key
      ? MONEY_LEAF_KEY.test(key)
        ? MoneyDecimalStringSchema
        : RATIO_LEAF_KEY.test(key)
          ? RatioDecimalStringSchema
          : null
      : null;
    if (schema && !schema.safeParse(value).success) {
      throw new Error(`Value at ${key} does not satisfy its decimal-string schema.`);
    }
    return;
  }
  if (value === null || typeof value !== 'object' || value instanceof Date) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child) => assertDecimalStringLeaf(child, key));
    return;
  }
  for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
    assertDecimalStringLeaf(child, childKey);
  }
}

export function assertDecimalStringLeaves(value: unknown): void {
  assertDecimalStringLeaf(value);
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Date) {
    return value.toJSON();
  }
  if (Decimal.isDecimal(value)) {
    throw new Error('Decimal values must be formatted as decimal strings before hashing.');
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const child = (value as Record<string, unknown>)[key];
    if (child !== undefined) {
      result[key] = canonicalize(child);
    }
  }
  return result;
}

export function canonicalizeDecimalLeaves(value: unknown): unknown {
  assertDecimalStringLeaves(value);
  return canonicalize(value);
}

export function toFixedDecimalString(value: Decimal | string, places: number): string {
  if (typeof value === 'string' && /e[+-]?\d/i.test(value)) {
    throw new Error('Scientific notation is not allowed in decimal-string formatting.');
  }
  return (typeof value === 'string' ? new Decimal(value) : value).toFixed(places);
}
