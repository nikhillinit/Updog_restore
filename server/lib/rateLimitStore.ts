import type { Store, Options } from 'express-rate-limit';
import { logger } from './logger.js';

function normalizeRedisResult(result: unknown): string | number | null {
  if (typeof result === 'string' || typeof result === 'number' || result === null) {
    return result;
  }

  return result === undefined ? null : String(result);
}

/**
 * Factory for rate limit stores
 * Allows switching between memory and Redis stores via environment
 */
export async function createRateLimitStore(required = false): Promise<Store | undefined> {
  const redisUrl = process.env['RATE_LIMIT_REDIS_URL'];

  if (!redisUrl) {
    if (required) {
      throw Object.assign(new Error('Shared rate-limit storage is required'), { status: 503 });
    }
    // Use default memory store
    return undefined;
  }

  let disconnect: (() => void) | undefined;
  try {
    // Dynamically import Redis store only if needed
    const { default: RedisStore } = await import('rate-limit-redis');
    const Redis = await import('ioredis');

    const client = new Redis.default(redisUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    disconnect = () => client.disconnect();
    await client['ping']();
    logger.info('Rate limit Redis store connected');

    // Create a properly typed store
    return new RedisStore({
      // Remove client property as it's not in the expected type
      // Instead, use sendCommand which is properly typed
      sendCommand: async (command: string, ...args: string[]): Promise<string | number | null> => {
        return normalizeRedisResult(await client.call(command, ...args));
      },
      prefix: 'rate-limit:',
    }) as unknown as Store;
  } catch (error) {
    disconnect?.();
    logger.warn({ err: error }, 'Rate-limit Redis unavailable');
    if (required) {
      throw Object.assign(new Error('Shared rate-limit storage is unavailable'), { status: 503 });
    }
    return undefined;
  }
}

/**
 * Create rate limit options with configurable store
 */
export async function createRateLimitOptions(
  baseOptions: Partial<Options>
): Promise<Partial<Options>> {
  const store = await createRateLimitStore();

  const options: Partial<Options> = {
    ...baseOptions,
    // Ensure we don't leak store type in response
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
  };

  if (store) {
    options.store = store;
  }

  return options;
}
