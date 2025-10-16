/**
 * Type guard utility for strict null/undefined checking
 *
 * @param v - Value to check for null or undefined
 * @returns Type predicate indicating value is defined (not null or undefined)
 *
 * @example
 * ```typescript
 * const value: number | undefined = getSomeValue();
 * if (isDefined(value)) {
 *   // TypeScript knows value is number here
 *   console.log(value.toFixed(2));
 * }
 *
 * // Array filtering
 * const items = [1, undefined, 2, null, 3];
 * const defined = items.filter(isDefined);  // Type: number[]
 * ```
 */
export function isDefined<T>(v: T | null | undefined): v is T {
  return v !== null && v !== undefined;
}

/**
 * Type guard for non-null values (allows undefined)
 *
 * @param v - Value to check for null
 * @returns Type predicate indicating value is not null
 */
export function isNonNull<T>(v: T | null): v is T {
  return v !== null;
}
