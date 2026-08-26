export interface StableJsonOptions {
  omitUndefinedObjectKeys?: boolean;
}

export function stableJson(value: unknown, options: StableJsonOptions = {}): string {
  if (value === undefined) return 'null';

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item, options)).join(',')}]`;
  }

  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => !options.omitUndefinedObjectKeys || record[key] !== undefined)
      .sort();

    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key], options)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}
