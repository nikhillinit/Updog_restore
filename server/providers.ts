/* eslint-disable @typescript-eslint/no-explicit-any */ // Dependency injection container
 
 
 
 
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
      }) as unknown as RateLimitStore;
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
    ...(rateLimitStore !== undefined ? { rateLimitStore } : {}),
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
    
    // Test connection with explicit ping
    await redis.connect();
    await redis['ping']();
    
    console.log('[providers] Redis cache enabled and verified');
    
    // Add error recovery wrapper with circuit breaker behavior
    let circuitOpen = false;
    let lastError: Date | null = null;
    
    const withCircuitBreaker = async <T>(operation: () => Promise<T>, fallback: T): Promise<T> => {
      // Reset circuit after 30 seconds
      if (circuitOpen && lastError && Date.now() - lastError.getTime() > 30000) {
        circuitOpen = false;
        console.log('[providers] Circuit breaker reset, retrying Redis operations');
      }
      
      if (circuitOpen) {
        return fallback;
      }
      
      try {
        return await operation();
      } catch (err) {
        lastError = new Date();
        circuitOpen = true;
        console.warn('[providers] Redis operation failed, circuit opened for 30s', { error: (err as Error).message });
        return fallback;
      }
    };
    
    return {
      async get(key: string): Promise<string | null> {
        return withCircuitBreaker(
          async () => (await redis['get'](key)) ?? null,
          null
        );
      },
      async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
        await withCircuitBreaker(
          async () => {
            if (ttlSeconds) {
              await redis['setex'](key, ttlSeconds, value);
            } else {
              await redis['set'](key, value);
            }
          },
          undefined
        );
      },
      async del(key: string): Promise<void> {
        await withCircuitBreaker(
          async () => { await redis['del'](key); },
          undefined
        );
      },
      async close(): Promise<void> {
        try {
          await redis['quit']();
        } catch (err) {
          console.warn('[providers] Redis close failed', { error: (err as Error).message });
        }
      }
    };
  } catch (error) {
    console.warn(`[providers] Redis cache failed, falling back to memory: ${error instanceof Error ? error.message : String(error)}`);
    return new BoundedMemoryCache();
  }
}

async function buildQueue(cfg: ReturnType<typeof import('./config/index.js').loadEnv>): Promise<{ enabled: boolean; close(): Promise<void> }> {
  // Check if queues should be enabled
  if (cfg.ENABLE_QUEUES !== '1' || !cfg.REDIS_URL || cfg.REDIS_URL === 'memory://') {
    console.log('[providers] Queue disabled (ENABLE_QUEUES not set or no Redis)');
    return {
      enabled: false,
      close: async () => {}
    };
  }

  try {
    console.log('[providers] Initializing BullMQ simulation queue...');
    const { default: IORedis } = await import('ioredis');
    const { initializeSimulationQueue } = await import('./queues/simulation-queue');

    const redis = new IORedis(cfg.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      connectTimeout: 5000
    });

    await redis.connect();

    const { close } = await initializeSimulationQueue(redis);

    console.log('[providers] BullMQ queue initialized successfully');

    return {
      enabled: true,
      close: async () => {
        await close();
        await redis.quit();
      }
    };
  } catch (error) {
    console.warn(`[providers] Queue initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      enabled: false,
      close: async () => {}
    };
  }
}
