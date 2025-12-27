/**
 * Test state utilities for feature flags and rate limiting.
 */

import { MemoryStore, type Store } from 'express-rate-limit';
import type { FlagMap, FlagValue } from '../../server/lib/flags';
import { clearMockTokenRegistries } from './test-auth-helpers';

type TargetingConfig = NonNullable<FlagValue['targeting']>;
type TargetingRule = NonNullable<TargetingConfig['rules']>[number];

const DEFAULT_FLAGS: FlagMap = {
  'wizard.v1': { enabled: false, exposeToClient: true },
  'reserves.v1_1': { enabled: false, exposeToClient: false },
};

const featureFlagStates: Set<FeatureFlagState> = new Set();
const rateLimitStores: Set<Store> = new Set();

function cloneRule(rule: TargetingRule): TargetingRule {
  const value = rule.value;
  return {
    ...rule,
    value: Array.isArray(value) ? [...value] : value,
  };
}

function cloneTargeting(targeting: FlagValue['targeting']): FlagValue['targeting'] {
  if (!targeting) return undefined;
  const rules = targeting.rules ? targeting.rules.map(cloneRule) : undefined;
  const result: TargetingConfig = {};
  if (targeting.enabled !== undefined) result.enabled = targeting.enabled;
  if (rules) result.rules = rules;
  return result;
}

function cloneFlagConfig(config: FlagValue): FlagValue {
  const cloned: FlagValue = { enabled: config.enabled };
  if (config.exposeToClient !== undefined) {
    cloned.exposeToClient = config.exposeToClient;
  }
  if (config.targeting) {
    cloned.targeting = cloneTargeting(config.targeting);
  }
  return cloned;
}

function cloneFlagMap(flags: Record<string, FlagValue>): Record<string, FlagValue> {
  const output: Record<string, FlagValue> = {};
  for (const [key, value] of Object.entries(flags)) {
    output[key] = cloneFlagConfig(value);
  }
  return output;
}

function mergeTargeting(
  current: FlagValue['targeting'],
  updates: FlagValue['targeting']
): FlagValue['targeting'] {
  if (!current && !updates) return undefined;

  const enabled = updates?.enabled ?? current?.enabled;
  const rules = updates?.rules ?? current?.rules;

  if (enabled === undefined && !rules) return undefined;

  const merged: TargetingConfig = {};
  if (enabled !== undefined) merged.enabled = enabled;
  if (rules) merged.rules = rules.map(cloneRule);
  return merged;
}

function isPromise(value: unknown): value is Promise<unknown> {
  return typeof value === 'object' && value !== null && 'then' in value;
}

function resetRateLimitStore(store: Store): void {
  try {
    const result = store.resetAll?.();
    if (isPromise(result)) {
      void result;
    }
  } catch {
    // Ignore reset errors in test cleanup paths.
  }
}

/**
 * Feature flag config type aligned with server/lib/flags.ts.
 */
export type FeatureFlagConfig = FlagValue;

/**
 * In-memory feature flag registry for tests.
 */
export class FeatureFlagState {
  private registry = new Map<string, FeatureFlagConfig>();
  private defaults: Record<string, FeatureFlagConfig>;

  constructor(defaults: Record<string, FeatureFlagConfig> = DEFAULT_FLAGS) {
    this.defaults = cloneFlagMap(defaults);
    featureFlagStates.add(this);
    this.resetToDefaults();
  }

  /**
   * Reset all flags to the default registry.
   */
  resetToDefaults(): void {
    this.registry.clear();
    const defaults = cloneFlagMap(this.defaults);
    for (const [key, value] of Object.entries(defaults)) {
      this.registry.set(key, value);
    }
  }

  /**
   * Update (or create) a flag config in the registry.
   */
  setFlag(name: string, config: Partial<FeatureFlagConfig>): void {
    const existing = this.registry.get(name);
    const targeting = mergeTargeting(existing?.targeting, config.targeting);
    const exposeToClient = config.exposeToClient ?? existing?.exposeToClient;

    const merged: FeatureFlagConfig = {
      enabled: config.enabled ?? existing?.enabled ?? false,
      ...(exposeToClient !== undefined ? { exposeToClient } : {}),
      ...(targeting ? { targeting } : {}),
    };

    this.registry.set(name, cloneFlagConfig(merged));
  }

  /**
   * Fetch a single flag by name.
   */
  getFlag(name: string): FeatureFlagConfig | null {
    const flag = this.registry.get(name);
    return flag ? cloneFlagConfig(flag) : null;
  }

  /**
   * Return a snapshot of all flags.
   */
  getAllFlags(): Record<string, FeatureFlagConfig> {
    return cloneFlagMap(Object.fromEntries(this.registry.entries()));
  }
}

/**
 * Rate limit store utilities for tests.
 */
export class RateLimitState {
  /**
   * Create a fresh in-memory rate limit store.
   */
  createFreshStore(): Store {
    const store = new MemoryStore();
    rateLimitStores.add(store);
    return store;
  }

  /**
   * Clear an existing store.
   */
  resetStore(store: Store): void {
    resetRateLimitStore(store);
  }
}

/**
 * Reset feature flags and clear all registries between tests.
 */
export function resetAllState(): void {
  for (const state of featureFlagStates) {
    try {
      state.resetToDefaults();
    } catch {
      // Ignore reset errors in test cleanup paths.
    }
  }

  for (const store of rateLimitStores) {
    resetRateLimitStore(store);
  }

  clearMockTokenRegistries();
}
