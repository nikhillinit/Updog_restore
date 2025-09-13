import { useEffect, useState } from 'react';

/**
 * SSR-safe feature flag hook with optional dev-only localStorage override
 * @param envKey - The Vite environment variable key
 * @param devKey - Optional localStorage key for dev-only override
 * @returns Boolean flag state
 */
export function useFlag(envKey: keyof ImportMetaEnv, devKey?: string): boolean {
  const envOn = (import.meta.env[envKey] ?? 'false') === 'true';
  const isDev = !!import.meta.env.DEV;

  const [on, setOn] = useState(envOn);

  useEffect(() => {
    if (!devKey || !isDev) return; // only honor dev override in dev builds
    try {
      const devOn = localStorage.getItem(devKey) === '1';
      if (envOn || devOn) setOn(true);
    } catch {
      // ignore private browsing / storage errors
    }
  }, [envOn, isDev, devKey]);

  return on;
}

/**
 * Analytics feature flag with dev override support
 */
export function useAnalyticsFlag(): boolean {
  return useFlag('VITE_FEATURE_ANALYTICS' as keyof ImportMetaEnv, 'dev.analytics');
}

/**
 * Waterfall feature flag (depends on analytics being enabled)
 */
export function useWaterfallFlag(): boolean {
  const analyticsEnabled = useAnalyticsFlag();
  const waterfallFlag = useFlag('VITE_FEATURE_WATERFALL' as keyof ImportMetaEnv, 'dev.waterfall');
  return analyticsEnabled && waterfallFlag;
}