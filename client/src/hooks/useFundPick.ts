import { useFundStore, withSelectGuard } from '@/stores/useFundStore';

/**
 * Typed wrapper around useFundStore that applies the selector guard.
 * This will log if any set() is triggered during selection (potential loop).
 */
export function useFundPick<T>(
  selector: (s: any) => T
) {
  return useFundStore(s => withSelectGuard(() => selector(s)));
}