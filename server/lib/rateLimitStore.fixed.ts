/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */

import type { Store } from 'express-rate-limit';
import Redis from 'ioredis';

/**
 * Factory for rate limit stores with proper error handling
 */
export async function createRateLimitStore(): Promise<Store | undefined> {
  const redisUrl = process.env['RATE_LIMIT_REDIS_URL'];
  
  if (!redisUrl) {
    console.log('⚠️ Using in-memory rate limit store (not suitable for production clusters)');
    return undefined;
  }
  
  try {
    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
      enableOfflineQueue: false  // Fail fast if Redis is down
    });
    
    await client['ping']();
    console.log('✅ Rate limit Redis store connected');
    
    // Use dynamic import to avoid bundling issues
    const { default: RedisStore } = await import('rate-limit-redis');
    
    return new RedisStore({
      client,
      prefix: 'rl:',
      // Don't block on Redis errors
      sendCommand: async (command: string, ...args: string[]): Promise<string | number | null> => {
        try {
          const result = await client.call(command, ...args);
          return result as string | number | null;
        } catch (error) {
          console.error('Rate limit Redis error:', error);
          return null;  // Fail open
        }
      }
    });
  } catch (error) {
    console.error('⚠️ Rate limit Redis unavailable:', error instanceof Error ? error.message : 'Unknown error');
    return undefined;  // Fall back to memory store
  }
}

