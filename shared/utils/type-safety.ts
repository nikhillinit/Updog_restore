/**
 * Lightweight type-safe helpers for exactOptionalPropertyTypes compliance
 */

/**
 * Type-safe optional property helper - prevents undefined assignment
 */
export const optionalProp = <K extends string, V>(
  key: K,
  value: V | undefined
// eslint-disable-next-line @typescript-eslint/ban-types
): Record<K, V> | {} => {
  return value !== undefined ? { [key]: value } as Record<K, V> : {};
};

/**
 * Multiple optional properties helper
 */
export const optionalProps = <T extends Record<string, unknown>>(
  props: { [K in keyof T]: T[K] | undefined }
): Partial<T> => {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) {
      (result as any)[key] = value;
    }
  }
  return result;
};

/**
 * Safe string coercion for form inputs
 */
export const safeString = (value: string | undefined | null): string => {
  return value ?? '';
};

/**
 * Safe default value helper
 */
export const withDefault = <T>(value: T | undefined, defaultValue: T): T => {
  return value !== undefined ? value : defaultValue;
};

/**
 * Filter undefined values from arrays
 */
export const filterDefined = <T>(array: (T | undefined)[]): T[] => {
  return array.filter((item): item is T => item !== undefined);
};

/**
 * Check if value is defined (type guard)
 */
export const isDefined = <T>(value: T | undefined): value is T => {
  return value !== undefined;
};