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
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // Variant 10xx

  const hex: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    hex.push(bytes[i]!.toString(16).padStart(2, '0'));
  }

  return `${hex[0]! + hex[1]! + hex[2]! + hex[3]!}-${hex[4]!}${hex[5]!}-${hex[6]!}${hex[7]!}-${hex[8]!}${hex[9]!}-${hex[10]!}${hex[11]!}${hex[12]!}${hex[13]!}${hex[14]!}${hex[15]!}`;
}

/**
 * Generate a session identifier suffix without Math.random().
 */
function secureSessionIdSuffix(): string {
  try {
    const bytes = getSecureRandomBytes(9); // 72 bits of entropy
    const hex: string[] = [];
    for (let i = 0; i < bytes.length; i++) {
      hex.push(bytes[i]!.toString(16).padStart(2, '0'));
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

function getRolloutEnvValue(envKey: string): string | undefined {
  const env = import.meta.env as unknown as Record<string, unknown>;
  const envValue = env[envKey];
  return typeof envValue === 'string' ? envValue : undefined;
}

const rolloutFeatures = [
  'USE_FUND_STORE',
  'USE_FUND_STORE_VALIDATION',
  'USE_FUND_STORE_TELEMETRY',
] as const;

type RolloutFeature = (typeof rolloutFeatures)[number];

interface RolloutDebugEntry {
  userId: string;
  bucket: number;
  rolloutPct: string;
  enabled: boolean;
}

type RolloutDebugSnapshot = Record<RolloutFeature, RolloutDebugEntry>;

interface RolloutDebugApi {
  inRollout: typeof inRollout;
  getUserBucket: typeof getUserBucket;
  debugRollouts: typeof debugRollouts;
  stableUserId: () => string;
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
    const envValue = getRolloutEnvValue(envKey);
    const pct = Number(envValue ?? defaultPct);

    // Validate percentage
    if (isNaN(pct) || pct < 0 || pct > 100) {
      console.warn(
        `Invalid rollout percentage for ${envKey}: ${envValue}, using default: ${defaultPct}%`
      );
      return defaultPct >= 100;
    }

    // Everyone gets 100% rollout
    if (pct >= 100) return true;
    if (pct <= 0) return false;

    // Deterministic bucketing based on stable user ID
    const userId = stableUserId();
    const bucket = fnv1a(userId + featureEnvName) % 100;

    return bucket < pct;
  } catch (error) {
    console.warn(`Rollout check failed for ${featureEnvName}:`, error);
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
  } catch {
    return -1; // Error state
  }
}

/**
 * Debug helper - shows rollout status for all features
 */
export function debugRollouts(): RolloutDebugSnapshot {
  const userId = stableUserId();
  const snapshot = rolloutFeatures.reduce<RolloutDebugSnapshot>(
    (acc, feature) => {
      const envKey = `VITE_${feature}_ROLLOUT`;
      const envValue = getRolloutEnvValue(envKey);

      acc[feature] = {
        userId: `${userId.substring(0, 8)}...`,
        bucket: getUserBucket(feature),
        rolloutPct: envValue ?? 'default',
        enabled: inRollout(feature),
      };
      return acc;
    },
    {
      USE_FUND_STORE: {
        userId: '',
        bucket: -1,
        rolloutPct: 'default',
        enabled: false,
      },
      USE_FUND_STORE_VALIDATION: {
        userId: '',
        bucket: -1,
        rolloutPct: 'default',
        enabled: false,
      },
      USE_FUND_STORE_TELEMETRY: {
        userId: '',
        bucket: -1,
        rolloutPct: 'default',
        enabled: false,
      },
    }
  );

  console.warn('Rollout status snapshot', snapshot);
  return snapshot;
}

// Development helper - expose to window
if (import.meta.env.MODE === 'development') {
  if (typeof window !== 'undefined') {
    const debugWindow = window as Window & { __rollouts?: RolloutDebugApi };
    debugWindow.__rollouts = {
      inRollout,
      getUserBucket,
      debugRollouts,
      stableUserId: () => `${stableUserId().substring(0, 8)}...`, // Masked for privacy
    };
  }
}
