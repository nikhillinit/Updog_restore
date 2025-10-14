/**
 * Conditionally spreads a property into an object if the value is defined.
 * Used with exactOptionalPropertyTypes to omit undefined props rather than pass them explicitly.
 *
 * **Philosophy:** Only spread when the value exists. Otherwise, omit the property entirely.
 *
 * @example
 * ```tsx
 * // ✅ Omit 'description' prop if undefined (preferred)
 * const fund = {
 *   name: 'Example Fund',
 *   ...spreadIfDefined("description", maybeDescription)
 * };
 *
 * // ❌ Fails with exactOptionalPropertyTypes
 * const fund = {
 *   name: 'Example Fund',
 *   description: maybeDescription  // if maybeDescription can be undefined
 * };
 *
 * // ✅ Multiple optional props
 * const options = {
 *   required: value,
 *   ...spreadIfDefined("optional1", val1),
 *   ...spreadIfDefined("optional2", val2)
 * };
 * ```
 *
 * @param key - Property key to conditionally spread
 * @param val - Value to spread (omitted if undefined)
 * @returns Empty object if undefined, or object with single key-value pair
 */
export function spreadIfDefined<K extends string, V>(
  key: K,
  val: V | undefined
): {} | { [P in K]: V } {
  return val === undefined ? {} : { [key]: val as V };
}
