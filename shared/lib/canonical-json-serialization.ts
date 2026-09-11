/** Strict canonical JSON serialization without a runtime-specific hash backend. */
function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Cannot canonicalize non-finite numbers.');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (typeof value === 'object') {
    if (!isPlainObject(value)) {
      throw new TypeError('Cannot canonicalize non-plain objects.');
    }
    return `{${Object.keys(value)
      .sort()
      .map((key) => {
        const fieldValue = value[key];
        if (fieldValue === undefined) {
          throw new TypeError(`Cannot canonicalize undefined field "${key}".`);
        }
        return `${JSON.stringify(key)}:${canonicalJson(fieldValue)}`;
      })
      .join(',')}}`;
  }
  throw new TypeError(`Cannot canonicalize ${typeof value} values.`);
}
