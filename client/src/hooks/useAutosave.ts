/**
 * useAutosave Hook
 *
 * Debounced autosave hook with status tracking.
 * Automatically saves data after a specified delay when values change.
 *
 * @example
 * ```tsx
 * const status = useAutosave(formData, async (data) => {
 *   await api.save(data);
 * }, 800);
 *
 * // Show status indicator
 * {status === 'saving' && <Spinner />}
 * {status === 'saved' && <CheckIcon />}
 * {status === 'error' && <ErrorIcon />}
 * ```
 */

import { useEffect, useRef, useState } from 'react';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Debounced autosave hook
 *
 * @param value - The value to save
 * @param save - Async function to save the value
 * @param delay - Debounce delay in milliseconds (default: 800ms)
 * @returns Current autosave status
 */
export function useAutosave<T>(
  value: T,
  save: (value: T) => Promise<void>,
  delay: number = 800
): AutosaveStatus {
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousValueRef = useRef<T>(value);
  const isMountedRef = useRef(false);

  useEffect(() => {
    // Skip on initial mount
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      previousValueRef.current = value;
      return;
    }

    // Skip if value hasn't changed
    if (value === previousValueRef.current) {
      return;
    }

    previousValueRef.current = value;

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set status to idle while waiting
    setStatus('idle');

    // Start debounce timer
    timeoutRef.current = setTimeout(async () => {
      setStatus('saving');
      try {
        await save(value);
        setStatus('saved');

        // Reset to idle after showing success
        setTimeout(() => {
          setStatus('idle');
        }, 2000);
      } catch (error) {
        console.error('Autosave error:', error);
        setStatus('error');

        // Reset to idle after showing error
        setTimeout(() => {
          setStatus('idle');
        }, 3000);
      }
    }, delay);

    // Cleanup on unmount or value change
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, save, delay]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return status;
}
