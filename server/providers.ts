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
  rateLimitStore?: RateLimitStore; // undefined => in-memory
  queue?: { enabled: boolean; close(): Promise<void> };
  sessions?: { enabled: boolean; store?: any };
  teardown?: () => Promise<void>;
}

/**
 * The single valve - all Redis decisions flow through here
 * Nothing else in the codebase should directly create Redis connections
 */
export async function buildProviders(
  cfg: ReturnType<typeof import('./config/index.js').loadEnv>
): Promise<Providers> {
  const { logger } = await import('./lib/logger.js');
  logger.info('[providers] Building providers...');

  // Determine mode based on REDIS_URL
  const mode: ProviderMode = cfg.REDIS_URL === 'memory://' ? 'memory' : 'redis';
  logger.info({ mode, redisUrl: cfg.REDIS_URL }, `[providers] Mode: ${mode}`);

  // Cache - use our own implementation to avoid side effects
  const cache = await buildCache(cfg.REDIS_URL);

  // Rate limit store - only use Redis if explicitly configured
  let rateLimitStore: RateLimitStore | undefined;
  const rateLimitRedisUrl =
    cfg.RATE_LIMIT_REDIS_URL || (mode === 'redis' ? cfg.REDIS_URL : undefined);

  if (mode === 'redis' && rateLimitRedisUrl && rateLimitRedisUrl !== 'memory://') {
    try {
      logger.debug('[providers] Attempting Redis rate limit store...');
      // Lazy import only if redis mode
      const RedisStoreModule = await import('rate-limit-redis');
      const RedisStore = RedisStoreModule.default;
      const { default: IORedis } = await import('ioredis');

      const client = new IORedis(rateLimitRedisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 1000,
      });

      await client.connect();
      rateLimitStore = new RedisStore({
        sendCommand: (command: string, ...args: string[]) => client.call(command, ...args),
      }) as unknown as RateLimitStore;
      logger.info('[providers] Redis rate limit store enabled');
    } catch (error) {
      logger.warn({ err: error }, '[providers] Redis rate limit store failed, using memory');
      rateLimitStore = undefined; // Fall back to memory
    }
  } else {
    logger.info('[providers] Using memory rate limit store');
  }

  // Queues - disabled in development by default, only enabled in production with explicit flag
  const queueEnabled =
    mode === 'redis' && cfg.ENABLE_QUEUES === '1' && cfg.NODE_ENV !== 'development';

  const queue = queueEnabled ? await buildQueue(cfg) : { enabled: false, close: async () => {} };

  logger.info({ queueEnabled: queue.enabled }, '[providers] Queue status');

  // Sessions - disabled for now, can be enabled later
  const sessions = { enabled: false };

  return {
    mode,
    cache,
    ...(rateLimitStore !== undefined ? { rateLimitStore } : {}),
    queue,
    sessions,
    teardown: async () => {
      logger.info('[providers] Tearing down...');
      try {
        await queue?.close?.();
        await cache?.close?.();
        logger.info('[providers] Teardown complete');
      } catch (error) {
        logger.error({ err: error }, '[providers] Teardown error');
      }
    },
  };
}

async function buildCache(redisUrl: string): Promise<Cache> {
  const { logger } = await import('./lib/logger.js');
  logger.debug({ redisUrl }, '[providers] Cache mode for URL');

  // Always use memory cache if URL is memory:// or missing
  if (!redisUrl || redisUrl === 'memory://') {
    logger.info('[providers] Using bounded memory cache (forced)');
    return new BoundedMemoryCache();
  }

  try {
    logger.debug('[providers] Attempting Redis cache...');
    const { default: IORedis } = await import('ioredis');
    const redis = new IORedis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 1000,
    });

    // Test connection with explicit ping
    await redis.connect();
    await redis['ping']();

    logger.info('[providers] Redis cache enabled and verified');

    // Add error recovery wrapper with circuit breaker behavior
    let circuitOpen = false;
    let lastError: Date | null = null;

    const withCircuitBreaker = async <T>(operation: () => Promise<T>, fallback: T): Promise<T> => {
      // Reset circuit after 30 seconds
      if (circuitOpen && lastError && Date.now() - lastError.getTime() > 30000) {
        circuitOpen = false;
        logger.debug('[providers] Circuit breaker reset, retrying Redis operations');
      }

      if (circuitOpen) {
        return fallback;
      }

      try {
        return await operation();
      } catch (err) {
        lastError = new Date();
        circuitOpen = true;
        logger.warn({ err }, '[providers] Redis operation failed, circuit opened for 30s');
        return fallback;
      }
    };

    return {
      async get(key: string): Promise<string | null> {
        return withCircuitBreaker(async () => (await redis['get'](key)) ?? null, null);
      },
      async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
        await withCircuitBreaker(async () => {
          if (ttlSeconds) {
            await redis['setex'](key, ttlSeconds, value);
          } else {
            await redis['set'](key, value);
          }
        }, undefined);
      },
      async del(key: string): Promise<void> {
        await withCircuitBreaker(async () => {
          await redis['del'](key);
        }, undefined);
      },
      async close(): Promise<void> {
        try {
          await redis['quit']();
        } catch (err) {
          logger.warn({ err }, '[providers] Redis close failed');
        }
      },
    };
  } catch (error) {
    logger.warn({ err: error }, '[providers] Redis cache failed, falling back to memory');
    return new BoundedMemoryCache();
  }
}

async function buildQueue(
  cfg: ReturnType<typeof import('./config/index.js').loadEnv>
): Promise<{ enabled: boolean; close(): Promise<void> }> {
  // Check if queues should be enabled
  if (cfg.ENABLE_QUEUES !== '1' || !cfg.REDIS_URL || cfg.REDIS_URL === 'memory://') {
    const { logger } = await import('./lib/logger.js');
    logger.info('[providers] Queue disabled (ENABLE_QUEUES not set or no Redis)');
    return {
      enabled: false,
      close: async () => {},
    };
  }

  const { logger: queueLogger } = await import('./lib/logger.js');
  try {
    queueLogger.debug('[providers] Initializing BullMQ simulation queue...');
    const { default: IORedis } = await import('ioredis');
    const { initializeSimulationQueue } = await import('./queues/simulation-queue');

    const redis = new IORedis(cfg.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      connectTimeout: 5000,
    });

    await redis.connect();

    const { close } = await initializeSimulationQueue(redis);

    queueLogger.info('[providers] BullMQ queue initialized successfully');

    return {
      enabled: true,
      close: async () => {
        await close();
        await redis.quit();
      },
    };
  } catch (error) {
    queueLogger.warn({ err: error }, '[providers] Queue initialization failed');
    return {
      enabled: false,
      close: async () => {},
    };
  }
}
