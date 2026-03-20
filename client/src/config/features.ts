/**
 * Feature flags with runtime + build-time controls
 * 
 * Runtime overrides (highest priority):
 * - Query param: ?ffuseFundStore=0|1
 * - LocalStorage: localStorage.setItem('ffuseFundStore', '0'|'1')
 * 
 * Build-time default:
 * - VITE_USE_FUND_STORE env var (defaults to true)
 */

interface FeatureFlags {
  useFundStore: boolean;
}

interface FeatureDebugSnapshot {
  useFundStore: {
    active: boolean;
    runtime: boolean | 'not set';
    buildTime: string | 'not set';
  };
}

interface WindowFeatureDebugApi {
  features: FeatureFlags;
  debugFeatures: () => FeatureDebugSnapshot;
}

declare global {
  interface Window {
    __features?: WindowFeatureDebugApi;
  }
}

const getRuntimeFlag = (flagName: string): boolean | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    // Check query params first
    const qp = new URLSearchParams(window.location.search).get(`ff_${flagName}`);
    if (qp === '0' || qp === '1') return qp === '1';
    
    // Check localStorage fallback
    const ls = window.localStorage.getItem(`ff_${flagName}`);
    if (ls === '0' || ls === '1') return ls === '1';
  } catch (e) {
    // Safe fallback if localStorage/URL parsing fails
    console.warn(`Feature flag runtime check failed for ${flagName}:`, e);
  }
  return undefined;
};

const getEnvVar = (name: string): string | undefined => {
  const value = (import.meta.env as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : undefined;
};

export const features: FeatureFlags = {
  /**
   * Use centralized FundStore vs legacy context
   * 
   * Kill switch:
   * - URL: ?ffuseFundStore=0
   * - Code: localStorage.setItem('ffuseFundStore', '0')
   */
  useFundStore:
    getRuntimeFlag('useFundStore') ??
    (getEnvVar('VITE_USE_FUND_STORE') !== 'false') // default true
};

/**
 * Helper for debugging feature flags
 */
export const debugFeatures = (): FeatureDebugSnapshot => {
  const snapshot: FeatureDebugSnapshot = {
    useFundStore: {
      active: features.useFundStore,
      runtime: getRuntimeFlag('useFundStore') ?? 'not set',
      buildTime: getEnvVar('VITE_USE_FUND_STORE') ?? 'not set'
    }
  };

  console.warn('Feature flag snapshot', snapshot);
  return snapshot;
};

// Development helper - expose to window in dev mode
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__features = { features, debugFeatures };
}
