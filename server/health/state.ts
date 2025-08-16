/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
// Health state management with cache invalidation
let lastReady = false;
const invalidators = new Set<() => void>();

/**
 * Set the readiness state and invalidate cache on change
 */
export function setReady(v: boolean) {
  if (v !== lastReady) {
    lastReady = v;
    // Notify all registered invalidators
    invalidators.forEach(fn => fn());
  }
}

/**
 * Get current readiness state
 */
export function isReady(): boolean {
  return lastReady;
}

/**
 * Register cache invalidation callback
 * Returns unregister function for cleanup
 */
export function registerInvalidator(fn: () => void) {
  invalidators.add(fn);
  return () => invalidators.delete(fn);
}
