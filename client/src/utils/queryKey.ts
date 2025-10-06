/**
 * TanStack Query Utilities
 * Provides type-safe query key predicates for readonly arrays
 */

export type RQuery = { queryKey: readonly unknown[] };

/**
 * Creates a predicate function that checks if a query key includes a target value
 * Handles TanStack Query v5's readonly queryKey requirement
 *
 * @param target - The value to search for in the query key
 * @returns Predicate function for query invalidation
 *
 * @example
 * queryClient.invalidateQueries({
 *   predicate: predicateHas(['funds', fundId])
 * });
 */
export const predicateHas = (target: unknown) =>
  (q: RQuery) => Array.from(q.queryKey).includes(target);

/**
 * Creates a predicate that checks if query key starts with a prefix
 */
export const predicateStartsWith = (prefix: readonly unknown[]) =>
  (q: RQuery) => {
    const key = Array.from(q.queryKey);
    return prefix.every((val, idx) => key[idx] === val);
  };
