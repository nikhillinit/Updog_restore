/* eslint-disable @typescript-eslint/no-explicit-any */
 
 
 
 
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
      } else if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        // Fallback UUID v4 generation using crypto.getRandomValues for older browsers
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        // Per RFC 4122 section 4.4
        bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
        bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
        const hex: string[] = [];
        for (let i = 0; i < bytes.length; i++) {
          hex.push(bytes[i].toString(16).padStart(2, '0'));
        }
        id = [
          hex.slice(0, 4).join(''),
          hex.slice(4, 6).join(''),
          hex.slice(6, 8).join(''),
          hex.slice(8, 10).join(''),
          hex.slice(10, 16).join(''),
        ].join('-');
      } else {
        // Last-resort fallback without crypto: time-based identifier
        const now = Date.now().toString(16);
        const randLike = (typeof performance !== 'undefined' ? performance.now() : 0).toString(16);
        id = `fallback-${now}-${randLike}`;
      }
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // Fallback for environments without localStorage/crypto
    console.warn('Unable to create stable user ID, using session fallback');
    const now = Date.now().toString(36);
    const extra = (typeof performance !== 'undefined' ? performance.now() : 0).toString(36);
    return `session-${now}-${extra}`;
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
    features.reduce((acc: any, feature: any) => {
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
