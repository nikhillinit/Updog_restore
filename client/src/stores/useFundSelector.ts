import { useStoreWithEqualityFn } from 'zustand/traditional';
import { shallow } from 'zustand/shallow';
import { fundStore } from './fundStore';
import type { FundState } from './fundStore';

/**
 * Core implementation of the fund selector.
 * Internal function - use `useFundSelector` export instead.
 */
function useFundSelectorImpl<T>(
  selector: (s: FundState) => T,
  equality?: (a: T, b: T) => boolean
): T {
  return useStoreWithEqualityFn(fundStore, selector, equality);
}

/**
 * Safe selector hook using Zustand's built-in primitives.
 * Prevents the "getSnapshot must be cached" warning and infinite re-renders.
 *
 * In development mode, wraps selectors with performance monitoring to detect
 * slow selectors (>4ms execution time).
 *
 * @param selector - Function to select a slice of state
 * @param equality - Optional equality function (defaults to Object.is)
 * @returns The selected state slice
 *
 * @example
 * // Single value
 * const hydrated = useFundSelector(s => s.hydrated);
 *
 * // Multiple values with tuple (preferred)
 * const [stages, allocations] = useFundTuple(s => [s.stages, s.allocations]);
 *
 * // Actions (usually stable by reference)
 * const addStage = useFundSelector(s => s.addStage);
 */
export function useFundSelector<T>(
  selector: (s: FundState) => T,
  equality?: (a: T, b: T) => boolean
): T {
  // Development mode: wrap selector with performance monitoring
  if (import.meta.env.DEV) {
    const wrappedSelector = (state: FundState): T => {
      const start = performance.now();
      const result = selector(state);
      const duration = performance.now() - start;

      // Only warn for selectors taking more than 4ms
      if (duration > 4) {
        console.warn(`[Slow selector] ${duration.toFixed(2)}ms`, {
          selector: selector.toString().slice(0, 100)
        });
      }

      return result;
    };

    return useFundSelectorImpl(wrappedSelector, equality);
  }

  // Production mode: use selector directly
  return useFundSelectorImpl(selector, equality);
}

/**
 * Tuple selector with shallow equality check.
 * Use this when selecting multiple values to prevent unnecessary re-renders.
 * 
 * @example
 * const [hydrated, stages, sectorProfiles] = useFundTuple(s => [
 *   s.hydrated,
 *   s.stages,
 *   s.sectorProfiles
 * ]);
 */
export const useFundTuple = <T extends any[]>(
  selector: (s: FundState) => T
) => useFundSelector(selector, shallow);

/**
 * Action selector helper.
 * Actions are typically stable by reference, so no equality check needed.
 * 
 * @example
 * const fromInvestmentStrategy = useFundAction(s => s.fromInvestmentStrategy);
 */
export const useFundAction = <T>(
  selector: (s: FundState) => T
) => useFundSelector(selector);

/**
 * Batch action selector with shallow equality.
 * Use when you need multiple actions at once.
 * 
 * @example
 * const actions = useFundActions(s => ({
 *   addStage: s.addStage,
 *   removeStage: s.removeStage,
 *   updateStageName: s.updateStageName
 * }));
 */
export const useFundActions = <T extends Record<string, any>>(
  selector: (s: FundState) => T
) => useFundSelector(selector, shallow);