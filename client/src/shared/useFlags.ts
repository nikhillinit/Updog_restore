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

import { useSyncExternalStore } from 'react';
import { ALL_FLAGS, type FlagKey } from '@shared/feature-flags/flag-definitions';

type FlagName = Extract<FlagKey, string>;
type FlagSnapshot = Record<FlagName, boolean>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRuntimeFlagValue(value: string | null): value is '0' | '1' {
  return value === '0' || value === '1';
}

function getImportMetaEnv(): unknown {
  return (import.meta as ImportMeta & { env?: unknown }).env;
}

/**
 * Get runtime override from query params or localStorage
 * Matches pattern from client/src/config/features.ts
 */
const getRuntimeFlag = (flagKey: string): boolean | undefined => {
  try {
    // Check query params first: ?ff_enable_new_ia=1
    const qp = new URLSearchParams(window.location.search).get(`ff_${flagKey}`);
    if (isRuntimeFlagValue(qp)) return qp === '1';

    // Check localStorage fallback: localStorage.setItem('ff_enable_new_ia', '1')
    const ls = window.localStorage.getItem(`ff_${flagKey}`);
    if (isRuntimeFlagValue(ls)) return ls === '1';
  } catch (error) {
    console.warn(`[useFlags] Runtime check failed for ${flagKey}:`, error);
  }
  return undefined;
};

/**
 * Get environment variable flag value
 */
const getEnvFlag = (flagKey: string): boolean | undefined => {
  try {
    const env = getImportMetaEnv();
    if (!isRecord(env)) {
      return undefined;
    }

    const envVal = env[`VITE_${flagKey.toUpperCase()}`];
    if (typeof envVal !== 'string') {
      return undefined;
    }
    if (envVal === 'true' || envVal === '1') return true;
    if (envVal === 'false' || envVal === '0') return false;
  } catch {
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

export function getFlagSnapshot(): FlagSnapshot {
  const snapshot = {} as FlagSnapshot;

  for (const key of Object.keys(ALL_FLAGS) as FlagName[]) {
    snapshot[key] =
      getRuntimeFlag(key) ??
      getEnvFlag(key) ??
      ALL_FLAGS[key]?.enabled ??
      false;
  }

  return snapshot;
}

/**
 * Hook to access all feature flags with runtime overrides
 * Re-renders when flags change via localStorage or query params
 */
export function useFlags(): Record<FlagName, boolean> {
  // Re-render on storage/navigation changes
  useSyncExternalStore(subscribe, () => window.location.search);
  return getFlagSnapshot();
}

/**
 * Hook to access a single feature flag
 * Convenience wrapper with TypeScript autocomplete
 */
export function useFlag(key: FlagName): boolean {
  const flags = useFlags();
  return flags[key] ?? false;
}

/**
 * Development helper - log current flag states
 */
export function debugFlags(): void {
  const flags = getFlagSnapshot();
  const rows = (Object.keys(flags) as FlagName[]).map((key) => ({
    flag: key,
    enabled: flags[key],
    runtime: getRuntimeFlag(key) ?? 'not set',
    env: getEnvFlag(key) ?? 'not set',
    default: ALL_FLAGS[key]?.enabled ?? false,
  }));

  console.warn('[useFlags] Feature flag snapshot', rows);
}

// Expose to window in development
if (import.meta.env?.DEV) {
  (window as unknown as { __debugFlags?: typeof debugFlags }).__debugFlags = debugFlags;
}
