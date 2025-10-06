/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
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

const DEFAULTS: RuntimeConfig = {
  flags: {
    useFundStore: {
      enabled: true,
      rollout: Number((import.meta as any).env?.VITE_USE_FUND_STORE_ROLLOUT ?? 10),
    },
  },
  thresholds: {
    errorScore: Number((import.meta as any).env?.VITE_ERROR_SCORE_THRESHOLD ?? 15),
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
  ((import.meta as any).env?.VITE_RUNTIME_CONFIG_URL as string | undefined) ||
  // local fallback served by your SPA
  '/runtime-config.json';

let cache: { cfg: RuntimeConfig; at: number } = { cfg: DEFAULTS, at: 0 };
const TTL_MS = 60_000;

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

    cache = { cfg: merged, at: now };
    window.dispatchEvent(new CustomEvent('runtime-config:update', { detail: merged }));
    return merged;
  } catch {
    // Fail safe to defaults on any error
    cache = { cfg: DEFAULTS, at: now };
    return DEFAULTS;
  }
}

export function subscribeRuntimeConfig(cb: (_cfg: RuntimeConfig) => void) {
  const handler = (e: Event) => { cb((e as CustomEvent<RuntimeConfig>).detail); };
  window.addEventListener('runtime-config:update', handler);
  return () => window.removeEventListener('runtime-config:update', handler);
}

