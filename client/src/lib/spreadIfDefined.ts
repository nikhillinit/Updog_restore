/**
 * Conditionally spreads a property into an object if the value is defined.
 * Used with exactOptionalPropertyTypes to omit undefined props rather than pass them explicitly.
 *
 * @example
 * ```tsx
 * // Omit 'error' prop if undefined
 * <Input {...spreadIfDefined("error", errorMessage)} />
 *
 * // Instead of (which fails with exactOptionalPropertyTypes)
 * <Input error={errorMessage} />  // ❌ if errorMessage can be undefined
 * ```
 *
 * @param key - Property key to conditionally spread
 * @param val - Value to spread (omitted if undefined)
 * @returns Empty object if undefined, or object with single key-value pair
 */
export const spreadIfDefined = <K extends string, V>(
  key: K,
  val: V | undefined
): Record<K, V> | Record<string, never> =>
  val === undefined ? {} as Record<string, never> : { [key]: val } as Record<K, V>;
