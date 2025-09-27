/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
/**
 * Deterministic feature rollout with stable user bucketing
 * 
 * Uses FNV-1a hash for fast, collision-resistant bucketing
 * Each user gets a stable bucket (0-99) based on their persistent UUID
 * 
 * Usage:
 * - inRollout('USE_FUND_STORE', 100) // 100% rollout
 * - inRollout('USE_FUND_STORE', 25)  // 25% rollout
 * - VITE_USE_FUND_STORE_ROLLOUT=50   // 50% via env var
 */

/**
 * Fast FNV-1a hash implementation
 * Returns deterministic 32-bit hash for consistent bucketing
 */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0); // Convert to unsigned 32-bit
}

/**
 * Get or create a stable user ID for consistent bucketing
 * Stored in localStorage, persists across sessions
 */
function stableUserId(): string {
  const KEY = '__uid';
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      // Try crypto.randomUUID() first, fallback for older browsers
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        id = crypto.randomUUID();
      } else {
        // Fallback UUID v4 generation for older browsers
        id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      }
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch (e) {
    // Fallback for environments without localStorage/crypto
    console.warn('Unable to create stable user ID, using session fallback');
    return `session-${  Math.random().toString(36).substring(2, 15)}`;
  }
}

/**
 * Check if user is in a feature rollout
 * 
 * @param featureEnvName - Environment variable name (without VITE_ prefix)
 * @param defaultPct - Default percentage if env var not set (0-100)
 * @returns true if user should see the feature
 */
export function inRollout(featureEnvName: string, defaultPct = 100): boolean {
  try {
    // Get rollout percentage from environment
    const envKey = `VITE_${featureEnvName}_ROLLOUT`;
    const envValue = (import.meta as any).env?.[envKey];
    const pct = Number(envValue ?? defaultPct);
    
    // Validate percentage
    if (isNaN(pct) || pct < 0 || pct > 100) {
      console.warn(`Invalid rollout percentage for ${envKey}: ${envValue}, using default: ${defaultPct}%`);
      return defaultPct >= 100;
    }
    
    // Everyone gets 100% rollout
    if (pct >= 100) return true;
    if (pct <= 0) return false;
    
    // Deterministic bucketing based on stable user ID
    const userId = stableUserId();
    const bucket = fnv1a(userId + featureEnvName) % 100;
    
    return bucket < pct;
  } catch (e) {
    console.warn(`Rollout check failed for ${featureEnvName}:`, e);
    return defaultPct >= 100; // Fail open to default
  }
}

/**
 * Get user's bucket for debugging (0-99)
 */
export function getUserBucket(featureEnvName: string): number {
  try {
    const userId = stableUserId();
    return fnv1a(userId + featureEnvName) % 100;
  } catch (e) {
    return -1; // Error state
  }
}

/**
 * Debug helper - shows rollout status for all features
 */
export function debugRollouts() {
  const userId = stableUserId();
  const features = ['USE_FUND_STORE', 'USE_FUND_STORE_VALIDATION', 'USE_FUND_STORE_TELEMETRY'];
  
  console.table(
    features.reduce((acc, feature) => {
      const envKey = `VITE_${feature}_ROLLOUT`;
      const envValue = (import.meta as any).env?.[envKey];
      const bucket = getUserBucket(feature);
      const inFeature = inRollout(feature);
      
      acc[feature] = {
        userId: `${userId.substring(0, 8)  }...`,
        bucket,
        rolloutPct: envValue || 'default',
        enabled: inFeature
      };
      return acc;
    }, {} as Record<string, any>)
  );
}

// Development helper - expose to window
if ((import.meta as any).env?.NODE_ENV === 'development') {
  if (typeof window !== 'undefined') {
    (window as any).__rollouts = { 
      inRollout, 
      getUserBucket, 
      debugRollouts,
      stableUserId: () => `${stableUserId().substring(0, 8)  }...` // Masked for privacy
    };
  }
}

