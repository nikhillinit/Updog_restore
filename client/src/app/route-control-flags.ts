import { useMemo } from 'react';
import { ALL_FLAG_KEYS, type FlagKey } from '@shared/generated/flag-types';
import { FLAG_DEFINITIONS, resolveFlagWithDependencies } from '@shared/generated/flag-defaults';
import type { RouteControlFlag } from '@shared/routes/app-route-definitions';

export type { RouteControlFlag } from '@shared/routes/app-route-definitions';
export type AdminRouteFlag = 'ui_catalog';

type RuntimeEnvironment = 'development' | 'staging' | 'production';

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

function parseBoolean(value: string | null | undefined): boolean | undefined {
  if (value == null) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return undefined;
}

function getEnvOverride(flag: FlagKey): boolean | undefined {
  const aliases = FLAG_DEFINITIONS[flag].aliases ?? [];
  const envKeys = new Set<string>([
    ...aliases.map((alias) => `VITE_${alias}`),
    `VITE_${flag.toUpperCase()}`,
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

function baseFlagState(flag: FlagKey): boolean {
  const env = getRuntimeEnvironment();
  const override = env === 'development' ? getEnvOverride(flag) : undefined;
  if (override !== undefined) {
    return override;
  }

  return FLAG_DEFINITIONS[flag].environments[env] ?? FLAG_DEFINITIONS[flag].default;
}

function resolveRouteControlStates(): Record<RouteControlFlag, boolean> {
  const states = {} as Record<FlagKey, boolean>;
  for (const flag of ALL_FLAG_KEYS) {
    states[flag] = baseFlagState(flag);
  }

  return {
    enable_lp_reporting: resolveFlagWithDependencies('enable_lp_reporting', states),
    onboarding_tour: resolveFlagWithDependencies('onboarding_tour', states),
    ui_catalog: resolveFlagWithDependencies('ui_catalog', states),
  };
}

export function resolveRouteControlFlag(flag: RouteControlFlag): boolean {
  return resolveRouteControlStates()[flag];
}

export function useRouteControlFlag(flag: RouteControlFlag): boolean {
  return useMemo(() => resolveRouteControlFlag(flag), [flag]);
}
