/**
 * FEATURE FLAG ADAPTER
 *
 * Maps lightweight Vite ENV flags to comprehensive flag system.
 * Single source of truth: flags/registry.yaml -> shared/generated/flag-defaults.ts
 *
 * This adapter allows starter kit components to work while
 * maintaining our dependency-aware, rollout-ready flag system.
 */

import {
  CLIENT_FLAG_KEYS,
  type ClientFlagKey,
  type FlagKey as GeneratedFlagKey,
  type FlagRecord,
} from '@shared/generated/flag-types';
import { FLAG_DEFINITIONS, resolveFlagWithDependencies } from '@shared/generated/flag-defaults';

type LegacyCompatibilityFlagKey =
  | 'enable_wizard_step_sectors'
  | 'enable_wizard_step_allocations'
  | 'enable_wizard_step_recycling'
  | 'enable_route_redirects'
  | 'enable_observability';

export type FlagKey = GeneratedFlagKey | LegacyCompatibilityFlagKey;

const LEGACY_FLAG_MAP: Partial<Record<LegacyCompatibilityFlagKey, ClientFlagKey>> = {
  enable_wizard_step_sectors: 'enable_wizard_step_sizing',
  enable_wizard_step_allocations: 'enable_wizard_step_reserves',
  enable_wizard_step_recycling: 'enable_wizard_step_waterfall',
};

type RuntimeEnvironment = 'development' | 'staging' | 'production';

// ============================================================================
// ENV FLAG → COMPREHENSIVE FLAG MAPPING
// ============================================================================

/**
 * Initialize flag states from Vite environment variables.
 * Falls back to generated environment defaults if env vars are absent.
 */
export function getInitialFlagStates(): Record<string, boolean> {
  const states: Record<string, boolean> = {};

  for (const key of CLIENT_FLAG_KEYS) {
    states[key] = resolveBaseFlag(key);
  }

  for (const [legacyKey, canonicalKey] of Object.entries(LEGACY_FLAG_MAP)) {
    states[legacyKey] = states[canonicalKey] ?? false;
  }

  states['enable_brand_tokens'] = true; // Always on (non-breaking CSS).
  states['enable_route_redirects'] = false;
  states['enable_observability'] = false;

  return states;
}

/**
 * Check if a flag is enabled (respects dependencies)
 * NOTE: This is a React Hook and must be called inside a component or custom hook
 */
export function useFeatureFlag(flagKey: FlagKey): boolean {
  const flagStates = getInitialFlagStates();
  return isFlagEnabled(flagKey, flagStates);
}

/**
 * Simple ENV-based flags for starter kit components
 * These are computed once at module load time (not reactive)
 * For reactive flags in components, use useFeatureFlag() hook instead
 */
const flagStates = getInitialFlagStates();
export const FLAGS = {
  NEW_IA: isFlagEnabled('enable_new_ia', flagStates),
  ENABLE_SELECTOR_KPIS: isFlagEnabled('enable_kpi_selectors', flagStates),
  ENABLE_MODELING_WIZARD: isFlagEnabled('enable_modeling_wizard', flagStates),
  ENABLE_OPERATIONS_HUB: isFlagEnabled('enable_operations_hub', flagStates),
  ENABLE_LP_REPORTING: isFlagEnabled('enable_lp_reporting', flagStates),
} as const;

/**
 * Export for direct access in components
 */
export function isFlagEnabled(flagKey: FlagKey, flagStates: Record<string, boolean>): boolean {
  const canonicalKey = toCanonicalClientFlag(flagKey);
  if (!canonicalKey) {
    return flagStates[flagKey] ?? false;
  }

  return resolveFlagWithDependencies(canonicalKey, flagStates as Partial<FlagRecord>);
}

function toCanonicalClientFlag(flagKey: FlagKey): ClientFlagKey | null {
  if (CLIENT_FLAG_KEYS.includes(flagKey as ClientFlagKey)) {
    return flagKey as ClientFlagKey;
  }

  return LEGACY_FLAG_MAP[flagKey as LegacyCompatibilityFlagKey] ?? null;
}

function resolveBaseFlag(key: ClientFlagKey): boolean {
  const envOverride = getEnvOverride(key);
  if (envOverride !== undefined) {
    return envOverride;
  }

  const definition = FLAG_DEFINITIONS[key];
  return definition.environments[getRuntimeEnvironment()] ?? definition.default;
}

function getEnvOverride(key: ClientFlagKey): boolean | undefined {
  const definition = FLAG_DEFINITIONS[key];
  const envKeys = new Set<string>([
    ...(definition.aliases ?? []).map((alias) => `VITE_${alias}`),
    `VITE_${key.toUpperCase()}`,
  ]);

  for (const envKey of envKeys) {
    const raw = import.meta.env[envKey] as string | undefined;
    const parsed = parseBoolean(raw);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

function parseBoolean(raw: string | undefined): boolean | undefined {
  if (raw == null || raw === '') return undefined;
  const normalized = raw.toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return undefined;
}

function getRuntimeEnvironment(): RuntimeEnvironment {
  const explicit = String(import.meta.env['VITE_ENV'] ?? '').toLowerCase();
  if (explicit === 'production' || explicit === 'staging' || explicit === 'development') {
    return explicit;
  }

  const mode = String(import.meta.env['MODE'] ?? '').toLowerCase();
  if (mode === 'production') return 'production';
  if (mode === 'staging') return 'staging';
  return 'development';
}
