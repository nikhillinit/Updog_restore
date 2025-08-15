/**
 * Resilient Cache System with Graceful Redis Fallback
 * Eliminates Redis connection failures in development
 */

export interface Cache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  close(): Promise<void>;
}

// Use the bounded memory cache implementation
import { BoundedMemoryCache } from './memory.js';

class RedisCache implements Cache {
  constructor(private redis: any) {}

  async get(key: string): Promise<string | null> {
    return (await this.redis.get(key)) ?? null;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.redis.setex(key, ttlSeconds, value);
    } else {
      await this.redis.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}

let lastRedisWarning = 0;
const REDIS_WARNING_THROTTLE = 60000; // 1 minute

function throttledWarn(message: string) {
  const now = Date.now();
  if (now - lastRedisWarning > REDIS_WARNING_THROTTLE) {
    console.warn(`[cache] ${message}`);
    lastRedisWarning = now;
  }
}

export async function buildCache(): Promise<Cache> {
  const url = process.env.REDIS_URL;
  
  // Explicit memory cache mode
  if (!url || url.startsWith('memory://')) {
    console.log('[cache] Using bounded in-memory cache (development mode)');
    return new BoundedMemoryCache();
  }

  try {
    const { default: IORedis } = await import('ioredis');
    const redis = new IORedis(url, { 
      lazyConnect: true, 
      maxRetriesPerRequest: 1,
      retryDelayOnFailover: 100,
      connectTimeout: 800
    });

    // Test Redis availability with timeout
    await Promise.race([
      redis.connect(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Redis connection timeout')), 800)
      )
    ]);

    // Verify with ping
    await Promise.race([
      redis.ping(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Redis ping timeout')), 500)
      )
    ]);

    console.log('[cache] Connected to Redis successfully');
    
    // Handle Redis errors gracefully in production
    redis.on('error', (err: Error) => {
      throttledWarn(`Redis error: ${err.message}`);
    });

    redis.on('reconnecting', () => {
      throttledWarn('Redis reconnecting...');
    });

    return new RedisCache(redis);

  } catch (error) {
    throttledWarn(`Redis unavailable, falling back to bounded memory cache: ${(error as Error).message}`);
    return new BoundedMemoryCache();
  }
}

// Global cache instance
let cacheInstance: Cache | null = null;

export async function getCache(): Promise<Cache> {
  if (!cacheInstance) {
    cacheInstance = await buildCache();
  }
  return cacheInstance;
}

export async function closeCache(): Promise<void> {
  if (cacheInstance) {
    await cacheInstance.close();
    cacheInstance = null;
  }
}