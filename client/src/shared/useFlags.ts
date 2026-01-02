/**
 * Client-side feature flag accessor with runtime overrides
 *
 * Extends the central flag system from shared/feature-flags/flag-definitions.ts
 * with client-specific runtime controls.
 *
 * Priority (highest to lowest):
 * 1. Query params: ?ff_enable_new_ia=1
 * 2. LocalStorage: localStorage.setItem('ff_enable_new_ia', '1')
 * 3. Environment: VITE_ENABLE_NEW_IA=true
 * 4. Definition default: ALL_FLAGS[key].enabled
 *
 * Usage:
 *   const flags = useFlags();
 *   if (flags.enable_new_ia) { ... }
 *
 *   // Or single flag:
 *   const isNewIA = useFlag('enable_new_ia');
 */

import { useMemo, useSyncExternalStore } from 'react';
import { ALL_FLAGS, type FlagKey } from '@shared/feature-flags/flag-definitions';

/**
 * Get runtime override from query params or localStorage
 * Matches pattern from client/src/config/features.ts
 */
const getRuntimeFlag = (flagKey: string): boolean | undefined => {
  try {
    // Check query params first: ?ff_enable_new_ia=1
    const qp = new URLSearchParams(window.location.search).get(`ff_${flagKey}`);
    if (qp === '0' || qp === '1') return qp === '1';

    // Check localStorage fallback: localStorage.setItem('ff_enable_new_ia', '1')
    const ls = localStorage.getItem(`ff_${flagKey}`);
    if (ls === '0' || ls === '1') return ls === '1';
  } catch (e) {
    console.warn(`[useFlags] Runtime check failed for ${flagKey}:`, e);
  }
  return undefined;
};

/**
 * Get environment variable flag value
 */
const getEnvFlag = (flagKey: string): boolean | undefined => {
  try {
    const meta = import.meta as ImportMeta & { env?: Record<string, string> };
    const envVal = meta.env?.[`VITE_${flagKey.toUpperCase()}`];
    if (envVal === 'true' || envVal === '1') return true;
    if (envVal === 'false' || envVal === '0') return false;
  } catch (_e) {
    // Ignore - might be SSR or no import.meta
  }
  return undefined;
};

/**
 * Subscribe to localStorage changes for live flag updates
 */
const subscribe = (callback: () => void) => {
  window.addEventListener('storage', callback);
  // Also listen to popstate for query param changes
  window.addEventListener('popstate', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('popstate', callback);
  };
};

/**
 * Hook to access all feature flags with runtime overrides
 * Re-renders when flags change via localStorage or query params
 */
export function useFlags(): Record<FlagKey, boolean> {
  // Re-render on storage/navigation changes
  useSyncExternalStore(
    subscribe,
    () => window.location.search + Date.now() // Snapshot includes query params
  );

  return useMemo(() => {
    const flags: Record<string, boolean> = {};

    Object.keys(ALL_FLAGS).forEach((key) => {
      const flagKey = key as FlagKey;
      // Priority: runtime > env > definition default
      flags[key] =
        getRuntimeFlag(key) ??
        getEnvFlag(key) ??
        ALL_FLAGS[flagKey]?.enabled ?? false;
    });

    return flags as Record<FlagKey, boolean>;
  }, []); // Dependencies handled by useSyncExternalStore
}

/**
 * Hook to access a single feature flag
 * Convenience wrapper with TypeScript autocomplete
 */
export function useFlag(key: FlagKey): boolean {
  const flags = useFlags();
  return flags[key] ?? false;
}

/**
 * Development helper - log current flag states
 */
export function debugFlags(): void {
  const flags = {} as Record<FlagKey, boolean>;
  Object.keys(ALL_FLAGS).forEach((key) => {
    const flagKey = key as FlagKey;
    flags[flagKey] =
      getRuntimeFlag(key) ??
      getEnvFlag(key) ??
      ALL_FLAGS[flagKey]?.enabled ?? false;
  });

  console.group('🚩 Feature Flags');
  console.table(
    Object.entries(flags).map(([key, value]) => ({
      flag: key,
      enabled: value,
      runtime: getRuntimeFlag(key) ?? 'not set',
      env: getEnvFlag(key) ?? 'not set',
      default: ALL_FLAGS[key as FlagKey]?.enabled ?? false,
    }))
  );
  console.groupEnd();
}

// Expose to window in development
if (import.meta.env?.DEV) {
  (window as unknown as { __debugFlags?: typeof debugFlags }).__debugFlags = debugFlags;
}
