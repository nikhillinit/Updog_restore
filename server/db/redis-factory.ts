import Redis from 'ioredis';
import { logger } from '../lib/logger';
import * as fs from 'fs';

// Explicit interface to avoid TS4111 index signature errors
export interface RedisAPI {
  on(event: string, listener: (...args: any[]) => void): this;
  get(key: string): Promise<string | null>;
  set(key: string, value: string | number | Buffer): Promise<'OK'>;
  setex(key: string, seconds: number, value: string | number | Buffer): Promise<'OK'>;
  del(...keys: string[]): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ping(): Promise<'PONG'>;
  quit(): Promise<'OK'>;
  duplicate(): RedisAPI;
  call(command: string, ...args: (string | number)[]): Promise<any>;
}

type RedisClient = Redis;
type SentinelAddress = { host: string; port: number };

// RedisOptions inline definition based on ioredis interface
type RedisOptions = {
  port?: number;
  host?: string;
  username?: string;
  password?: string;
  db?: number;
  lazyConnect?: boolean;
  enableAutoPipelining?: boolean;
  enableOfflineQueue?: boolean;
  maxRetriesPerRequest?: number | null;
  connectTimeout?: number;
  commandTimeout?: number;
  retryStrategy?: (attempt: number) => number | void | null;
  tls?: {
    ca?: Buffer | string;
    cert?: Buffer | string;
    key?: Buffer | string;
    servername?: string;
    [key: string]: unknown;
  };
  sentinels?: SentinelAddress[];
  name?: string;
  [key: string]: unknown;
};
type RedisEvent = Parameters<RedisClient['on']>[0];
type RedisListener = Parameters<RedisClient['on']>[1];
type RedisValue = string | number | Buffer;

interface MemoryEntry {
  value: string;
  expiresAt?: number;
}

function normalizeValue(value: RedisValue): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value.toString();
  return value.toString();
}

function createMemoryRedisClient(): RedisAPI {
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

  let proxy: RedisClient;

  const stub: {
    get(key: string): Promise<string | null>;
    set(key: string, value: RedisValue): Promise<'OK'>;
    setex(key: string, ttlSeconds: number, value: RedisValue): Promise<'OK'>;
    del(key: string): Promise<number>;
    incr(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
    ping(): Promise<'PONG'>;
    quit(): Promise<'OK'>;
    duplicate(): RedisClient;
    call(command: string, ...args: (string | number)[]): Promise<string | number | null>;
    on(event: RedisEvent, listener: RedisListener): RedisClient;
    once(event: RedisEvent, listener: RedisListener): RedisClient;
    addListener(event: RedisEvent, listener: RedisListener): RedisClient;
    removeListener(event: RedisEvent, listener: RedisListener): RedisClient;
    off(event: RedisEvent, listener: RedisListener): RedisClient;
    removeAllListeners(event?: RedisEvent): RedisClient;
  } = {
    async get(key: string): Promise<string | null> {
      const entry = touch(key);
      return entry?.value ?? null;
    },
    async set(key: string, value: RedisValue): Promise<'OK'> {
      store.set(key, { value: normalizeValue(value) });
      return 'OK';
    },
    async setex(key: string, ttlSeconds: number, value: RedisValue): Promise<'OK'> {
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
    duplicate(): RedisClient {
      return proxy;
    },
    async call(command: string, ...args: (string | number)[]): Promise<string | number | null> {
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
    on(_event: RedisEvent, _listener: RedisListener): RedisClient {
      return proxy;
    },
    once(_event: RedisEvent, _listener: RedisListener): RedisClient {
      return proxy;
    },
    addListener(_event: RedisEvent, _listener: RedisListener): RedisClient {
      return proxy;
    },
    removeListener(_event: RedisEvent, _listener: RedisListener): RedisClient {
      return proxy;
    },
    off(_event: RedisEvent, _listener: RedisListener): RedisClient {
      return proxy;
    },
    removeAllListeners(_event?: RedisEvent): RedisClient {
      return proxy;
    },
  };

  proxy = stub as unknown as RedisClient;
  return proxy as unknown as RedisAPI;
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
  retryStrategy: (attempt: number) => {
    const delay = Math.min(1000 * 2 ** attempt, 30_000);
    logger.warn({ attempt, delay }, 'Redis retry scheduled');
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
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to parse REDIS_SENTINELS env var'
      );
    }
  }

  return {};
}

/**
 * Create typed Redis client from configuration
 */
export function createRedis(config: CreateRedisConfig = {}): RedisAPI {
  if (config.url === 'memory://' || process.env['REDIS_URL'] === 'memory://') {
    logger.info('Redis memory mode enabled - using in-process stub');
    return createMemoryRedisClient();
  }
  // Start with defaults
  const options: RedisOptions = { ...DEFAULT_OPTIONS };

  // Handle Sentinel configuration
  const sentinelConfig = parseSentinelOptions(config);
  if (sentinelConfig.sentinels) {
    // Guard sentinel name - required by ioredis
    const sentinelName = sentinelConfig.name ?? config.name ?? 'mymaster';
    if (!sentinelName) {
      throw new Error('Redis Sentinel requires "name" option');
    }

    Object.assign(options, {
      sentinels: sentinelConfig.sentinels,
      name: sentinelName,
    });
    logger.info(
      {
        sentinelCount: sentinelConfig.sentinels.length,
        masterName: sentinelName,
      },
      'Creating Redis client with Sentinel configuration'
    );
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

      logger.info(
        { connection: maskPassword(config.url) },
        'Redis client using URL configuration'
      );
    } catch (error) {
      logger.warn(
        {
          url: config.url,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to parse Redis URL, using as-is'
      );
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
  logger.info({ connection: maskConnectionInfo(options) }, 'Creating Redis client');

  // Create Redis client
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const redis = new Redis(options as any);

  // Add connection event listeners
  redis['on']('connect', () => {
    logger.info({ connection: maskConnectionInfo(options) }, 'Redis client connected');
  });

  redis['on']('ready', () => {
    logger.info('Redis client ready');
  });

  redis['on']('error', (error: Error) => {
    logger.error(
      { error: error.message, connection: maskConnectionInfo(options) },
      'Redis client error'
    );
  });

  redis['on']('close', () => {
    logger.warn({ connection: maskConnectionInfo(options) }, 'Redis connection closed');
  });

  redis['on']('reconnecting', (delay: number) => {
    logger.info(`Redis reconnecting in ${delay}ms`);
  });

  return redis as unknown as RedisAPI;
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
export async function checkRedisHealth(redis: RedisClient): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Redis health check failed'
    );
    return false;
  }
}

/**
 * Create Redis client from environment variables
 */
export function createCacheFromEnv(): RedisAPI {
  const config: CreateRedisConfig = {};
  const redisUrl = process.env['REDIS_URL'];

  if (redisUrl === 'memory://' || redisUrl === 'mock') {
    logger.info(
      { redisUrl },
      'Redis memory mode detected'
    );
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
