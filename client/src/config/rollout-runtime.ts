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
  return h >>> 0; // Convert to unsigned 32-bit
}

/**
 * Get cryptographically secure random bytes using Web Crypto API.
 */
function getSecureRandomBytes(length: number): Uint8Array {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  }
  throw new Error('Secure randomness not available');
}

/**
 * Generate UUID v4 using cryptographically secure randomness.
 */
function secureUuidV4Fallback(): string {
  const bytes = getSecureRandomBytes(16);
  // Per RFC 4122 section 4.4
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10xx

  const hex: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    hex.push(bytes[i].toString(16).padStart(2, '0'));
  }

  return (
    hex[0] +
    hex[1] +
    hex[2] +
    hex[3] +
    '-' +
    hex[4] +
    hex[5] +
    '-' +
    hex[6] +
    hex[7] +
    '-' +
    hex[8] +
    hex[9] +
    '-' +
    hex[10] +
    hex[11] +
    hex[12] +
    hex[13] +
    hex[14] +
    hex[15]
  );
}

/**
 * Generate a session identifier suffix without Math.random().
 */
function secureSessionIdSuffix(): string {
  try {
    const bytes = getSecureRandomBytes(9); // 72 bits of entropy
    const hex: string[] = [];
    for (let i = 0; i < bytes.length; i++) {
      hex.push(bytes[i].toString(16).padStart(2, '0'));
    }
    return hex.join('');
  } catch {
    // Last-resort fallback for environments without crypto APIs
    const now = Date.now().toString(36);
    const extra = (typeof performance !== 'undefined' ? performance.now() : 0).toString(36);
    return `${now}-${extra}`;
  }
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
        // Fallback UUID v4 generation for older browsers using secure randomness
        id = secureUuidV4Fallback();
      }
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // Fallback for environments without localStorage/crypto
    console.warn('Unable to create stable user ID, using session fallback');
    return `session-${secureSessionIdSuffix()}`;
  }
}

/**
 * Check runtime overrides (URL params, localStorage)
 */
function getRuntimeOverride(flagName: string): boolean | undefined {
  try {
    // Check URL params first (highest priority)
    const qp = new URLSearchParams(window.location.search)['get'](`ff_${flagName}`);
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
      return override;
    }

    // 2. Get runtime configuration
    const config = await getRuntimeConfig();

    // 3. Check emergency rollback
    if (config.killSwitches.emergencyRollback) {
      console.warn('[CRITICAL] Emergency rollback active - disabling FundStore');
      return false;
    }

    // 4. Check if feature is globally disabled
    const flag = config.flags.useFundStore;
    if (flag?.enabled === false) {
      return false;
    }

    // 5. Get rollout percentage from runtime config
    const rolloutPct = flag?.rollout ?? 100;

    // 6. Everyone gets 100% rollout
    if (rolloutPct >= 100) return true;
    if (rolloutPct <= 0) return false;

    // 7. Deterministic bucketing based on stable user ID
    const userId = stableUserId();
    const bucket = fnv1a(`${userId}USE_FUND_STORE`) % 100;
    const inRollout = bucket < rolloutPct;
    return inRollout;
  } catch (e) {
    console.warn('FundStore rollout check failed:', e);

    // Fallback to env var if runtime config fails
    const envValue = import.meta.env['VITE_USE_FUND_STORE'];
    return envValue !== 'false'; // Default to true
  }
}

/**
 * Get user's bucket for debugging (0-99)
 */
export function getUserBucket(): number {
  try {
    const userId = stableUserId();
    return fnv1a(`${userId}USE_FUND_STORE`) % 100;
  } catch {
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

    return {
      config,
      override,
      bucket,
      enabled,
      userId: `${userId.substring(0, 8)}...`,
      runtimeRollout: config.flags.useFundStore?.rollout ?? 'default',
      urlOverride: new URLSearchParams(window.location.search)['get']('ffuseFundStore') ?? 'none',
      localStorageOverride: localStorage.getItem('ffuseFundStore') ?? 'none',
      emergencyRollback: config.killSwitches.emergencyRollback,
    };
  } catch (e) {
    console.error('Debug rollout failed:', e);
  }
}

// Development helper - expose to window
if (import.meta.env.DEV) {
  if (typeof window !== 'undefined') {
    const debugWindow = window as Window & {
      __runtimeRollout?: {
        shouldUseFundStore: typeof shouldUseFundStore;
        getUserBucket: typeof getUserBucket;
        debugRuntimeRollout: typeof debugRuntimeRollout;
      };
    };
    debugWindow.__runtimeRollout = {
      shouldUseFundStore,
      getUserBucket,
      debugRuntimeRollout,
    };
  }
}
