/**
 * Centralized Providers System - Single source of truth for Redis/memory decisions
 * The "valve" that controls all Redis access throughout the application
 */

import type { Cache } from './cache/index.js';
import { BoundedMemoryCache } from './cache/memory.js';
import type { Store as RateLimitStore } from 'express-rate-limit';
import { getQueueConfig } from './config/features.js';
import { resetQueueRegistry } from './queues/registry.js';

export type ProviderMode = 'memory' | 'redis';

export interface Providers {
  mode: ProviderMode;
  cache: Cache;
  rateLimitStore?: RateLimitStore; // undefined => in-memory
  queue?: { enabled: boolean; close(): Promise<void> };
  sessions?: { enabled: boolean; store?: unknown };
  teardown?: () => Promise<void>;
}

interface RedisCacheClient {
  connect(): Promise<unknown>;
  ping(): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  setex(key: string, ttlSeconds: number, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
  quit(): Promise<unknown>;
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

  const queueConfig = getQueueConfig(cfg);
  const queue = queueConfig.enabled
    ? await buildQueue(cfg)
    : { enabled: false, close: async () => {} };

  logger.info(
    { queueEnabled: queue.enabled, queueReason: queueConfig.reason },
    '[providers] Queue status'
  );

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
        resetQueueRegistry();
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
    }) as unknown as RedisCacheClient;

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
        return withCircuitBreaker(async () => (await redis.get(key)) ?? null, null);
      },
      async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
        await withCircuitBreaker(async () => {
          if (ttlSeconds) {
            await redis.setex(key, ttlSeconds, value);
          } else {
            await redis.set(key, value);
          }
        }, undefined);
      },
      async del(key: string): Promise<void> {
        await withCircuitBreaker(async () => {
          await redis.del(key);
        }, undefined);
      },
      async close(): Promise<void> {
        try {
          await redis.quit();
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
  const queueConfig = getQueueConfig(cfg);
  if (!queueConfig.enabled || !queueConfig.queueRedisUrl) {
    const { logger } = await import('./lib/logger.js');
    logger.info({ reason: queueConfig.reason }, '[providers] Queue disabled');
    return {
      enabled: false,
      close: async () => {},
    };
  }

  const { logger: queueLogger } = await import('./lib/logger.js');
  try {
    queueLogger.debug(
      { queueRedisUrl: queueConfig.queueRedisUrl },
      '[providers] Initializing BullMQ queues...'
    );
    const { default: IORedis } = await import('ioredis');
    const { initializeSimulationQueue } = await import('./queues/simulation-queue.js');
    const { initializeReportQueue } = await import('./queues/report-generation-queue.js');
    const { initializeBacktestingQueue } = await import('./queues/backtesting-queue.js');
    const { initializeFundScenarioCalcWorker } =
      await import('./queues/fund-scenario-calc-worker-init.js');

    const redis = new IORedis(queueConfig.queueRedisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      connectTimeout: 5000,
    });

    await redis.connect();

    const initResults = await Promise.allSettled([
      initializeSimulationQueue(redis),
      initializeReportQueue(redis),
      initializeBacktestingQueue(redis),
      initializeFundScenarioCalcWorker(redis),
    ]);

    const closers = initResults.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value.close] : []
    );
    const failures = initResults.filter((result) => result.status === 'rejected');

    for (const failure of failures) {
      queueLogger.warn({ err: failure.reason }, '[providers] Queue runtime failed to initialize');
    }

    if (closers.length === 0) {
      await redis.quit();
      return {
        enabled: false,
        close: async () => {},
      };
    }

    queueLogger.info(
      { initializedQueues: closers.length, failedQueues: failures.length },
      '[providers] BullMQ queues initialized'
    );

    return {
      enabled: true,
      close: async () => {
        await Promise.allSettled(closers.map((close) => close()));
        resetQueueRegistry();
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
