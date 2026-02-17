/**
 * Unified client-side feature flag runtime.
 *
 * Uses generated registry metadata as source-of-truth while preserving:
 * - userId-based rollout bucketing (legacy-compatible hash)
 * - URL/localStorage overrides for non-admin flags
 * - force_reserves_engine override behavior
 * - kill-switch meta tag polling safety net
 */

import {
  ADMIN_FLAG_KEYS,
  CLIENT_FLAG_KEYS,
  type ClientFlagKey,
  type FlagKey,
} from '@shared/generated/flag-types';
import {
  FLAG_DEFINITIONS,
  resolveAlias,
  resolveFlagWithDependencies,
} from '@shared/generated/flag-defaults';

type RuntimeEnvironment = 'development' | 'staging' | 'production';

const LEGACY_ALIAS_TO_CANONICAL: Record<string, ClientFlagKey> = {
  new_ia: 'enable_new_ia',
};

const CANONICAL_TO_LEGACY_ALIASES: Record<ClientFlagKey, string[]> = {
  enable_new_ia: ['new_ia'],
  enable_kpi_selectors: [],
  enable_brand_tokens: [],
  enable_modeling_wizard: [],
  enable_operations_hub: [],
  enable_lp_reporting: [],
  enable_reserve_engine: [],
  ts_reserves: [],
  wasm_reserves: [],
  shadow_compare: [],
  reserves_v11: [],
  remain_pass: [],
  stage_based_caps: [],
  export_async: [],
  metrics_collection: [],
  ui_catalog: [],
  onboarding_tour: [],
  enable_wizard_step_general: [],
  enable_wizard_step_sizing: [],
  enable_wizard_step_pacing: [],
  enable_wizard_step_reserves: [],
  enable_wizard_step_fees: [],
  enable_wizard_step_waterfall: [],
  enable_wizard_step_results: [],
};

const overrideCache = new Map<ClientFlagKey, boolean>();

function getRuntimeEnvironment(): RuntimeEnvironment {
  const explicit = String(import.meta.env['VITE_ENV'] ?? '').toLowerCase();
  if (explicit === 'production' || explicit === 'staging' || explicit === 'development') {
    return explicit;
  }

  const mode = String(import.meta.env['MODE'] ?? '').toLowerCase();
  if (mode === 'production') return 'production';
  if (mode === 'staging') return 'staging';

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'updog.pressonventures.com' || host.includes('vercel.app')) return 'production';
    if (host.includes('staging') || host.includes('preview')) return 'staging';
  }

  return 'development';
}

function isAdminFlag(key: ClientFlagKey): boolean {
  return ADMIN_FLAG_KEYS.includes(key as (typeof ADMIN_FLAG_KEYS)[number]);
}

function parseBooleanOverride(raw: string | null): boolean | undefined {
  if (!raw) return undefined;
  const lowered = raw.toLowerCase();
  if (lowered === '1' || lowered === 'true') return true;
  if (lowered === '0' || lowered === 'false') return false;
  return undefined;
}

function getSearchParams(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

function resolveClientFlagKey(flag: string): ClientFlagKey | undefined {
  if (!flag) return undefined;
  const direct = resolveAlias(flag);
  const mapped = direct ?? LEGACY_ALIAS_TO_CANONICAL[flag];
  if (!mapped) return undefined;

  if (!CLIENT_FLAG_KEYS.includes(mapped as ClientFlagKey)) return undefined;
  return mapped as ClientFlagKey;
}

function baseFlagState(flag: ClientFlagKey): boolean {
  const env = getRuntimeEnvironment();
  return FLAG_DEFINITIONS[flag].environments[env] ?? FLAG_DEFINITIONS[flag].default;
}

function resolvedFlagState(flag: ClientFlagKey): boolean {
  const states: Partial<Record<FlagKey, boolean>> = {};
  for (const key of CLIENT_FLAG_KEYS) {
    states[key] = overrideCache.has(key) ? overrideCache.get(key)! : baseFlagState(key);
  }
  return resolveFlagWithDependencies(flag, states);
}

function readOverride(flag: ClientFlagKey, originalFlag: string): boolean | undefined {
  if (isAdminFlag(flag)) return undefined;

  const params = getSearchParams();
  const keys = new Set<string>([
    `ff_${flag}`,
    `ff_${originalFlag}`,
    ...CANONICAL_TO_LEGACY_ALIASES[flag].map((alias) => `ff_${alias}`),
  ]);

  for (const key of keys) {
    const override = parseBooleanOverride(params.get(key));
    if (override !== undefined) return override;
  }

  if (typeof localStorage === 'undefined') return undefined;
  for (const key of keys) {
    const override = parseBooleanOverride(localStorage.getItem(key));
    if (override !== undefined) return override;
  }

  return undefined;
}

function applyEngineOverride(flag: ClientFlagKey): boolean | undefined {
  const params = getSearchParams();
  const mode = params.get('force_reserves_engine');
  if (!mode) return undefined;

  if (flag === 'ts_reserves') {
    if (mode === 'ts') return true;
    if (mode === 'wasm') return false;
  }
  if (flag === 'wasm_reserves') {
    if (mode === 'wasm') return true;
    if (mode === 'ts') return false;
  }
  return undefined;
}

export function computeLegacyUserHash(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash &= hash;
  }
  return Math.abs(hash);
}

export function computeLegacyUserBucket(userId: string): number {
  return computeLegacyUserHash(userId) % 100;
}

export function isUnifiedFlagEnabled(flag: string, userId?: string): boolean {
  const resolved = resolveClientFlagKey(flag);
  if (!resolved) {
    console.warn(`Unknown feature flag: ${flag}`);
    return false;
  }

  const engineOverride = applyEngineOverride(resolved);
  if (engineOverride !== undefined) return engineOverride;

  const explicitOverride = readOverride(resolved, flag);
  if (explicitOverride !== undefined) return explicitOverride;

  const enabled = resolvedFlagState(resolved);
  if (!enabled) return false;

  if (userId) {
    const rollout = FLAG_DEFINITIONS[resolved].rolloutPercentage;
    if (typeof rollout === 'number' && rollout >= 0 && rollout < 100) {
      return computeLegacyUserBucket(userId) < rollout;
    }
  }

  return enabled;
}

export function setUnifiedFlag(flag: string, value: boolean): void {
  const resolved = resolveClientFlagKey(flag);
  if (!resolved) {
    console.warn(`Unknown feature flag: ${flag}`);
    return;
  }
  if (isAdminFlag(resolved)) {
    console.warn(`Flag ${resolved} does not allow client overrides`);
    return;
  }

  overrideCache.set(resolved, value);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(`ff_${resolved}`, String(value));
  }
}

export function killUnifiedFlag(flag: string): void {
  setUnifiedFlag(flag, false);

  if (
    typeof navigator === 'undefined' ||
    !navigator.sendBeacon ||
    typeof document === 'undefined'
  ) {
    return;
  }

  const killSwitchUrl = document
    .querySelector('meta[name="kill-switch-url"]')
    ?.getAttribute('content');
  if (!killSwitchUrl) return;

  navigator.sendBeacon(killSwitchUrl, JSON.stringify({ flag, action: 'kill' }));
}

if (typeof window !== 'undefined') {
  setInterval(() => {
    const meta = document.querySelector('meta[name="kill-switch-flags"]');
    if (!meta) return;

    const flags =
      meta
        .getAttribute('content')
        ?.split(',')
        .map((f) => f.trim())
        .filter(Boolean) ?? [];
    for (const flag of flags) {
      killUnifiedFlag(flag);
    }
  }, 30000);
}
