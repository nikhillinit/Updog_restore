/**
 * Typed Redis Factory Pattern
 * Centralizes Redis client creation with proper type safety and comprehensive config support
 */

import IORedis, { Redis, RedisOptions, SentinelAddress } from 'ioredis';
import { logger } from '../lib/logger';
import * as fs from 'fs';

interface MemoryEntry {
  value: string;
  expiresAt?: number;
}

function normalizeValue(value: string | number | Buffer): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value.toString();
  return value.toString();
}

function createMemoryRedisClient(): Redis {
  const store = new Map<string, MemoryEntry>();

  const touch = (key: string): MemoryEntry | undefined => {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      store.delete(key);
      return undefined;
    }
    return entry;
  };

  const stub: any = {
    async get(key: string): Promise<string | null> {
      const entry = touch(key);
      return entry?.value ?? null;
    },
    async set(key: string, value: string | number | Buffer): Promise<'OK'> {
      store.set(key, { value: normalizeValue(value) });
      return 'OK';
    },
    async setex(key: string, ttlSeconds: number, value: string | number | Buffer): Promise<'OK'> {
      store.set(key, {
        value: normalizeValue(value),
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
      return 'OK';
    },
    async del(key: string): Promise<number> {
      return store.delete(key) ? 1 : 0;
    },
    async incr(key: string): Promise<number> {
      const current = Number(await stub.get(key) ?? '0');
      const next = current + 1;
      store.set(key, { value: next.toString() });
      return next;
    },
    async expire(key: string, seconds: number): Promise<number> {
      const entry = store.get(key);
      if (!entry) return 0;
      entry.expiresAt = Date.now() + seconds * 1000;
      store.set(key, entry);
      return 1;
    },
    async ping(): Promise<'PONG'> {
      return 'PONG';
    },
    async quit(): Promise<'OK'> {
      store.clear();
      return 'OK';
    },
    duplicate(): Redis {
      return stub as Redis;
    },
    async call(command: string, ...args: (string | number)[]): Promise<any> {
      switch (command.toUpperCase()) {
        case 'PING':
          return 'PONG';
        case 'GET':
          return stub.get(String(args[0]));
        case 'SET':
          return stub.set(String(args[0]), String(args[1] ?? ''));
        case 'SETEX':
          return stub.setex(String(args[0]), Number(args[1] ?? 0), String(args[2] ?? ''));
        case 'DEL':
          return stub.del(String(args[0]));
        case 'INCR':
          return stub.incr(String(args[0]));
        case 'EXPIRE':
          return stub.expire(String(args[0]), Number(args[1] ?? 0));
        default:
          return null;
      }
    },
    on(): Redis {
      return stub as Redis;
    },
    once(): Redis {
      return stub as Redis;
    },
    addListener(): Redis {
      return stub as Redis;
    },
    removeListener(): Redis {
      return stub as Redis;
    },
    off(): Redis {
      return stub as Redis;
    },
    removeAllListeners(): Redis {
      return stub as Redis;
    },
  };

  return stub as Redis;
}

/**
 * Mask sensitive data in connection strings for logging
 */
function maskPassword(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Mask password in connection info for logging
 */
function maskConnectionInfo(options: RedisOptions): string {
  const { host, port, db } = options;
  return `${host || 'localhost'}:${port || 6379}/${db || 0}`;
}

/**
 * Default Redis options with production-ready settings
 */
const DEFAULT_OPTIONS: Partial<RedisOptions> = {
  lazyConnect: true,
  enableAutoPipelining: true,
  enableOfflineQueue: false, // Fail fast in production
  maxRetriesPerRequest: 3,
  connectTimeout: 10_000,
  commandTimeout: 5_000,
  retryStrategy: (times: number) => {
    const delay = Math.min(1000 * 2 ** times, 30_000);
    logger.warn(`Redis retry attempt ${times}, waiting ${delay}ms`);
    return delay;
  },
};

/**
 * Configuration for creating Redis clients
 * Supports both URL strings and individual options
 */
export interface CreateRedisConfig extends Partial<RedisOptions> {
  url?: string;
  sentinels?: SentinelAddress[];
  name?: string; // Sentinel master name
}

/**
 * Parse TLS options from environment or config
 */
function parseTlsOptions(config: CreateRedisConfig): RedisOptions['tls'] | undefined {
  // If URL uses rediss://, enable TLS
  if (config.url?.startsWith('rediss://')) {
    return {};
  }

  // Check explicit TLS env var
  if (process.env['REDIS_TLS'] === 'true' || process.env['REDIS_TLS'] === '1') {
    const tlsOptions: NonNullable<RedisOptions['tls']> = {};

    // Load TLS certificates if paths are provided
    if (process.env['REDIS_CA_PATH']) {
      tlsOptions.ca = fs.readFileSync(process.env['REDIS_CA_PATH']);
    }
    if (process.env['REDIS_CERT_PATH']) {
      tlsOptions.cert = fs.readFileSync(process.env['REDIS_CERT_PATH']);
    }
    if (process.env['REDIS_KEY_PATH']) {
      tlsOptions.key = fs.readFileSync(process.env['REDIS_KEY_PATH']);
    }
    if (process.env['REDIS_SERVERNAME']) {
      tlsOptions.servername = process.env['REDIS_SERVERNAME'];
    }

    return tlsOptions;
  }

  // Return any TLS options from config
  return config.tls;
}

/**
 * Parse Sentinel configuration from environment
 */
function parseSentinelOptions(config: CreateRedisConfig): {
  sentinels?: SentinelAddress[];
  name?: string;
} {
  // Use config sentinels if provided
  if (config.sentinels) {
    return {
      sentinels: config.sentinels,
      name: config.name || process.env['REDIS_SENTINEL_NAME'],
    };
  }

  // Parse from environment
  const sentinelsEnv = process.env['REDIS_SENTINELS'];
  if (sentinelsEnv) {
    try {
      const sentinels = JSON.parse(sentinelsEnv) as SentinelAddress[];
      return {
        sentinels,
        name: config.name || process.env['REDIS_SENTINEL_NAME'],
      };
    } catch (error) {
      logger.error('Failed to parse REDIS_SENTINELS env var', { error });
    }
  }

  return {};
}

/**
 * Create typed Redis client from configuration
 */
export function createRedis(config: CreateRedisConfig = {}): Redis {
  if (config.url === 'memory://' || process.env['REDIS_URL'] === 'memory://') {
    logger.info('Redis memory mode enabled - using in-process stub');
    return createMemoryRedisClient();
  }
  // Start with defaults
  const options: RedisOptions = { ...DEFAULT_OPTIONS };

  // Handle Sentinel configuration
  const sentinelConfig = parseSentinelOptions(config);
  if (sentinelConfig.sentinels) {
    Object.assign(options, sentinelConfig);
    logger.info('Creating Redis client with Sentinel configuration', {
      sentinelCount: sentinelConfig.sentinels.length,
      masterName: sentinelConfig.name,
    });
  }

  // Handle TLS configuration
  const tls = parseTlsOptions(config);
  if (tls) {
    options.tls = tls;
    logger.info('Redis TLS enabled');
  }

  // If URL is provided, parse and override options
  if (config.url) {
    try {
      const url = new URL(config.url);

      // Extract connection details from URL
      if (url.hostname) options.host = url.hostname;
      if (url.port) options.port = parseInt(url.port, 10);
      if (url.username) options.username = url.username;
      if (url.password) options.password = url.password;

      // Extract DB from pathname (e.g., /0, /1)
      const dbMatch = url.pathname.match(/^\/(\d+)$/);
      if (dbMatch) {
        options.db = parseInt(dbMatch[1], 10);
      }

      // Enable TLS for rediss:// URLs
      if (url.protocol === 'rediss:') {
        options.tls = options.tls || {};
      }

      logger.info('Redis client using URL configuration', {
        connection: maskPassword(config.url),
      });
    } catch (error) {
      logger.warn('Failed to parse Redis URL, using as-is', {
        url: config.url,
        error,
      });
    }
  }

  // Merge any additional config options (these override URL-parsed values)
  const {
    url: _url,
    sentinels: _sentinels,
    name: _name,
    ...configOptions
  } = config;
  Object.assign(options, configOptions);

  // Log connection attempt (mask password)
  logger.info('Creating Redis client', {
    connection: maskConnectionInfo(options),
  });

  // Create Redis client
  const redis = new IORedis(options);

  // Add connection event listeners
  redis.on('connect', () => {
    logger.info('Redis client connected', {
      connection: maskConnectionInfo(options),
    });
  });

  redis.on('ready', () => {
    logger.info('Redis client ready');
  });

  redis.on('error', (error: Error) => {
    logger.error('Redis client error', {
      error: error.message,
      connection: maskConnectionInfo(options),
    });
  });

  redis.on('close', () => {
    logger.warn('Redis connection closed', {
      connection: maskConnectionInfo(options),
    });
  });

  redis.on('reconnecting', (delay: number) => {
    logger.info(`Redis reconnecting in ${delay}ms`);
  });

  return redis;
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
 * Check Redis health
 * Returns true if Redis is healthy, false otherwise
 * Does not throw errors
 */
export async function checkRedisHealth(redis: Redis): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch (error) {
    logger.error('Redis health check failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Create Redis client from environment variables
 */
export function createCacheFromEnv(): Redis {
  const config: CreateRedisConfig = {};
  const redisUrl = process.env['REDIS_URL'];

  if (redisUrl === 'memory://' || redisUrl === 'mock') {
    logger.info('Redis memory mode detected (REDIS_URL=%s)', redisUrl);
    return createMemoryRedisClient();
  }

  // Parse URL if provided
  if (redisUrl) {
    config.url = redisUrl;
  } else {
    // Use individual options
    if (process.env['REDIS_HOST']) {
      config.host = process.env['REDIS_HOST'];
    }
    if (process.env['REDIS_PORT']) {
      config.port = parseInt(process.env['REDIS_PORT'], 10);
    }
  }

  // Parse optional credentials and settings
  if (process.env['REDIS_PASSWORD']) {
    config.password = process.env['REDIS_PASSWORD'];
  }
  if (process.env['REDIS_USERNAME']) {
    config.username = process.env['REDIS_USERNAME'];
  }
  if (process.env['REDIS_DB']) {
    config.db = parseInt(process.env['REDIS_DB'], 10);
  }

  // TLS and Sentinel are handled by createRedis via parsers

  return createRedis(config);
}

/**
 * Create Cache interface from Redis client
 */
export function createCacheInterface(): Cache {
  const redis = createCacheFromEnv();

  return {
    async get(key: string): Promise<string | null> {
      return await redis.get(key);
    },

    async set(key: string, val: string, ttlSeconds?: number): Promise<void> {
      if (ttlSeconds) {
        await redis.setex(key, ttlSeconds, val);
      } else {
        await redis.set(key, val);
      }
    },

    async del(key: string): Promise<void> {
      await redis.del(key);
    },
  };
}
