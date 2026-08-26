import type { Store } from 'express-rate-limit';
import Redis from 'ioredis';
import { logger } from './logger.js';

function normalizeRedisResult(result: unknown): string | number | null {
  if (typeof result === 'string' || typeof result === 'number' || result === null) {
    return result;
  }

  return result === undefined ? null : String(result);
}

/**
 * Factory for rate limit stores with proper error handling
 */
export async function createRateLimitStore(): Promise<Store | undefined> {
  const redisUrl = process.env['RATE_LIMIT_REDIS_URL'];

  if (!redisUrl) {
    logger.info('Using in-memory rate limit store (not suitable for production clusters)');
    return undefined;
  }

  try {
    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
      enableOfflineQueue: false, // Fail fast if Redis is down
    });

    await client['ping']();
    logger.info('Rate limit Redis store connected');

    // Use dynamic import to avoid bundling issues
    const { default: RedisStore } = await import('rate-limit-redis');

    return new RedisStore({
      client,
      prefix: 'rl:',
      // Don't block on Redis errors
      sendCommand: async (command: string, ...args: string[]): Promise<string | number | null> => {
        try {
          return normalizeRedisResult(await client.call(command, ...args));
        } catch (error) {
          console.error('Rate limit Redis error:', error);
          return null; // Fail open
        }
      },
    }) as unknown as Store;
  } catch (error) {
    console.error(
      '⚠️ Rate limit Redis unavailable:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return undefined; // Fall back to memory store
  }
}
