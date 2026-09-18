import React, { createContext, useContext, useMemo } from 'react';
import { getClientRuntimeEnvironment } from '@/core/flags/unifiedClientFlags';

/**
 * Feature flag configuration for gradual rollouts and A/B testing
 */
export interface FeatureFlags {
  isProduction: boolean;
  isStaging: boolean;
  isDevelopment: boolean;
}

/**
 * Determines the current environment based on VITE_ENV and hostname
 * Priority: VITE_ENV > hostname detection
 */
/**
 * Get feature flags based on current environment
 */
function getFeatureFlags(): FeatureFlags {
  const environment = getClientRuntimeEnvironment();

  return {
    isProduction: environment === 'production',
    isStaging: environment === 'staging',
    isDevelopment: environment === 'development',
  };
}

export interface FeatureFlagContextValue {
  flags: FeatureFlags;
}

const FeatureFlagContext = createContext<FeatureFlagContextValue | null>(null);

/**
 * Provider component for feature flags
 * Memoized to prevent unnecessary re-renders
 */
export function FeatureFlagProvider({ children }: { children: React.ReactNode }) {
  const flags = getFeatureFlags();

  const value = useMemo<FeatureFlagContextValue>(() => ({ flags }), [flags]);

  return <FeatureFlagContext.Provider value={value}>{children}</FeatureFlagContext.Provider>;
}

/**
 * Hook to access all feature flags
 */
export function useFeatureFlags(): FeatureFlags {
  const context = useContext(FeatureFlagContext);
  if (!context) {
    throw new Error('useFeatureFlags must be used within FeatureFlagProvider');
  }
  return context.flags;
}

/**
 * Hook to check a specific feature flag
 * @param feature - The feature flag to check
 * @returns boolean indicating if the feature is enabled
 */
export function useFeature(feature: keyof FeatureFlags): boolean {
  const flags = useFeatureFlags();
  return flags[feature] as boolean;
}
