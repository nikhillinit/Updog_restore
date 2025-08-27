/**
 * Boolean coercion utilities
 * Safely converts various truthy/falsy values to booleans
 */

export const asBool = (v: unknown): boolean => 
  v === true || v === "true" || v === 1 || v === "1";

export const asNullableBool = (v: unknown): boolean | null => {
  if (v == null) return null;
  return asBool(v);
};