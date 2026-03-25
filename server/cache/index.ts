/**
 * Resilient Cache System with Graceful Redis Fallback.
 *
 * Uses Redis when available and falls back to the bounded in-memory cache
 * for development or degraded runtime scenarios.
 */

import { logger } from '../lib/logger';
import { BoundedMemoryCache } from './memory.js';

export interface Cache {
  get(_key: string): Promise<string | null>;
  set(_key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(_key: string): Promise<void>;
  close(): Promise<void>;
}

interface RedisClientLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  setex(key: string, ttlSeconds: number, value: string): Promise<unknown>;
  del(key: string): Promise<number>;
  quit(): Promise<unknown>;
  ping(): Promise<unknown>;
  connect(): Promise<void>;
  on(event: 'error', listener: (error: Error) => void): void;
  on(event: 'reconnecting', listener: () => void): void;
}

interface RedisClientOptions {
  lazyConnect: boolean;
  maxRetriesPerRequest: number;
  retryDelayOnFailover: number;
  connectTimeout: number;
}

interface RedisModule {
  default: new (url: string, options: RedisClientOptions) => RedisClientLike;
}

class RedisCache implements Cache {
  constructor(private readonly redis: RedisClientLike) {}

  async get(key: string): Promise<string | null> {
    return (await this.redis.get(key)) ?? null;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.redis.setex(key, ttlSeconds, value);
      return;
    }

    await this.redis.set(key, value);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}

let lastRedisWarning = 0;
const REDIS_WARNING_THROTTLE = 60_000;
let cacheInstance: Cache | null = null;
let cacheInstancePromise: Promise<Cache> | null = null;

function throttledWarn(message: string): void {
  const now = Date.now();
  if (now - lastRedisWarning > REDIS_WARNING_THROTTLE) {
    logger.warn({ cacheBackend: 'redis' }, `[cache] ${message}`);
    lastRedisWarning = now;
  }
}

function timeoutReject(message: string, timeoutMs: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), timeoutMs);
  });
}

export async function buildCache(): Promise<Cache> {
  const url = process.env['REDIS_URL'];

  if (!url || url.startsWith('memory://')) {
    logger.info('[cache] Using bounded in-memory cache (development mode)');
    return new BoundedMemoryCache();
  }

  try {
    const redisModule = (await import('ioredis')) as unknown as RedisModule;
    const redis = new redisModule.default(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryDelayOnFailover: 100,
      connectTimeout: 800,
    });

    await Promise.race([redis.connect(), timeoutReject('Redis connection timeout', 800)]);

    await Promise.race([redis.ping(), timeoutReject('Redis ping timeout', 500)]);

    logger.info('[cache] Connected to Redis successfully');

    redis.on('error', (error: Error) => {
      throttledWarn(`Redis error: ${error.message}`);
    });

    redis.on('reconnecting', () => {
      throttledWarn('Redis reconnecting...');
    });

    return new RedisCache(redis);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throttledWarn(`Redis unavailable, falling back to bounded memory cache: ${message}`);
    return new BoundedMemoryCache();
  }
}

export async function getCache(): Promise<Cache> {
  if (cacheInstance) {
    return cacheInstance;
  }

  if (!cacheInstancePromise) {
    cacheInstancePromise = buildCache().then((cache) => {
      cacheInstance = cache;
      return cache;
    });
  }

  return cacheInstancePromise;
}

export async function closeCache(): Promise<void> {
  const activeCache = cacheInstance;
  cacheInstance = null;
  cacheInstancePromise = null;

  if (activeCache) {
    await activeCache.close();
  }
}
