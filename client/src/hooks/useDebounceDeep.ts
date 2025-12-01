/**
 * useDebounceDeep Hook
 *
 * Debounces a value with deep equality comparison to prevent unnecessary updates
 * when object/array contents haven't actually changed.
 *
 * **Use Cases:**
 * - React Hook Form watch() values (objects change identity every render)
 * - Expensive calculations triggered by form state
 * - Auto-save with object state
 *
 * **Example:**
 * ```typescript
 * const formValues = watch();
 * const debouncedFormValues = useDebounceDeep(formValues, 250);
 *
 * const calculations = useMemo(() => {
 *   return expensiveCalculation(debouncedFormValues);
 * }, [debouncedFormValues]);
 * ```
 *
 * **Performance:**
 * - Deep equality check on every render (cheap for small objects)
 * - Timer only reset if value actually changed
 * - Single timer per hook instance
 *
 * @template T - Type of value to debounce
 * @param value - The value to debounce
 * @param delay - Debounce delay in milliseconds (default: 250ms)
 * @returns Debounced value
 */

/// <reference types="node" />
import { useState, useEffect, useRef } from 'react';

// ============================================================================
// DEEP EQUALITY UTILITY
// ============================================================================

/**
 * Deep equality comparison using JSON serialization
 *
 * **Limitations:**
 * - Functions not compared (serialized as undefined)
 * - Dates compared by ISO string
 * - Circular references not supported
 * - Property order matters in objects
 *
 * **Good enough for:**
 * - React Hook Form values (plain objects/arrays)
 * - Form state without functions/circular refs
 */
function isDeepEqual<T>(a: T, b: T): boolean {
  // Fast path: Same reference
  if (a === b) return true;

  // Fast path: Primitives
  if (typeof a !== 'object' || typeof b !== 'object') {
    return a === b;
  }

  // Null check
  if (a === null || b === null) {
    return a === b;
  }

  // JSON serialization (sufficient for form values)
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (error) {
    // Fallback to reference equality if serialization fails
    console.warn('[useDebounceDeep] Deep equality check failed, using reference equality', error);
    return a === b;
  }
}

// ============================================================================
// HOOK
// ============================================================================

export function useDebounceDeep<T>(value: T, delay: number = 250): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const previousValueRef = useRef<T>(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Check if value actually changed (deep comparison)
    const valueChanged = !isDeepEqual(previousValueRef.current, value);

    if (!valueChanged) {
      // Value didn't change → no need to reset timer or update
      return;
    }

    // Value changed → update ref and set debounce timer
    previousValueRef.current = value;

    // Clear existing timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // Set new timer
    timerRef.current = setTimeout(() => {
      setDebouncedValue(value);
      timerRef.current = null;
    }, delay);

    // Cleanup: Clear timer on unmount or value change
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [value, delay]);

  return debouncedValue;
}

// ============================================================================
// VARIANT: useDebouncePrimitive (Lightweight)
// ============================================================================

/**
 * Debounce hook for primitive values (no deep equality check)
 *
 * Use this for numbers, strings, booleans where reference equality is sufficient.
 * Faster than useDebounceDeep for primitives.
 *
 * @template T - Primitive type (string, number, boolean)
 */
export function useDebouncePrimitive<T extends string | number | boolean>(
  value: T,
  delay: number = 250
): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Clear existing timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // Set new timer
    timerRef.current = setTimeout(() => {
      setDebouncedValue(value);
      timerRef.current = null;
    }, delay);

    // Cleanup
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [value, delay]);

  return debouncedValue;
}

// ============================================================================
// VARIANT: useDebounceCallback (For Functions)
// ============================================================================

/**
 * Debounce a callback function
 *
 * **Example:**
 * ```typescript
 * const debouncedSave = useDebounceCallback((data) => {
 *   onSave(data);
 * }, 500);
 *
 * // Call immediately, but execution delayed
 * debouncedSave(formValues);
 * ```
 */
export function useDebounceCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delay: number = 250
) {
  const callbackRef = useRef(callback);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update callback ref (avoid stale closures)
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Create debounced function
  const debouncedCallback = useRef((...args: Args) => {
    // Clear existing timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // Set new timer
    timerRef.current = setTimeout(() => {
      callbackRef.current(...args);
      timerRef.current = null;
    }, delay);
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return debouncedCallback.current;
}
