// server/lib/stage-validation-mode.ts
import { createClient } from 'redis';

export type Mode = 'off' | 'warn' | 'enforce';
const KEY = 'stage:validation:mode';

const ENV_DEFAULT = process.env['STAGE_VALIDATION_MODE'] as Mode | undefined;
const DEFAULT: Mode =
  ENV_DEFAULT && ['off', 'warn', 'enforce'].includes(ENV_DEFAULT) ? ENV_DEFAULT : 'warn';

const TTL_MS = 5000; // in-process cache TTL
const TIMEOUT_MS = 100; // redis get timeout

const redis = createClient({ url: process.env['REDIS_URL'] });
await redis.connect().catch((err) => {
  console.error('[stage-mode] Redis connect failed; using cache/default', err);
});

let cache: { mode: Mode; expiresAt: number } | null = null;

export async function getStageValidationMode(): Promise<Mode> {
  const now = Date.now();
  if (cache && now < cache.expiresAt) return cache.mode;

  try {
    const v = await Promise.race<Mode | null>([
      redis.get(KEY) as Promise<Mode | null>,
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
    ]);
    const mode = v && ['off', 'warn', 'enforce'].includes(v) ? (v as Mode) : DEFAULT;
    cache = { mode, expiresAt: now + TTL_MS };
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
  options?: { actor?: string; reason?: string }
) {
  if (!['off', 'warn', 'enforce'].includes(next)) throw new Error('invalid mode');

  const oldMode = cache?.mode ?? DEFAULT;
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
