/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
/**
 * Runtime-configurable rollout with stable user bucketing
 * Integrates with runtime config for instant rollout percentage changes
 * 
 * Priority order:
 * 1. URL params (?ffuseFundStore=0|1 for hard override)
 * 2. localStorage (persistent override)  
 * 3. Emergency rollback flag (from runtime config)
 * 4. Runtime config rollout percentage
 * 5. Environment variable fallback
 */

import { getRuntimeConfig } from './runtime';

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
    return 'session-' + Math.random().toString(36).substring(2, 15);
  }
}

/**
 * Check runtime overrides (URL params, localStorage)
 */
function getRuntimeOverride(flagName: string): boolean | undefined {
  try {
    // Check URL params first (highest priority)
    const qp = new URLSearchParams(window.location.search).get(`ff_${flagName}`);
    if (qp === '0' || qp === '1') return qp === '1';
    
    // Check localStorage fallback
    const ls = localStorage.getItem(`ff_${flagName}`);
    if (ls === '0' || ls === '1') return ls === '1';
  } catch (e) {
    console.warn(`Runtime override check failed for ${flagName}:`, e);
  }
  return undefined;
}

/**
 * Check if user should see the fund store feature
 * Uses runtime config for instant rollout percentage changes
 */
export async function shouldUseFundStore(): Promise<boolean> {
  try {
    // 1. Check for runtime overrides first
    const override = getRuntimeOverride('useFundStore');
    if (override !== undefined) {
      console.log(`🎛️ FundStore override: ${override ? 'enabled' : 'disabled'}`);
      return override;
    }

    // 2. Get runtime configuration  
    const config = await getRuntimeConfig();
    
    // 3. Check emergency rollback
    if (config.killSwitches.emergencyRollback) {
      console.warn('🚨 Emergency rollback active - disabling FundStore');
      return false;
    }

    // 4. Check if feature is globally disabled
    const flag = config.flags.useFundStore;
    if (flag?.enabled === false) {
      console.log('⏸️ FundStore globally disabled in runtime config');
      return false;
    }

    // 5. Get rollout percentage from runtime config
    const rolloutPct = flag?.rollout ?? 100;
    
    // 6. Everyone gets 100% rollout
    if (rolloutPct >= 100) return true;
    if (rolloutPct <= 0) return false;
    
    // 7. Deterministic bucketing based on stable user ID
    const userId = stableUserId();
    const bucket = fnv1a(userId + 'USE_FUND_STORE') % 100;
    const inRollout = bucket < rolloutPct;
    
    console.log(`📊 FundStore rollout: ${rolloutPct}%, bucket: ${bucket}, enabled: ${inRollout}`);
    return inRollout;
    
  } catch (e) {
    console.warn('FundStore rollout check failed:', e);
    
    // Fallback to env var if runtime config fails
    const envValue = (import.meta as any).env?.VITE_USE_FUND_STORE;
    return envValue !== 'false'; // Default to true
  }
}

/**
 * Get user's bucket for debugging (0-99)
 */
export function getUserBucket(): number {
  try {
    const userId = stableUserId();
    return fnv1a(userId + 'USE_FUND_STORE') % 100;
  } catch (e) {
    return -1; // Error state
  }
}

/**
 * Debug helper - shows current rollout status
 */
export async function debugRuntimeRollout() {
  try {
    const config = await getRuntimeConfig();
    const override = getRuntimeOverride('useFundStore');
    const bucket = getUserBucket();
    const enabled = await shouldUseFundStore();
    const userId = stableUserId();
    
    console.table({
      'FundStore Rollout': {
        userId: userId.substring(0, 8) + '...',
        bucket,
        'runtime %': config.flags.useFundStore?.rollout ?? 'default',
        'url override': new URLSearchParams(window.location.search).get('ffuseFundStore') ?? 'none',
        'localStorage override': localStorage.getItem('ffuseFundStore') ?? 'none', 
        'emergency rollback': config.killSwitches.emergencyRollback,
        enabled
      }
    });
    
    return { config, override, bucket, enabled };
  } catch (e) {
    console.error('Debug rollout failed:', e);
  }
}

// Development helper - expose to window
if ((import.meta as any).env?.NODE_ENV === 'development') {
  if (typeof window !== 'undefined') {
    (window as any).__runtimeRollout = { 
      shouldUseFundStore, 
      getUserBucket, 
      debugRuntimeRollout 
    };
  }
}

