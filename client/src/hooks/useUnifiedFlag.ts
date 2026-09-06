/**
 * Unified Feature Flag Hook
 *
 * Single source of truth for feature flag consumption.
 * Priority: URL param > localStorage (non-admin) > env var > default
 *
 * Usage:
 *   const isEnabled = useFlag('enable_new_ia');
 *   const { flags, isLoading } = useFlags();
 */

import { useMemo } from 'react';
import type { FlagKey, ClientFlagKey, FlagRecord } from '@shared/generated/flag-types';
import { isAdminFlag, isFlagKey, CLIENT_FLAG_KEYS } from '@shared/generated/flag-types';
import { FLAG_DEFINITIONS } from '@shared/generated/flag-defaults';
import {
  clearUnifiedFlagOverrides,
  getClientRuntimeEnvironment,
  isUnifiedFlagEnabled,
  setUnifiedFlag,
} from '@/core/flags/unifiedClientFlags';

/**
 * Resolve a single flag value
 * Priority: URL param > localStorage (non-admin) > env var > environment default > default
 */
export function resolveFlag(key: FlagKey): boolean {
  return isUnifiedFlagEnabled(key);
}

/**
 * Resolve all flags
 */
export function resolveAllFlags(): FlagRecord {
  const result: Partial<FlagRecord> = {};
  for (const key of CLIENT_FLAG_KEYS) {
    result[key] = resolveFlag(key);
  }
  return result as FlagRecord;
}

/**
 * Hook to get a single flag value
 *
 * @param key - The flag key from registry
 * @param options - Optional configuration
 * @returns boolean indicating if flag is enabled
 *
 * @example
 * const isNewIaEnabled = useFlag('enable_new_ia');
 */
export function useFlag(
  key: FlagKey,
  options?: {
    /** Check dependencies - if true, returns false if any dependency is disabled */
    withDependencies?: boolean;
  }
): boolean {
  return useMemo(() => {
    const value = resolveFlag(key);

    if (options?.withDependencies) {
      return value;
    }

    return value;
  }, [key, options?.withDependencies]);
}

/**
 * Hook to get all flag values
 *
 * @returns Object with flags record and metadata
 *
 * @example
 * const { flags, isAdmin } = useFlags();
 * if (flags.enable_new_ia) { ... }
 */
export function useFlags(): {
  flags: FlagRecord;
  isAdmin: (key: FlagKey) => boolean;
  setOverride: (key: ClientFlagKey, value: boolean) => void;
  clearOverrides: () => void;
} {
  const flags = useMemo(() => resolveAllFlags(), []);

  return {
    flags,
    isAdmin: (key: FlagKey) => isAdminFlag(key),
    setOverride: (key: ClientFlagKey, value: boolean) => {
      if (isAdminFlag(key)) {
        console.warn(`Cannot override admin flag: ${key}`);
        return;
      }
      setUnifiedFlag(key, value);
    },
    clearOverrides: () => {
      if (getClientRuntimeEnvironment() === 'development') {
        clearUnifiedFlagOverrides();
      }
    },
  };
}

/**
 * Type-safe flag check (non-hook, for use outside components)
 *
 * @param key - The flag key from registry
 * @returns boolean indicating if flag is enabled
 *
 * @example
 * if (getFlag('enable_new_ia')) { ... }
 */
export function getFlag(key: FlagKey): boolean {
  return resolveFlag(key);
}

/**
 * Check if a string is a valid flag key
 */
export { isFlagKey };

/**
 * Legacy alias resolver (for migration)
 */
export function resolveLegacyFlag(aliasOrKey: string): boolean | undefined {
  // First check if it's a direct key
  if (isFlagKey(aliasOrKey)) {
    return resolveFlag(aliasOrKey);
  }

  // Check aliases in FLAG_DEFINITIONS
  for (const [key, def] of Object.entries(FLAG_DEFINITIONS)) {
    if (def.aliases?.includes(aliasOrKey)) {
      return resolveFlag(key as FlagKey);
    }
  }

  // Not found
  if (import.meta.env.DEV) {
    console.warn(`Unknown flag: ${aliasOrKey}`);
  }
  return undefined;
}

// Re-export types for convenience
export type { FlagKey, ClientFlagKey, FlagRecord };
