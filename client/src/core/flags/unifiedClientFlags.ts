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

export type RuntimeEnvironment = 'development' | 'staging' | 'production';

const LEGACY_ALIAS_TO_CANONICAL: Record<string, ClientFlagKey> = {
  new_ia: 'enable_new_ia',
};

const CANONICAL_TO_LEGACY_ALIASES: Record<ClientFlagKey, string[]> = {
  enable_new_ia: ['new_ia'],
  enable_kpi_selectors: [],
  enable_brand_tokens: [],
  enable_cap_table_tabs: [],
  enable_modeling_wizard: [],
  enable_operations_hub: [],
  enable_investment_rounds: [],
  enable_lp_reporting: [],
  enable_lp_snapshot_mode: [],
  enable_planning_fmv_overrides: [],
  enable_reserve_engine: [],
  enable_portfolio_table_v2: [],
  enable_engine_integration: [],
  enable_gp_economics_engine: [],
  ts_reserves: [],
  wasm_reserves: [],
  shadow_compare: [],
  reserves_v11: [],
  remain_pass: [],
  stage_based_caps: [],
  export_async: [],
  metrics_collection: [],
  enable_pipeline_bulk_actions: [],
  enable_pipeline_dnd: [],
  enable_work_panel: [],
  enable_context_rail: [],
  enable_cash_event_object: [],
  enable_cash_event_edit: [],
  enable_route_redirects: [],
  enable_observability: [],
  ui_catalog: [],
  onboarding_tour: [],
  enable_wizard_step_general: [],
  enable_wizard_step_sectors: [],
  enable_wizard_step_allocations: [],
  enable_wizard_step_sizing: [],
  enable_wizard_step_pacing: [],
  enable_wizard_step_reserves: [],
  enable_wizard_step_fees: [],
  enable_wizard_step_recycling: [],
  enable_wizard_step_waterfall: [],
  enable_wizard_step_results: [],
  enable_scenario_seed_picker: [],
};

const overrideCache = new Map<ClientFlagKey, boolean>();

export function resolveClientRuntimeEnvironment(input: {
  explicit?: unknown;
  mode?: unknown;
  hostname?: string | undefined;
}): RuntimeEnvironment {
  const explicit = String(input.explicit ?? '').toLowerCase();
  if (explicit === 'production' || explicit === 'staging' || explicit === 'development') {
    return explicit;
  }

  const host = input.hostname;
  if (host) {
    if (host === 'updog.pressonventures.com') return 'production';
    if (host === 'staging.updog.pressonventures.com' || host.endsWith('.vercel.app')) {
      return 'staging';
    }
  }

  const mode = String(input.mode ?? '').toLowerCase();
  if (mode === 'production' || mode === 'staging' || mode === 'development') {
    return mode;
  }

  return 'development';
}

export function getClientRuntimeEnvironment(): RuntimeEnvironment {
  return resolveClientRuntimeEnvironment({
    explicit: import.meta.env['VITE_ENV'],
    mode: import.meta.env['MODE'],
    hostname: typeof window === 'undefined' ? undefined : window.location.hostname,
  });
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
  const envOverride = getEnvOverride(flag);
  if (envOverride !== undefined) return envOverride;

  const env = getClientRuntimeEnvironment();
  return FLAG_DEFINITIONS[flag].environments[env] ?? FLAG_DEFINITIONS[flag].default;
}

export function getUnifiedFlagBaseState(flag: ClientFlagKey): boolean {
  const engineOverride = applyEngineOverride(flag);
  if (engineOverride !== undefined) return engineOverride;
  return readOverride(flag, flag) ?? baseFlagState(flag);
}

function getEnvOverride(flag: ClientFlagKey): boolean | undefined {
  const aliases = FLAG_DEFINITIONS[flag].aliases ?? [];
  for (const envKey of [...aliases.map((alias) => `VITE_${alias}`), `VITE_${flag.toUpperCase()}`]) {
    const raw = import.meta.env[envKey] as string | undefined;
    const parsed = parseBooleanOverride(raw ?? null);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function resolvedFlagState(flag: ClientFlagKey): boolean {
  const states: Partial<Record<FlagKey, boolean>> = {};
  const allowOverrides = getClientRuntimeEnvironment() === 'development';
  for (const key of CLIENT_FLAG_KEYS) {
    states[key] =
      allowOverrides && overrideCache.has(key) ? overrideCache.get(key)! : baseFlagState(key);
  }
  return resolveFlagWithDependencies(flag, states);
}

function readOverride(flag: ClientFlagKey, originalFlag: string): boolean | undefined {
  if (isAdminFlag(flag)) return undefined;
  if (getClientRuntimeEnvironment() !== 'development') return undefined;

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
  if (getClientRuntimeEnvironment() !== 'development') {
    console.warn('Client feature flag overrides are disabled outside development');
    return;
  }

  overrideCache.set(resolved, value);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(`ff_${resolved}`, String(value));
  }
}

export function clearUnifiedFlagOverrides(): void {
  if (getClientRuntimeEnvironment() !== 'development') return;
  overrideCache.clear();
  if (typeof localStorage === 'undefined') return;
  for (const key of CLIENT_FLAG_KEYS) {
    localStorage.removeItem(`ff_${key}`);
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
