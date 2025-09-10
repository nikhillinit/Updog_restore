import { shallow } from 'zustand/shallow';
import { useFundStore } from './useFundStore';

/**
 * Safe wrapper around useFundStore that applies shallow equality by default.
 * Prevents object-return selector identity churn that causes infinite loops.
 * 
 * @example
 * // Tuple selectors (recommended)
 * const [hydrated, fromInvestmentStrategy] = useFundSelector(s => [s.hydrated, s.fromInvestmentStrategy]);
 * 
 * // Object selectors (shallow equality applied automatically)  
 * const slice = useFundSelector(s => ({ stages: s.stages, hydrated: s.hydrated }));
 * 
 * // Custom equality if needed
 * const data = useFundSelector(s => s.complexData, Object.is);
 */
export function useFundSelector<TSelected>(
  selector: (state: any) => TSelected,
  equality?: (a: TSelected, b: TSelected) => boolean
): TSelected {
  // Use type assertion to allow two arguments
  const store = useFundStore as any;
  if (equality) {
    return store(selector, equality);
  }
  return store(selector, shallow);
}