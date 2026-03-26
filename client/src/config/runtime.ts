// Lightweight runtime config with 60s TTL, env + URL overrides, and safe fallbacks.

type FlagSpec = {
  rollout?: number;      // 0..100
  enabled?: boolean;     // hard on/off
};

export type RuntimeConfig = {
  flags: {
    useFundStore?: FlagSpec;
  };
  thresholds: {
    errorScore?: number;           // e.g. 15
    consecutiveHighScore?: number; // e.g. 3
  };
  killSwitches: {
    emergencyRollback?: boolean;
  };
  telemetry: {
    // Reserved for future telemetry configuration
  };
  // optional: version string
  version?: string;
};

type ViteEnvValue = string | boolean | undefined;
type ViteEnvRecord = Record<string, ViteEnvValue>;

function getEnvRecord(): ViteEnvRecord {
  return import.meta.env as ViteEnvRecord;
}

function getNumberEnv(name: string, fallback: number): number {
  const value = getEnvRecord()[name];
  if (typeof value !== 'string') return fallback;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getStringEnv(name: string): string | undefined {
  const value = getEnvRecord()[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

const DEFAULTS: RuntimeConfig = {
  flags: {
    useFundStore: {
      enabled: true,
      rollout: getNumberEnv('VITE_USE_FUND_STORE_ROLLOUT', 10),
    },
  },
  thresholds: {
    errorScore: getNumberEnv('VITE_ERROR_SCORE_THRESHOLD', 15),
    consecutiveHighScore: 3,
  },
  killSwitches: {
    emergencyRollback: false,
  },
  telemetry: {
    // Reserved for future telemetry configuration
  },
  version: 'ev1',
};

const RUNTIME_URL =
  // optional remote URL for live edits (e.g., S3/GitHub raw)
  getStringEnv('VITE_RUNTIME_CONFIG_URL') ||
  // local fallback served by your SPA
  '/runtime-config.json';

let cache: { cfg: RuntimeConfig; at: number } = { cfg: DEFAULTS, at: 0 };
const TTL_MS = 60_000;

function updateCache(cfg: RuntimeConfig, at: number): RuntimeConfig {
  cache = { cfg, at };
  return cfg;
}

function emitRuntimeConfigUpdate(cfg: RuntimeConfig): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<RuntimeConfig>('runtime-config:update', { detail: cfg }));
}

export async function getRuntimeConfig(force = false): Promise<RuntimeConfig> {
  const now = Date.now();
  if (!force && now - cache.at < TTL_MS) return cache.cfg;

  try {
    // Always attempt a fresh fetch; bust CDN caches if needed
    const res = await fetch(`${RUNTIME_URL}?t=${now}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as Partial<RuntimeConfig>;

    // Merge shallowly with defaults
    const merged: RuntimeConfig = {
      ...DEFAULTS,
      ...json,
      flags: { ...DEFAULTS.flags, ...(json.flags ?? {}) },
      thresholds: { ...DEFAULTS.thresholds, ...(json.thresholds ?? {}) },
      killSwitches: { ...DEFAULTS.killSwitches, ...(json.killSwitches ?? {}) },
      telemetry: {},
    };

    emitRuntimeConfigUpdate(merged);
    return updateCache(merged, now);
  } catch {
    // Fail safe to defaults on any error
    return updateCache(DEFAULTS, now);
  }
}

export function subscribeRuntimeConfig(cb: (_cfg: RuntimeConfig) => void) {
  if (typeof window === 'undefined') return () => {};

  const handler = (event: Event) => {
    cb((event as CustomEvent<RuntimeConfig>).detail);
  };
  window.addEventListener('runtime-config:update', handler);
  return () => window.removeEventListener('runtime-config:update', handler);
}
