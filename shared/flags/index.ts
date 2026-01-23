/**
 * Unified Feature Flag System
 *
 * Server-side utilities for feature flag resolution.
 * For client-side, use: import { useFlag, getFlag } from '@/hooks/useUnifiedFlag'
 */

export { getFlag, getAllFlags, isFlagEnabled, getFlagDefinition, getFlagDefault } from './getFlag.js';

export type { FlagKey, FlagRecord } from '../generated/flag-types.js';
export { ALL_FLAG_KEYS, CLIENT_FLAG_KEYS, ADMIN_FLAG_KEYS, isFlagKey, isClientFlag, isAdminFlag } from '../generated/flag-types.js';
export { FLAG_DEFINITIONS, FLAG_DEFAULTS, FLAG_ALIASES, resolveAlias } from '../generated/flag-defaults.js';
