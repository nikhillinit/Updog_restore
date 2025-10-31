// server/lib/stage-validation-mode.ts
import { createClient, type RedisClientType } from 'redis';

export type Mode = 'off' | 'warn' | 'enforce';

// Constants
const KEY = 'stage:validation:mode';
const CACHE_TTL_MS = 5000; // 5 seconds in-process cache
const REDIS_TIMEOUT_MS = 100; // 100ms Redis GET timeout

const ENV_DEFAULT = process.env['STAGE_VALIDATION_MODE'] as Mode | undefined;
const DEFAULT: Mode =
  ENV_DEFAULT && ['off', 'warn', 'enforce'].includes(ENV_DEFAULT) ? ENV_DEFAULT : 'warn';

// Lazy Redis connection
let redis: RedisClientType | null = null;
let redisConnecting = false;
let cache: { mode: Mode; expiresAt: number } | null = null;

/**
 * Get or initialize Redis client (lazy connection)
 * Returns null if connection fails, allowing graceful fallback
 */
async function getRedisClient(): Promise<RedisClientType | null> {
  if (redis) return redis;

  // Prevent concurrent connection attempts
  if (redisConnecting) {
    // Wait briefly for connection to complete
    await new Promise((resolve) => setTimeout(resolve, 50));
    return redis;
  }

  try {
    redisConnecting = true;
    const redisUrl = process.env['REDIS_URL'];
    redis = createClient(redisUrl ? { url: redisUrl } : {});

    await redis.connect();
    console.log('[stage-mode] Redis connected successfully');
    return redis;
  } catch (err) {
    console.error('[stage-mode] Redis connect failed; using cache/default fallback', err);
    redis = null;
    return null;
  } finally {
    redisConnecting = false;
  }
}

export async function getStageValidationMode(): Promise<Mode> {
  const now = Date.now();

  // Fast path: return cached value if still valid
  if (cache && now < cache.expiresAt) {
    return cache.mode;
  }

  // Attempt Redis fetch with timeout
  const redisClient = await getRedisClient();

  if (!redisClient) {
    // Redis unavailable, use cache or default
    return cache?.mode ?? DEFAULT;
  }

  try {
    const v = await Promise.race<Mode | null>([
      redisClient.get(KEY) as Promise<Mode | null>,
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), REDIS_TIMEOUT_MS)
      ),
    ]);

    // Validate and cache the result
    const mode = v && ['off', 'warn', 'enforce'].includes(v) ? (v as Mode) : DEFAULT;
    cache = { mode, expiresAt: now + CACHE_TTL_MS };
    return mode;
  } catch (err) {
    console.warn(
      '[stage-mode] redis.get failed; falling back to cache/default:',
      (err as Error)?.message
    );
    return cache?.mode ?? DEFAULT;
  }
}

export async function setStageValidationMode(
  next: Mode,
  opts?: { actor?: string; reason?: string }
): Promise<void> {
  if (!['off', 'warn', 'enforce'].includes(next)) {
    throw new Error(`Invalid mode: ${next}. Expected one of: off, warn, enforce`);
  }

  // Get current mode for audit trail
  const oldMode = await getStageValidationMode();

  // Attempt to update Redis
  const redisClient = await getRedisClient();
  if (redisClient) {
    try {
      await redisClient.set(KEY, next);
    } catch (err) {
      console.error('[stage-mode] Failed to set mode in Redis, updating cache only', err);
    }
  } else {
    console.warn('[stage-mode] Redis unavailable, mode change will only affect cache');
  }

  // Always update cache
  cache = { mode: next, expiresAt: Date.now() + CACHE_TTL_MS };

  // Structured audit log for mode changes
  console.log(
    JSON.stringify({
      event: 'stage_validation_mode_changed',
      old_mode: oldMode,
      new_mode: next,
      actor: opts?.actor || 'system',
      reason: opts?.reason || 'manual',
      redis_available: redisClient !== null,
      timestamp: new Date().toISOString(),
    })
  );
}
