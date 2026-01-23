/**
 * Unified Server-Side Flag Utility
 *
 * Single source of truth for server-side feature flag resolution.
 * Priority: env var > environment default > default
 */

import type { FlagKey, FlagRecord } from '../generated/flag-types.js';
import { FLAG_DEFINITIONS, FLAG_DEFAULTS } from '../generated/flag-defaults.js';
import { ALL_FLAG_KEYS } from '../generated/flag-types.js';

const ENV_PREFIX = '';

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
 * Get environment variable value
 */
function getEnvValue(key: FlagKey): boolean | null {
  const def = FLAG_DEFINITIONS[key];
  const aliases = def.aliases ?? [];

  // Try aliases first (for legacy env var names)
  for (const alias of aliases) {
    const value = process.env[alias];
    if (value !== undefined) {
      return parseBoolean(value);
    }
  }

  // Try UPPER_SNAKE_CASE version of key
  const standardKey = key.toUpperCase();
  const standardValue = process.env[standardKey];
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
  const env = (process.env['NODE_ENV'] || 'development') as 'development' | 'staging' | 'production';
  return def.environments[env] ?? def.default;
}

/**
 * Resolve a single flag value
 * Priority: env var > environment default > default
 */
export function getFlag(key: FlagKey): boolean {
  // 1. Environment variable
  const envValue = getEnvValue(key);
  if (envValue !== null) return envValue;

  // 2. Environment-specific default
  return getEnvironmentDefault(key);
}

/**
 * Resolve all flags
 */
export function getAllFlags(): FlagRecord {
  const result: Partial<FlagRecord> = {};
  for (const key of ALL_FLAG_KEYS) {
    result[key] = getFlag(key);
  }
  return result as FlagRecord;
}

/**
 * Check if a flag is enabled with dependency resolution
 */
export function isFlagEnabled(
  key: FlagKey,
  options?: { checkDependencies?: boolean }
): boolean {
  const value = getFlag(key);

  if (options?.checkDependencies && value) {
    const def = FLAG_DEFINITIONS[key];
    for (const dep of def.dependencies) {
      if (!isFlagEnabled(dep, { checkDependencies: true })) {
        return false;
      }
    }
  }

  return value;
}

/**
 * Get flag definition
 */
export function getFlagDefinition(key: FlagKey) {
  return FLAG_DEFINITIONS[key];
}

/**
 * Get default value for a flag
 */
export function getFlagDefault(key: FlagKey): boolean {
  return FLAG_DEFAULTS[key];
}

// Re-export types
export type { FlagKey, FlagRecord };
