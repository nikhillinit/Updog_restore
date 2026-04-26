// Legacy compatibility flags with localStorage override support.
// Generated registry defaults/env overrides come from flagAdapter.
// Route and admin exposure live in client/src/app/route-control-flags.ts.
import type { ClientFlagKey, FlagRecord } from '@shared/generated/flag-types';
import { resolveFlagWithDependencies } from '@shared/generated/flag-defaults';
import { getInitialFlagStates } from './flagAdapter';

function getLocalOverride(localStorageKey: string): boolean | undefined {
  if (typeof window !== 'undefined') {
    const lsValue = localStorage.getItem(localStorageKey);
    if (lsValue !== null) {
      return lsValue.toLowerCase() === 'true';
    }
  }

  return undefined;
}

function getFlag(flagKey: ClientFlagKey, localStorageKey: string): boolean {
  const states = getInitialFlagStates();
  const localOverride = getLocalOverride(localStorageKey);
  if (localOverride !== undefined) {
    states[flagKey] = localOverride;
  }

  return resolveFlagWithDependencies(flagKey, states as Partial<FlagRecord>);
}

export const FLAGS = {
  NEW_IA: getFlag('enable_new_ia', 'FF_NEW_IA'),
  ENABLE_SELECTOR_KPIS: getFlag('enable_kpi_selectors', 'FF_ENABLE_SELECTOR_KPIS'),
  ENABLE_MODELING_WIZARD: getFlag('enable_modeling_wizard', 'FF_ENABLE_MODELING_WIZARD'),
  ENABLE_OPERATIONS_HUB: getFlag('enable_operations_hub', 'FF_ENABLE_OPERATIONS_HUB'),
} as const;

export type Flags = typeof FLAGS;
