/**
 * Centralized Providers System - Single source of truth for Redis/memory decisions
 * The "valve" that controls all Redis access throughout the application
 */

import type { Cache } from './cache/index.js';
import { BoundedMemoryCache } from './cache/memory.js';
import type { Store as RateLimitStore } from 'express-rate-limit';
import { getQueueRuntimePolicy } from './config/features.js';
import {
  assertQueueRuntimePolicy,
  type QueueRuntimePolicyEnv,
} from './config/queue-runtime-policy.js';
import {
  createProviderQueueRuntime,
  type ProviderQueueRuntime,
} from './queues/provider-queue-runtime.js';
import { closeRegisteredQueueRuntimes } from './queues/registry.js';
import { sanitizeQueueError } from './lib/queue-error-sanitizer.js';

export type ProviderMode = 'memory' | 'redis';

export interface Providers {
  mode: ProviderMode;
  cache: Cache;
  rateLimitStore?: RateLimitStore; // undefined => in-memory
  queue?: ProviderQueueRuntime;
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
  const queuePolicyEnv: QueueRuntimePolicyEnv = {
    ...cfg,
    VERCEL: process.env['VERCEL'],
    VERCEL_ENV: process.env['VERCEL_ENV'],
  };
  assertQueueRuntimePolicy(queuePolicyEnv);

  const { logger } = await import('./lib/logger.js');
  logger.info('[providers] Building providers...');

  // Determine mode based on REDIS_URL
  const mode: ProviderMode = cfg.REDIS_URL === 'memory://' ? 'memory' : 'redis';
  logger.info({ mode }, `[providers] Mode: ${mode}`);

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
      logger.warn(
        { err: sanitizeQueueError(error) },
        '[providers] Redis rate limit store failed, using memory'
      );
      rateLimitStore = undefined; // Fall back to memory
    }
  } else {
    logger.info('[providers] Using memory rate limit store');
  }

  const queuePolicy = getQueueRuntimePolicy(queuePolicyEnv);
  const queue = queuePolicy.legacyProviderProducersEnabled
    ? await buildQueue(queuePolicyEnv)
    : disabledQueueRuntime();

  logger.info(
    { queueEnabled: queue.enabled, queueReason: queuePolicy.reason },
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
      const providerResults = await Promise.allSettled([queue?.close?.()]);
      const routeResults = await Promise.allSettled([closeRegisteredQueueRuntimes()]);
      const cacheResults = await Promise.allSettled([cache?.close?.()]);
      const failures = [...providerResults, ...routeResults, ...cacheResults].filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected'
      );
      if (failures.length === 0) {
        logger.info('[providers] Teardown complete');
      } else {
        for (const failure of failures) {
          logger.error({ err: sanitizeQueueError(failure.reason) }, '[providers] Teardown error');
        }
      }
    },
  };
}

async function buildCache(redisUrl: string): Promise<Cache> {
  const { logger } = await import('./lib/logger.js');
  logger.debug({ redisConfigured: Boolean(redisUrl) }, '[providers] Cache mode');

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
        logger.warn(
          { err: sanitizeQueueError(err) },
          '[providers] Redis operation failed, circuit opened for 30s'
        );
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
          logger.warn({ err: sanitizeQueueError(err) }, '[providers] Redis close failed');
        }
      },
    };
  } catch (error) {
    logger.warn(
      { err: sanitizeQueueError(error) },
      '[providers] Redis cache failed, falling back to memory'
    );
    return new BoundedMemoryCache();
  }
}

async function buildQueue(cfg: QueueRuntimePolicyEnv): Promise<ProviderQueueRuntime> {
  const queuePolicy = getQueueRuntimePolicy(cfg);
  if (
    !queuePolicy.legacyProviderProducersEnabled ||
    !queuePolicy.enabled ||
    !queuePolicy.queueRedisUrl
  ) {
    const { logger } = await import('./lib/logger.js');
    logger.info({ reason: queuePolicy.reason }, '[providers] Queue disabled');
    return disabledQueueRuntime();
  }

  const { logger: queueLogger } = await import('./lib/logger.js');
  queueLogger.debug(
    { queueRedisConfigured: Boolean(queuePolicy.queueRedisUrl) },
    '[providers] Initializing BullMQ queues...'
  );
  return createProviderQueueRuntime({
    queueRedisUrl: queuePolicy.queueRedisUrl,
    startConsumers: queuePolicy.inProcessConsumersEnabled,
  });
}

function disabledQueueRuntime(): ProviderQueueRuntime {
  return {
    enabled: false,
    producersEnabled: false,
    consumersEnabled: false,
    close: async () => {},
  };
}
