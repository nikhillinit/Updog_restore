type CanonicalPrimitive = string | number | boolean | null;
export type CanonicalValue =
  | CanonicalPrimitive
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

function normalizeNumber(value: number): number {
  if (!Number.isFinite(value)) {
    throw new TypeError('Scenario input hash cannot canonicalize non-finite numbers');
  }
  return Object.is(value, -0) ? 0 : value;
}

function canonicalizePrimitive(value: CanonicalPrimitive | bigint): CanonicalPrimitive {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') return normalizeNumber(value);
  return value;
}

function isPrimitiveInput(value: unknown): value is CanonicalPrimitive | bigint {
  return (
    value === null ||
    typeof value === 'bigint' ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  );
}

function canonicalizeArray(value: unknown[]): CanonicalValue[] {
  return value.map((item) => {
    const normalized = canonicalizeScenarioValue(item);
    return normalized === undefined ? null : normalized;
  });
}

function canonicalizeObject(value: object): Record<string, CanonicalValue> {
  const proto = Reflect.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    throw new TypeError('Scenario input hash cannot canonicalize non-POJO objects');
  }
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

export function canonicalizeScenarioValue(value: unknown): CanonicalValue | undefined {
  if (value === undefined) return undefined;
  if (isPrimitiveInput(value)) return canonicalizePrimitive(value);

  if (Array.isArray(value)) return canonicalizeArray(value);

  if (typeof value === 'object') return canonicalizeObject(value);

  throw new TypeError(`Scenario input hash cannot canonicalize ${typeof value}`);
}

export function canonicalJson(value: unknown): string {
  const normalized = canonicalizeScenarioValue(value);
  return JSON.stringify(normalized === undefined ? null : normalized);
}
