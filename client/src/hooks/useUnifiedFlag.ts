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
import { FLAG_DEFINITIONS, resolveFlagWithDependencies } from '@shared/generated/flag-defaults';

const FLAG_PREFIX = 'ff_';
const ENV_PREFIX = 'VITE_';

/**
 * Parse boolean from various string representations
 */
function parseBoolean(value: string | null | undefined): boolean | null {
  if (value === null || value === undefined) return null;
  const lower = value.toLowerCase();
  if (lower === 'true' || lower === '1' || lower === 'yes') return true;
  if (lower === 'false' || lower === '0' || lower === 'no') return false;
  return null;
}

/**
 * Get URL parameter override
 */
function getUrlOverride(key: FlagKey): boolean | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return parseBoolean(params.get(`${FLAG_PREFIX}${key}`));
}

/**
 * Get localStorage override (blocked for admin flags)
 */
function getLocalStorageOverride(key: FlagKey): boolean | null {
  if (typeof window === 'undefined') return null;
  if (isAdminFlag(key)) return null; // Admin flags cannot be overridden via localStorage

  try {
    return parseBoolean(localStorage.getItem(`${FLAG_PREFIX}${key}`));
  } catch {
    return null;
  }
}

/**
 * Get environment variable value
 */
function getEnvValue(key: FlagKey): boolean | null {
  // Map flag key to env var name (e.g., enable_new_ia -> VITE_NEW_IA)
  const def = FLAG_DEFINITIONS[key];
  const aliases = def.aliases ?? [];

  // Try direct env var mapping first (legacy support)
  for (const alias of aliases) {
    const envKey = `${ENV_PREFIX}${alias}`;
    const envValue = import.meta.env[envKey] as string | undefined;
    if (envValue !== undefined) {
      return parseBoolean(envValue);
    }
  }

  // Try snake_case to UPPER_SNAKE_CASE conversion
  const standardEnvKey = `${ENV_PREFIX}${key.toUpperCase()}`;
  const standardValue = import.meta.env[standardEnvKey] as string | undefined;
  if (standardValue !== undefined) {
    return parseBoolean(standardValue);
  }

  return null;
}

/**
 * Get environment-specific default
 */
function getEnvironmentDefault(key: FlagKey): boolean {
  const def = FLAG_DEFINITIONS[key];
  const env = import.meta.env.MODE as 'development' | 'staging' | 'production';
  return def.environments[env] ?? def.default;
}

/**
 * Resolve a single flag value
 * Priority: URL param > localStorage (non-admin) > env var > environment default > default
 */
export function resolveFlag(key: FlagKey): boolean {
  // 1. URL param override (dev only for non-admin, blocked in production)
  if (import.meta.env.DEV) {
    const urlOverride = getUrlOverride(key);
    if (urlOverride !== null) return urlOverride;
  }

  // 2. localStorage override (blocked for admin flags)
  const localOverride = getLocalStorageOverride(key);
  if (localOverride !== null) return localOverride;

  // 3. Environment variable
  const envValue = getEnvValue(key);
  if (envValue !== null) return envValue;

  // 4. Environment-specific default
  return getEnvironmentDefault(key);
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
      const allFlags = resolveAllFlags();
      return resolveFlagWithDependencies(key, allFlags);
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
      try {
        localStorage.setItem(`${FLAG_PREFIX}${key}`, String(value));
      } catch {
        // localStorage may be unavailable
      }
    },
    clearOverrides: () => {
      try {
        for (const key of CLIENT_FLAG_KEYS) {
          localStorage.removeItem(`${FLAG_PREFIX}${key}`);
        }
      } catch {
        // localStorage may be unavailable
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
