import { useStoreWithEqualityFn } from 'zustand/traditional';
import { shallow } from 'zustand/shallow';
import { useFundStore } from './useFundStore';

type FundState = ReturnType<typeof useFundStore.getState>;

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
  return useStoreWithEqualityFn(
    useFundStore,
    selector,
    equality ?? (shallow as (a: T, b: T) => boolean)
  );
}
