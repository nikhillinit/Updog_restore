import { useState, useEffect } from 'react';
import React from 'react';
import featureConfig from '../config/features.json';

type FeatureFlagName = keyof typeof featureConfig;

/**
 * Hook to check if a feature flag is enabled
 * @param flagName - The name of the feature flag
 * @param defaultValue - Default value if flag is not found
 * @returns boolean indicating if the feature is enabled
 */
export function useFeatureFlag(flagName: FeatureFlagName, defaultValue = false): boolean {
  const [isEnabled, setIsEnabled] = useState(defaultValue);

  useEffect(() => {
    // Check environment variable override first
    const envOverride = import.meta.env[`VITE_FEATURE_${flagName.toUpperCase().replace(/-/g, '_')}`];
    if (envOverride !== undefined) {
      setIsEnabled(envOverride === 'true');
      return;
    }

    // Check config file
    const flagConfig = featureConfig[flagName];
    if (flagConfig) {
      setIsEnabled(flagConfig.enabled);
    } else {
      setIsEnabled(defaultValue);
    }
  }, [flagName, defaultValue]);

  return isEnabled;
}

/**
 * Get all feature flags and their status
 * @returns Object with all feature flags and their enabled status
 */
export function useAllFeatureFlags(): Record<FeatureFlagName, boolean> {
  const [flags, setFlags] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const allFlags: Record<string, boolean> = {};
    
    Object.keys(featureConfig).forEach((key) => {
      const flagName = key as FeatureFlagName;
      const envOverride = import.meta.env[`VITE_FEATURE_${flagName.toUpperCase().replace(/-/g, '_')}`];
      
      if (envOverride !== undefined) {
        allFlags[flagName] = envOverride === 'true';
      } else {
        allFlags[flagName] = featureConfig[flagName].enabled;
      }
    });
    
    setFlags(allFlags);
  }, []);

  return flags as Record<FeatureFlagName, boolean>;
}

/**
 * Component wrapper that only renders children if feature flag is enabled
 */
export function FeatureFlag({ 
  flag, 
  children, 
  fallback = null 
}: { 
  flag: FeatureFlagName;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const isEnabled = useFeatureFlag(flag);
  
  if (isEnabled) {
    return React.createElement(React.Fragment, null, children);
  }
  
  return React.createElement(React.Fragment, null, fallback);
}