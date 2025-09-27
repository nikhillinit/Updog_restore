/**
 * Typed Redis Factory Pattern
 * Centralizes Redis client creation with proper type safety
 */

import Redis from 'ioredis';

interface CreateRedisConfig {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  retryStrategy?: (times: number) => number;
  enableOfflineQueue?: boolean;
  maxRetriesPerRequest?: number;
  connectTimeout?: number;
  commandTimeout?: number;
  lazyConnect?: boolean;
}

/**
 * Create typed Redis client from configuration
 */
export function createRedis(config: CreateRedisConfig = {}): Redis {
  // Always construct URL for consistent type handling
  const url = config.url || `redis://${config.host || 'localhost'}:${config.port || 6379}`;
  return new Redis(url);
}

/**
 * Cache interface for type-safe operations
 */
export interface Cache {
  get(key: string): Promise<string | null>;
  set(key: string, val: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
}

/**
 * Create Redis client from environment variables
 */
export function createCacheFromEnv(): Redis {
  return createRedis({
    url: process.env['REDIS_URL'],
    host: process.env['REDIS_HOST'],
    port: process.env['REDIS_PORT'] ? parseInt(process.env['REDIS_PORT'], 10) : undefined,
    password: process.env['REDIS_PASSWORD'],
    db: process.env['REDIS_DB'] ? parseInt(process.env['REDIS_DB'], 10) : undefined
  });
}

/**
 * Create Cache interface from Redis client
 */
export function createCacheInterface(): Cache {
  const redis = createCacheFromEnv();
  
  return {
    async get(key: string): Promise<string | null> {
      return await redis['get'](key);
    },
    
    async set(key: string, val: string, ttlSeconds?: number): Promise<void> {
      if (ttlSeconds) {
        await redis.setex(key, ttlSeconds, val);
      } else {
        await redis['set'](key, val);
      }
    },
    
    async del(key: string): Promise<void> {
      await redis['del'](key);
    }
  };
}