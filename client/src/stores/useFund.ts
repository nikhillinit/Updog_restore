import { shallow } from 'zustand/shallow';
import type { StoreApi, UseBoundStore } from 'zustand';
import { useFundStore } from './useFundStore';

// Infer the store state and re-cast the bound store so TS knows
// it accepts a selector + optional equality function.
type FundState = ReturnType<typeof useFundStore.getState>;
const bound = useFundStore as unknown as UseBoundStore<StoreApi<FundState>>;

/**
 * Safe wrapper over useFundStore that defaults to shallow equality for
 * object/array selectors to prevent getSnapshot churn.
 *
 * Prefer tuple/object selectors here:
 * const [hydrated, stages] = useFundSelector(s => [s.hydrated, s.stages]);
 */
export function useFundSelector<T>(
  selector: (s: FundState) => T,
  equality?: (a: T, b: T) => boolean
): T {
  return bound(selector, equality ?? shallow);
}