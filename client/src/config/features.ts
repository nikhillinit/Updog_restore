/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
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

const getRuntimeFlag = (flagName: string): boolean | undefined => {
  try {
    // Check query params first
    const qp = new URLSearchParams(window.location.search).get(`ff_${flagName}`);
    if (qp === '0' || qp === '1') return qp === '1';
    
    // Check localStorage fallback
    const ls = localStorage.getItem(`ff_${flagName}`);
    if (ls === '0' || ls === '1') return ls === '1';
  } catch (e) {
    // Safe fallback if localStorage/URL parsing fails
    console.warn(`Feature flag runtime check failed for ${flagName}:`, e);
  }
  return undefined;
};

const getEnvVar = (name: string): string | undefined => {
  try {
    return (import.meta as any).env?.[name];
  } catch {
    return undefined;
  }
};

export const features = {
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
export const debugFeatures = () => {
  console.table({
    useFundStore: {
      active: features.useFundStore,
      runtime: getRuntimeFlag('useFundStore') ?? 'not set',
      buildTime: getEnvVar('VITE_USE_FUND_STORE') ?? 'not set'
    }
  });
};

// Development helper - expose to window in dev mode
if (getEnvVar('NODE_ENV') === 'development' || getEnvVar('VITE_DEV') === 'true') {
  (window as any).__features = { features, debugFeatures };
}

