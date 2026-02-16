const MAX_MONEY_VALUE = 1e12;

/** Parse a string to a positive dollar amount, or undefined if invalid */
export function parseMoney(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const num = parseFloat(value);
  if (!Number.isFinite(num) || num <= 0 || num > MAX_MONEY_VALUE) return undefined;
  return num;
}

/** Parse a string to a non-negative integer, or undefined if invalid */
export function parseIntSafe(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const num = parseInt(value, 10);
  if (!Number.isFinite(num) || num < 0) return undefined;
  return num;
}
