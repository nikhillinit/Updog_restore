/**
 * Type guard utility for strict null/undefined checking
 *
 * @param v - Value to check for null or undefined
 * @returns Type predicate indicating value is defined (not null or undefined)
 *
 * @example
 * const value: number | undefined = getSomeValue();
 * if (isDefined(value)) {
 *   // TypeScript knows value is number here
 *   console.log(value.toFixed(2));
 * }
 */
export function isDefined<T>(v: T | null | undefined): v is T {
  return v !== null && v !== undefined;
}
