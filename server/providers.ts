/**
 * Centralized Providers System - Single source of truth for Redis/memory decisions
 * The "valve" that controls all Redis access throughout the application
 */

import type { Cache } from './cache/index.js';
import { BoundedMemoryCache } from './cache/memory.js';
import type { Store as RateLimitStore } from 'express-rate-limit';

export type ProviderMode = 'memory' | 'redis';

export interface Providers {
  mode: ProviderMode;
  cache: Cache;
  rateLimitStore?: RateLimitStore;       // undefined => in-memory
  queue?: { enabled: boolean; close(): Promise<void> };
  sessions?: { enabled: boolean; store?: any };
  teardown?: () => Promise<void>;
}

/** 
 * The single valve - all Redis decisions flow through here
 * Nothing else in the codebase should directly create Redis connections
 */
export async function buildProviders(cfg: ReturnType<typeof import('./config/index.js').loadEnv>): Promise<Providers> {
  console.log('[providers] Building providers...');
  
  // Determine mode based on REDIS_URL
  const mode: ProviderMode = cfg.REDIS_URL === 'memory://' ? 'memory' : 'redis';
  console.log(`[providers] Mode: ${mode} (REDIS_URL=${cfg.REDIS_URL})`);
  
  // Cache - use our own implementation to avoid side effects
  const cache = await buildCache(cfg.REDIS_URL);
  
  // Rate limit store - only use Redis if explicitly configured
  let rateLimitStore: RateLimitStore | undefined;
  const rateLimitRedisUrl = cfg.RATE_LIMIT_REDIS_URL || (mode === 'redis' ? cfg.REDIS_URL : undefined);
  
  if (mode === 'redis' && rateLimitRedisUrl && rateLimitRedisUrl !== 'memory://') {
    try {
      console.log('[providers] Attempting Redis rate limit store...');
      // Lazy import only if redis mode
      const RedisStoreModule = await import('rate-limit-redis');
      const RedisStore = RedisStoreModule.default;
      const { default: IORedis } = await import('ioredis');
      
      const client = new IORedis(rateLimitRedisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 1000
      });
      
      await client.connect();
      rateLimitStore = new RedisStore({
        sendCommand: (command: string, ...args: string[]) => client.call(command, ...args),
      });
      console.log('[providers] Redis rate limit store enabled');
    } catch (error) {
      console.warn(`[providers] Redis rate limit store failed, using memory: ${error instanceof Error ? error.message : String(error)}`);
      rateLimitStore = undefined; // Fall back to memory
    }
  } else {
    console.log('[providers] Using memory rate limit store');
  }
  
  // Queues - disabled in development by default, only enabled in production with explicit flag
  const queueEnabled = mode === 'redis' && 
                      cfg.ENABLE_QUEUES === '1' && 
                      cfg.NODE_ENV !== 'development';
  
  const queue = queueEnabled
    ? await buildQueue(cfg)
    : { enabled: false, close: async () => {} };
  
  console.log(`[providers] Queue enabled: ${queue.enabled}`);
  
  // Sessions - disabled for now, can be enabled later
  const sessions = { enabled: false };
  
  return {
    mode,
    cache,
    rateLimitStore, // undefined => express-rate-limit uses memory store
    queue,
    sessions,
    teardown: async () => {
      console.log('[providers] Tearing down...');
      try {
        await queue?.close?.();
        await cache?.close?.();
        console.log('[providers] Teardown complete');
      } catch (error) {
        console.error('[providers] Teardown error:', error);
      }
    }
  };
}

async function buildCache(redisUrl: string): Promise<Cache> {
  console.log(`[providers] Cache mode for URL: ${redisUrl}`);
  
  // Always use memory cache if URL is memory:// or missing
  if (!redisUrl || redisUrl === 'memory://') {
    console.log('[providers] Using bounded memory cache (forced)');
    return new BoundedMemoryCache();
  }
  
  try {
    console.log('[providers] Attempting Redis cache...');
    const { default: IORedis } = await import('ioredis');
    const redis = new IORedis(redisUrl, { 
      lazyConnect: true, 
      maxRetriesPerRequest: 1,
      connectTimeout: 1000
    });
    
    // Test connection
    await redis.connect();
    await redis.ping();
    
    console.log('[providers] Redis cache enabled');
    
    return {
      async get(key: string): Promise<string | null> {
        return (await redis.get(key)) ?? null;
      },
      async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
        if (ttlSeconds) {
          await redis.setex(key, ttlSeconds, value);
        } else {
          await redis.set(key, value);
        }
      },
      async del(key: string): Promise<void> {
        await redis.del(key);
      },
      async close(): Promise<void> {
        await redis.quit();
      }
    };
  } catch (error) {
    console.warn(`[providers] Redis cache failed, falling back to memory: ${error instanceof Error ? error.message : String(error)}`);
    return new BoundedMemoryCache();
  }
}

async function buildQueue(cfg: any): Promise<{ enabled: boolean; close(): Promise<void> }> {
  // Placeholder for queue implementation
  // Only implement if you need queues right now
  return {
    enabled: false,
    close: async () => {}
  };
}