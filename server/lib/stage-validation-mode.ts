// server/lib/stage-validation-mode.ts
import { createClient } from 'redis';

export type Mode = 'off' | 'warn' | 'enforce';
const KEY = 'stage:validation:mode';

// Compute default mode from environment variable
function computeDefaultFromEnv(): Mode {
  const envValue = process.env['STAGE_VALIDATION_MODE'] as Mode | undefined;
  return envValue && ['off', 'warn', 'enforce'].includes(envValue) ? envValue : 'warn';
}

let defaultMode: Mode = computeDefaultFromEnv();

const TTL_MS = 5000; // in-process cache TTL
const TIMEOUT_MS = 100; // redis get timeout

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect().catch((err) => {
  console.error('[stage-mode] Redis connect failed; using cache/default', err);
});

let cache: { mode: Mode; expiresAt: number } | null = null;

// TEST-ONLY: Reset cache and default mode (for test isolation)
export function _resetStageValidationModeForTesting() {
  cache = null;
  defaultMode = computeDefaultFromEnv();
}

export async function getStageValidationMode(): Promise<Mode> {
  const now = Date.now();
  if (cache && now < cache.expiresAt) return cache.mode;

  try {
    const v = await Promise.race<Mode | null>([
      redis.get(KEY) as Promise<Mode | null>,
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
    ]);
    const mode = v && ['off', 'warn', 'enforce'].includes(v) ? (v as Mode) : defaultMode;
    cache = { mode, expiresAt: now + TTL_MS };
    return mode;
  } catch (err) {
    console.warn(
      '[stage-mode] redis.get failed; falling back to cache/default:',
      (err as Error)?.message
    );
    return cache?.mode ?? defaultMode;
  }
}

export async function setStageValidationMode(
  next: Mode,
  options?: { actor?: string; reason?: string }
) {
  if (!['off', 'warn', 'enforce'].includes(next)) throw new Error('invalid mode');

  const oldMode = cache?.mode ?? defaultMode;
  await redis.set(KEY, next);
  cache = { mode: next, expiresAt: Date.now() + TTL_MS };

  // Structured audit log for mode flips
  console.warn(
    JSON.stringify({
      event: 'stage_validation_mode_change',
      old_mode: oldMode,
      new_mode: next,
      actor: options?.actor ?? 'system',
      reason: options?.reason ?? 'manual',
      timestamp: new Date().toISOString(),
      ttl_cached_until: new Date(Date.now() + TTL_MS).toISOString(),
    })
  );
}
