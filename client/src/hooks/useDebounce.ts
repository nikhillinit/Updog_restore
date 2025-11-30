import { useState, useEffect } from 'react';

/**
 * Debounces a value by delaying updates until after a specified delay
 * @param value The value to debounce
 * @param delay Delay in milliseconds (default: 750ms for auto-save)
 * @returns The debounced value
 */
export function useDebounce<T>(value: T, delay: number = 750): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set up timeout to update debounced value after delay
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Cleanup: cancel timeout if value changes before delay completes
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
