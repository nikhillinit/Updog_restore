import React, { createContext, useContext, useMemo } from 'react';

/**
 * Feature flag configuration for gradual rollouts and A/B testing
 */
export interface FeatureFlags {
  // Environment flags
  isProduction: boolean;
  isStaging: boolean;
  isDevelopment: boolean;

  // Feature flags for Iteration A: Deterministic Engine
  deterministicEngineV1: boolean;
  scenarioManagementV1: boolean;

  // Future iteration flags (disabled by default)
  advancedAnalyticsV2: boolean;
  aiInsightsV2: boolean;
}

/**
 * Determines the current environment based on VITE_ENV and hostname
 * Priority: VITE_ENV > hostname detection
 */
function getEnvironment(): 'development' | 'staging' | 'production' {
  // Check explicit environment variable first
  const viteEnv = import.meta.env.VITE_ENV;
  if (viteEnv === 'production') return 'production';
  if (viteEnv === 'staging') return 'staging';
  if (viteEnv === 'development') return 'development';

  // Fallback to hostname detection
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;

    // Production domains
    if (hostname === 'updog.pressonventures.com' || hostname.includes('vercel.app')) {
      return 'production';
    }

    // Staging domains
    if (hostname.includes('staging') || hostname.includes('preview')) {
      return 'staging';
    }
  }

  // Default to development
  return 'development';
}

/**
 * Get feature flags based on current environment
 */
function getFeatureFlags(): FeatureFlags {
  const environment = getEnvironment();

  const baseFlags: FeatureFlags = {
    // Environment detection
    isProduction: environment === 'production',
    isStaging: environment === 'staging',
    isDevelopment: environment === 'development',

    // Iteration A features (gradual rollout)
    deterministicEngineV1: false,
    scenarioManagementV1: false,

    // Future features (disabled everywhere)
    advancedAnalyticsV2: false,
    aiInsightsV2: false,
  };

  // Enable features based on environment
  if (environment === 'development') {
    // All features enabled in development
    return {
      ...baseFlags,
      deterministicEngineV1: true,
      scenarioManagementV1: true,
    };
  }

  if (environment === 'staging') {
    // Iteration A features enabled in staging for testing
    return {
      ...baseFlags,
      deterministicEngineV1: true,
      scenarioManagementV1: true,
    };
  }

  // Production: features disabled by default (manual rollout control)
  return baseFlags;
}

export interface FeatureFlagContextValue {
  flags: FeatureFlags;
  isFeatureEnabled: (feature: keyof FeatureFlags) => boolean;
}

const FeatureFlagContext = createContext<FeatureFlagContextValue | null>(null);

/**
 * Provider component for feature flags
 * Memoized to prevent unnecessary re-renders
 */
export function FeatureFlagProvider({ children }: { children: React.ReactNode }) {
  const flags = getFeatureFlags();

  const value = useMemo<FeatureFlagContextValue>(() => ({
    flags,
    isFeatureEnabled: (feature: keyof FeatureFlags) => Boolean(flags[feature]),
  }), [flags]);

  return (
    <FeatureFlagContext.Provider value={value}>
      {children}
    </FeatureFlagContext.Provider>
  );
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
