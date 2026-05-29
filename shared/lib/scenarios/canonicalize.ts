type CanonicalPrimitive = string | number | boolean | null;
export type CanonicalValue =
  | CanonicalPrimitive
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

function normalizeNumber(value: number): number {
  if (!Number.isFinite(value)) {
    throw new TypeError(
      'Scenario input hash cannot canonicalize non-finite numbers'
    );
  }
  return Object.is(value, -0) ? 0 : value;
}

export function canonicalizeScenarioValue(
  value: unknown
): CanonicalValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return normalizeNumber(value);

  if (Array.isArray(value)) {
    return value.map((item) => {
      const normalized = canonicalizeScenarioValue(item);
      return normalized === undefined ? null : normalized;
    });
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const normalized: Record<string, CanonicalValue> = {};
    for (const key of Object.keys(record).sort()) {
      const child = canonicalizeScenarioValue(record[key]);
      if (child !== undefined) {
        normalized[key] = child;
      }
    }
    return normalized;
  }

  throw new TypeError(`Scenario input hash cannot canonicalize ${typeof value}`);
}

export function canonicalJson(value: unknown): string {
  const normalized = canonicalizeScenarioValue(value);
  return JSON.stringify(normalized === undefined ? null : normalized);
}
